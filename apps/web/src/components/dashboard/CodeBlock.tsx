import { CopyButton } from './CopyButton';

export function CodeBlock({ code, filename, language }: { code: string; filename?: string; language?: string }) {
  return <div className="overflow-hidden rounded-3xl border border-slate-200 bg-ink shadow-sm"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs font-bold text-white/70"><span>{filename ?? language ?? 'Code'}</span><div className="flex items-center gap-2">{language ? <span>{language}</span> : null}<CopyButton value={code} /></div></div><pre className="overflow-x-auto p-4 text-sm text-white"><code>{code}</code></pre></div>;
}
