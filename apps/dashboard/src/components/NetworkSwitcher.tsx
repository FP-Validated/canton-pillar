import Link from 'next/link';
import { cookies } from 'next/headers';
import { getNetworkContext, networks, type Network } from '../server/network';

const labels: Record<Network, string> = { devnet: 'Devnet', testnet: 'Testnet', mainnet: 'Mainnet' };
const badgeClasses: Record<Network, string> = {
  devnet: 'bg-zinc-100 text-zinc-700 ring-zinc-300',
  testnet: 'bg-blue-100 text-blue-700 ring-blue-300',
  mainnet: 'bg-emerald-100 text-emerald-700 ring-emerald-300'
};

async function setDashboardNetwork(formData: FormData) {
  'use server';
  const network = formData.get('network');
  if (network !== 'devnet' && network !== 'testnet' && network !== 'mainnet') return;
  cookies().set('pillar-network', network, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  if (process.env.PILLAR_AUTH_NETWORK_ENDPOINT === 'true') {
    await fetch(`${(process.env.PILLAR_API_BASE_URL ?? 'http://api:4000').replace(/\/$/, '')}/v1/auth/network`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Pillar-Network': network },
      body: JSON.stringify({ network }),
      cache: 'no-store'
    });
  }
}

export async function NetworkSwitcher() {
  const context = await getNetworkContext();
  const supported = new Set(context.supported);

  return (
    <div className="flex items-center gap-3 text-sm">
      <form action={setDashboardNetwork} className="flex items-center gap-2" data-testid="dashboard-network-switcher">
        <span className={`inline-flex h-2.5 w-2.5 rounded-full ring-2 ${badgeClasses[context.current]}`} data-testid="network-badge" />
        <label className="sr-only" htmlFor="dashboard-network">Network</label>
        <select
          id="dashboard-network"
          name="network"
          aria-label="Network"
          defaultValue={context.current}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm outline-none hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          {networks.map((network) => <option key={network} value={network} disabled={!supported.has(network)}>{labels[network]}</option>)}
        </select>
      </form>
      {networks.some((network) => !supported.has(network)) ? <Link href="/settings/networks" className="text-xs font-semibold text-blue-600 hover:text-blue-700">Request access</Link> : null}
    </div>
  );
}
