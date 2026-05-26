import { StatusPill, type Status } from '@/components/StatusPill';
import { CopyButton } from './CopyButton';
import { HeaderAction } from './PageHeader';
import Link from 'next/link';

export function DetailHeader({ object, id, status, actions, tabs }: { object: string; id: string; status?: Status; actions?: HeaderAction[]; tabs?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slateMuted">{object}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="break-all font-mono text-2xl font-bold text-ink">{id}</h1>
            <CopyButton value={id} />
            {status ? <StatusPill status={status} /> : null}
          </div>
        </div>
        {actions?.length ? <div className="flex flex-wrap gap-2">{actions.map((action) => <Link key={action.label} href={action.href} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-ink hover:bg-bgSoft">{action.label}</Link>)}</div> : null}
      </div>
      {tabs ? <div className="mt-5">{tabs}</div> : null}
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
