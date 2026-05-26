export default function ConceptsDocsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-bold tracking-tight">Concepts</h1>
      <p className="mt-6 leading-8 text-slateMuted">The concepts guide will explain the Canton Pillar object model: intents describe requested state changes, holdings expose available balances, holds reserve value, and operations trace asynchronous execution.</p>
      <p className="mt-4 leading-8 text-slateMuted">The product API remains Canton-invisible. Developers work with account, asset, intent, event, and operation IDs rather than ledger implementation details.</p>
    </section>
  );
}
