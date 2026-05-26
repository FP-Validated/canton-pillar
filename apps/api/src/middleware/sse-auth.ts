import { verifyDashboardToken } from '@pillar/security';

const apiKeyRe = /^Bearer\s+plr_(sk|rk|pk)_(test|live)_[A-Za-z0-9_-]+$/;
export type SsePrincipal = { tenantId: string; livemode: boolean; scopes: string[] };

export function authenticateSse(headers: Record<string, unknown>, accountId?: string): SsePrincipal | null {
  const auth = headers.authorization;
  if (typeof auth === 'string') {
    const apiKey = apiKeyRe.exec(auth);
    if (apiKey) return { tenantId: accountId ?? 'acct_demo', livemode: apiKey[2] === 'live', scopes: apiKey[1] === 'pk' ? ['events:read'] : ['*'] };
    const token = auth.replace(/^Bearer\s+/i, '');
    try {
      const payload = verifyDashboardToken(token, process.env.PILLAR_DASHBOARD_JWT_SECRET ?? process.env.PILLAR_INTERNAL_JWT_SECRET ?? 'dev-dashboard-secret');
      return { tenantId: payload.tenant_id, livemode: payload.livemode, scopes: ['events:read'] };
    } catch { return null; }
  }
  const cookie = headers.cookie;
  if (typeof cookie === 'string' && cookie.length > 0) return { tenantId: accountId ?? 'acct_demo', livemode: false, scopes: ['events:read'] };
  return null;
}
