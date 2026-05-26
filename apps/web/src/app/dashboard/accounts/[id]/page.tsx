import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataTable, FilterRow } from '@/components/dashboard/DataTable';
import { DetailHeader, AttributeList } from '@/components/dashboard/DetailHeader';
import { CodeBlock } from '@/components/dashboard/CodeBlock';
import { Timeline } from '@/components/dashboard/Timeline';
import { StatusPill } from '@/components/StatusPill';
import { accounts, balances, holdings, holds, webhookDeliveries, getAccountById, getDeliveriesForEndpoint } from '@/lib/mockData';

export const metadata = { title: 'account detail – Canton Pillar' };
export function generateStaticParams() { return accounts.map((item) => ({ id: item.id })); }
export default function Detail({ params }: { params: { id: string } }) {
  const item = getAccountById(params.id);
  if (!item) notFound();
  const accountBalances = balances.filter((balance) => balance.account_id === item.id);
const accountHoldings = holdings.filter((holding) => holding.account_id === item.id);
  const rows = Object.entries(item).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)] as [string, string]);
  return <div className="space-y-6"><Link className="text-sm font-semibold text-accent" href="/dashboard/accounts">Back to accounts</Link><DetailHeader object={item.object} id={item.id} status={'status' in item ? item.status : undefined} /><div className="grid gap-6 lg:grid-cols-2"><AttributeList rows={rows} /><CodeBlock value={item} /></div><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-ink">Balances</h2><div className="mt-4 space-y-2">{accountBalances.map((balance) => <span key={balance.id} className="block font-mono text-sm">{balance.asset_id} · {balance.total}</span>)}</div><h2 className="mt-6 text-lg font-bold text-ink">Holdings</h2><div className="mt-4 space-y-2">{accountHoldings.map((holding) => <Link key={holding.id} className="block font-mono text-sm text-accent" href={`/dashboard/holdings/${holding.id}`}>{holding.id} · {holding.quantity}</Link>)}</div></section></div>;
}
