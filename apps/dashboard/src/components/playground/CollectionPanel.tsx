'use client';

import type { PlaygroundCollection } from '../../server/playground/collections';

export function CollectionPanel({ collections = [], onLoad, onSave }: { collections?: PlaygroundCollection[]; onLoad?: (item: PlaygroundCollection) => void; onSave?: () => void }) {
  return <section className="rounded-xl border bg-white p-4">
    <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Collections</h2><button className="text-sm text-blue-700" onClick={onSave}>Save</button></div>
    {collections.length === 0 ? <p className="text-sm text-slate-500">No saved requests yet. Collection storage is currently per-user and per-tenant in memory.</p> : <ul className="space-y-2">{collections.map(item => <li key={item.id}><button className="text-left text-sm hover:text-blue-700" onClick={() => onLoad?.(item)}><span className="font-mono">{item.method}</span> {item.name}</button></li>)}</ul>}
  </section>;
}
