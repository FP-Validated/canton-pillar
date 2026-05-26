import Link from 'next/link';

export function Pager({ prev, next }: { prev?: { href: string; label?: string; title?: string }; next?: { href: string; label?: string; title?: string } }) {
  return <nav className="mt-12 grid gap-4 border-t border-slate-200 pt-8 sm:grid-cols-2">{prev ? <Link href={prev.href} className="rounded-2xl border border-slate-200 p-4 text-sm hover:border-accent/40"><span className="block text-slateMuted">Previous</span><span className="font-semibold text-ink">{prev.label ?? prev.title}</span></Link> : <span />}{next ? <Link href={next.href} className="rounded-2xl border border-slate-200 p-4 text-right text-sm hover:border-accent/40"><span className="block text-slateMuted">Next</span><span className="font-semibold text-ink">{next.label ?? next.title}</span></Link> : null}</nav>;
}
