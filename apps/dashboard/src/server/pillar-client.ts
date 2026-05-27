import { signDashboardToken } from '@pillar/security';
import { cookies } from 'next/headers';
import { getDashboardSession, type DashboardSession } from './session';

export type Result<T, E> = { ok: true; value: T; headers: Headers } | { ok: false; error: E; headers?: Headers; status?: number };
export type PillarApiError = { type: 'unauthenticated' | 'timeout' | 'http' | 'network' | 'unsupported_in_deployment_mode'; code: string; message: string; status?: number };

type PillarInit = RequestInit & { idempotencyKey?: string; timeoutMs?: number };

export function err(error: PillarApiError, status?: number, headers?: Headers): Result<never, PillarApiError> { return { ok: false, error, status, headers }; }
export function ok<T>(value: T, headers: Headers): Result<T, PillarApiError> { return { ok: true, value, headers }; }

export async function getServerSession(_request?: Request): Promise<DashboardSession | null> {
  if (process.env.PILLAR_DASHBOARD_TEST_SESSION) return JSON.parse(process.env.PILLAR_DASHBOARD_TEST_SESSION) as DashboardSession;
  return getDashboardSession();
}

function activeRole(session: DashboardSession): string {
  return session.memberships.find(m => m.tenant.id === session.active_tenant_id)?.role ?? 'viewer';
}

function requestCookieNetwork(request: Request | undefined): string {
  const cookieHeader = request?.headers.get('cookie');
  const match = cookieHeader?.match(/(?:^|;\s*)pillar-network=([^;]+)/);
  const value = match ? decodeURIComponent(match[1] ?? '') : cookies().get('pillar-network')?.value;
  return value === 'testnet' || value === 'mainnet' ? value : 'devnet';
}

export async function pillarFetch<T>(request: Request | undefined, path: string, init: PillarInit = {}): Promise<Result<T, PillarApiError>> {
  if (typeof window !== 'undefined') return err({ type: 'network', code: 'server_only', message: 'pillarFetch may only run on the server.' });
  const session = await getServerSession(request);
  if (!session) return err({ type: 'unauthenticated', code: 'session_required', message: 'Sign in required.' }, 401);
  const tenantId = session.active_tenant_id;
  const secret = process.env.PILLAR_DASHBOARD_JWT_SECRET ?? process.env.PILLAR_INTERNAL_JWT_SECRET ?? 'dev-dashboard-secret';
  const token = signDashboardToken({ tenant_id: tenantId, user_id: session.user.id, role: activeRole(session) as any, livemode: Boolean((session as any).livemode) }, { secret });
  const base = (process.env.PILLAR_API_BASE_URL ?? 'http://api:4000').replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 5000);
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.set('pillar-version', process.env.PILLAR_API_VERSION ?? '2026-05-26');
  headers.set('Pillar-Network', requestCookieNetwork(request));
  if (init.idempotencyKey) headers.set('idempotency-key', init.idempotencyKey);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  try {
    const res = await fetch(`${base}/v1${path.startsWith('/') ? path : `/${path}`}`, { ...init, headers, signal: controller.signal, cache: 'no-store' });
    const responseHeaders = new Headers(res.headers);
    responseHeaders.set('cache-control', 'private, max-age=5');
    if (!res.ok) {
      let body: any = undefined;
      try { body = await res.json(); } catch {}
      const code = body?.error?.code ?? body?.code ?? `http_${res.status}`;
      const type = code === 'unsupported_in_deployment_mode' ? 'unsupported_in_deployment_mode' : 'http';
      return err({ type, code, message: body?.error?.message ?? body?.message ?? res.statusText, status: res.status }, res.status, responseHeaders);
    }
    if (res.status === 204) return ok(undefined as T, responseHeaders);
    return ok(await res.json() as T, responseHeaders);
  } catch (e: any) {
    if (e?.name === 'AbortError') return err({ type: 'timeout', code: 'timeout', message: 'Pillar API request timed out.' });
    return err({ type: 'network', code: 'network_error', message: e?.message ?? 'Pillar API request failed.' });
  } finally { clearTimeout(timeout); }
}

export function emptyList(path: string) { return { object: 'list', data: [], has_more: false, url: path }; }
