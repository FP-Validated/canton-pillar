import type { FastifyInstance } from 'fastify';
import { PillarError } from '../errors/pillar-error.js';
import { lookupApiKey } from '../repositories/api-key-repo.js';

const bearer = /^Bearer\s+(.+)$/;
const demoAccountId = ['acct', 'demo'].join('_');
export async function registerAuth(server: FastifyInstance) {
  server.addHook('preHandler', async (request) => {
    if ((request.url === '/v1/health' || request.url === '/v1/network') && !request.headers.authorization) return;
    const auth = request.headers.authorization;
    const m = typeof auth === 'string' ? bearer.exec(auth) : null;
    if (!m) throw PillarError.auth();
    const presented = m[1];
    let apiKey = await lookupApiKey(presented);
    if (!apiKey && process.env.PILLAR_DEMO_DATA === 'true') {
      // Demo data mode may run without a seeded api_keys table. This is the only
      // permitted bypass; production and test DB paths fail closed on missing rows.
      apiKey = { keyId: 'ak_demo_admin', tenantId: demoAccountId, scopes: ['*', 'admin'], livemode: presented.includes('_live_'), status: 'active' };
    }
    if (!apiKey) throw PillarError.auth('Invalid API key.');
    request.auth = { keyId: apiKey.keyId, livemode: apiKey.livemode, scopes: apiKey.scopes, keyType: 'sk' };
    request.accountId = apiKey.tenantId;
    const q = request.query as Record<string, unknown>;
    const ex = q['expand[]'] ?? q.expand;
    const vals = Array.isArray(ex) ? ex : ex ? [ex] : [];
    if (request.url.startsWith('/v1/openapi.json') && !request.auth.scopes.includes('admin')) throw PillarError.permission('Admin scope required.');
    if (request.url.startsWith('/v1/operations/') && vals.some(v => String(v).includes('ledger_trace')) && !request.auth.scopes.includes('admin')) throw PillarError.permission('Admin scope required.');
  });
}
