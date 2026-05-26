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

export const metadata: Metadata = { title: 'Configuration – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Configuration" eyebrow="Reference" description="Configuration reference for Canton Pillar." href="/docs/reference/configuration" references={[]}><><h2 id="settings">Settings</h2><ApiTable columns={[{header:'Key',accessor:'k'},{header:'Purpose',accessor:'p'}]} rows={[{k:'PILLAR_API_URL',p:'API base URL'},{k:'PILLAR_WEBHOOK_SECRET',p:'Webhook HMAC verification secret'},{k:'PILLAR_MODE',p:'hosted, customer-validator, or self-hosted'}]}/></></DocPage>;
}
