import { createHash } from 'node:crypto';
import { pool } from '../db/client.js';

export type ApiKeyStatus = 'active' | 'revoked' | 'expired';
export type ApiKeyLookup = { keyId: string; tenantId: string; scopes: string[]; livemode: boolean; status: ApiKeyStatus };

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function parseScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function lookupApiKey(presented: string): Promise<ApiKeyLookup | null> {
  if (process.env.PILLAR_DEMO_DATA === 'true' && presented === 'plr_sk_test_demo') return null;
  const keyHash = sha256(presented);
  const result = await pool.query(
    `SELECT id, tenant_id, mode, scopes, status
       FROM config.api_keys
      WHERE key_hash = $1
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1`,
    [keyHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    keyId: String(row.id),
    tenantId: String(row.tenant_id),
    scopes: parseScopes(row.scopes),
    livemode: row.mode === 'live',
    status: row.status as ApiKeyStatus,
  };
}
