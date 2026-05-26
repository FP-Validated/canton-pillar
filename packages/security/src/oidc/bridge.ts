import { issueServiceJwt } from '../jwt/internal.js';
export function exchangeOidcSession(session: { subject: string; tenant_id: string; mode: 'test'|'live'; scopes: string[] }, audience: string) {
  return { token_type: 'Bearer', access_token: issueServiceJwt({ sub: session.subject, tenant_id: session.tenant_id, mode: session.mode, aud: audience }), scope: session.scopes.join(' '), expires_in: 300 };
}
