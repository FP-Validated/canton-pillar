'use client';

import Link from 'next/link';
import { StatusPill } from '@/components/StatusPill';
import { ActivityFeed } from './ActivityFeed';
import { BarChart } from './BarChart';
import { ChartCard } from './ChartCard';
import { DataGrid } from './DataGrid';
import { KpiGroup } from './KpiGroup';
import { RelatedPanel } from './RelatedPanel';
import { StatusBand } from './StatusBand';
import { events, webhookDeliveries } from '@/lib/mockData';
import { formatCurrency, formatRelative, intentTrendBars, intentVolume24h, kpiSparklines, latencyStats, recentIntents, systemStatus } from '@/lib/dashboard/selectors';

export function OverviewClient() {
  const spark = kpiSparklines(); const intents = recentIntents(10); const latency = latencyStats();
  return <><StatusBand status={systemStatus()} /><KpiGroup items={[{ label: 'Total volume (24h)', value: formatCurrency(intentVolume24h()), change: 12, points: spark.totalVolume }, { label: 'Pending intents', value: String(intents.filter((i) => ['processing', 'requires_action'].includes(i.status)).length), change: -4, points: spark.pending }, { label: 'Succeeded today', value: String(intents.filter((i) => i.status === 'succeeded').length), change: 18, points: spark.succeeded }, { label: 'Failed today', value: String(intents.filter((i) => i.status === 'failed').length), change: -9, points: spark.failed }]} />
  <section className="grid gap-6 lg:grid-cols-3"><div className="space-y-6 lg:col-span-2"><ChartCard title="Intent count by day" description="Illustrative 7-day activity buckets"><BarChart data={intentTrendBars()} /></ChartCard><ChartCard title="Recent intents"><DataGrid pageSize={10} rows={intents} columns={[{ header: 'ID', cell: (row) => <Link className="font-mono text-xs font-black text-accentDark" href={`/dashboard/intents/${row.id}`}>{row.id}</Link>, sortable: (row) => row.id }, { header: 'Type', cell: (row) => row.object }, { header: 'From→To / Account', cell: (row) => 'from_account_id' in row ? `${row.from_account_id.slice(0, 12)} → ${row.to_account_id.slice(0, 12)}` : row.account_id.slice(0, 16) }, { header: 'Amount', align: 'right', cell: (row) => row.amount, sortable: (row) => Number(row.amount) }, { header: 'Status', cell: (row) => <StatusPill status={row.status} /> }, { header: 'Updated', cell: (row) => formatRelative(row.updated), sortable: (row) => row.updated }]} /></ChartCard></div><div className="space-y-6"><ActivityFeed items={events.slice().sort((a,b)=>b.created.localeCompare(a.created)).slice(0,10)} /><RelatedPanel title="Helpful" links={[{ label: 'API reference', href: '/api' }, { label: 'Quickstart', href: '/docs/getting-started/quickstart' }, { label: 'Intent concepts', href: '/docs/concepts/intents' }]} /></div></section>
  <section className="grid gap-6 lg:grid-cols-2"><ChartCard title="Webhook delivery health"><DataGrid pageSize={5} rows={webhookDeliveries.slice().sort((a,b)=>b.created.localeCompare(a.created)).slice(0,5)} columns={[{ header: 'Delivery', cell: (row) => row.id }, { header: 'Attempts', align: 'right', cell: (row) => row.attempt_count }, { header: 'HTTP', align: 'right', cell: (row) => row.http_status }, { header: 'Status', cell: (row) => <StatusPill status={row.status} /> }]} /></ChartCard><ChartCard title="Operation latency snapshot"><div className="grid grid-cols-2 gap-3">{Object.entries(latency).map(([key,value]) => <div key={key} className="rounded-2xl bg-bgSoft p-5"><div className="text-xs font-black uppercase text-slateMuted">{key}</div><div className="mt-2 text-2xl font-black text-ink">{value}ms</div></div>)}</div></ChartCard></section></>;
}
