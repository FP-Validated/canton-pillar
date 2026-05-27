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

export function networkFromCookie(cookieValue: string | null | undefined): Network {
  if (!cookieValue) return 'devnet';
  const match = cookieValue.match(/(?:^|;\s*)pillar-network=([^;]+)/);
  const value = match ? decodeURIComponent(match[1] ?? '') : cookieValue;
  return isNetwork(value) ? value : 'devnet';
}
