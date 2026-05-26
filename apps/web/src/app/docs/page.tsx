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

export const metadata: Metadata = { title: 'Documentation – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Documentation" eyebrow="Canton Pillar" description="Enterprise documentation for building, operating, and auditing Canton Pillar integrations." href="/docs" references={[]}><>
<section className="rounded-3xl bg-bgSoft p-8"><h2 id="start">Build ledger-grade asset flows without ledger coupling</h2><p>Canton Pillar gives product teams intent-first APIs, auditable operations, customer-safe read models, and signed webhooks for regulated asset movement.</p></section>
<div className="mt-8 grid gap-4 sm:grid-cols-2"><FeatureCard href="/docs/getting-started/introduction" icon="GS" title="Getting started" body="Learn the mental model and run the first transfer intent."/><FeatureCard href="/docs/concepts/accounts" icon="CO" title="Concepts" body="Understand accounts, assets, balances, intents, holds, operations, and events."/><FeatureCard href="/docs/guides/issuing-assets" icon="GD" title="Guides" body="Implement reliable issue, transfer, redeem, webhook, and versioning workflows."/><FeatureCard href="/docs/architecture/overview" icon="AR" title="Architecture" body="See how the API edge, command runtime, ledger truth, projections, and webhooks fit together."/></div>
<h2 id="popular-topics">Popular topics</h2><ul><li><Link href="/docs/getting-started/quickstart">Quickstart</Link></li><li><Link href="/docs/concepts/idempotency">Idempotency</Link></li><li><Link href="/docs/guides/building-reliable-webhooks">Reliable webhooks</Link></li><li><Link href="/docs/getting-started/deployment-modes">Deployment modes</Link></li></ul>
<Callout variant="success" title="What's new"><p>The current docs add operational runbooks, event references, deployment responsibilities, and security guidance. Read the <Link href="/docs/resources/changelog">changelog</Link>.</p></Callout>
</></DocPage>;
}
