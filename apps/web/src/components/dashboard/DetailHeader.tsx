import { StatusPill, type Status } from '@/components/StatusPill';

export function DetailHeader({ object, id, status }: { object: string; id: string; status?: Status }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-slateMuted">{object}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="break-all font-mono text-2xl font-bold text-ink">{id}</h1>
        <button className="rounded-full bg-bgSoft px-3 py-1 text-xs font-semibold text-slateMuted" type="button">Copy</button>
        {status ? <StatusPill status={status} /> : null}
      </div>
    </div>
  );
}

export function AttributeList({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-ink">Attributes</h2>
      <dl className="mt-4 divide-y divide-slate-100 text-sm">
        {rows.map(([key, value]) => <div key={key} className="grid gap-2 py-3 md:grid-cols-[160px_1fr]"><dt className="text-slateMuted">{key}</dt><dd className="break-all font-mono text-ink">{value}</dd></div>)}
      </dl>
    </div>
  );
}
