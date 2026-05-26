import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataTable, FilterRow } from '@/components/dashboard/DataTable';
import { DetailHeader, AttributeList } from '@/components/dashboard/DetailHeader';
import { CodeBlock } from '@/components/dashboard/CodeBlock';
import { Timeline } from '@/components/dashboard/Timeline';
import { StatusPill } from '@/components/StatusPill';
import { holdings, balances, holds, webhookDeliveries, getHoldingById, getDeliveriesForEndpoint } from '@/lib/mockData';

export const metadata = { title: 'holding detail – Canton Pillar' };
export function generateStaticParams() { return holdings.map((item) => ({ id: item.id })); }
export default function Detail({ params }: { params: { id: string } }) {
  const item = getHoldingById(params.id);
  if (!item) notFound();
  const activeHolds = holds.filter((hold) => hold.holding_id === item.id);
  const rows = Object.entries(item).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)] as [string, string]);
  return <div className="space-y-6"><Link className="text-sm font-semibold text-accent" href="/dashboard/holdings">Back to holdings</Link><DetailHeader object={item.object} id={item.id} status={'status' in item ? item.status : undefined} /><div className="grid gap-6 lg:grid-cols-2"><AttributeList rows={rows} /><CodeBlock value={item} /></div><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-ink">Active holds</h2><div className="mt-4 space-y-2">{activeHolds.map((hold) => <Link key={hold.id} className="block font-mono text-sm text-accent" href={`/dashboard/holds/${hold.id}`}>{hold.id} · {hold.status}</Link>)}</div></section></div>;
}
