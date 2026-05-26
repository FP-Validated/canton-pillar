import { EndpointTree } from '../../../components/playground/EndpointTree';
import { CollectionPanel } from '../../../components/playground/CollectionPanel';
import { loadPlayground } from '../../../server/loaders/playground';

export default async function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  const { operations, selected } = await loadPlayground();
  return <main className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)_360px] gap-4 p-4">
    <aside className="overflow-auto rounded-xl border bg-white p-4"><EndpointTree operations={operations} selected={selected.operationId} /></aside>
    <section className="overflow-auto rounded-xl border bg-white p-6">{children}</section>
    <aside className="space-y-4 overflow-auto"><CollectionPanel /></aside>
  </main>;
}
