type Status = 'Succeeded' | 'Processing' | 'RequiresAction' | 'Failed' | 'Canceled' | 'Expired';

const statusClasses: Record<Status, string> = {
  Succeeded: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Processing: 'bg-blue-50 text-blue-700 ring-blue-200',
  RequiresAction: 'bg-amber-50 text-amber-700 ring-amber-200',
  Failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  Canceled: 'bg-slate-100 text-slate-600 ring-slate-200',
  Expired: 'bg-zinc-100 text-zinc-700 ring-zinc-200'
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClasses[status]}`}>
      {status}
    </span>
  );
}
