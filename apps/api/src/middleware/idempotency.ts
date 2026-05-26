import type { FastifyInstance } from 'fastify';
import { canonicalRequestHash, IdempotencyStore } from '../../../../packages/idempotency/src/index.js';
import { pool } from '../db/client.js';
import { PillarError } from '../errors/pillar-error.js';
import { bodyHash, clearExpired, idemKey, idempotencyStore } from '../http/idempotency-store.js';

const store = new IdempotencyStore(pool);
const ACTION_SEGMENTS = new Set(['release', 'cancel', 'confirm', 'rotate_secret', 'revoke', 'dispute', 'replay', 'resend']);

type ClaimState = { tenantId: string; key: string; requestHash: string; operationId?: string; mode: 'db' | 'memory' };

function isMutatingPost(request: { method: string; url: string }) {
  if (request.method !== 'POST') return false;
  const path = request.url.split('?')[0];
  const last = path.split('/').filter(Boolean).at(-1);
  return path.startsWith('/v1/') && (!!last && (ACTION_SEGMENTS.has(last) || true));
}

function pathTemplate(request: any): string {
  const routerPath = request.routeOptions?.url ?? request.routerPath;
  const prefix = request.routeOptions?.prefix ?? '';
  if (routerPath) return `${prefix}${routerPath}`.replace(/:([A-Za-z_][\w]*)/g, '{$1}');
  return request.url.split('?')[0].replace(/\/([A-Za-z]+_[A-Za-z0-9_]+)/g, '/{id}');
}

function idempotencyKey(request: any) {
  const raw = request.headers['idempotency-key'];
  return typeof raw === 'string' ? raw : undefined;
}

function memoryEnabled() { return process.env.PILLAR_IDEMPOTENCY === 'memory'; }

export async function registerIdempotency(server: FastifyInstance) {
  server.addHook('preHandler', async (request, reply) => {
    if (!isMutatingPost(request)) return;
    const key = idempotencyKey(request);
    if (!key || key.length > 255) throw PillarError.idempotency('idempotency_key_required', 'Idempotency-Key is required.');

    const tenantId = request.accountId;
    const route = pathTemplate(request);
    const requestHash = canonicalRequestHash({
      method: request.method,
      pathTemplate: route,
      apiVersion: request.apiVersion,
      body: request.body,
      headersSubset: { 'Pillar-Version': request.headers['pillar-version'] as string | undefined },
    });

    if (memoryEnabled()) {
      clearExpired();
      const storeKey = idemKey(tenantId, !!request.auth?.livemode, request.method, route, key);
      const existing = idempotencyStore.get(storeKey);
      const hash = bodyHash({ requestHash });
      if (existing) {
        if (existing.hash !== hash) throw PillarError.idempotency('idempotency_key_reused', 'This idempotency key was already used with different request parameters.', 409);
        if (existing.body !== undefined) return reply.status(existing.statusCode ?? 200).send(existing.body);
        return reply.status(202).send({ status: 'processing', operation_id: undefined });
      }
      idempotencyStore.set(storeKey, { hash, expiresAt: Date.now() + 300000 });
      (request as any).idempotencyClaim = { tenantId, key: storeKey, requestHash, mode: 'memory' } satisfies ClaimState;
      return;
    }

    const claim = await store.claim({ tenantId, idempotencyKey: key, requestHash, livemode: request.auth.livemode, route, method: request.method, apiVersion: request.apiVersion });
    if (claim.status === 'conflict') throw PillarError.idempotency('idempotency_key_reused', 'This idempotency key was already used with different request parameters.', 409);
    if (claim.status === 'completed' && claim.stored) return reply.status(claim.stored.response_status).send(claim.stored.response_body);
    if (claim.status === 'in_progress') return reply.status(202).send({ status: 'processing', operation_id: claim.operationId });
    (request as any).idempotencyClaim = { tenantId, key, requestHash, operationId: claim.operationId, mode: 'db' } satisfies ClaimState;
  });

  server.addHook('onSend', async (request, reply, payload) => {
    const claim = (request as any).idempotencyClaim as ClaimState | undefined;
    if (!claim || reply.statusCode >= 400) return payload;
    try {
      const body = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (claim.mode === 'memory') {
        idempotencyStore.set(claim.key, { ...(idempotencyStore.get(claim.key)!), statusCode: reply.statusCode, body, expiresAt: Date.now() + 300000 });
      } else {
        await store.complete(claim.tenantId, claim.key, reply.statusCode, body);
      }
    } catch {
      if (claim.mode === 'db') await store.release(claim.tenantId, claim.key);
    }
    return payload;
  });

  server.addHook('onError', async (request) => {
    const claim = (request as any).idempotencyClaim as ClaimState | undefined;
    if (claim?.mode === 'db') await store.release(claim.tenantId, claim.key);
  });
}
