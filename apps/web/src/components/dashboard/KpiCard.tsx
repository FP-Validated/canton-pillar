export function KpiCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slateMuted">{label}</p>
      <p className="mt-3 text-2xl font-bold text-ink">{value}</p>
      {helper ? <p className="mt-2 text-xs text-slateMuted">{helper}</p> : null}
    </div>
  );
}
