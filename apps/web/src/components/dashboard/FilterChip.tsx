'use client';

export function FilterChip({ label, active = false, onClick, onRemove }: { label: string; active?: boolean; onClick?: () => void; onRemove?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ring-1 ${active ? 'bg-accent text-white ring-accent' : 'bg-white text-ink ring-slate-200 hover:bg-bgSoft'}`}>
      {label}
      {onRemove ? <span onClick={(event) => { event.stopPropagation(); onRemove(); }} className="text-sm" aria-hidden="true">×</span> : null}
    </button>
  );
}
