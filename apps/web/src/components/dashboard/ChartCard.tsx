import { Sparkline } from './Sparkline';

export function ChartCard({ title, description, variant = 'line', points, children }: { title: string; description?: string; variant?: 'line' | 'bars'; points?: number[]; children?: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4"><h2 className="text-lg font-black text-ink">{title}</h2>{description ? <p className="mt-1 text-sm text-slateMuted">{description}</p> : null}</div>{children ?? (points ? <div className="h-52"><Sparkline points={points} height={160} width={520} /></div> : null)}</section>;
}
