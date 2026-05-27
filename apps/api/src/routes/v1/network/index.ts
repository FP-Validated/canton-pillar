import type { FastifyInstance } from 'fastify';
import { supportedNetworks } from '../../../middleware/network.js';

const now = '2026-05-26T00:00:00.000Z';
const bindings: any[] = [];
const list = (url: string, data: any[]) => ({ object: 'list', url, has_more: false, data });

export async function networkRoutes(s: FastifyInstance) {
  s.get('/network', async (request) => ({
    object: 'network_context',
    current: request.network?.id ?? 'devnet',
    supported: [...supportedNetworks],
    validator: request.network?.provider_id && request.network.validator_id && request.network.status
      ? { provider_id: request.network.provider_id, validator_id: request.network.validator_id, status: request.network.status }
      : null,
    livemode: request.network?.livemode ?? false,
  }));

  s.get('/network/bindings', async () => list('/v1/network/bindings', bindings));
  s.post('/network/bindings', async (req: any) => {
    const existing = bindings.find((b) => b.network === req.body.network);
    const body = { id: existing?.id ?? 'tnb_01JY0000000000000000000000', object: 'tenant_network_binding', tenant_id: 'tenant_default', network_id: `net_${req.body.network}`, network: req.body.network, default_validator_id: req.body.validator, fallback_validator_id: req.body.fallback ?? null, livemode: req.body.network === 'mainnet', status: 'active', created: existing?.created ?? now, updated: now };
    if (existing) Object.assign(existing, body); else bindings.push(body);
    return body;
  });
  for (const action of ['pause', 'resume']) s.post(`/network/bindings/:id/${action}`, async (req: any, reply) => {
    const b = bindings.find((x) => x.id === req.params.id);
    if (!b) return reply.notFound('binding not found');
    b.status = action === 'pause' ? 'paused' : 'active';
    b.updated = now;
    return b;
  });
}
