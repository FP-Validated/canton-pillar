'use client';

export function Drawer({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return <aside className="fixed right-4 top-20 z-30 w-96 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"><h2 className="text-lg font-black text-ink">{title}</h2><div className="mt-4">{children}</div></aside>;
}
