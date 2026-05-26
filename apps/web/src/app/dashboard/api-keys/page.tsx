import { DataTable, FilterRow } from '@/components/dashboard/DataTable';
import { StatusPill } from '@/components/StatusPill';
import { apiKeys } from '@/lib/mockData';

export const metadata = { title: 'API keys – Canton Pillar' };
export default function ApiKeysPage() {
  return <div className="space-y-6"><div className="flex items-center justify-between gap-3"><h1 className="text-3xl font-bold text-ink">API keys</h1><span className="rounded-full bg-bgSoft px-3 py-1 text-xs font-semibold text-slateMuted">{apiKeys.length} records</span></div><div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">Newly created secret material is shown only once. Existing keys only display prefix and last4.</div><FilterRow /><DataTable rows={apiKeys} columns={[{ key: 'name', header: 'Name', render: (row) => row.name }, { key: 'prefix', header: 'Prefix', render: (row) => <span className="font-mono text-xs">{row.prefix}</span> }, { key: 'last4', header: 'last4', render: (row) => <span className="font-mono">{row.last4}</span> }, { key: 'scopes', header: 'Scopes', render: (row) => <div className="flex flex-wrap gap-1">{row.scopes.map((scope) => <span key={scope} className="rounded-full bg-bgSoft px-2 py-1 text-xs font-semibold text-slateMuted">{scope}</span>)}</div> }, { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> }, { key: 'created', header: 'Created', render: (row) => row.created }]} /></div>;
}
