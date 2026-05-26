import Link from 'next/link';

export function RelatedPanel({ title, links }: { title: string; links: { label: string; href: string; meta?: string }[] }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-ink">{title}</h2><div className="mt-3 divide-y divide-slate-100">{links.map((link) => <Link key={`${link.href}-${link.label}`} href={link.href} className="flex items-center justify-between gap-4 py-3 text-sm font-bold text-ink hover:text-accentDark"><span>{link.label}</span>{link.meta ? <span className="font-mono text-xs text-slateMuted">{link.meta}</span> : null}</Link>)}</div></section>;
}
