'use client';

export function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button disabled={page <= 0} onClick={() => onPage(page - 1)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Prev</button>
      <span className="text-xs font-black text-slateMuted">{page + 1} / {Math.max(1, pageCount)}</span>
      <button disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Next</button>
    </div>
  );
}
