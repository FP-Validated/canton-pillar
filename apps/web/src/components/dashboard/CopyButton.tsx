'use client';

import { useState } from 'react';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={async () => { await navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-black text-slateMuted hover:text-ink">{copied ? 'Copied' : label}</button>;
}
