export default function WebhooksDocsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-bold tracking-tight">Webhooks</h1>
      <p className="mt-6 leading-8 text-slateMuted">The webhooks guide will document event shapes, HMAC signatures, delivery attempts, retry scheduling, and dead-letter handling for thin event notifications.</p>
      <p className="mt-4 leading-8 text-slateMuted">Webhook consumers should fetch canonical object state from the API after receiving an event and should process delivery attempts idempotently.</p>
    </section>
  );
}
