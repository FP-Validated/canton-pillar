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

export const metadata: Metadata = { title: 'API resources – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="API resources" eyebrow="Reference" description="API resources reference for Canton Pillar." href="/docs/reference/api-resources" references={[]}><><h2 id="resources">Resources</h2><ApiTable columns={[{header:'Resource',accessor:'r'},{header:'Prefix',accessor:'p'},{header:'API',accessor:'a'}]} rows={ids.map((id)=>({r:id.replace('_',''),p:id,a:<Link href={`/api/${id.replace('_','s')}`}>Reference</Link>}))}/></></DocPage>;
}
