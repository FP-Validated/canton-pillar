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

export const metadata: Metadata = { title: 'Error codes – Canton Pillar Docs' };

export default function Page() {
  return <DocPage title="Error codes" eyebrow="Reference" description="Error codes reference for Canton Pillar." href="/docs/reference/error-codes" references={[]}><><h2 id="codes">Codes</h2><ApiTable columns={[{header:'Code',accessor:'c'},{header:'HTTP',accessor:'h'},{header:'Description',accessor:'d'}]} rows={[{c:'authentication_failed',h:'401',d:'Missing or invalid API key.'},{c:'permission_denied',h:'403',d:'Key lacks required scope.'},{c:'not_found',h:'404',d:'Resource not visible to tenant.'},{c:'idempotency_conflict',h:'409',d:'Key reused with different request body.'},{c:'validation_error',h:'422',d:'Request shape or business rule failed.'},{c:'rate_limited',h:'429',d:'Client exceeded configured limit.'},{c:'runtime_unavailable',h:'503',d:'Safe to retry with same key.'}]}/></></DocPage>;
}
