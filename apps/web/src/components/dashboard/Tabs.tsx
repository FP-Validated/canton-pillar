'use client';

import { useState } from 'react';

export function Tabs({ tabs }: { tabs: { label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.label ?? '');
  const current = tabs.find((tab) => tab.label === active) ?? tabs[0];
  return <div><div className="mb-4 flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">{tabs.map((tab) => <button type="button" key={tab.label} onClick={() => setActive(tab.label)} className={`rounded-full px-4 py-2 text-sm font-black ${active === tab.label ? 'bg-ink text-white' : 'text-slateMuted hover:bg-bgSoft hover:text-ink'}`}>{tab.label}</button>)}</div><div>{current?.content}</div></div>;
}
