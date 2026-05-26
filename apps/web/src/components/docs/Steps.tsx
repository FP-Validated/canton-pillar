import type { ReactNode } from 'react';

export function Steps({ steps }: { steps: { title: string; body: ReactNode }[] }) {
  return <ol className="my-6 space-y-5">{steps.map((step, index) => <li key={step.title} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{index + 1}</span><div><h3 className="mt-1 text-lg font-semibold text-ink">{step.title}</h3><div className="mt-2 text-sm leading-7 text-slateMuted">{step.body}</div></div></li>)}</ol>;
}
