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

export const metadata: Metadata = { title: 'Object model – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Object model" eyebrow="Getting started" description="Public resources, ID prefixes, mutation rules, statuses, and expansion behavior." href="/docs/getting-started/object-model" references={[]}><><h2 id="inventory">Object inventory</h2><ApiTable columns={[{header:'Object',accessor:'object'},{header:'Prefix',accessor:'prefix'},{header:'Purpose',accessor:'purpose'}]} rows={ids.map((id) => ({object:id.replace('_',''),prefix:id,purpose:'Opaque public identifier for API, dashboard, and webhook correlation.'}))}/><h2 id="mutation-matrix">Mutation matrix</h2><ApiTable columns={[{header:'Resource',accessor:'r'},{header:'Create',accessor:'c'},{header:'Update',accessor:'u'},{header:'Terminal',accessor:'t'}]} rows={[{r:'accounts',c:'API',u:'metadata and status',t:'closed'},{r:'intents',c:'API',u:'runtime only',t:'succeeded, failed, canceled'},{r:'operations',c:'runtime',u:'runtime only',t:'succeeded or failed'},{r:'events',c:'runtime',u:'immutable',t:'delivered or replayed'}]}/><h2 id="status-enums">Status enums</h2><p>Common statuses are pending, processing, requires_action, succeeded, failed, canceled, expired, delivered, retrying, and dead_lettered.</p><h2 id="expansion">Expansion notes</h2><p>Use expansion to include related objects only when needed. Prefer IDs in list views and expand details in drill-down workflows.</p></></DocPage>;
}
