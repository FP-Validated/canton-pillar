import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataTable, FilterRow } from '@/components/dashboard/DataTable';
import { DetailHeader, AttributeList } from '@/components/dashboard/DetailHeader';
import { CodeBlock } from '@/components/dashboard/CodeBlock';
import { Timeline } from '@/components/dashboard/Timeline';
import { StatusPill } from '@/components/StatusPill';
import { webhookEndpoints, balances, holdings, holds, webhookDeliveries, getWebhookEndpointById, getDeliveriesForEndpoint } from '@/lib/mockData';

export const metadata = { title: 'webhook_endpoint detail – Canton Pillar' };
export function generateStaticParams() { return webhookEndpoints.map((item) => ({ id: item.id })); }
export default function Detail({ params }: { params: { id: string } }) {
  const item = getWebhookEndpointById(params.id);
  if (!item) notFound();
  const deliveries = getDeliveriesForEndpoint(item.id);
  const rows = Object.entries(item).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)] as [string, string]);
  return <div className="space-y-6"><Link className="text-sm font-semibold text-accent" href="/dashboard/webhooks">Back to webhooks</Link><DetailHeader object={item.object} id={item.id} status={'status' in item ? item.status : undefined} /><div className="grid gap-6 lg:grid-cols-2"><AttributeList rows={rows} /><CodeBlock value={item} /></div><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-ink">Enabled events</h2><div className="mt-4 flex flex-wrap gap-2">{item.enabled_events.map((event) => <span key={event} className="rounded-full bg-bgSoft px-3 py-1 text-xs font-semibold text-slateMuted">{event}</span>)}</div><p className="mt-4 font-mono text-sm">Secret ending in {item.secret_last4}</p><h3 className="mt-6 font-bold text-ink">Deliveries</h3><div className="mt-3 space-y-2">{deliveries.map((delivery) => <span key={delivery.id} className="block font-mono text-sm">{delivery.id} · {delivery.status}</span>)}</div></section></div>;
}
