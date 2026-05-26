import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataTable, FilterRow } from '@/components/dashboard/DataTable';
import { DetailHeader, AttributeList } from '@/components/dashboard/DetailHeader';
import { CodeBlock } from '@/components/dashboard/CodeBlock';
import { Timeline } from '@/components/dashboard/Timeline';
import { StatusPill } from '@/components/StatusPill';
import { operations, balances, holdings, holds, webhookDeliveries, getOperationById, getDeliveriesForEndpoint } from '@/lib/mockData';

export const metadata = { title: 'operation detail – Canton Pillar' };
export function generateStaticParams() { return operations.map((item) => ({ id: item.id })); }
export default function Detail({ params }: { params: { id: string } }) {
  const item = getOperationById(params.id);
  if (!item) notFound();
    const rows = Object.entries(item).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)] as [string, string]);
  return <div className="space-y-6"><Link className="text-sm font-semibold text-accent" href="/dashboard/operations">Back to operations</Link><DetailHeader object={item.object} id={item.id} status={'status' in item ? item.status : undefined} /><div className="grid gap-6 lg:grid-cols-2"><AttributeList rows={rows} /><CodeBlock value={item} /></div><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-ink">Timeline</h2><div className="mt-4"><Timeline items={item.transitions} /></div>{item.intent_id ? <Link className="mt-4 block font-mono text-sm text-accent" href={`/dashboard/intents/${item.intent_id}`}>Intent {item.intent_id}</Link> : null}<div className="mt-4 rounded-2xl bg-bgSoft p-4 font-mono text-sm">update_reference: {item.ledger.update_reference}<br />effective_at: {item.ledger.effective_at}</div></section></div>;
}
