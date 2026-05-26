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

export const metadata: Metadata = { title: 'Your first intent – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Your first intent" eyebrow="Getting started" description="A narrative walkthrough of the core asset movement lifecycle." href="/docs/getting-started/your-first-intent" references={[]}><><h2 id="journey">Issue, transfer, redeem</h2><p>A production journey usually begins when an operator issues an asset into an account, transfers part of that value to another account, then redeems it out of circulation. Canton Pillar models each business action as an intent. The intent receives a public ID, creates an operation, and eventually emits an event that downstream systems can reconcile.</p><h2 id="issue">Issue</h2><p>The issue intent establishes supply or customer inventory. Store the returned <code>issint_</code> with your treasury reference and wait for the operation to succeed before showing funds as available.</p><h2 id="transfer">Transfer</h2><p>The transfer intent moves value between accounts. The API validates available balance, tenant policy, and idempotency before committing the action.</p><h2 id="redeem">Redeem</h2><p>The redeem intent removes value according to your product rules. The final event is the durable fact used by reporting and support.</p><Callout variant="success" title="Traceability">A customer ticket should be answerable from the intent ID, operation ID, and final event ID.</Callout></></DocPage>;
}
