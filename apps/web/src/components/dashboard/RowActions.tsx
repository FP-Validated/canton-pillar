'use client';

export function RowActions() {
  return (
    <details className="relative inline-block text-left">
      <summary className="cursor-pointer list-none rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slateMuted">More…</summary>
      <div className="absolute right-0 z-20 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-2 text-xs font-bold text-ink shadow-xl">
        {['View detail', 'Copy ID', 'Open API reference'].map((item) => <button key={item} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-bgSoft">{item}</button>)}
      </div>
    </details>
  );
}
