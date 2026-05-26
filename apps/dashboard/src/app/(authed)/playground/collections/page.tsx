import { CollectionPanel } from '../../../../components/playground/CollectionPanel';
import { playgroundCollectionsOpenIssue } from '../../../../server/playground/collections';

export default async function Page() {
  return <main className="space-y-4"><h1 className="text-2xl font-semibold">Saved playground requests</h1><CollectionPanel /><p className="text-sm text-slate-500">{playgroundCollectionsOpenIssue}</p></main>;
}
