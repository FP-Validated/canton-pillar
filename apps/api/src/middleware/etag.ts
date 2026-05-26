import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

export async function registerEtag(server: FastifyInstance): Promise<void> {
  server.addHook('preSerialization', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    if (request.method !== 'GET' || reply.statusCode >= 300) return payload;
    const etag = `"${crypto.createHash('sha256').update(canonical(payload)).digest('hex')}"`;
    reply.header('ETag', etag);
    reply.header('Vary', 'Authorization, Pillar-Version');
    if (request.headers['if-none-match'] === etag) {
      reply.code(304);
      return undefined;
    }
    return payload;
  });
}
