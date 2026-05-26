import { createHash } from 'node:crypto';
export type CachedResponse = { hash: string; statusCode?: number; body?: unknown; expiresAt: number };
export const idempotencyStore = new Map<string, CachedResponse>();
export function bodyHash(body: unknown) { return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex'); }
export function idemKey(account:string, live:boolean, method:string, path:string, key:string) { return `${account}:${live}:${method}:${path}:${key}`; }
export function clearExpired(now = Date.now()) { for (const [k,v] of idempotencyStore) if (v.expiresAt < now) idempotencyStore.delete(k); }
