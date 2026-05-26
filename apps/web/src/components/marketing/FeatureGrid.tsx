import { Container } from './Container';
import { Eyebrow } from './Eyebrow';

export type Feature = { title: string; body: string };

export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <section className="py-20">
      <Container>
        <Eyebrow>Platform primitives</Eyebrow>
        <h2 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-ink">Everything teams need to ship asset movement without leaking runtime complexity.</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
              <div className="mb-5 h-10 w-10 rounded-2xl bg-accent/10 ring-1 ring-accent/20" />
              <h3 className="text-xl font-bold text-ink">{feature.title}</h3>
              <p className="mt-3 leading-7 text-slateMuted">{feature.body}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
