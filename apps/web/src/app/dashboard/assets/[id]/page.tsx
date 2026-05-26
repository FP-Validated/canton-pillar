import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataTable, FilterRow } from '@/components/dashboard/DataTable';
import { DetailHeader, AttributeList } from '@/components/dashboard/DetailHeader';
import { CodeBlock } from '@/components/dashboard/CodeBlock';
import { Timeline } from '@/components/dashboard/Timeline';
import { StatusPill } from '@/components/StatusPill';
import { assets, balances, holdings, holds, webhookDeliveries, getAssetById, getDeliveriesForEndpoint } from '@/lib/mockData';

export const metadata = { title: 'asset detail – Canton Pillar' };
export function generateStaticParams() { return assets.map((item) => ({ id: item.id })); }
export default function Detail({ params }: { params: { id: string } }) {
  const item = getAssetById(params.id);
  if (!item) notFound();
  const assetBalances = balances.filter((balance) => balance.asset_id === item.id);
const assetHoldings = holdings.filter((holding) => holding.asset_id === item.id);
  const rows = Object.entries(item).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)] as [string, string]);
  return <div className="space-y-6"><Link className="text-sm font-semibold text-accent" href="/dashboard/assets">Back to assets</Link><DetailHeader object={item.object} id={item.id} status={'status' in item ? item.status : undefined} /><div className="grid gap-6 lg:grid-cols-2"><AttributeList rows={rows} /><CodeBlock value={item} /></div><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-ink">Restrictions</h2><div className="mt-4 flex flex-wrap gap-2">{item.restrictions.map((restriction) => <span key={restriction} className="rounded-full bg-bgSoft px-3 py-1 text-xs font-semibold text-slateMuted">{restriction}</span>)}</div><h2 className="mt-6 text-lg font-bold text-ink">Balances</h2><div className="mt-4 space-y-2">{assetBalances.map((balance) => <span key={balance.id} className="block font-mono text-sm">{balance.account_id} · {balance.total}</span>)}</div><h2 className="mt-6 text-lg font-bold text-ink">Holdings</h2><div className="mt-4 space-y-2">{assetHoldings.map((holding) => <Link key={holding.id} className="block font-mono text-sm text-accent" href={`/dashboard/holdings/${holding.id}`}>{holding.id} · {holding.quantity}</Link>)}</div></section></div>;
}
