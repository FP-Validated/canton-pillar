'use client';

import { useState } from 'react';
import type { PlaygroundOperation } from '../../server/playground/openapi';

export function RequestBuilder({ operation, livemode = false, onExecute }: { operation: PlaygroundOperation; livemode?: boolean; onExecute?: (payload: { body: unknown; headers: Record<string, string>; query: Record<string, string> }) => void }) {
  const [body, setBody] = useState('{\n  "amount": "100.00"\n}');
  const [headers, setHeaders] = useState('{\n  "Pillar-Version": "2026-05-26"\n}');
  const [query, setQuery] = useState('{}');
  function run() {
    if (livemode && !window.confirm('This will execute against livemode. Continue?')) return;
    onExecute?.({ body: JSON.parse(body || '{}'), headers: JSON.parse(headers || '{}'), query: JSON.parse(query || '{}') });
  }
  return <section className="space-y-4">
    <div><p className="text-sm text-slate-500">{operation.operationId}</p><h1 className="text-2xl font-semibold"><span className="font-mono text-blue-700">{operation.method}</span> {operation.path}</h1></div>
    <label className="block text-sm font-medium">Query params<textarea className="mt-1 h-20 w-full rounded border p-3 font-mono text-sm" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <label className="block text-sm font-medium">Headers<textarea className="mt-1 h-24 w-full rounded border p-3 font-mono text-sm" value={headers} onChange={e => setHeaders(e.target.value)} /></label>
    <label className="block text-sm font-medium">JSON body<textarea className="mt-1 h-56 w-full rounded border p-3 font-mono text-sm" value={body} onChange={e => setBody(e.target.value)} /></label>
    <button onClick={run} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Execute request</button>
  </section>;
}
