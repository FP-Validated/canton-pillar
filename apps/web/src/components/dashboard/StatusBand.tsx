const color = { ok: 'bg-emerald-500', degraded: 'bg-amber-500', down: 'bg-rose-500' } as const;

export function StatusBand({ status }: { status: { api: 'ok'; projection: 'ok' | 'degraded'; ledgerParticipant: 'ok'; webhookDispatcher: 'ok' | 'degraded' } }) {
  const rows = [['API', status.api], ['Projection', status.projection], ['Ledger participant', status.ledgerParticipant], ['Webhook dispatcher', status.webhookDispatcher]] as const;
  return <section className="grid gap-3 md:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color[value]}`} /><span className="text-sm font-black text-ink">{label}</span></div><div className="mt-1 text-xs font-bold uppercase text-slateMuted">{value}</div></div>)}</section>;
}
