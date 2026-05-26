import { CopyButton } from './CopyButton';

export function AttributesGrid({ items }: { items: { label: string; value: React.ReactNode; copy?: string }[] }) {
  return <dl className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">{items.map((item) => <div key={item.label} className="rounded-2xl bg-bgSoft p-4"><dt className="text-xs font-black uppercase tracking-wide text-slateMuted">{item.label}</dt><dd className="mt-2 flex items-center gap-2 break-all text-sm font-bold text-ink">{item.value}{item.copy ? <CopyButton value={item.copy} /> : null}</dd></div>)}</dl>;
}
