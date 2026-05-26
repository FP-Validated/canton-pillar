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

export const metadata: Metadata = { title: 'Status enums – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Status enums" eyebrow="Reference" description="Status enums reference for Canton Pillar." href="/docs/reference/status-enums" references={[]}><><h2 id="enums">Enums</h2><ApiTable columns={[{header:'Enum',accessor:'e'},{header:'Resources',accessor:'r'},{header:'Meaning',accessor:'m'}]} rows={['pending','processing','requires_action','succeeded','failed','canceled','expired','queued','delivered','retrying','dead_lettered','manually_replayed'].map((e)=>({e,r:'intents, operations, events, webhooks',m:'Documented state used for polling, reconciliation, and support workflows.'}))}/></></DocPage>;
}
