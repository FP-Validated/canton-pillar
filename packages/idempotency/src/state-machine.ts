import { createHash } from 'node:crypto';
import type pg from 'pg';

export type Claim = {
  status: 'new' | 'in_progress' | 'completed' | 'conflict';
  operationId?: string;
  stored?: { response_status: number; response_body: unknown };
};

export type ClaimInput = {
  tenantId: string;
  idempotencyKey: string;
  requestHash: string;
  livemode?: boolean;
  route?: string;
  method?: string;
  apiVersion?: string;
};

function hashKey(key: string) { return createHash('sha256').update(key).digest('hex'); }
function lockBigint(hash: string) { return BigInt.asIntN(64, BigInt('0x' + hash.slice(0, 16))).toString(); }

export class IdempotencyStore {
  constructor(private pool: pg.Pool, private ttlMs = 24 * 3600_000) {}

  async claim(input: ClaimInput): Promise<Claim>;
  async claim(tenantId: string, key: string, requestHash: string): Promise<Claim>;
  async claim(inputOrTenant: ClaimInput | string, key?: string, requestHash?: string): Promise<Claim> {
    const input: ClaimInput = typeof inputOrTenant === 'string'
      ? { tenantId: inputOrTenant, idempotencyKey: key!, requestHash: requestHash! }
      : inputOrTenant;
    const h = hashKey(input.idempotencyKey);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const got = await client.query('select pg_try_advisory_xact_lock($1::bigint) ok', [lockBigint(h)]);
      if (!got.rows[0].ok) {
        await client.query('ROLLBACK');
        return { status: 'in_progress' };
      }
      const existing = await client.query('select * from idempotency_keys where tenant_id=$1 and idempotency_key_hash=$2 for update', [input.tenantId, h]);
      if (!existing.rowCount) {
        await client.query(
          "insert into idempotency_keys(tenant_id,idempotency_key_hash,request_hash,method,path_template,api_version,status,locked_until,expires_at) values($1,$2,$3,$4,$5,$6,'in_progress',now()+interval '5 minutes',$7)",
          [input.tenantId, h, input.requestHash, input.method ?? 'POST', input.route ?? 'unknown', input.apiVersion ?? 'unknown', new Date(Date.now() + this.ttlMs)],
        );
        await client.query('COMMIT');
        return { status: 'new' };
      }
      const row = existing.rows[0];
      if (row.request_hash !== input.requestHash) {
        await client.query('COMMIT');
        return { status: 'conflict', operationId: row.operation_id ?? undefined };
      }
      if (row.status === 'completed') {
        await client.query('COMMIT');
        return { status: 'completed', operationId: row.operation_id ?? undefined, stored: { response_status: row.response_status, response_body: row.response_body } };
      }
      await client.query('COMMIT');
      return { status: 'in_progress', operationId: row.operation_id ?? undefined };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(tenantId: string, key: string, responseStatus: number, responseBody: unknown) {
    const h = hashKey(key);
    await this.pool.query("update idempotency_keys set status='completed', response_status=$3, response_body=$4, locked_until=null, updated_at=now() where tenant_id=$1 and idempotency_key_hash=$2", [tenantId, h, responseStatus, responseBody]);
  }

  async release(tenantId: string, key: string) {
    const h = hashKey(key);
    await this.pool.query("delete from idempotency_keys where tenant_id=$1 and idempotency_key_hash=$2 and status<>'completed'", [tenantId, h]);
  }
}
