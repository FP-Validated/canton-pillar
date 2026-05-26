import { formatRelative } from '@/lib/dashboard/selectors';

export function Timeline({ steps, direction = 'vertical' }: { steps: { status?: string; step?: string; at?: string; time?: string; note?: string; detail?: string }[]; direction?: 'vertical' | 'horizontal' }) {
  const horizontal = direction === 'horizontal';
  return (
    <div className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${horizontal ? 'overflow-x-auto' : ''}`}>
      <h2 className="text-lg font-black text-ink">Timeline</h2>
      <ol className={`mt-4 ${horizontal ? 'flex min-w-max gap-4' : 'space-y-4'}`}>
        {steps.map((step, index) => {
          const at = step.at ?? step.time ?? '';
          const previous = index > 0 ? new Date(at).getTime() - new Date(steps[index - 1].at ?? steps[index - 1].time ?? at).getTime() : 0;
          return <li key={`${step.status ?? step.step}-${index}`} className={`relative ${horizontal ? 'w-52' : 'pl-6'}`}><span className={`absolute ${horizontal ? '-top-1 left-0' : 'left-0 top-1'} h-3 w-3 rounded-full bg-accent ring-4 ring-bgSoft`} /><div className="text-sm font-black text-ink">{step.status ?? step.step}</div><div className="text-xs text-slateMuted">{at ? formatRelative(at) : ''}{previous > 0 ? ` · +${Math.round(previous / 1000)}s` : ''}</div><div className="mt-1 text-xs text-slateMuted">{step.note ?? step.detail}</div></li>;
        })}
      </ol>
    </div>
  );
}
