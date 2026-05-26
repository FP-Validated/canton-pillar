import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataTable, FilterRow } from '@/components/dashboard/DataTable';
import { DetailHeader, AttributeList } from '@/components/dashboard/DetailHeader';
import { CodeBlock } from '@/components/dashboard/CodeBlock';
import { Timeline } from '@/components/dashboard/Timeline';
import { StatusPill } from '@/components/StatusPill';
import { holds, balances, holdings, webhookDeliveries, getHoldById, getDeliveriesForEndpoint } from '@/lib/mockData';

export const metadata = { title: 'hold detail – Canton Pillar' };
export function generateStaticParams() { return holds.map((item) => ({ id: item.id })); }
export default function Detail({ params }: { params: { id: string } }) {
  const item = getHoldById(params.id);
  if (!item) notFound();
    const rows = Object.entries(item).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)] as [string, string]);
  return <div className="space-y-6"><Link className="text-sm font-semibold text-accent" href="/dashboard/holds">Back to holds</Link><DetailHeader object={item.object} id={item.id} status={'status' in item ? item.status : undefined} /><div className="grid gap-6 lg:grid-cols-2"><AttributeList rows={rows} /><CodeBlock value={item} /></div><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-ink">References</h2><div className="mt-4 space-y-2"><Link className="block font-mono text-sm text-accent" href={`/dashboard/holdings/${item.holding_id}`}>Holding {item.holding_id}</Link><Link className="block font-mono text-sm text-accent" href={`/dashboard/operations/${item.operation_id}`}>Operation {item.operation_id}</Link></div></section></div>;
}
