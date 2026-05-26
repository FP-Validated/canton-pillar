import Link from 'next/link';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { DataTable } from '@/components/dashboard/DataTable';
import { StatusPill } from '@/components/StatusPill';
import { transferIntents, issueIntents, redeemIntents, webhookDeliveries, operations } from '@/lib/mockData';

export const metadata = { title: 'Overview – Canton Pillar' };

const money = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const percentile = (values: number[], p: number) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] ?? 0;

export default function DashboardOverview() {
  const allIntents = [...transferIntents, ...issueIntents, ...redeemIntents];
  const succeededToday = allIntents.filter((i) => i.status === 'succeeded').length;
  const failedToday = allIntents.filter((i) => i.status === 'failed').length;
  const pending = allIntents.filter((i) => i.status === 'processing' || i.status === 'requires_action').length;
  const totalVolume = transferIntents.filter((i) => i.status === 'succeeded').reduce((sum, i) => sum + Number(i.amount), 0);
  const recentIntents = [...allIntents].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 10);
  const recentDeliveries = [...webhookDeliveries].sort((a, b) => b.created.localeCompare(a.created)).slice(0, 5);
  const latencies = operations.map((op) => op.latency_ms).sort((a, b) => a - b);
  const avg = Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);
  const stats = [['avg', avg], ['p50', percentile(latencies, 0.5)], ['p95', percentile(latencies, 0.95)], ['max', latencies.at(-1) ?? 0]];
  return <div className="space-y-8"><section className="grid gap-4 md:grid-cols-4"><KpiCard label="Total volume" value={money(totalVolume)} helper="Succeeded transfers" /><KpiCard label="Pending intents" value={String(pending)} /><KpiCard label="Succeeded today" value={String(succeededToday)} /><KpiCard label="Failed today" value={String(failedToday)} /></section><section className="space-y-4"><h1 className="text-xl font-bold text-ink">Recent intents</h1><DataTable rows={recentIntents} columns={[{ key: 'id', header: 'ID', render: (row) => <Link className="font-mono font-semibold text-accent" href={`/dashboard/intents/${row.id}`}>{row.id}</Link> }, { key: 'type', header: 'Type', render: (row) => <span className="font-mono text-xs">{row.object}</span> }, { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> }, { key: 'amount', header: 'Amount', render: (row) => row.amount }, { key: 'updated', header: 'Updated', render: (row) => row.updated }]} /></section><section className="grid gap-6 lg:grid-cols-2"><div className="space-y-4"><h2 className="text-lg font-bold text-ink">Recent webhook deliveries</h2><DataTable rows={recentDeliveries} columns={[{ key: 'id', header: 'ID', render: (row) => <span className="font-mono text-xs text-accent">{row.id}</span> }, { key: 'type', header: 'Type', render: (row) => row.type }, { key: 'target', header: 'Target', render: (row) => <span className="break-all text-xs">{row.target}</span> }, { key: 'http', header: 'HTTP', render: (row) => row.http_status }, { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> }, { key: 'attempts', header: 'Attempts', render: (row) => row.attempt_count }]} /></div><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-ink">Operation latency snapshot</h2><div className="mt-5 grid gap-3 sm:grid-cols-4">{stats.map(([label, value]) => <div key={label} className="rounded-2xl bg-bgSoft p-4"><p className="text-xs uppercase text-slateMuted">{label}</p><p className="mt-2 text-xl font-bold text-ink">{value}ms</p></div>)}</div></div></section></div>;
}
