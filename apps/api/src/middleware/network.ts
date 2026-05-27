import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PillarError } from '../errors/pillar-error.js';
import { resolveBinding, resolveDefaultNetwork, type NetworkId } from '../repositories/network-repo.js';

export const supportedNetworks = ['devnet', 'testnet', 'mainnet'] as const;
const cookieKey = 'pillar-network';

function parseCookie(header: unknown): Record<string, string> {
  if (typeof header !== 'string') return {};
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index < 0) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function assertNetwork(value: string): NetworkId {
  if ((supportedNetworks as readonly string[]).includes(value)) return value as NetworkId;
  throw PillarError.invalid('network_invalid', 'Pillar-Network must be one of devnet, testnet, or mainnet.', 'Pillar-Network');
}

export async function resolveNetworkContext(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = request.auth ? request.accountId : undefined;
  const requested = headerValue(request.headers['pillar-network']) ?? parseCookie(request.headers.cookie)[cookieKey];
  const network = assertNetwork(requested ?? (tenantId ? await resolveDefaultNetwork(tenantId) : null) ?? 'devnet');
  const binding = tenantId ? await resolveBinding(tenantId, network) : null;
  if (tenantId && !binding) throw new PillarError('permission_error', 'network_not_bound', 403, 'Tenant is not bound to the requested network.');
  request.network = {
    id: network,
    livemode: network === 'mainnet',
    provider_id: binding?.provider_id ?? null,
    validator_id: binding?.validator_id ?? null,
    status: binding?.status ?? null,
  };
  reply.header('Pillar-Network', network);
}

export async function registerNetwork(server: FastifyInstance) {
  server.addHook('preHandler', resolveNetworkContext);
}
