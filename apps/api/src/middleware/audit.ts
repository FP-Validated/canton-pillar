import type { FastifyInstance } from 'fastify';
import { defaultAuditSink, maskBody, maskHeaders, type AuditSink } from '../repositories/api-requests.js';
export async function registerAudit(server: FastifyInstance, sink: AuditSink = defaultAuditSink) {
  server.decorate('auditSink', sink);
  server.addHook('onResponse', async (request, reply) => {
    sink.record({ request_id: request.requestId, method: request.method, path: request.url.split('?')[0], status_code: reply.statusCode, request_headers: maskHeaders(request.headers as Record<string,unknown>), request_body: maskBody(request.body) });
  });
}
