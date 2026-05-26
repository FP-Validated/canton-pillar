export function TokenBadge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex max-w-full items-center rounded-lg bg-bgSoft px-2 py-1 font-mono text-xs font-bold text-ink ring-1 ring-slate-200">{children}</span>;
}
