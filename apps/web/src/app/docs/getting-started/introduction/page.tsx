import type { Metadata } from 'next';
import Link from 'next/link';
import { DocPage } from '@/components/docs/DocPage';
import { ApiTable } from '@/components/docs/ApiTable';
import { Callout } from '@/components/docs/Callout';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { Diagram } from '@/components/docs/Diagram';
import { FeatureCard } from '@/components/docs/FeatureCard';
import { KeyValueList } from '@/components/docs/KeyValueList';
import { Steps } from '@/components/docs/Steps';
import { ConceptContent, GuideContent, ArchitectureContent, OperationContent, architectureBase, ids } from '@/components/docs/content';

export const metadata: Metadata = { title: 'Introduction – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Introduction" eyebrow="Getting started" description="Understand the product boundary and the operating model." href="/docs/getting-started/introduction" references={[]}><><h2 id="what-is-it">What Canton Pillar is</h2><p>Canton Pillar is a payments runtime for regulated asset products. It gives application teams a stable API for issuing, transferring, redeeming, holding, and observing assets while keeping ledger-specific mechanics inside the platform boundary.</p><h2 id="who">Who it is for</h2><p>It is built for fintech, treasury, exchange, and institutional teams that need auditable movement of customer assets without asking every product engineer to become a ledger operator.</p><h2 id="three-pillars">Three pillars</h2><KeyValueList items={[{term:'Intent-first',description:'Clients request business outcomes; the runtime owns validation and settlement.'},{term:'Ledger of truth',description:'Committed facts are projected into customer-safe read models.'},{term:'Webhook-first',description:'Every important state transition can be delivered, retried, and replayed.'}]}/><Diagram title="Mental model">{'Client app -> Intent API -> Operation -> Ledger truth -> Projection -> Signed event'}</Diagram><h2 id="next">What to read next</h2><p>Continue with <Link href="/docs/getting-started/quickstart">Quickstart</Link>, then <Link href="/docs/getting-started/object-model">Object model</Link>.</p></></DocPage>;
}
