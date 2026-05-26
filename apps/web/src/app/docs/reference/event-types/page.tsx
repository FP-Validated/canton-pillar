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

export const metadata: Metadata = { title: 'Event types – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Event types" eyebrow="Reference" description="Event types reference for Canton Pillar." href="/docs/reference/event-types" references={[]}><><h2 id="events">Events</h2><ApiTable columns={[{header:'Type',accessor:'t'},{header:'When emitted',accessor:'w'}]} rows={['account.created','asset.created','holding.updated','issue_intent.succeeded','transfer_intent.succeeded','redeem_intent.succeeded','hold.created','hold.released','operation.failed','webhook.delivery_failed'].map((t)=>({t,w:'After the corresponding public state transition is committed and projected.'}))}/></></DocPage>;
}
