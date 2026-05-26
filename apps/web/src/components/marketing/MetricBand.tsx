import { Container } from './Container';

const metrics = [
  ['p95 < 350ms', 'intent create'],
  ['99.95%', 'projection availability target'],
  ['0', 'silent balance changes'],
  ['5 minutes', 'deployment to first call']
];

export function MetricBand() {
  return (
    <section className="bg-bgSoft py-16">
      <Container>
        <div className="grid gap-5 md:grid-cols-4">
          {metrics.map(([value, label]) => (
            <div key={label} className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <p className="text-3xl font-bold tracking-tight text-ink">{value}</p>
              <p className="mt-2 text-sm font-semibold text-slateMuted">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs font-bold uppercase tracking-wide text-slateMuted">illustrative target</p>
      </Container>
    </section>
  );
}
