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

export const metadata: Metadata = { title: 'Changelog – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Changelog" eyebrow="Resources" description="Changelog for Canton Pillar teams." href="/docs/resources/changelog" references={[]}><><h2 id="entries">Entries</h2><ApiTable columns={[{header:'Date',accessor:'d'},{header:'Change',accessor:'c'}]} rows={[{d:'2026-05-26',c:'Expanded docs, runbooks, and API references.'},{d:'2026-05-12',c:'Added webhook replay and projection rebuild guidance.'},{d:'2026-04-30',c:'Clarified deployment-mode responsibilities.'}]}/></></DocPage>;
}
