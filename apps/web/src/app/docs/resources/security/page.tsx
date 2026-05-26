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

export const metadata: Metadata = { title: 'Security – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Security" eyebrow="Resources" description="Security for Canton Pillar teams." href="/docs/resources/security" references={[]}><><h2 id="hmac">HMAC scheme</h2><p>Webhook payloads are signed with a timestamped HMAC header. Receivers verify the timestamp tolerance, compute the signature with the active secret, and compare in constant time.</p><h2 id="rotation">Key rotation cadence</h2><p>Rotate API and webhook secrets on a fixed cadence and immediately after suspected exposure. Support dual-secret windows during cutover.</p><h2 id="masking">Masking rules</h2><p>Never store secrets in metadata, logs, or support notes. Mask tokens to first and last four characters.</p></></DocPage>;
}
