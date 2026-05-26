import type { Metadata } from 'next';
import Link from 'next/link';
import { CodePane } from '@/components/apiref/CodePane';
import { ObjectSchema } from '@/components/apiref/ObjectSchema';
import { navSections, resources } from '@/components/apiref/data';

export const metadata: Metadata = { title: 'API reference | Canton Pillar' };

const prefixes = [
  ['account', 'acct_'], ['asset', 'asst_'], ['balance', 'bal_'], ['holding', 'hldg_'], ['issue intent', 'issint_'], ['redeem intent', 'redint_'], ['transfer intent', 'trint_'], ['hold', 'hold_'], ['operation', 'op_'], ['event', 'evt_'], ['webhook endpoint', 'we_'], ['API key descriptor', 'ak_'], ['request', 'req_'],
].map(([name, prefix]) => ({ name, type: prefix, required: true, description: `${name} identifier prefix.` }));

export default function ApiOverviewPage() {
  const gettingStarted = navSections[0].items.slice(1);
  return (
    <article className="space-y-10">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Canton Pillar API</p>
        <h1 className="text-4xl font-bold tracking-tight text-ink">API reference</h1>
        <p className="text-lg text-slateMuted">Build against the Canton Pillar v1 API with stable resource objects, cursor pagination, idempotent mutations, versioned responses, and webhook-first workflows.</p>
      </header>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold text-ink">Base URL and modes</h2>
        <p className="text-slateMuted">All examples use the v1 base URL. Test and live mode are determined by the API key family used for the request.</p>
        <CodePane code="https://api.pillar.example/v1" language="text" />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold text-ink">Required headers</h2>
        <CodePane code={`Authorization: Bearer plr_sk_test_51HY...\nPillar-Version: 2026-05-26\nIdempotency-Key: 9f2d1c8e-7a9c-4e6a-9fb9-f1a5c9f88b31`} language="http" />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold text-ink">ID prefixes</h2>
        <ObjectSchema fields={prefixes} />
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-ink">Resources</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {resources.map((resource) => (
            <Link key={resource.slug} href={`/api/${resource.slug}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-accent">
              <h3 className="font-semibold text-ink">{resource.title}</h3>
              <p className="mt-1 text-sm text-slateMuted">{resource.objectName}</p>
            </Link>
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-ink">Concepts</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {gettingStarted.map(([label, href]) => (
            <Link key={href} href={href} className="rounded-2xl border border-slate-200 bg-white p-4 text-ink shadow-sm transition hover:border-accent">{label}</Link>
          ))}
        </div>
      </section>
    </article>
  );
}
