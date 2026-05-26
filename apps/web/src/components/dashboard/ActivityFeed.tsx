import { formatRelative } from '@/lib/dashboard/selectors';

export function ActivityFeed({ items }: { items: { id: string; type?: string; title?: string; created: string; resource_id?: string }[] }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-ink">Activity</h2><ol className="mt-4 space-y-4">{items.map((item) => <li key={item.id} className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-accent" /><div className="min-w-0"><div className="text-sm font-bold text-ink">{item.title ?? item.type}</div><div className="truncate text-xs text-slateMuted">{formatRelative(item.created)}{item.resource_id ? ` · ${item.resource_id}` : ''}</div></div></li>)}</ol></section>;
}

export { formatRelative };
