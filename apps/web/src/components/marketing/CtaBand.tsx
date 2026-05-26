import Link from 'next/link';
import { Container } from './Container';

export function CtaBand() {
  return (
    <section className="py-20">
      <Container>
        <div className="rounded-[2rem] bg-ink p-8 text-white shadow-2xl md:p-12">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">Start building</p>
              <h2 className="mt-3 text-4xl font-bold tracking-tight">Ship the first asset movement through a stable API.</h2>
              <p className="mt-4 max-w-2xl leading-7 text-slate-300">Create test credentials, read the integration guide, and model the first intent with predictable operations and events.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/get-api-keys" className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accentDark">Get API keys</Link>
              <Link href="/docs" className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">Read the docs</Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
