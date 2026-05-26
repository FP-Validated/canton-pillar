import Link from 'next/link';
import { Container } from './Container';
import { Eyebrow } from './Eyebrow';

type Cta = { label: string; href: string };

export function Hero({
  eyebrow,
  title,
  body,
  primaryCta,
  secondaryCta
}: {
  eyebrow: string;
  title: string;
  body: string;
  primaryCta: Cta;
  secondaryCta: Cta;
}) {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="absolute right-[-14rem] top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-accent/15 blur-3xl" />
      <div className="absolute bottom-[-18rem] left-[-12rem] h-[30rem] w-[30rem] rounded-full bg-accentDark/10 blur-3xl" />
      <Container className="relative grid gap-12 py-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-24">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-5 text-5xl font-bold tracking-tight text-ink md:text-6xl lg:text-7xl">{title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slateMuted">{body}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href={primaryCta.href} className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-accent/20 hover:bg-accentDark">
              {primaryCta.label}
            </Link>
            <Link href={secondaryCta.href} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-ink hover:border-accent hover:text-accent">
              {secondaryCta.label}
            </Link>
          </div>
        </div>
        <div className="rounded-[2rem] border border-slate-800/10 bg-ink p-4 shadow-2xl shadow-slate-900/20">
          <div className="mb-4 flex items-center gap-2 px-2 pt-1">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-300" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
            <span className="ml-3 font-mono text-xs text-slate-400">/v1/transfer_intents</span>
          </div>
          <pre className="overflow-x-auto rounded-3xl bg-slate-950 p-5 text-sm leading-6 text-slate-100"><code>{`curl https://api.cantonpillar.example/v1/transfer_intents \\
  -H "Authorization: Bearer plr_sk_test_..." \\
  -H "Idempotency-Key: req_4c0f6a" \\
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
}

{
  "id": "evt_transfer_succeeded",
  "type": "transfer_intent.succeeded",
  "data": { "intent": "trint_7Kq2Vm91" }
}`}</code></pre>
        </div>
      </Container>
    </section>
  );
}
