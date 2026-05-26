import { Sparkline } from './Sparkline';

export function KpiCard({ label, value, helper, trend }: { label: string; value: string; helper?: string; trend?: { points: number[]; delta: number } }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slateMuted">{label}</p>
      <div className="mt-3 flex items-start justify-between gap-3">
        <p className="text-2xl font-bold text-ink">{value}</p>
        {trend ? <span className={trend.delta >= 0 ? 'text-xs font-black text-emerald-700' : 'text-xs font-black text-rose-700'}>{trend.delta >= 0 ? 'up' : 'down'} {Math.abs(trend.delta)}%</span> : null}
      </div>
      {trend ? <div className="mt-3 h-10"><Sparkline points={trend.points} /></div> : null}
      {helper ? <p className="mt-2 text-xs text-slateMuted">{helper}</p> : null}
    </div>
  );
}
