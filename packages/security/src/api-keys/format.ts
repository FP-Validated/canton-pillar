import { randomBytes } from 'node:crypto';
export type ApiKeyKind = 'sk' | 'rk' | 'pk';
export type ApiKeyMode = 'test' | 'live';
export function createApiKey(kind: ApiKeyKind, mode: ApiKeyMode, token = randomBytes(24).toString('base64url')) {
  const secret = `plr_${kind}_${mode}_${token}`;
  return { secret, prefix: `plr_${kind}_${mode}`, last4: secret.slice(-4), kind, mode };
}
export function parseApiKey(secret: string) {
  const match = /^plr_(sk|rk|pk)_(test|live)_([A-Za-z0-9_-]{32,})$/.exec(secret);
  if (!match) throw new Error('Invalid Pillar API key format');
  return { kind: match[1] as ApiKeyKind, mode: match[2] as ApiKeyMode, prefix: `plr_${match[1]}_${match[2]}`, last4: secret.slice(-4) };
}
