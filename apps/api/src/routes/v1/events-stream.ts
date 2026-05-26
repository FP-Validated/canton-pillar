import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { defaultSseBroker, type SseEvent } from '../../services/sse-broker/index.js';
import { authenticateSse } from '../../middleware/sse-auth.js';

type Query = { types?: string | string[]; livemode?: string };

function frame(event: SseEvent) {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function parseTypes(types: Query['types']) { return Array.isArray(types) ? types : types ? [types] : undefined; }
function parseLivemode(value: string | undefined, fallback: boolean) { if (value === undefined) return fallback; return value === 'true'; }

export async function eventsStreamRoutes(server: FastifyInstance) {
  server.get('/events:stream', async (request: FastifyRequest<{ Querystring: Query }>, reply: FastifyReply) => {
    const principal = authenticateSse(request.headers as Record<string, unknown>, request.accountId);
    if (!principal) return reply.code(401).send({ error: { type: 'authentication_error', code: 'authentication_required', message: 'Authentication required.', request_id: request.id, doc_url: 'https://docs.pillar.example/errors/authentication_required' } });
    const livemode = parseLivemode(request.query.livemode, principal.livemode);
    if (livemode !== principal.livemode) return reply.code(403).send({ error: { type: 'permission_error', code: 'tenant_scope_mismatch', message: 'Requested livemode is outside the authenticated tenant scope.', request_id: request.id, doc_url: 'https://docs.pillar.example/errors/tenant_scope_mismatch' } });

    const subscriber = defaultSseBroker.subscribe(principal.tenantId, livemode, { types: parseTypes(request.query.types), afterId: request.headers['last-event-id'] as string | undefined });
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const keepalive = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    request.raw.on('close', () => { clearInterval(keepalive); subscriber.close(); });
    try {
      for await (const event of subscriber) {
        if (!reply.raw.write(frame(event))) await new Promise(resolve => reply.raw.once('drain', resolve));
      }
    } finally { clearInterval(keepalive); subscriber.close(); reply.raw.end(); }
  });
}

export { defaultSseBroker as SseBroker };
