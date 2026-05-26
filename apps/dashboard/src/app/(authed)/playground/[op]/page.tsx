import { notFound } from 'next/navigation';
import { generateSnippets } from '@pillar/api-contracts';
import { RequestBuilder } from '../../../../components/playground/RequestBuilder';
import { ResponseInspector } from '../../../../components/playground/ResponseInspector';
import { SnippetTabs } from '../../../../components/playground/SnippetTabs';
import { LivemodeChip } from '../../../../components/playground/LivemodeChip';
import { loadPlayground } from '../../../../server/loaders/playground';

export default async function Page({ params }: { params: { op: string } }) {
  const { selected } = await loadPlayground(params.op);
  if (!selected || selected.operationId !== params.op) notFound();
  const snippets = generateSnippets({ method: selected.method, path: selected.path, headers: { 'Pillar-Version': '2026-05-26' } });
  return <div className="space-y-6"><div className="flex justify-end"><LivemodeChip livemode={false} /></div><RequestBuilder operation={selected} /><ResponseInspector /><SnippetTabs snippets={snippets} /></div>;
}
