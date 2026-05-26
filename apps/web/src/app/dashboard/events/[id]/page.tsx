import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataTable, FilterRow } from '@/components/dashboard/DataTable';
import { DetailHeader, AttributeList } from '@/components/dashboard/DetailHeader';
import { CodeBlock } from '@/components/dashboard/CodeBlock';
import { Timeline } from '@/components/dashboard/Timeline';
import { StatusPill } from '@/components/StatusPill';
import { events, balances, holdings, holds, webhookDeliveries, getEventById, getDeliveriesForEndpoint } from '@/lib/mockData';

export const metadata = { title: 'event detail – Canton Pillar' };
export function generateStaticParams() { return events.map((item) => ({ id: item.id })); }
export default function Detail({ params }: { params: { id: string } }) {
  const item = getEventById(params.id);
  if (!item) notFound();
  const deliveries = webhookDeliveries.filter((delivery) => delivery.event_id === item.id);
  const rows = Object.entries(item).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)] as [string, string]);
  return <div className="space-y-6"><Link className="text-sm font-semibold text-accent" href="/dashboard/events">Back to events</Link><DetailHeader object={item.object} id={item.id} /><div className="grid gap-6 lg:grid-cols-2"><AttributeList rows={rows} /><CodeBlock value={item} /></div><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-ink">Deliveries</h2><div className="mt-4 space-y-2">{deliveries.map((delivery) => <span key={delivery.id} className="block font-mono text-sm">{delivery.id} · {delivery.status} · {delivery.http_status}</span>)}</div></section></div>;
}
