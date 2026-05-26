'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navSections } from './data';

export function ApiRefSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-[280px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white pr-6 lg:block">
      <nav className="space-y-8 py-8">
        {navSections.map((section) => (
          <div key={section.title}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slateMuted">{section.title}</h2>
            <div className="space-y-1">
              {section.items.map(([label, href]) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`block rounded-xl px-3 py-2 text-sm transition ${active ? 'bg-accent text-white shadow-sm' : 'text-slateMuted hover:bg-bgSoft hover:text-ink'}`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
