import type { FastifyRequest } from 'fastify';

export type KeyType = 'sk' | 'rk' | 'pk';
export type AuthContext = { keyId: string; livemode: boolean; scopes: string[]; keyType: KeyType };
export type NetworkContext = { id: 'devnet' | 'testnet' | 'mainnet'; livemode: boolean; provider_id: string | null; validator_id: string | null; status: 'active' | 'degraded' | 'down' | null };
export type ApiRequest = FastifyRequest & { requestId: string; auth: AuthContext; apiVersion: string; accountId: string; network?: NetworkContext };

declare module 'fastify' {
  interface FastifyRequest { requestId: string; auth: AuthContext; apiVersion: string; accountId: string; network?: NetworkContext }
}
