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

export const metadata: Metadata = { title: 'Compliance – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Compliance" eyebrow="Resources" description="Compliance for Canton Pillar teams." href="/docs/resources/compliance" references={[]}><><h2 id="posture">Mode posture</h2><ApiTable columns={[{header:'Mode',accessor:'m'},{header:'Posture',accessor:'p'}]} rows={[{m:'hosted',p:'Managed controls and standard evidence package.'},{m:'customer-validator',p:'Shared controls with customer-operated validator evidence.'},{m:'self-hosted',p:'Customer-owned infrastructure controls with product support artifacts.'}]}/></></DocPage>;
}
