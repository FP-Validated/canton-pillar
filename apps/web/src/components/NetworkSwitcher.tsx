'use client';

import React, { useMemo, useState } from 'react';
import { networkFromCookie, networks, type Network } from '@/lib/network';

const labels: Record<Network, string> = { devnet: 'Devnet', testnet: 'Testnet', mainnet: 'Mainnet' };
const tooltips: Record<Network, string> = {
  devnet: 'Development sandbox - data resets',
  testnet: 'Test network - persistent, no real value',
  mainnet: 'Production network'
};
const badgeClasses: Record<Network, string> = {
  devnet: 'bg-zinc-100 text-zinc-700 ring-zinc-300',
  testnet: 'bg-blue-100 text-blue-700 ring-blue-300',
  mainnet: 'bg-emerald-100 text-emerald-700 ring-emerald-300'
};

export function NetworkSwitcher({ current }: { current?: Network }) {
  const initial = useMemo(() => current ?? (typeof document === 'undefined' ? 'devnet' : networkFromCookie(document.cookie)), [current]);
  const [selected, setSelected] = useState<Network>(initial);
  const [pending, setPending] = useState(false);

  async function changeNetwork(network: Network) {
    setSelected(network);
    setPending(true);
    await fetch('/api/network', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ network })
    });
    window.location.reload();
  }

  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600" title={tooltips[selected]}>
      <span className={`inline-flex h-2.5 w-2.5 rounded-full ring-2 ${badgeClasses[selected]}`} data-testid="network-badge" />
      <span className="sr-only">Network</span>
      <select
        aria-label="Network"
        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink shadow-sm outline-none hover:border-slate-300 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
        value={selected}
        disabled={pending}
        onChange={(event) => changeNetwork(event.target.value as Network)}
      >
        {networks.map((network) => <option key={network} value={network}>{labels[network]}</option>)}
      </select>
    </label>
  );
}
