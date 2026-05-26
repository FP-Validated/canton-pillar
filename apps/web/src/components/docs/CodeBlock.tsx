import type { ReactNode } from 'react';

export function CodeBlock({ children, language, filename }: { children: ReactNode; language?: string; filename?: string }) {
  return <figure className="my-6 overflow-hidden rounded-2xl border border-slate-200 bg-ink text-white shadow-sm">{filename || language ? <figcaption className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-white/70"><span>{filename}</span><span>{language}</span></figcaption> : null}<pre className="overflow-x-auto p-4 text-sm leading-7"><code className="font-mono">{children}</code></pre></figure>;
}
