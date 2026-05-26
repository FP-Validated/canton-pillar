'use client';

import { FilterChip } from './FilterChip';
import { SearchInput } from './SearchInput';
import { SegmentedControl } from './SegmentedControl';

export function Toolbar({ search, onSearch, statuses = ['All'], status, onStatus, chips = [], onChip, resultCount }: { search: string; onSearch: (value: string) => void; statuses?: string[]; status?: string; onStatus?: (value: string) => void; chips?: string[]; onChip?: (value: string) => void; resultCount?: number }) {
  const activeStatus = status ?? statuses[0] ?? 'All';
  return (
    <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={onSearch} placeholder="Search this view" />
        {chips.map((chip) => <FilterChip key={chip} label={chip} active={chip === activeStatus} onClick={() => onChip?.(chip)} />)}
        {statuses.length > 1 ? <SegmentedControl options={statuses} value={activeStatus} onChange={(value) => onStatus?.(value)} /> : null}
        <div className="flex gap-1">
          {['24h', '7d', '30d'].map((range) => <button key={range} className="rounded-full bg-bgSoft px-3 py-2 text-xs font-bold text-slateMuted">{range}</button>)}
        </div>
        <details className="relative">
          <summary className="cursor-pointer rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-ink">Columns</summary>
          <div className="absolute right-0 z-20 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slateMuted shadow-xl">
            Compact density<br />Pinned identifier<br />Status colors
          </div>
        </details>
        {typeof resultCount === 'number' ? <div className="ml-auto text-xs font-black text-slateMuted">{resultCount.toLocaleString()} results</div> : null}
      </div>
    </section>
  );
}
