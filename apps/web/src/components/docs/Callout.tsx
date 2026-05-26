import type { ReactNode } from 'react';

const styles = {
  info: 'border-blue-200 bg-blue-50 text-blue-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  note: 'border-slate-200 bg-white text-ink',
  caution: 'border-rose-200 bg-rose-50 text-rose-950'
};

export function Callout({ variant = 'note', title, children }: { variant?: keyof typeof styles; title?: string; children: ReactNode }) {
  return <aside className={`my-6 rounded-2xl border p-5 ${styles[variant]}`}>{title ? <p className="mb-2 font-semibold">{title}</p> : null}<div className="text-sm leading-7">{children}</div></aside>;
}
