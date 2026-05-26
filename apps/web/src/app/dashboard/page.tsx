import { StatusPill } from '@/components/StatusPill';
import { intents, operationTrace, webhookDeliveries } from '@/lib/mockData';

const kpis = [
  ['Total volume (24h)', '$2,418,300.00'],
  ['Pending intents', '7'],
  ['Succeeded today', '142'],
  ['Failed today', '3']
];

export default function DashboardPage() {
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[220px_1fr]">
      <aside className="rounded-3xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slateMuted shadow-sm">
        {['Intents', 'Holdings', 'Webhooks', 'Operations'].map((item) => (
          <div key={item} className="rounded-2xl px-4 py-3 first:bg-bgSoft first:text-ink">{item}</div>
        ))}
      </aside>
      <div className="space-y-8">
        <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center">
          <input aria-label="Search" placeholder="Search intents, holdings, operations" className="w-full rounded-full border border-slate-200 px-4 py-3 text-sm outline-none focus:border-accent md:max-w-md" />
          <div className="rounded-full bg-bgSoft px-4 py-3 font-mono text-sm text-ink">acct_demo_001 (livemode: false)</div>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          {kpis.map(([label, value]) => (
            <div key={label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slateMuted">{label}</p>
              <p className="mt-3 text-2xl font-bold text-ink">{value}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5"><h1 className="text-xl font-bold">Intent activity</h1></div>
          <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
            <thead className="bg-bgSoft text-xs uppercase tracking-wide text-slateMuted">
              <tr>{['ID', 'Type', 'Status', 'Amount', 'From', 'To', 'Updated'].map((h) => <th key={h} className="px-5 py-4">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {intents.map((intent) => (
                <tr key={intent.id}>
                  <td className="px-5 py-4 font-mono font-semibold text-accent">{intent.id}</td>
                  <td className="px-5 py-4 font-mono text-xs text-slateMuted">{intent.type}</td>
                  <td className="px-5 py-4"><StatusPill status={intent.status} /></td>
                  <td className="px-5 py-4 font-semibold">{intent.amount}</td>
                  <td className="px-5 py-4 font-mono text-xs">{intent.from}</td>
                  <td className="px-5 py-4 font-mono text-xs">{intent.to}</td>
                  <td className="px-5 py-4 text-slateMuted">{intent.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Recent webhook deliveries</h2>
            <div className="mt-5 space-y-4">
              {webhookDeliveries.map((delivery) => (
                <div key={delivery.eventId} className="rounded-2xl bg-bgSoft p-4 text-sm">
                  <div className="flex justify-between gap-3"><span className="font-mono font-semibold text-accent">{delivery.eventId}</span><span className="font-semibold">{delivery.httpStatus}</span></div>
                  <p className="mt-1 font-mono text-xs text-slateMuted">{delivery.type}</p>
                  <p className="mt-1 truncate text-slateMuted">{delivery.target}</p>
                  <p className="mt-1 text-slateMuted">{delivery.deliveredAt}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Operation trace</h2>
            <p className="mt-1 font-mono text-sm text-accent">op_5pK91XdR2</p>
            <div className="mt-5 space-y-5 border-l-2 border-slate-200 pl-5">
              {operationTrace.map((item) => (
                <div key={item.step} className="relative">
                  <div className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-accent" />
                  <div className="flex justify-between gap-3"><h3 className="font-semibold">{item.step}</h3><span className="font-mono text-xs text-slateMuted">{item.time}</span></div>
                  <p className="mt-1 text-sm text-slateMuted">{item.detail}</p>
                  <p className="mt-1 font-mono text-xs text-ink">{item.reference}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
