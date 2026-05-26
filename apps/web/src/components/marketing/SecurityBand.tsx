import { Container } from './Container';

const items = [
  ['HMAC-signed events', 'Every webhook delivery is signed so receivers can verify origin and payload integrity.'],
  ['Audited operations', 'Each asynchronous action carries an operation record for review, retry, and support workflows.'],
  ['Scoped API keys', 'Keys are constrained by environment and permission so teams can separate automation safely.'],
  ['Ledger-of-truth', 'Balances and state transitions are derived from committed asset movement, not mutable shortcuts.']
];

export function SecurityBand() {
  return (
    <section className="bg-ink py-16 text-white">
      <Container>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map(([title, body]) => (
            <div key={title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h3 className="font-bold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
