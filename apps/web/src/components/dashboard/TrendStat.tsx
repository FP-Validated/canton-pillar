import { Sparkline } from './Sparkline';

export function TrendStat({ label, value, change, points }: { label: string; value: string; change: number; points: number[] }) {
  const up = change >= 0;
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wide text-slateMuted">{label}</div><div className="mt-2 flex items-baseline justify-between gap-3"><div className="text-2xl font-black text-ink">{value}</div><div className={up ? 'text-xs font-black text-emerald-700' : 'text-xs font-black text-rose-700'}>{up ? 'up' : 'down'} {Math.abs(change)}%</div></div><div className="mt-4 h-12"><Sparkline points={points} /></div></article>;
}
