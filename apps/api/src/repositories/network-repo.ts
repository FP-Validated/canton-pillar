import { demoDataEnabled } from '../config/runtime-mode.js';

export type NetworkId = 'devnet' | 'testnet' | 'mainnet';
export type NetworkBinding = {
  network: NetworkId;
  provider_id: string;
  validator_id: string;
  status: 'active' | 'degraded' | 'down';
};

const demoTenantId = ['acct', 'demo'].join('_');
const demoBindings: NetworkBinding[] = [
  { network: 'devnet', provider_id: 'valp_demo', validator_id: 'val_demo_devnet', status: 'active' },
  { network: 'testnet', provider_id: 'valp_demo', validator_id: 'val_demo_testnet', status: 'active' },
  { network: 'mainnet', provider_id: 'valp_demo', validator_id: 'val_demo_mainnet', status: 'active' },
];

function useDemo() {
  return process.env.PILLAR_DB === 'memory' || !process.env.DATABASE_URL || demoDataEnabled();
}

async function query(sql: string, params: unknown[]) {
  const { pool } = await import('../db/client.js');
  return pool.query(sql, params);
}

function toPublicStatus(status: string): NetworkBinding['status'] {
  return status === 'disabled' ? 'down' : status === 'degraded' ? 'degraded' : 'active';
}

export async function resolveDefaultNetwork(tenantId: string): Promise<NetworkId | null> {
  if (useDemo()) return tenantId === demoTenantId ? 'devnet' : null;
  const result = await query(
    `select n.kind
       from network.tenant_network_bindings b
       join network.networks n on n.id = b.network_id
      where b.tenant_id = $1 and b.is_default = true and b.status = 'active'
      limit 1`,
    [tenantId],
  );
  return (result.rows[0]?.kind as NetworkId | undefined) ?? null;
}

export async function resolveBinding(tenantId: string, network: NetworkId): Promise<NetworkBinding | null> {
  if (useDemo()) {
    if (tenantId !== demoTenantId || process.env.PILLAR_NETWORK_TEST_UNBOUND === 'true') return null;
    return demoBindings.find((binding) => binding.network === network) ?? null;
  }
  const result = await query(
    `select n.kind, v.provider_id, v.id as validator_id, v.status as validator_status
       from network.tenant_network_bindings b
       join network.networks n on n.id = b.network_id
       join network.validators v on v.id = b.default_validator_id
      where b.tenant_id = $1 and n.kind = $2 and b.status = 'active'
      limit 1`,
    [tenantId, network],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    network: row.kind,
    provider_id: row.provider_id,
    validator_id: row.validator_id,
    status: toPublicStatus(row.validator_status),
  };
}
