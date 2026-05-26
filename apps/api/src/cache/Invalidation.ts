import { redisClientPool } from './RedisClient.js';

export const INVALIDATION_CHANNEL = 'pillar.cache.invalidate';

export type CacheInvalidationEvent = {
  tenant_id: string;
  livemode: boolean;
  resource: 'balance' | 'holding' | 'operation' | 'event';
  id: string;
  as_of_ledger_offset?: string;
  occurred_at: string;
};

export async function publishInvalidation(event: CacheInvalidationEvent): Promise<void> {
  if (!redisClientPool.enabled()) return;
  const client = await redisClientPool.client();
  await client.publish(INVALIDATION_CHANNEL, JSON.stringify(event)).catch(() => undefined);
}
