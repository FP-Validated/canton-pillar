import { Container } from './Container';

const cases = [
  ['Issue stable tokens', 'Create controlled issuance flows with policy checks, operations, and webhook visibility.'],
  ['Settle institutional payments', 'Move value between known accounts through deterministic transfer intents.'],
  ['Power custody workflows', 'Reserve, release, and reconcile holdings without exposing backend machinery to clients.']
];

export function UseCaseStrip() {
  return (
    <section className="py-20">
      <Container>
        <div className="grid gap-5 md:grid-cols-3">
          {cases.map(([title, body]) => (
            <article key={title} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <h3 className="text-xl font-bold text-ink">{title}</h3>
              <p className="mt-3 leading-7 text-slateMuted">{body}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
