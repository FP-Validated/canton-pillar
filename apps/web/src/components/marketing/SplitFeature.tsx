import type { ReactNode } from 'react';
import { Container } from './Container';

export type SplitFeatureRow = { eyebrow: string; title: string; body: string; figure: ReactNode; reverse?: boolean };

export function SplitFeature({ rows }: { rows: SplitFeatureRow[] }) {
  return (
    <section className="py-20">
      <Container className="space-y-16">
        {rows.map((row) => (
          <div key={row.title} className={`grid gap-10 lg:grid-cols-2 lg:items-center ${row.reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">{row.eyebrow}</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink md:text-4xl">{row.title}</h2>
              <p className="mt-5 text-lg leading-8 text-slateMuted">{row.body}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-bgSoft p-5 shadow-sm">{row.figure}</div>
          </div>
        ))}
      </Container>
    </section>
  );
}
