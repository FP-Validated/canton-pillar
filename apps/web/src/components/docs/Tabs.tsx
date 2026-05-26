'use client';

import { useState, type ReactNode } from 'react';

export function Tabs({ tabs }: { tabs: { label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(0);
  return <div className="my-6 rounded-2xl border border-slate-200 bg-white"><div className="flex flex-wrap gap-2 border-b border-slate-200 p-2">{tabs.map((tab, index) => <button key={tab.label} type="button" onClick={() => setActive(index)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${active === index ? 'bg-accent text-white' : 'text-slateMuted hover:bg-bgSoft'}`}>{tab.label}</button>)}</div><div className="p-5 text-sm leading-7 text-slateMuted">{tabs[active]?.content}</div></div>;
}
