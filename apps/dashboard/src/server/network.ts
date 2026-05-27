import 'server-only';

import { cookies } from 'next/headers';
import { pillarFetch } from './pillar-client';

export const networks = ['devnet', 'testnet', 'mainnet'] as const;
export type Network = (typeof networks)[number];
export type NetworkContext = {
  object: 'network_context';
  current: Network;
  supported: Network[];
  validator: { provider_id: string; validator_id: string; status: string } | null;
  livemode: boolean;
};

export function isNetwork(value: string | null | undefined): value is Network {
  return value === 'devnet' || value === 'testnet' || value === 'mainnet';
}

export function getCookieNetwork(): Network {
  const value = cookies().get('pillar-network')?.value;
  return isNetwork(value) ? value : 'devnet';
}

export async function getNetworkContext(): Promise<NetworkContext> {
  const result = await pillarFetch<NetworkContext>(undefined, '/network');
  if (result.ok) return result.value;
  const current = getCookieNetwork();
  return { object: 'network_context', current, supported: [current], validator: null, livemode: current === 'mainnet' };
}
