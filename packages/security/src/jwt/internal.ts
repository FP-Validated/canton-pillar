import { createHmac, timingSafeEqual } from 'node:crypto';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
export interface ServiceJwtClaims { sub: string; aud: string; tenant_id: string; mode: 'test'|'live'; exp?: number; iat?: number; }
export function issueServiceJwt(claims: ServiceJwtClaims, secret = process.env.PILLAR_INTERNAL_JWT_SECRET ?? 'local-dev-secret', ttlSeconds = 300) {
  const now = Math.floor(Date.now()/1000); const payload = { ...claims, iat: now, exp: claims.exp ?? now + ttlSeconds };
  const body = `${b64({alg:'HS256',typ:'JWT'})}.${b64(payload)}`; const sig = createHmac('sha256', secret).update(body).digest('base64url'); return `${body}.${sig}`;
}
export function verifyServiceJwt(token: string, expectedAudience: string, secret = process.env.PILLAR_INTERNAL_JWT_SECRET ?? 'local-dev-secret'): ServiceJwtClaims {
  const [h,p,s] = token.split('.'); if (!h || !p || !s) throw new Error('Malformed token');
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(s))) throw new Error('Invalid signature');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as ServiceJwtClaims;
  if (claims.aud !== expectedAudience) throw new Error('Invalid audience');
  if ((claims.exp ?? 0) < Math.floor(Date.now()/1000)) throw new Error('Expired token');
  return claims;
}
