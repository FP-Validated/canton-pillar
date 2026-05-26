import type { ReactNode } from 'react';
import { Breadcrumb } from './Breadcrumb';
import { OnThisPage } from './OnThisPage';
import { Pager } from './Pager';
import { pagerFor } from './nav';

export function DocPage({ title, eyebrow, description, href, children, toc, references = [] }: { title: string; eyebrow: string; description?: string; href: string; children: ReactNode; toc?: { id: string; title: string; level?: 2 | 3 }[]; references?: { label: string; href: string }[] }) {
  const pager = pagerFor(href);
  return <div className="flex min-w-0 flex-1"><article className="mx-auto w-full max-w-3xl px-6 py-12"><Breadcrumb items={[{ label: eyebrow }, { label: title }]} /><header className="mb-10"><p className="text-sm font-semibold uppercase tracking-widest text-accentDark">{eyebrow}</p><h1 className="mt-3 text-4xl font-bold tracking-tight text-ink">{title}</h1>{description ? <p className="mt-5 text-lg leading-8 text-slateMuted">{description}</p> : null}</header><div className="prose-docs">{children}</div>{references.length ? <section className="mt-10 rounded-2xl border border-slate-200 bg-bgSoft p-5"><h2 id="references" className="text-xl font-semibold text-ink">References</h2><ul className="mt-3 space-y-2 text-sm text-slateMuted">{references.map((ref) => <li key={ref.href}><a className="text-accentDark hover:underline" href={ref.href}>{ref.label}</a></li>)}</ul></section> : null}<Pager prev={pager.prev} next={pager.next} /></article><OnThisPage items={toc} /></div>;
}
