export type Status =
  | 'Succeeded' | 'Processing' | 'RequiresAction' | 'Failed' | 'Canceled' | 'Expired'
  | 'active' | 'restricted' | 'suspended' | 'closed' | 'draft' | 'paused' | 'retired'
  | 'partially_reserved' | 'reserved' | 'frozen' | 'redeeming' | 'released' | 'expired'
  | 'enabled' | 'disabled' | 'revoked' | 'pending' | 'delivered' | 'retrying' | 'dead_lettered'
  | 'manually_replayed' | 'received' | 'queued' | 'submitted' | 'in_flight' | 'ledger_committed'
  | 'projected' | 'unknown' | 'reconciled' | 'requires_action' | 'processing' | 'succeeded'
  | 'failed' | 'canceled';

const green = 'bg-emerald-50 text-emerald-700 ring-emerald-200';
const yellow = 'bg-amber-50 text-amber-700 ring-amber-200';
const red = 'bg-rose-50 text-rose-700 ring-rose-200';
const gray = 'bg-slate-100 text-slate-600 ring-slate-200';

const legacy: Partial<Record<Status, string>> = {
  Succeeded: green,
  Processing: yellow,
  RequiresAction: yellow,
  Failed: red,
  Canceled: red,
  Expired: red
};

const greenStatuses = new Set<Status>(['succeeded', 'active', 'enabled', 'delivered', 'ledger_committed', 'projected', 'released', 'reconciled']);
const yellowStatuses = new Set<Status>(['processing', 'submitted', 'in_flight', 'queued', 'retrying', 'pending', 'requires_action', 'partially_reserved', 'reserved', 'draft', 'redeeming', 'received']);
const redStatuses = new Set<Status>(['failed', 'expired', 'dead_lettered', 'closed', 'revoked', 'canceled', 'restricted', 'suspended', 'paused', 'retired', 'frozen', 'disabled']);

function classFor(status: Status) {
  if (legacy[status]) return legacy[status];
  if (greenStatuses.has(status)) return green;
  if (yellowStatuses.has(status)) return yellow;
  if (redStatuses.has(status)) return red;
  return gray;
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${classFor(status)}`}>
      {status}
    </span>
  );
}
