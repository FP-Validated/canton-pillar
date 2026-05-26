import type { FastifyInstance } from 'fastify';

const readPrefixes = ['/v1/balances', '/v1/holdings', '/v1/operations', '/v1/events'];

export async function registerCacheControl(server: FastifyInstance): Promise<void> {
  server.addHook('onSend', async (request, reply, payload) => {
    if (request.method === 'GET' && readPrefixes.some(prefix => request.url.startsWith(prefix))) {
      const isEventById = /^\/v1\/events\/[^/?]+/.test(request.url);
      reply.header('Cache-Control', isEventById ? 'private, max-age=300, immutable' : 'private, max-age=5, stale-while-revalidate=10');
    } else if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      reply.header('Cache-Control', 'no-store');
    }
    return payload;
  });
}
