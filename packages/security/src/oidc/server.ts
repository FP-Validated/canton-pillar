import { createHash } from 'node:crypto';
export interface OidcIssuerConfig { issuer: string; clientId: string; authorizationEndpoint: string; tokenEndpoint: string; jwksUri: string; }
export function validateIssuerConfig(c: OidcIssuerConfig) { for (const [k,v] of Object.entries(c)) if (!v || !String(v).startsWith(k==='clientId'?'':'https://')) throw new Error(`Invalid OIDC ${k}`); return c; }
export function hashState(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function validateCallback(input: { state: string; nonce: string; expectedStateHash: string; expectedNonceHash: string; aud: string; expectedAud: string; sub: string; tenantId: string; mode: 'test'|'live' }) {
  if (hashState(input.state) !== input.expectedStateHash) throw new Error('Invalid OIDC state');
  if (hashState(input.nonce) !== input.expectedNonceHash) throw new Error('Invalid OIDC nonce');
  if (input.aud !== input.expectedAud) throw new Error('Invalid OIDC audience');
  return { subject: input.sub, tenant_id: input.tenantId, mode: input.mode, aud: input.aud };
}
