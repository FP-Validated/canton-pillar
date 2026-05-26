import { Container } from './Container';
import { Eyebrow } from './Eyebrow';

const steps = [
  ['intent', 'Client asks for a business outcome with a stable request key.'],
  ['operation', 'Pillar tracks validation, settlement, and retry-safe completion.'],
  ['event', 'Subscribers receive thin signed events for state transitions.']
];

export function LifecycleDiagram() {
  return (
    <section className="bg-ink py-20 text-white">
      <Container>
        <Eyebrow className="text-white/70">Intent to event lifecycle</Eyebrow>
        <h2 className="mt-3 text-4xl font-bold tracking-tight">One chain of custody from API call to observable result.</h2>
        <div className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {steps.map(([title, body], index) => (
              <div key={title} className="contents">
                <div className="rounded-2xl bg-white p-6 text-ink">
                  <p className="font-mono text-sm font-bold text-accent">{title}</p>
                  <p className="mt-3 text-sm leading-6 text-slateMuted">{body}</p>
                </div>
                {index < steps.length - 1 ? (
                  <svg className="mx-auto hidden h-8 w-16 text-accent md:block" viewBox="0 0 64 32" fill="none" aria-hidden="true">
                    <path d="M4 16h52M44 6l12 10-12 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
