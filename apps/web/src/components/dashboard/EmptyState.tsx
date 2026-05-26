import Link from 'next/link';

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { label: string; href: string } }) {
  return <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><h3 className="text-lg font-black text-ink">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm text-slateMuted">{body}</p>{action ? <Link href={action.href} className="mt-4 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-bold text-white">{action.label}</Link> : null}</div>;
}
