'use client';
import { useTransition } from 'react';
export function RowActions({ actions }: { actions: { label: string; run: () => Promise<void>; destructive?: boolean; disabled?: boolean }[] }) {
  const [pending, start] = useTransition();
  return <div className="row-actions">{actions.map((a) => <button key={a.label} disabled={pending || a.disabled} data-destructive={a.destructive || undefined} onClick={() => start(async () => { await a.run(); window.dispatchEvent(new CustomEvent('admin:toast', { detail: `${a.label} requested` })); })}>{a.label}</button>)}</div>;
}
