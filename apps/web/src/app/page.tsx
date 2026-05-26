import Link from 'next/link';

const objects = [
  ['issue_intent', 'Create newly issued asset units under an issuer-controlled workflow.', 'issint_'],
  ['transfer_intent', 'Move asset value between accounts through an intent lifecycle.', 'trint_'],
  ['redeem_intent', 'Redeem asset value back to the issuer under policy controls.', 'redint_'],
  ['hold', 'Reserve value for a downstream settlement or compliance decision.', 'hold_'],
  ['holding', 'Projected account-level asset balance available to the API.', 'hldg_'],
  ['asset', 'A configured asset with issuance, transfer, and redemption policy.', 'asst_'],
  ['operation', 'A traceable asynchronous runtime operation.', 'op_'],
  ['event', 'A thin webhook event emitted from state transitions.', 'evt_'],
  ['webhook_endpoint', 'A configured delivery target with signing and retry policy.', 'we_']
];

export default function HomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="mb-4 text-sm font-bold tracking-[0.24em] text-accent">CANTON-NATIVE PAYMENTS RUNTIME</p>
          <h1 className="text-5xl font-bold tracking-tight text-ink md:text-6xl">The payments runtime for Canton-backed assets.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slateMuted">
            Canton Pillar gives product teams a clean `/v1` API for issuing, transferring, redeeming, and observing ledger-backed assets without exposing Canton internals to customers.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/api" className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accentDark">
              Read API reference
            </Link>
            <Link href="/dashboard" className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-ink hover:border-accent hover:text-accent">
              Open dashboard
            </Link>
          </div>
        </div>
        <pre className="overflow-x-auto rounded-3xl bg-ink p-6 text-sm leading-6 text-slate-100 shadow-2xl"><code>{`curl https://api.cantonpillar.example/v1/transfer_intents \\
  -H "Authorization: Bearer pk_test_..." \\
  -H "Idempotency-Key: ik_4c0f6a" \\
  -d '{
    "amount": 2500000,
    "asset": "asst_usdc_demo",
    "from_account": "acct_treasury_001",
    "to_account": "acct_vendor_874"
  }'

{
  "id": "trint_7Kq2Vm91",
  "object": "transfer_intent",
  "status": "processing",
  "operation": "op_5pK91XdR2"
}`}</code></pre>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ['Intent-first API', 'REST-style verbs over Canton workflows.'],
            ['Ledger-of-truth', 'Pillar never invents balances; every state mutation is rooted on the Canton ledger.'],
            ['Webhook-first', 'HMAC-signed thin events with idempotent retries.']
          ].map(([title, body]) => (
            <div key={title} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-bold text-ink">{title}</h2>
              <p className="mt-3 leading-7 text-slateMuted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-bold tracking-tight">Object model</h2>
        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-bgSoft text-xs uppercase tracking-wide text-slateMuted">
              <tr><th className="px-6 py-4">Object</th><th className="px-6 py-4">Description</th><th className="px-6 py-4">Example ID prefix</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {objects.map(([object, description, prefix]) => (
                <tr key={object}><td className="px-6 py-4 font-mono font-semibold text-ink">{object}</td><td className="px-6 py-4 text-slateMuted">{description}</td><td className="px-6 py-4 font-mono text-accent">{prefix}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="rounded-3xl bg-bgSoft p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Deployment modes</p>
          <h2 className="mt-2 text-3xl font-bold">Deployment model changes, API experience does not.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {['hosted', 'customer-validator', 'self-hosted'].map((mode) => <div key={mode} className="rounded-2xl bg-white p-6 font-mono font-semibold shadow-sm">{mode}</div>)}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-6 py-10 text-sm text-slateMuted md:flex-row">
        <span>© Canton Pillar prototype. Not for production use.</span>
        <Link href="https://github.com/FP-Validated/pillar" className="font-semibold text-accent">GitHub repository</Link>
      </footer>
    </>
  );
}
