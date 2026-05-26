import Link from 'next/link';

const docs = [
  { href: '/docs/quickstart', title: 'Quickstart', body: 'Install the prototype, run the web app, and explore the mocked workflow.' },
  { href: '/docs/concepts', title: 'Concepts', body: 'Understand intents, holdings, holds, assets, operations, and events.' },
  { href: '/docs/webhooks', title: 'Webhooks', body: 'Design signed event delivery, retries, and dead-letter handling.' },
  { href: '/docs/deployment', title: 'Deployment', body: 'Compare hosted, customer-validator, and self-hosted modes.' }
];

export default function DocsPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <p className="text-sm font-bold uppercase tracking-wide text-accent">Documentation</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">Build with Canton Pillar</h1>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {docs.map((doc) => (
          <Link key={doc.href} href={doc.href} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm hover:border-accent">
            <h2 className="text-2xl font-bold text-ink">{doc.title}</h2>
            <p className="mt-3 leading-7 text-slateMuted">{doc.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
