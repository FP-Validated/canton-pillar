import { AdminPageHeader, AdminTable, Forbidden, JsonInspector, RoleBadge, DualControlModal } from '../../components/admin';
import { pillarAdmin } from '../../server/pillar-admin-client';
import { mutateAdmin } from './actions';

type Row = Record<string, unknown>;
type List = { data?: Row[] } | Row[];
function rows(value: List | null): Row[] { return Array.isArray(value) ? value : value?.data ?? []; }
function detail(value: Row | null): Row { return value ?? {}; }

export async function AdminListPage({ title, description, path, columns, actions = [], dualAction }: { title: string; description: string; path: string; columns: string[]; actions?: string[]; dualAction?: { label: string; path: (row: Row) => string } }) {
  const result = await pillarAdmin<List>(path);
  if (!result.ok && result.error.type === 'permission_error') return <Forbidden />;
  const data = result.ok ? rows(result.value) : [];
  return <main><AdminPageHeader title={title} description={description} /><AdminTable columns={columns.map((key) => ({ key, label: key }))} rows={data} renderActions={(row) => <div className="row-actions">{actions.map((action) => <form key={action} action={async () => { 'use server'; await mutateAdmin(`${path}/${row.id}/${action}`); }}><button>{action}</button></form>)}{dualAction ? <DualControlModal title={dualAction.label} actionLabel={dualAction.label} onApprove={async (email) => { await mutateAdmin(dualAction.path(row), {}, email); }} /> : null}</div>} /></main>;
}

export async function AdminDetailPage({ title, path }: { title: string; path: string }) {
  const result = await pillarAdmin<Row | null>(path);
  if (!result.ok && result.error.type === 'permission_error') return <Forbidden />;
  const row = result.ok ? detail(result.value) : {};
  return <main><AdminPageHeader title={title} description={String(row.id ?? 'Detail')} /><p>Status <RoleBadge role={String(row.status ?? row.role ?? 'unknown')} /></p><JsonInspector value={row} /></main>;
}
