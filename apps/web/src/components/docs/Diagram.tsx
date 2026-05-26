export function Diagram({ children, title }: { children: string; title?: string }) {
  return <figure className="my-6 rounded-2xl border border-slate-200 bg-bgSoft p-4">{title ? <figcaption className="mb-3 text-sm font-semibold text-ink">{title}</figcaption> : null}<pre className="overflow-x-auto whitespace-pre font-mono text-sm leading-7 text-ink">{children}</pre></figure>;
}
