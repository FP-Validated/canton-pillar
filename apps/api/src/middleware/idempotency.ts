import type { FastifyInstance } from 'fastify';
import { PillarError } from '../errors/pillar-error.js';
import { bodyHash, clearExpired, idemKey, idempotencyStore } from '../http/idempotency-store.js';
export async function registerIdempotency(server: FastifyInstance) {
  server.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') return;
    const raw = request.headers['idempotency-key'];
    const key = typeof raw === 'string' ? raw : undefined;
    if (!key || key.length > 255) throw PillarError.idempotency('idempotency_key_required','Idempotency-Key is required.');
    clearExpired();
    const path = request.url.split('?')[0];
    const storeKey = idemKey(request.accountId ?? 'acct_demo', !!request.auth?.livemode, request.method, path, key);
    const hash = bodyHash(request.body);
    const existing = idempotencyStore.get(storeKey);
    if (existing) {
      if (existing.hash !== hash) throw PillarError.idempotency('idempotency_key_reused','This idempotency key was already used with different request parameters.',409);
      if (existing.body !== undefined) return reply.status(existing.statusCode ?? 200).send(existing.body);
    } else idempotencyStore.set(storeKey, { hash, expiresAt: Date.now()+300000 });
    (request as any).idempotencyStoreKey = storeKey;
  });
  server.addHook('onSend', async (request, reply, payload) => {
    const key = (request as any).idempotencyStoreKey;
    if (key && reply.statusCode < 400) {
      try {
        const body = typeof payload === 'string' ? JSON.parse(payload) : payload;
        idempotencyStore.set(key, { ...(idempotencyStore.get(key)!), statusCode: reply.statusCode, body, expiresAt: Date.now() + 300000 });
      } catch {
        // Non-JSON payloads are not idempotency-safe to replay.
      }
    }
    return payload;
  });
}
