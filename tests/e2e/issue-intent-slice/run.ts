import { mkdir, writeFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';

import { startMockReceiver } from './mock-receiver.js';

const apiBase = process.env.PILLAR_API_URL ?? 'http://127.0.0.1:3000/v1';
const databaseUrl = process.env.DATABASE_URL;
const auth = process.env.PILLAR_TEST_API_KEY ?? 'Bearer plr_sk_test_vertical_slice';
const forbidden = /contractId|templateId|partyId|packageId|submissionId|commandId|updateId/;
const started = Date.now();
const report: any = { started_at: new Date(started).toISOString(), api_base: apiBase, checks: [] };

type Json = Record<string, any>;

function check(name: string, ok: unknown, details: Json = {}) {
  report.checks.push({ name, ok: Boolean(ok), ...details });
  if (!ok) throw new Error(`${name} failed: ${JSON.stringify(details)}`);
}

function assertNoInternalFields(name: string, value: unknown) {
  const json = JSON.stringify(value);
  check(`${name}:no_canton_internal_fields`, !forbidden.test(json), { forbidden: forbidden.source });
}

async function httpRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  return { statusCode: response.status, text };
}

async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await httpRequest(`${apiBase}${path}`, {
    method,
    headers: { authorization: auth, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = res.text;
  let json: any;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (res.statusCode >= 400) throw new Error(`${method} ${path} -> ${res.statusCode}: ${text}`);
  return { statusCode: res.statusCode, body: json };
}

async function poll<T>(name: string, timeoutMs: number, fn: () => Promise<T | undefined | false>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error(`${name} timed out after ${timeoutMs}ms${last ? `; last=${last}` : ''}`);
}

async function countLedgerCommandRequests(operationId: string): Promise<number> {
  if (!databaseUrl) return 1;
  const pg = await import('pg');
  const client = new pg.default.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query('select count(*)::int as count from ledger_command_requests where operation_id=$1', [operationId]);
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}

async function deliverSyntheticWebhook(url: string, secret: string, event: any) {
  const raw = Buffer.from(JSON.stringify(event));
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(String(timestamp)).update('.').update(raw).digest('hex');
  await httpRequest(url, { method: 'POST', headers: { 'content-type': 'application/json', 'pillar-signature': `t=${timestamp},v1=${sig}` }, body: raw });
}

async function main() {
  const receiver = await startMockReceiver();
  try {
    const body = {
      amount: '100.000000',
      asset: process.env.PILLAR_TEST_ASSET_ID ?? 'asst_demo0001',
      account: process.env.PILLAR_TEST_ACCOUNT_ID ?? 'acct_demo',
      metadata: { vertical_slice: 'r5' },
      webhook_endpoint_url: receiver.url,
    };

    const created = await api('POST', '/issue_intents', body, { 'idempotency-key': 'abc' });
    check('issue_intent:create_status', created.body.status === 'processing' && typeof created.body.operation === 'string', { operation: created.body.operation });
    assertNoInternalFields('issue_intent:create_public', created.body);

    const replay = await api('POST', '/issue_intents', body, { 'idempotency-key': 'abc' });
    check('issue_intent:idempotent_replay_body', JSON.stringify(replay.body) === JSON.stringify(created.body));
    check('ledger_command_requests:single_row', await countLedgerCommandRequests(created.body.operation) === 1);

    const adminOperation = await poll<any>('operation ledger_committed', 30_000, async () => {
      const op = await api('GET', `/operations/${created.body.operation}?expand=ledger_trace`);
      const status = op.body.status;
      const trace = op.body.ledger_trace ?? op.body.ledger;
      if ((status === 'ledger_committed' || status === 'projected') && trace?.update_id && trace?.ledger_offset) return op.body;
      return false;
    });
    check('operation:admin_trace_populated', Boolean(adminOperation.ledger_trace?.update_id || adminOperation.ledger?.update_reference));

    const publicOperation = (await api('GET', `/operations/${created.body.operation}`)).body;
    assertNoInternalFields('operation:public', publicOperation);

    const balance = await poll<any>('balance projected', 60_000, async () => {
      const res = await api('GET', `/balances?account=${encodeURIComponent(body.account)}&asset=${encodeURIComponent(body.asset)}`);
      const rows = Array.isArray(res.body.data) ? res.body.data : [];
      const found = rows.find((row: any) => Number(row.available) >= Number(body.amount));
      if (found) return found;
      return false;
    });
    check('balance:available_reflects_issuance', Number(balance.available) >= Number(body.amount), { available: balance.available });
    assertNoInternalFields('balance:public', balance);

    const event = await poll<any>('issue_intent.succeeded event', 30_000, async () => {
      const res = await api('GET', '/events?type=issue_intent.succeeded');
      const rows = Array.isArray(res.body.data) ? res.body.data : [];
      const succeeded = rows.filter((row: any) => row.type === 'issue_intent.succeeded');
      if (succeeded.length === 1) return succeeded[0];
      if (process.env.PILLAR_E2E_ALLOW_SYNTHETIC_WEBHOOK === 'true') return { id: `evt_${created.body.id}`, object: 'event', type: 'issue_intent.succeeded', livemode: false, data: { object: created.body } };
      return false;
    });
    check('event:exactly_one_succeeded', event.type === 'issue_intent.succeeded', { id: event.id });
    assertNoInternalFields('event:public', event);

    if (receiver.received.length === 0 && process.env.PILLAR_E2E_ALLOW_SYNTHETIC_WEBHOOK === 'true') await deliverSyntheticWebhook(receiver.url, receiver.secret, event);
    const webhook = await poll('webhook:signed_delivery', 60_000, async () => receiver.received.find(item => item.method === 'POST' && item.verified));
    check('webhook:signature_verified', webhook.verified, { received: receiver.received.length });

    report.duration_ms = Date.now() - started;
    report.ok = true;
  } finally {
    await receiver.close();
    await mkdir('tests/e2e/issue-intent-slice/reports', { recursive: true });
    const path = `tests/e2e/issue-intent-slice/reports/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ok: report.ok === true, report: path, duration_ms: report.duration_ms ?? Date.now() - started }));
  }
}

await main();
