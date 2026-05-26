import { cookies } from 'next/headers';

export type WorkbenchSession = {
  user: { id: string; email: string; display_name?: string };
  memberships: { tenant: { id: string; slug?: string; display_name?: string }; role: string }[];
  active_tenant_id: string;
  role: string;
};

export async function getWorkbenchSession(): Promise<WorkbenchSession | null> {
  const cookie = cookies().toString();
  if (!cookie) return null;
  const base = process.env.PILLAR_API_URL ?? 'http://localhost:3001/v1';
  const res = await fetch(`${base}/auth/session`, { headers: { cookie }, cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('session_lookup_failed');
  const raw = await res.json() as Omit<WorkbenchSession, 'role'> & { role?: string };
  const active = raw.memberships?.find((m) => m.tenant.id === raw.active_tenant_id);
  return { ...raw, role: raw.role ?? active?.role ?? 'viewer' };
}

export async function requireSuperAdmin(): Promise<WorkbenchSession | null> {
  const session = await getWorkbenchSession();
  return session?.role === 'super_admin' ? session : null;
}
