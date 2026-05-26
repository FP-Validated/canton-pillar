'use client';

import { CopyButton } from './CopyButton';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, stable(val)]));
  return value;
}

function Node({ value, name }: { value: unknown; name?: string }) {
  if (value && typeof value === 'object') {
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>);
    return <details open className="pl-3"><summary className="cursor-pointer font-mono text-xs font-bold text-ink">{name ? `${name}: ` : ''}{Array.isArray(value) ? '[' : '{'} {entries.length} {Array.isArray(value) ? ']' : '}'}</summary><div className="border-l border-slate-200 pl-3">{entries.map(([key, val]) => <Node key={key} name={key} value={val} />)}</div></details>;
  }
  const color = typeof value === 'string' ? 'text-emerald-700' : typeof value === 'number' ? 'text-accentDark' : 'text-rose-700';
  return <div className="pl-3 font-mono text-xs"><span className="text-slateMuted">{name}: </span><span className={color}>{JSON.stringify(value)}</span></div>;
}

export function JsonViewer({ value }: { value: unknown }) {
  const ordered = stable(value);
  const text = JSON.stringify(ordered, null, 2);
  return <section className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div className="text-sm font-black text-ink">Raw JSON</div><CopyButton value={text} label="Copy all" /></div><div className="max-h-[640px] overflow-auto p-4"><Node value={ordered} /></div></section>;
}
