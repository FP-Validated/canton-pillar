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

export const metadata: Metadata = { title: 'CLI – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="CLI" eyebrow="Reference" description="CLI reference for Canton Pillar." href="/docs/reference/cli" references={[]}><><h2 id="commands">Commands</h2><CodeBlock language="bash">{'pillar tenants list\npillar webhooks replay --endpoint we_example --event evt_example\npillar projections rebuild --tenant acct_example'}</CodeBlock><p>The CLI mirrors operational runbooks: inspect, replay, rebuild, rotate, and verify. Production use should capture command output in the change record.</p></></DocPage>;
}
