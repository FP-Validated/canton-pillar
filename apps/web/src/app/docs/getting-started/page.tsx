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

export const metadata: Metadata = { title: 'Getting started – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Getting started" eyebrow="Docs" description="A guided path from concepts to the first production-shaped integration." href="/docs/getting-started" references={[]}><><h2 id="paths">Choose a path</h2><div className="grid gap-4 sm:grid-cols-2"><FeatureCard href="/docs/getting-started/introduction" icon="01" title="Introduction" body="What Canton Pillar is and who uses it."/><FeatureCard href="/docs/getting-started/quickstart" icon="02" title="Quickstart" body="Create an account, key, transfer intent, operation, and event."/><FeatureCard href="/docs/getting-started/object-model" icon="03" title="Object model" body="Inventory objects, prefixes, statuses, and mutation rules."/><FeatureCard href="/docs/getting-started/deployment-modes" icon="04" title="Deployment modes" body="Compare hosted, customer-validator, and self-hosted."/></div><h2 id="reading-order">Reading order</h2><p>Start with the introduction, run the quickstart, then study the object model before choosing a deployment mode. Teams implementing production flows should continue into idempotency, webhooks, and error handling.</p></></DocPage>;
}
