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

export const metadata: Metadata = { title: 'Ledger source-of-truth – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Ledger source-of-truth" eyebrow="Architecture" description="Architecture notes for ledger source-of-truth." href="/docs/architecture/ledger-source-of-truth" references={[]}><ArchitectureContent title="Ledger source-of-truth" /></DocPage>;
}
