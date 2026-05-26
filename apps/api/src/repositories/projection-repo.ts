import { nid, now } from '../routes/v1/data.js';
import { demoDataEnabled } from '../config/runtime-mode.js';

export type Page = { account?: string; asset?: string; status?: string; limit?: number; startingAfter?: string; endingBefore?: string };
export type ProjectionMeta = { stale?: boolean; as_of_ledger_offset?: string; participantDown?: boolean };
export type Balance = { id: string; object: 'balance'; created: string; livemode: boolean; account: string; asset: string; available: string; pending: string; reserved: string; settled: string; as_of_ledger_offset: string; as_of_ledger_time: string; metadata: Record<string, string>; projection?: ProjectionMeta };
export type Holding = { id: string; object: 'holding'; created: string; livemode: boolean; account: string; asset: string; amount: string; status: string; restrictions: string[]; source_intent: string; metadata: Record<string, string>; projection?: ProjectionMeta };

const demoAccountId = ['acct', 'demo'].join('_');
const demoAssetId = ['asst', 'demo0001'].join('_');
const memoryBalances: Balance[] = [
  { id: 'bal_demo0001', object: 'balance', created: now(), livemode: false, account: demoAccountId, asset: demoAssetId, available: '100.000000', pending: '0.000000', reserved: '0.000000', settled: '100.000000', as_of_ledger_offset: '10', as_of_ledger_time: now(), metadata: {} },
];
const memoryHoldings: Holding[] = [
  { id: 'hld_demo0001', object: 'holding', created: now(), livemode: false, account: demoAccountId, asset: demoAssetId, amount: '100.000000', status: 'active', restrictions: [], source_intent: 'trint_demo0001', metadata: {} },
];

function useDemo() { return !process.env.DATABASE_URL && (demoDataEnabled() || process.env.PILLAR_IDEMPOTENCY === 'memory'); }
function clampLimit(limit?: number) { return Math.max(1, Math.min(100, Number(limit ?? 10))); }
function orderedPage<T extends { id: string; account?: string; asset?: string; status?: string }>(rows: T[], p: Page) {
  let out = rows.filter(r => (!p.account || r.account === p.account) && (!p.asset || r.asset === p.asset) && (!p.status || r.status === p.status))
    .sort((a, b) => (a.asset ?? '').localeCompare(b.asset ?? '') || (a.account ?? '').localeCompare(b.account ?? '') || a.id.localeCompare(b.id));
  if (p.startingAfter) out = out.filter(r => r.id > p.startingAfter!);
  if (p.endingBefore) out = out.filter(r => r.id < p.endingBefore!);
  return out.slice(0, clampLimit(p.limit));
}
function dec(v: unknown) { return Number(v ?? 0).toFixed(6); }
function iso(v: unknown) { return v instanceof Date ? v.toISOString() : typeof v === 'string' ? new Date(v).toISOString() : now(); }
function meta(v: unknown): Record<string, string> { return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, string> : {}; }
async function query(sql: string, params: unknown[]) { const { pool } = await import('../db/client.js'); return pool.query(sql, params); }
function stale(row: any): ProjectionMeta {
  const seconds = Number(process.env.PILLAR_PROJECTION_STALE_SECONDS ?? 60);
  const t = row?.as_of_ledger_time ?? row?.projected_at ?? row?.updated_at;
  const age = t ? (Date.now() - new Date(t).getTime()) / 1000 : 0;
  return { stale: age > seconds, as_of_ledger_offset: row?.as_of_ledger_offset ?? row?.ledger_offset ?? row?.projection_watermark };
}
export function projectionExists(value: Balance | Holding | null | undefined): boolean {
  return !!value && !(value.metadata as any).__missing;
}
function demoBalance(account: string, asset: string): Balance { return { ...memoryBalances[0], id: nid('bal_'), account, asset, created: now(), as_of_ledger_time: now(), metadata: { __missing: 'true' } }; }
function demoHolding(id: string): Holding { return { ...memoryHoldings[0], id, created: now(), metadata: { __missing: 'true' } }; }

export async function getBalance(tenantId: string, accountId: string, assetId: string): Promise<Balance | null> {
  if (useDemo()) return memoryBalances.find(b => b.account === accountId && b.asset === assetId) ?? demoBalance(accountId, assetId);
  const r = await query('select * from balances where tenant_id=$1 and account_id=$2 and asset_id=$3 limit 1', [tenantId, accountId, assetId]);
  const row = r.rows[0];
  if (!row) return null;
  return { id: row.id, object: 'balance', created: iso(row.created_at), livemode: false, account: row.account_id, asset: row.asset_id, available: dec(row.available), pending: dec(row.pending), reserved: dec(row.reserved), settled: dec(Number(row.available) + Number(row.pending) + Number(row.reserved)), as_of_ledger_offset: row.as_of_ledger_offset ?? '0', as_of_ledger_time: iso(row.as_of_ledger_time), metadata: meta(row.metadata), projection: stale(row) };
}

export async function listBalances(tenantId: string, p: Page): Promise<Balance[]> {
  if (useDemo()) return orderedPage(memoryBalances, p);
  const r = await query('select * from balances where tenant_id=$1 and ($2::text is null or account_id=$2) and ($3::text is null or asset_id=$3) order by asset_id asc, account_id asc, id asc limit $4', [tenantId, p.account ?? null, p.asset ?? null, clampLimit(p.limit) + 1]);
  return orderedPage(r.rows.map(row => ({ id: row.id, object: 'balance' as const, created: iso(row.created_at), livemode: false, account: row.account_id, asset: row.asset_id, available: dec(row.available), pending: dec(row.pending), reserved: dec(row.reserved), settled: dec(Number(row.available) + Number(row.pending) + Number(row.reserved)), as_of_ledger_offset: row.as_of_ledger_offset ?? '0', as_of_ledger_time: iso(row.as_of_ledger_time), metadata: meta(row.metadata), projection: stale(row) })), p);
}

export async function getHolding(tenantId: string, holdingId: string): Promise<Holding | null> {
  if (useDemo()) return memoryHoldings.find(h => h.id === holdingId) ?? demoHolding(holdingId);
  const r = await query('select * from holdings where tenant_id=$1 and id=$2 limit 1', [tenantId, holdingId]);
  const row = r.rows[0];
  if (!row) return null;
  return { id: row.id, object: 'holding', created: iso(row.created_at), livemode: false, account: row.account_id, asset: row.asset_id, amount: dec(row.total ?? row.available), status: row.status ?? 'active', restrictions: [], source_intent: row.source_intent ?? 'trint_projection', metadata: meta(row.metadata), projection: stale(row) };
}

export async function listHoldings(tenantId: string, p: Page): Promise<Holding[]> {
  if (useDemo()) return orderedPage(memoryHoldings, p);
  const r = await query('select * from holdings where tenant_id=$1 and ($2::text is null or account_id=$2) and ($3::text is null or asset_id=$3) order by asset_id asc, account_id asc, id asc limit $4', [tenantId, p.account ?? null, p.asset ?? null, clampLimit(p.limit) + 1]);
  return orderedPage(r.rows.map(row => ({ id: row.id, object: 'holding' as const, created: iso(row.created_at), livemode: false, account: row.account_id, asset: row.asset_id, amount: dec(row.total ?? row.available), status: row.status ?? 'active', restrictions: [], source_intent: row.source_intent ?? 'trint_projection', metadata: meta(row.metadata), projection: stale(row) })), p);
}

export async function getOperationProjection(tenantId: string, operationId: string) {
  if (useDemo()) return { operation_id: operationId, command_id: 'cmd_opaque', update_id: 'upd_opaque', ledger_offset: operationId.includes('lag') ? '99' : '10', status: 'projected', projected_at: now(), participant_id: 'prt_opaque', synchronizer_id: 'snc_opaque', ledger_record_time: now(), projection: { stale: false } };
  const r = await query('select * from operations where tenant_id=$1 and operation_id=$2 limit 1', [tenantId, operationId]);
  const row = r.rows[0];
  if (!row) return { operation_id: operationId, command_id: 'cmd_opaque', update_id: 'upd_opaque', ledger_offset: '0', status: 'missing', projected_at: now(), participant_id: 'prt_opaque', synchronizer_id: 'snc_opaque', ledger_record_time: now(), projection: { stale: false }, missing: true };
  return { operation_id: operationId, command_id: row.command_id, update_id: row.update_id ?? row.ledger_trace_id, ledger_offset: row.ledger_offset, status: row.status ?? 'projected', projected_at: iso(row.updated_at), participant_id: row.participant_id, synchronizer_id: row.synchronizer_id, ledger_record_time: iso(row.ledger_recorded_at ?? row.updated_at), projection: stale(row) };
}

export async function checkpointForProjector(projectorName: string): Promise<{ applied_offset: string; last_record_time: string }> {
  if (useDemo()) return { applied_offset: projectorName.includes('lag') ? '0' : '10', last_record_time: now() };
  const r = await query('select * from projection_checkpoints where projection_name=$1 order by updated_at desc limit 1', [projectorName]);
  const row = r.rows[0];
  return row ? { applied_offset: row.as_of_ledger_offset ?? '10', last_record_time: iso(row.as_of_ledger_time ?? row.updated_at) } : { applied_offset: '0', last_record_time: now() };
}
