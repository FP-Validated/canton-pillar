import Link from 'next/link';

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slateMuted"><ol className="flex flex-wrap items-center gap-2"><li><Link className="hover:text-accentDark" href="/docs">Docs</Link></li>{items.map((item) => <li key={item.label} className="flex items-center gap-2"><span>/</span>{item.href ? <Link className="hover:text-accentDark" href={item.href}>{item.label}</Link> : <span className="text-ink">{item.label}</span>}</li>)}</ol></nav>;
}
