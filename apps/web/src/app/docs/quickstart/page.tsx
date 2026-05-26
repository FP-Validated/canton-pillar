export default function QuickstartDocsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-bold tracking-tight">Quickstart</h1>
      <p className="mt-6 leading-8 text-slateMuted">The production quickstart will guide developers from a clean checkout to a running Canton Pillar environment with local services, seeded mock assets, and a configured API key.</p>
      <p className="mt-4 leading-8 text-slateMuted">This prototype page is intentionally static. Use `pnpm --filter @pillar/web dev` to run the web experience and inspect the mocked dashboard and API reference.</p>
    </section>
  );
}
