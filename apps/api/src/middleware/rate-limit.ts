import type { FastifyInstance } from 'fastify';
import { PillarError } from '../errors/pillar-error.js';
const hits = new Map<string, number[]>();
export async function registerRateLimit(server: FastifyInstance, rpm = 60) {
  server.addHook('preHandler', async (request, reply) => {
    const group = request.routerPath ?? request.url.split('?')[0];
    const key = `${request.auth?.keyId ?? 'anon'}:${group}`;
    const now = Date.now();
    const windowed = (hits.get(key) ?? []).filter(t => now - t < 60000);
    if (windowed.length >= rpm) { reply.header('Retry-After','1').header('Pillar-Rate-Limited-Reason','endpoint-rate'); throw PillarError.rateLimit(); }
    windowed.push(now); hits.set(key, windowed);
    reply.header('Pillar-RateLimit-Limit', String(rpm)).header('Pillar-RateLimit-Remaining', String(Math.max(0, rpm-windowed.length))).header('Pillar-RateLimit-Reset', new Date(now + 60000).toISOString());
  });
}
