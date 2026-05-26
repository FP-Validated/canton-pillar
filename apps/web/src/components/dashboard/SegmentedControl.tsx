'use client';

export function SegmentedControl<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-full bg-bgSoft p-1 ring-1 ring-slate-200">
      {options.map((option) => (
        <button key={option} type="button" onClick={() => onChange(option)} className={`rounded-full px-3 py-1.5 text-xs font-black ${value === option ? 'bg-white text-accentDark shadow-sm' : 'text-slateMuted hover:text-ink'}`}>
          {option}
        </button>
      ))}
    </div>
  );
}
