import Link from 'next/link';
import { DataTable, FilterRow } from '@/components/dashboard/DataTable';
import { StatusPill } from '@/components/StatusPill';
import { issueIntents, redeemIntents, transferIntents } from '@/lib/mockData';

export const metadata = { title: 'Intents – Canton Pillar' };
const rows = [...transferIntents, ...issueIntents, ...redeemIntents].sort((a, b) => b.updated.localeCompare(a.updated));
export default function IntentsPage() {
  return <div className="space-y-6"><div className="flex items-center justify-between gap-3"><h1 className="text-3xl font-bold text-ink">Intents</h1><span className="rounded-full bg-bgSoft px-3 py-1 text-xs font-semibold text-slateMuted">{rows.length} records</span></div><FilterRow /><DataTable rows={rows} columns={[{ key: 'id', header: 'ID', render: (row) => <Link className="font-mono font-semibold text-accent" href={`/dashboard/intents/${row.id}`}>{row.id}</Link> }, { key: 'type', header: 'Type', render: (row) => <span className="font-mono text-xs">{row.object}</span> }, { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> }, { key: 'amount', header: 'Amount', render: (row) => row.amount }, { key: 'updated', header: 'Updated', render: (row) => row.updated }]} /></div>;
}
