import type { ReactNode } from 'react';

export function KeyValueList({ items }: { items: { term: string; description: ReactNode }[] }) {
  return <dl className="my-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-[180px_1fr]">{items.map((item) => <div key={item.term} className="contents"><dt className="font-mono text-sm font-semibold text-ink">{item.term}</dt><dd className="text-sm leading-7 text-slateMuted">{item.description}</dd></div>)}</dl>;
}
