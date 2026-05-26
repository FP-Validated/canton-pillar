import { Container } from './Container';

export function Testimonial() {
  return (
    <section className="py-20">
      <Container>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm md:p-12">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">Hypothetical scenario</p>
          <blockquote className="mt-5 text-2xl font-semibold leading-10 text-ink">
            “A regulated treasury desk can give product teams a polished API while operations teams retain deterministic audit trails for every asset movement.”
          </blockquote>
          <p className="mt-6 text-sm font-semibold text-slateMuted">Fictional Head of Digital Assets, Meridian Custody</p>
        </div>
      </Container>
    </section>
  );
}
