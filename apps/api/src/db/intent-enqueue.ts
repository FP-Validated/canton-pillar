import { createHash, randomUUID } from 'node:crypto';
import { ulid } from 'ulid';
import type pg from 'pg';
import { pool } from './client.js';
import { withTx } from './transaction.js';

export type IntentKind = 'issue' | 'redeem' | 'transfer' | 'hold_create' | 'hold_release';

type EnqueueInput = {
  tenantId: string;
  livemode: boolean;
  intentKind: IntentKind;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  requestId: string;
  apiKeyId?: string;
};

type EnqueueResult = { operationId: string; intentId: string; commandId: string; status: 'processing'; cached?: boolean };

const intentPrefix: Record<IntentKind, string> = { issue: 'issint_', redeem: 'redint_', transfer: 'trint_', hold_create: 'hold_', hold_release: 'hrel_' };
const commandType: Record<IntentKind, string> = { issue: 'issue_intent.create', redeem: 'redeem_intent.create', transfer: 'transfer_intent.create', hold_create: 'hold.create', hold_release: 'hold.release' };

function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }
function id(prefix: string) { return `${prefix}${ulid()}`; }
function commandId(tenantId: string, operationId: string, semanticVersion: string) {
  // ADR-0011: command_id = sha256(tenant_id | operation_id | command_semantic_version)[:24]
  return `cmd_${sha256(`${tenantId}|${operationId}|${semanticVersion}`).slice(0, 24)}`;
}
function idemHash(key: string) { return sha256(key); }

// Bind the middleware-owned idempotency claim row to the operation_id we just
// created. The middleware (apps/api/src/middleware/idempotency.ts) owns the
// claim/complete/release lifecycle; enqueueIntent MUST NOT double-claim.
async function bindClaimToOperation(client: pg.PoolClient, tenantId: string, key: string, requestId: string, operationId: string) {
  await client.query(
    'update idempotency_keys set request_id=$3, operation_id=$4, updated_at=now() where tenant_id=$1 and idempotency_key_hash=$2',
    [tenantId, idemHash(key), requestId, operationId],
  );
}

export async function enqueueIntent(input: EnqueueInput): Promise<EnqueueResult> {
  const semanticVersion = `${commandType[input.intentKind]}:v1`;
  if (process.env.PILLAR_DB === 'memory' || !process.env.DATABASE_URL) {
    const operationId = id('op_');
    const intentId = input.intentKind === 'hold_release' && typeof input.payload.hold_id === 'string'
      ? input.payload.hold_id
      : id(intentPrefix[input.intentKind]);
    return { operationId, intentId, commandId: commandId(input.tenantId, operationId, semanticVersion), status: 'processing' };
  }
  return withTx(async (client) => {
    const operationId = id('op_');
    const intentId = id(intentPrefix[input.intentKind]);
    const cmd = commandId(input.tenantId, operationId, semanticVersion);
    const hash = idemHash(input.idempotencyKey);
    const amount = typeof input.payload.amount === 'string' ? input.payload.amount : null;
    const asset = typeof input.payload.asset === 'string' ? input.payload.asset : null;
    const metadata = typeof input.payload.metadata === 'object' && input.payload.metadata !== null ? input.payload.metadata : {};
    const cmdTypeValue = commandType[input.intentKind];
    const commandPayload = {
      ...input.payload,
      command_type: cmdTypeValue,
      command_semantic_version: semanticVersion,
      intent_id: intentId,
      operation_id: operationId,
      command_id: cmd,
      submission_id: `sub_${randomUUID()}`,
    };

    await client.query("insert into api_requests(id, tenant_id, operation_id, request_id, idempotency_key_hash, method, path_template, api_version, response_status) values($1,$2,$3,$4,$5,'POST',$6,'2026-05-26',202)", [id('apireq_'), input.tenantId, operationId, input.requestId, hash, `/v1/${input.intentKind}`]);
    await client.query("insert into intents(id, tenant_id, operation_id, request_id, idempotency_key_hash, intent_type, status, amount, asset_id, metadata) values($1,$2,$3,$4,$5,$6,'processing',$7,$8,$9)", [intentId, input.tenantId, operationId, input.requestId, hash, input.intentKind, amount, asset, metadata]);
    await client.query("insert into operations(id, tenant_id, operation_id, request_id, idempotency_key_hash, command_id, status) values($1,$2,$3,$4,$5,$6,'received')", [operationId, input.tenantId, operationId, input.requestId, hash, cmd]);
    await client.query(
      "insert into ledger_command_requests(id, tenant_id, operation_id, request_id, idempotency_key_hash, command_id, command_type, command_semantic_version, command_payload, payload, status, priority, participant_id, available_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'received',0,'default',now())",
      [id('lcr_'), input.tenantId, operationId, input.requestId, hash, cmd, cmdTypeValue, semanticVersion, commandPayload],
    );
    await bindClaimToOperation(client, input.tenantId, input.idempotencyKey, input.requestId, operationId);
    return { operationId, intentId, commandId: cmd, status: 'processing' as const };
  });
}
