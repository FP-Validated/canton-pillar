import Link from 'next/link';
import { DataTable, FilterRow } from '@/components/dashboard/DataTable';
import { StatusPill } from '@/components/StatusPill';
import { holds } from '@/lib/mockData';

export const metadata = { title: 'Holds – Canton Pillar' };
const rows = [...holds].sort((a, b) => b.created.localeCompare(a.created));
export default function Page() { return <div className="space-y-6"><div className="flex items-center justify-between gap-3"><h1 className="text-3xl font-bold text-ink">Holds</h1><span className="rounded-full bg-bgSoft px-3 py-1 text-xs font-semibold text-slateMuted">{rows.length} records</span></div><FilterRow /><DataTable rows={rows} columns={[{ key: 'id', header: 'ID', render: (row) => <Link className="font-mono font-semibold text-accent" href={`/dashboard/holds/${row.id}`}>{row.id}</Link> }, { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> }, { key: 'kind', header: 'Type', render: (row) => <span className="font-mono text-xs">{row.object}</span> }, { key: 'date', header: 'Updated', render: (row) => row.created }]} /></div>; }
