'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { accounts, apiKeys, apiRequestLog, assets, events, holdings, holds, issueIntents, operations, redeemIntents, transferIntents, webhookEndpoints } from '@/lib/mockData';

const groups = [
  { label: 'Activity', items: [['Overview', '/dashboard', 0], ['Intents', '/dashboard/intents', issueIntents.length + redeemIntents.length + transferIntents.length], ['Operations', '/dashboard/operations', operations.length], ['Events', '/dashboard/events', events.length]] },
  { label: 'Operations', items: [['Holdings', '/dashboard/holdings', holdings.length], ['Holds', '/dashboard/holds', holds.length], ['Webhooks', '/dashboard/webhooks', webhookEndpoints.length], ['Accounts', '/dashboard/accounts', accounts.length], ['Assets', '/dashboard/assets', assets.length]] },
  { label: 'Settings', items: [['API keys', '/dashboard/api-keys', apiKeys.length], ['Developers', '/dashboard/developers', apiRequestLog.length]] }
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="h-screen w-[264px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
      <Link href="/" className="block rounded-2xl px-4 py-3 text-lg font-black text-ink">Canton Pillar</Link>
      <div className="mx-4 mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">Test mode</div>
      <nav className="mt-6 space-y-6 text-sm font-semibold">
        {groups.map((group) => <div key={group.label}><div className="px-4 text-[11px] font-black uppercase tracking-[0.18em] text-slateMuted">{group.label}</div><div className="mt-2 space-y-1">{group.items.map(([label, href, count]) => { const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={`flex items-center justify-between rounded-2xl px-4 py-3 ${active ? 'bg-bgSoft text-accentDark' : 'text-slateMuted hover:bg-bgSoft hover:text-ink'}`}><span>{label}</span>{count ? <span className="rounded-full bg-white px-2 py-0.5 text-[11px] ring-1 ring-slate-200">{count}</span> : null}</Link>; })}</div></div>)}
      </nav>
    </aside>
  );
}
