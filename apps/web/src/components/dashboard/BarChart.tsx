export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return <svg viewBox="0 0 420 180" className="h-48 w-full" role="img" aria-label="Bar chart">{data.map((item, index) => { const h = (item.value / max) * 120; const x = 20 + index * 56; return <g key={item.label}><rect x={x} y={140 - h} width="34" height={h} rx="8" className="fill-accent" /><text x={x + 17} y="162" textAnchor="middle" className="fill-slate-500 text-[10px] font-bold">{item.label}</text><text x={x + 17} y={132 - h} textAnchor="middle" className="fill-ink text-[10px] font-black">{item.value}</text></g>; })}</svg>;
}
