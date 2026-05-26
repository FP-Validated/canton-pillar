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

export const metadata: Metadata = { title: 'Glossary – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Glossary" eyebrow="Reference" description="Glossary reference for Canton Pillar." href="/docs/reference/glossary" references={[]}><><h2 id="terms">Terms</h2><ApiTable columns={[{header:'Term',accessor:'term'},{header:'Meaning',accessor:'meaning'}]} rows={['account','asset','balance','holding','intent','operation','event','idempotency','projection','webhook endpoint','deployment mode','metadata'].map((term)=>({term,meaning:'Canonical public documentation term used across Canton Pillar APIs, dashboard, and runbooks.'}))}/></></DocPage>;
}
