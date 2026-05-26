'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  ['Overview', '/dashboard'],
  ['Intents', '/dashboard/intents'],
  ['Holdings', '/dashboard/holdings'],
  ['Holds', '/dashboard/holds'],
  ['Operations', '/dashboard/operations'],
  ['Events', '/dashboard/events'],
  ['Webhooks', '/dashboard/webhooks'],
  ['Accounts', '/dashboard/accounts'],
  ['Assets', '/dashboard/assets'],
  ['API keys', '/dashboard/api-keys'],
  ['Developers', '/dashboard/developers']
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="h-screen w-[240px] shrink-0 border-r border-slate-200 bg-white p-4">
      <Link href="/" className="block rounded-2xl px-4 py-3 text-lg font-black text-ink">Canton Pillar</Link>
      <nav className="mt-6 space-y-1 text-sm font-semibold">
        {items.map(([label, href]) => {
          const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} className={`block rounded-2xl px-4 py-3 ${active ? 'bg-bgSoft text-accentDark' : 'text-slateMuted hover:bg-bgSoft hover:text-ink'}`}>{label}</Link>;
        })}
      </nav>
    </aside>
  );
}
