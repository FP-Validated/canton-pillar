'use client';

import Link from 'next/link';
import { useState } from 'react';

export type PlaygroundResponse = { status: number; headers: Record<string, string>; body: unknown; durationMs: number; operationLink?: string };

export function ResponseInspector({ response, previous }: { response?: PlaygroundResponse; previous?: PlaygroundResponse }) {
  const [tab, setTab] = useState<'body' | 'headers' | 'trace' | 'diff'>('body');
  const body = response?.body as any;
  const link = response?.operationLink ?? (typeof body?.operation === 'string' ? `/dashboard/operations/${body.operation}` : body?.operation?.id ? `/dashboard/operations/${body.operation.id}` : undefined);
  return <section className="rounded-xl border bg-white p-4">
    <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Response</h2>{response && <span className="text-sm text-slate-500">{response.status} · {response.durationMs}ms</span>}</div>
    <div className="mb-3 flex gap-2">{(['body','headers','trace','diff'] as const).map(name => <button key={name} onClick={() => setTab(name)} className={`rounded px-2 py-1 text-sm ${tab === name ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>{name === 'trace' ? 'Operation Trace' : name[0].toUpperCase() + name.slice(1)}</button>)}</div>
    {tab === 'body' && <pre className="overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-50">{JSON.stringify(response?.body ?? { message: 'No response yet' }, null, 2)}</pre>}
    {tab === 'headers' && <pre className="overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-50">{JSON.stringify(response?.headers ?? {}, null, 2)}</pre>}
    {tab === 'trace' && <div>{link ? <Link className="text-blue-700 underline" href={link}>Open operation trace</Link> : <p className="text-sm text-slate-500">No operation field returned.</p>}</div>}
    {tab === 'diff' && <pre className="overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-50">{JSON.stringify({ previous: previous?.body ?? null, current: response?.body ?? null }, null, 2)}</pre>}
  </section>;
}
