import { getWorkbenchSession, type WorkbenchSession } from './session';

export type AdminError = { type: 'permission_error'; code: 'admin_required' } | { type: 'api_error'; code: string; status?: number };
export type Result<T> = { ok: true; value: T } | { ok: false; error: AdminError };

const ADMIN_REQUIRED: AdminError = { type: 'permission_error', code: 'admin_required' };

function base64url(input: string) {
  return Buffer.from(input).toString('base64url');
}

export function mintDashboardJwt(session: WorkbenchSession): Result<string> {
  if (session.role !== 'super_admin') return { ok: false, error: ADMIN_REQUIRED };
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: session.user.id,
    email: session.user.email,
    role: 'super_admin',
    active_tenant_id: session.active_tenant_id,
    iat: now,
    exp: now + 300,
    aud: 'pillar-dashboard',
    iss: 'pillar-workbench',
  };
  const signingKey = process.env.PILLAR_DASHBOARD_JWT_SECRET ?? process.env.PILLAR_SERVER_TOKEN ?? 'dev-server-token';
  const body = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(`${body}.${signingKey}`);
  return { ok: true, value: `${body}.${signature}` };
}

export async function pillarAdmin<T>(path: string, init: RequestInit = {}): Promise<Result<T>> {
  const session = await getWorkbenchSession();
  if (!session || session.role !== 'super_admin') return { ok: false, error: ADMIN_REQUIRED };
  const token = mintDashboardJwt(session);
  if (!token.ok) return token;
  const base = process.env.PILLAR_API_URL ?? 'http://localhost:3001/v1';
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token.value}`);
  headers.set('content-type', 'application/json');
  if (init.method && init.method !== 'GET' && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID());
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  if (!res.ok) return { ok: false, error: { type: 'api_error', code: 'request_failed', status: res.status } };
  return { ok: true, value: await res.json() as T };
}

export async function adminAction(path: string, body?: unknown, secondApproverEmail?: string): Promise<Result<unknown>> {
  return pillarAdmin(path, {
    method: 'POST',
    body: JSON.stringify({ ...(body && typeof body === 'object' ? body : {}), second_approver_email: secondApproverEmail }),
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}
