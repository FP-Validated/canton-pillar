import type { FastifyRequest } from 'fastify';

export type KeyType = 'sk' | 'rk' | 'pk';
export type AuthContext = { keyId: string; livemode: boolean; scopes: string[]; keyType: KeyType };
export type ApiRequest = FastifyRequest & { requestId: string; auth: AuthContext; apiVersion: string; accountId: string };

declare module 'fastify' {
  interface FastifyRequest { requestId: string; auth: AuthContext; apiVersion: string; accountId: string }
}
