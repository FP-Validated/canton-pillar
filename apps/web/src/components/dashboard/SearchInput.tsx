'use client';

export function SearchInput({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="relative block min-w-[240px] flex-1">
      <span className="sr-only">Search</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-4 pr-16 text-sm font-semibold outline-none focus:border-accent" />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-bgSoft px-2 py-1 text-[10px] font-black text-slateMuted">Ctrl+/</span>
    </label>
  );
}
