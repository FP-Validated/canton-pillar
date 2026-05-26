import { pillarFetch } from '../../../server/pillar-client';
import { ErrorState, EmptyState } from '../../../components/StateViews';
export default async function Page({ searchParams }: { searchParams: { tenant_id?: string } }) {
  if (!searchParams.tenant_id) return <EmptyState title="Choose a tenant" />;
  const r = await pillarFetch(undefined, '/auth/switch_tenant', { method: 'POST', body: JSON.stringify({ tenant_id: searchParams.tenant_id }), idempotencyKey: `switch-${searchParams.tenant_id}` });
  if (!r.ok) return <ErrorState message={r.error.message} />;
  return <main><h1>Tenant switched</h1></main>;
}
