'use client';

export function LivemodeChip({ livemode }: { livemode: boolean }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${livemode ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{livemode ? 'Livemode' : 'Testmode'}</span>;
}
