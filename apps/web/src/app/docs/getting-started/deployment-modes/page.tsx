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

export const metadata: Metadata = { title: 'Deployment modes – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Deployment modes" eyebrow="Getting started" description="Compare hosted, customer-validator, and self-hosted responsibilities." href="/docs/getting-started/deployment-modes" references={[]}><><h2 id="comparison">Mode comparison</h2><ApiTable columns={[{header:'Mode',accessor:'mode'},{header:'Choose when',accessor:'when'},{header:'Canton Pillar owns',accessor:'pillar'},{header:'Customer owns',accessor:'customer'}]} rows={[{mode:'hosted',when:'Fastest launch and standard compliance posture.',pillar:'Runtime, operations, upgrades, webhooks.',customer:'API use, policy inputs, reconciliation.'},{mode:'customer-validator',when:'Customer needs validator control with managed application services.',pillar:'API, projections, dispatcher.',customer:'Validator operation and keys.'},{mode:'self-hosted',when:'Strict infrastructure or data-residency control.',pillar:'Release artifacts and support boundaries.',customer:'Full platform operation.'}]}/><h2 id="responsibilities">Responsibilities matrix</h2><p>Hosted minimizes operational burden. Customer-validator splits ledger infrastructure from application runtime. Self-hosted maximizes control and requires mature platform operations.</p><h2 id="migration">Switching modes</h2><p>Mode changes are planned migrations: freeze writes, reconcile open operations, move tenant configuration, verify projections, then re-enable webhooks.</p></></DocPage>;
}
