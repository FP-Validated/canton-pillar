export function Timeline({ items }: { items: { status?: string; at?: string; note?: string; step?: string; time?: string; detail?: string; reference?: string }[] }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-ink">Timeline</h2>
      <div className="mt-5 space-y-5 border-l-2 border-slate-200 pl-5">
        {items.map((item, index) => (
          <div key={`${item.status ?? item.step}-${index}`} className="relative">
            <div className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-accent" />
            <div className="flex justify-between gap-3"><h3 className="font-semibold text-ink">{item.status ?? item.step}</h3><span className="font-mono text-xs text-slateMuted">{item.at ?? item.time}</span></div>
            <p className="mt-1 text-sm text-slateMuted">{item.note ?? item.detail}</p>
            {item.reference ? <p className="mt-1 font-mono text-xs text-accent">{item.reference}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
