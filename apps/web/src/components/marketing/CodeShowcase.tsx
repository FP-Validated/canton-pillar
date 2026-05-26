'use client';

import { useState } from 'react';
import { Container } from './Container';
import { Eyebrow } from './Eyebrow';

const samples = {
  curl: `curl https://api.cantonpillar.example/v1/transfer_intents \\
  -H "Authorization: Bearer plr_sk_test_..." \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: req_transfer_001" \\
  -d '{"asset":"asst_usdc_demo","amount":2500000,"from_account":"acct_treasury_001","to_account":"acct_vendor_874"}'`,
  Node: `const intent = await pillar.transferIntents.create({
  asset: 'asst_usdc_demo',
  amount: 2500000,
  from_account: 'acct_treasury_001',
  to_account: 'acct_vendor_874'
}, { idempotencyKey: 'req_transfer_001' });`,
  Python: `intent = client.transfer_intents.create(
    asset='asst_usdc_demo',
    amount=2500000,
    from_account='acct_treasury_001',
    to_account='acct_vendor_874',
    idempotency_key='req_transfer_001',
)`,
  Java: `TransferIntent intent = client.transferIntents().create(
    TransferIntentCreate.builder()
      .asset("asst_usdc_demo")
      .amount(2500000)
      .fromAccount("acct_treasury_001")
      .toAccount("acct_vendor_874")
      .build(),
    RequestOptions.idempotencyKey("req_transfer_001")
);`
};

type SampleKey = keyof typeof samples;

export function CodeShowcase() {
  const [active, setActive] = useState<SampleKey>('curl');
  const keys = Object.keys(samples) as SampleKey[];

  return (
    <section className="py-20">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <Eyebrow>Polyglot SDKs</Eyebrow>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-ink">One transfer intent, the same shape in every client.</h2>
            <p className="mt-5 text-lg leading-8 text-slateMuted">Use raw HTTP or typed SDKs while preserving the same object names, idempotency behavior, and response semantics.</p>
          </div>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-ink shadow-2xl">
            <div className="flex gap-2 border-b border-white/10 p-3">
              {keys.map((key) => (
                <button key={key} onClick={() => setActive(key)} className={`rounded-full px-4 py-2 text-sm font-semibold ${active === key ? 'bg-white text-ink' : 'text-slate-300 hover:bg-white/10'}`}>
                  {key}
                </button>
              ))}
            </div>
            <pre className="overflow-x-auto p-6 text-sm leading-7 text-slate-100"><code>{samples[active]}</code></pre>
          </div>
        </div>
      </Container>
    </section>
  );
}
