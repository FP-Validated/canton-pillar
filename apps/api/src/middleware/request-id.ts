import { ulid } from 'ulid';
import type { FastifyInstance } from 'fastify';
const requestIdRe = /^req_[A-Z0-9]{26}$/i;
export async function registerRequestId(server: FastifyInstance) {
  server.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-request-id'];
    request.requestId = typeof incoming === 'string' && requestIdRe.test(incoming) ? incoming : `req_${ulid()}`;
    reply.header('Pillar-Request-Id', request.requestId);
  });
}
