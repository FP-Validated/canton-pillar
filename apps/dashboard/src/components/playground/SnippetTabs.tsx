'use client';

import { useState } from 'react';

export function SnippetTabs({ snippets }: { snippets: { curl: string; node: string; python: string; java: string } }) {
  const [tab, setTab] = useState<keyof typeof snippets>('curl');
  return <section className="rounded-xl border bg-white p-4">
    <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Code snippets</h2><button className="text-sm text-blue-700" onClick={() => navigator.clipboard.writeText(snippets[tab])}>Copy</button></div>
    <div className="mb-3 flex gap-2">{(Object.keys(snippets) as Array<keyof typeof snippets>).map(name => <button key={name} onClick={() => setTab(name)} className={`rounded px-2 py-1 text-sm ${tab === name ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>{name === 'node' ? 'Node' : name === 'java' ? 'Java' : name === 'python' ? 'Python' : 'curl'}</button>)}</div>
    <pre className="overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-50">{snippets[tab]}</pre>
  </section>;
}
