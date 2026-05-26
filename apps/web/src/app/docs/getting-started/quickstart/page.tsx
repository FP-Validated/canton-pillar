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

export const metadata: Metadata = { title: 'Quickstart – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Quickstart" eyebrow="Getting started" description="Run the smallest complete account, asset, intent, operation, and event workflow." href="/docs/getting-started/quickstart" references={[]}><><h2 id="flow">End-to-end flow</h2><Steps steps={[{title:'Create an account',body:<CodeBlock language="bash">{'curl -X POST https://api.cantonpillar.example/v1/accounts -H "Authorization: Bearer $PILLAR_KEY" -d name=treasury'}</CodeBlock>},{title:'Generate a restricted key',body:<CodeBlock language="json">{`{
  "id": "ak_live_example",
  "scopes": ["accounts:read", "transfer_intents:write"]
}`}</CodeBlock>},{title:'List assets',body:<CodeBlock language="bash">{'curl https://api.cantonpillar.example/v1/assets -H "Authorization: Bearer $PILLAR_KEY"'}</CodeBlock>},{title:'Create a transfer intent',body:<CodeBlock language="json">{`{
  "id": "trint_example",
  "amount": 2500,
  "asset": "asst_usdc",
  "destination": "acct_treasury"
}`}</CodeBlock>},{title:'Observe operation and event',body:<p>Open <Link href="/api/transfer-intents">transfer intent API</Link> or the <Link href="/dashboard">dashboard</Link> to inspect the resulting <code>op_</code> and <code>evt_</code> records.</p>}]} /><Callout variant="info" title="Invariant">Use the same idempotency key when retrying the same request.</Callout></></DocPage>;
}
