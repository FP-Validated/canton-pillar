'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { docSections } from './nav';

export function Sidebar() {
  const pathname = usePathname();
  return <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-[260px] shrink-0 overflow-y-auto border-r border-slate-200 px-5 py-8 lg:block"><Link href="/docs" className={`mb-6 block text-sm font-semibold ${pathname === '/docs' ? 'text-accentDark' : 'text-ink'}`}>Documentation</Link><nav className="space-y-6">{docSections.map((section) => <div key={section.title}><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slateMuted">{section.title}</p><ul className="space-y-1">{section.links.map((link) => { const active = pathname === link.href; return <li key={link.href}><Link href={link.href} className={`block rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-accent/10 font-semibold text-accentDark' : 'text-slateMuted hover:bg-bgSoft hover:text-ink'}`}>{link.title}</Link></li>; })}</ul></div>)}</nav></aside>;
}
