'use client';
import React from 'react';

import Link from 'next/link';
export type EndpointTreeOperation = {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
  parameters: Array<{ name: string; in: string; required?: boolean }>;
};

export function EndpointTree({ operations, selected }: { operations: EndpointTreeOperation[]; selected?: string }) {
  const groups = operations.reduce<Record<string, EndpointTreeOperation[]>>((acc, op) => {
    const tag = op.tags[0] ?? 'API';
    (acc[tag] ??= []).push(op);
    return acc;
  }, {});
  return <nav aria-label="API endpoints" className="space-y-5">
    {Object.entries(groups).map(([tag, ops]) => <section key={tag}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{tag}</h2>
      <div className="space-y-1">{ops.map(op => <Link key={op.operationId} href={`/playground/${op.operationId}`} className={`block rounded-lg px-3 py-2 text-sm ${selected === op.operationId ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100'}`}>
        <span className="mr-2 font-mono text-xs">{op.method}</span>{op.path}
      </Link>)}</div>
    </section>)}
  </nav>;
}
