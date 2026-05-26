import Link from 'next/link';

export function FeatureCard({ href, icon, title, body }: { href: string; icon: string; title: string; body: string }) {
  return <Link href={href} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"><div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-bgSoft font-mono text-sm font-bold text-accentDark">{icon}</div><h3 className="text-lg font-semibold text-ink">{title}</h3><p className="mt-2 text-sm leading-7 text-slateMuted">{body}</p></Link>;
}
