'use client';

import { useEffect, useState } from 'react';

export function OnThisPage({ items }: { items?: { id: string; title: string; level?: 2 | 3 }[] }) {
  const [derived, setDerived] = useState<{ id: string; title: string; level?: 2 | 3 }[]>(items ?? []);
  useEffect(() => {
    if (items?.length) return;
    const headings = Array.from(document.querySelectorAll('article h2, article h3')).map((heading) => ({ id: heading.id, title: heading.textContent ?? '', level: heading.tagName === 'H3' ? 3 as const : 2 as const })).filter((item) => item.id && item.title);
    setDerived(headings);
  }, [items]);
  if (!derived.length) return null;
  return <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-[240px] shrink-0 overflow-y-auto px-5 py-8 xl:block"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slateMuted">On this page</p><ul className="space-y-2">{derived.map((item) => <li key={item.id} className={item.level === 3 ? 'pl-4' : ''}><a href={`#${item.id}`} className="text-sm text-slateMuted hover:text-accentDark">{item.title}</a></li>)}</ul></aside>;
}
