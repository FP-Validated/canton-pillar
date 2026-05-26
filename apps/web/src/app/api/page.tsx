const params = [
  ['amount', 'integer', 'Required amount in the smallest unit for the asset.'],
  ['from_account', 'string', 'Source account ID for the transfer.'],
  ['to_account', 'string', 'Destination account ID for the transfer.'],
  ['asset', 'string', 'Asset ID, such as asst_usdc_demo.'],
  ['metadata', 'object', 'Optional key-value metadata returned on the object.']
];

const errors = [
  ['idempotency_required', 'Requests that mutate state require an Idempotency-Key header.'],
  ['asset_inactive', 'The requested asset is not active for transfers.'],
  ['insufficient_funds', 'The source account does not have enough available holding balance.'],
  ['restriction_violation', 'A policy restriction prevented the transfer.']
];

export default function ApiPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[240px_1fr]">
      <aside className="rounded-3xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slateMuted shadow-sm">
        {['Authentication', 'Intents', 'Holdings', 'Holds', 'Assets', 'Events', 'Webhooks'].map((item) => (
          <div key={item} className="rounded-2xl px-4 py-3 even:bg-bgSoft">{item}</div>
        ))}
      </aside>
      <article className="space-y-10">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-accent">Transfer intents</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">POST /v1/transfer_intents</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slateMuted">Create an intent to move asset value between two accounts. The response is an intent object plus an operation reference for asynchronous tracking.</p>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">HTTP signature</h2>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-ink p-5 text-sm text-slate-100"><code>{`POST /v1/transfer_intents
Authorization: Bearer pk_test_...
Idempotency-Key: ik_4c0f6a
Content-Type: application/json`}</code></pre>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Request body parameters</h2>
          <table className="mt-4 min-w-full divide-y divide-slate-100 text-left text-sm">
            <tbody className="divide-y divide-slate-100">
              {params.map(([name, type, description]) => <tr key={name}><td className="py-3 font-mono font-semibold text-accent">{name}</td><td className="py-3 font-mono text-xs text-slateMuted">{type}</td><td className="py-3 text-slateMuted">{description}</td></tr>)}
            </tbody>
          </table>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Response body</h2>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-ink p-5 text-sm leading-6 text-slate-100"><code>{`{
  "id": "trint_7Kq2Vm91",
  "object": "transfer_intent",
  "amount": 2500000,
  "asset": "asst_usdc_demo",
  "from_account": "acct_treasury_001",
  "to_account": "acct_vendor_874",
  "status": "processing",
  "operation": "op_5pK91XdR2",
  "metadata": {
    "invoice": "inv_demo_2044"
  },
  "created": "2026-05-26T12:01:04Z"
}`}</code></pre>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Errors</h2>
          <table className="mt-4 min-w-full divide-y divide-slate-100 text-left text-sm">
            <tbody className="divide-y divide-slate-100">
              {errors.map(([code, description]) => <tr key={code}><td className="py-3 font-mono font-semibold text-rose-700">{code}</td><td className="py-3 text-slateMuted">{description}</td></tr>)}
            </tbody>
          </table>
        </section>

        <section className="rounded-3xl bg-bgSoft p-6">
          <h2 className="text-xl font-bold">Idempotency</h2>
          <p className="mt-3 leading-7 text-slateMuted">Per IC-04, every mutating request must include an `Idempotency-Key` header. Reusing the same key with the same request returns the original result; reusing it with a different request is rejected.</p>
        </section>
      </article>
    </div>
  );
}
