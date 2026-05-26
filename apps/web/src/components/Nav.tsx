'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/api', label: 'API' },
  { href: '/docs', label: 'Docs' }
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-ink">
          Canton Pillar
        </Link>
        <div className="flex items-center gap-6 text-sm font-medium">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? 'text-accent' : 'text-slateMuted hover:text-ink'}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/get-api-keys"
            className="rounded-full bg-accent px-4 py-2 font-semibold text-white shadow-sm hover:bg-accentDark"
          >
            Get API keys
          </Link>
        </div>
      </nav>
    </header>
  );
}
