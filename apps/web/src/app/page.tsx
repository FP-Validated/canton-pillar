import { CodeShowcase } from '@/components/marketing/CodeShowcase';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { CtaBand } from '@/components/marketing/CtaBand';
import { FaqAccordion } from '@/components/marketing/FaqAccordion';
import { FeatureGrid } from '@/components/marketing/FeatureGrid';
import { Footer } from '@/components/marketing/Footer';
import { Hero } from '@/components/marketing/Hero';
import { LifecycleDiagram } from '@/components/marketing/LifecycleDiagram';
import { LogoCloud } from '@/components/marketing/LogoCloud';
import { MetricBand } from '@/components/marketing/MetricBand';
import { ObjectModelTable } from '@/components/marketing/ObjectModelTable';
import { SecurityBand } from '@/components/marketing/SecurityBand';
import { SplitFeature } from '@/components/marketing/SplitFeature';
import { Testimonial } from '@/components/marketing/Testimonial';
import { UseCaseStrip } from '@/components/marketing/UseCaseStrip';

const features = [
  ['Intent-first API', 'Create issue, transfer, and redeem intents that describe the business outcome before the runtime performs settlement work.'],
  ['Ledger source-of-truth', 'Projected balances come from committed asset movement, giving operators a reliable boundary between requests and truth.'],
  ['Webhook-first', 'Thin signed events let downstream systems react to lifecycle changes without polling or coupling to internals.'],
  ['Idempotency you can trust', 'Request keys make retries safe for clients, workers, and support teams during network failures.'],
  ['Polyglot SDKs', 'Use raw HTTP or typed clients while preserving the same object model and error semantics.'],
  ['Three deployment modes', 'Run hosted, customer-validator, or self-hosted without changing application code.']
].map(([title, body]) => ({ title, body }));

const splitRows = [
  {
    eyebrow: 'Issuance',
    title: 'Issue assets with policy controls.',
    body: 'Model issuance as an intent, attach issuer policy, and let the runtime produce auditable operations and events for every state transition.',
    figure: <pre className="overflow-x-auto rounded-2xl bg-ink p-5 text-sm leading-6 text-slate-100"><code>{`{
  "id": "issint_91Kp2",
  "asset": "asst_usdc_demo",
  "amount": 10000000,
  "destination": "acct_treasury_001",
  "policy": "issuer_approval_required",
  "operation": "op_issue_7mQ"
}`}</code></pre>
  },
  {
    eyebrow: 'Settlement',
    title: 'Transfer with deterministic settlement.',
    body: 'Each transfer intent advances through explicit processing states so product, finance, and support teams can explain what happened without guessing.',
    reverse: true,
    figure: <div className="grid gap-3 text-sm font-semibold text-ink sm:grid-cols-3"><div className="rounded-2xl bg-white p-4 shadow-sm">trint_created</div><div className="rounded-2xl bg-white p-4 shadow-sm">op_processing</div><div className="rounded-2xl bg-white p-4 shadow-sm">evt_succeeded</div></div>
  },
  {
    eyebrow: 'Reconciliation',
    title: 'Reconcile and audit by default.',
    body: 'Operations, holdings, and events give finance teams the evidence they need to close books and investigate exceptions from one stable model.',
    figure: <div className="overflow-hidden rounded-2xl bg-white text-sm shadow-sm"><div className="grid grid-cols-3 bg-bgSoft p-3 font-bold text-ink"><span>Object</span><span>Status</span><span>Prefix</span></div><div className="grid grid-cols-3 p-3 text-slateMuted"><span>holding</span><span>available</span><span>hldg_</span></div><div className="grid grid-cols-3 border-t border-slate-100 p-3 text-slateMuted"><span>operation</span><span>succeeded</span><span>op_</span></div></div>
  }
];

export default function HomePage() {
  return (
    <>
      <Hero
        eyebrow="CANTON-NATIVE PAYMENTS RUNTIME"
        title="The payments runtime for Canton-backed assets."
        body="Canton Pillar gives product teams a polished /v1 API for issuing, transferring, redeeming, and observing Canton-backed assets. The ledger-of-truth model keeps balances and lifecycle events rooted in committed asset movement while the API stays clean for developers."
        primaryCta={{ label: 'Get API keys', href: '/get-api-keys' }}
        secondaryCta={{ label: 'Read the docs', href: '/docs' }}
      />
      <LogoCloud />
      <FeatureGrid features={features} />
      <LifecycleDiagram />
      <SplitFeature rows={splitRows} />
      <CodeShowcase />
      <ObjectModelTable />
      <ComparisonTable />
      <SecurityBand />
      <MetricBand />
      <UseCaseStrip />
      <Testimonial />
      <FaqAccordion />
      <CtaBand />
      <Footer />
    </>
  );
}
