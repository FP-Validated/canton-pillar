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

export const metadata: Metadata = { title: 'FAQ – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="FAQ" eyebrow="Resources" description="FAQ for Canton Pillar teams." href="/docs/resources/faq" references={[]}><><h2 id="questions">Questions</h2><ApiTable columns={[{header:'Question',accessor:'q'},{header:'Answer',accessor:'a'}]} rows={['How do retries work?','Can we use our own validator?','How are webhooks signed?','What is a projection?','Can metadata hold secrets?','How do we switch modes?','How are errors shaped?','What IDs are stable?','How do we replay events?','How do we prove settlement?','How do API versions work?'].map((q)=>({q,a:'The docs provide a public object, operation, and event trail so teams can verify behavior without exposing ledger internals.'}))}/></></DocPage>;
}
