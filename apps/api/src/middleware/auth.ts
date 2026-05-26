import type { FastifyInstance } from 'fastify';
import { PillarError } from '../errors/pillar-error.js';
const re = /^Bearer\s+plr_(sk|rk|pk)_(test|live)_[A-Za-z0-9_-]+$/;
export async function registerAuth(server: FastifyInstance) {
  server.addHook('preHandler', async (request) => {
    if (request.url === '/v1/health') return;
    const auth = request.headers.authorization;
    const m = typeof auth === 'string' ? re.exec(auth) : null;
    if (!m) throw PillarError.auth();
    const keyType = m[1] as 'sk'|'rk'|'pk';
    request.auth = { keyId: keyType === 'sk' ? 'ak_demo_admin' : 'ak_demo', livemode: m[2] === 'live', scopes: keyType === 'sk' ? ['*','admin'] : ['*'], keyType };
    request.accountId = 'acct_demo';
    const q = request.query as Record<string, unknown>;
    const ex = q['expand[]'] ?? q.expand;
    const vals = Array.isArray(ex) ? ex : ex ? [ex] : [];
    if (request.url.startsWith('/v1/openapi.json') && !request.auth.scopes.includes('admin')) throw PillarError.permission('Admin scope required.');
    if (request.url.startsWith('/v1/operations/') && vals.some(v => String(v).includes('ledger_trace')) && !request.auth.scopes.includes('admin')) throw PillarError.permission('Admin scope required.');
  });
}
