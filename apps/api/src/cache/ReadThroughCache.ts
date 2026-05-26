import { redisClientPool } from './RedisClient.js';

export class ReadThroughCache {
  static async get<T>(key: string, ttlSec: number, loader: () => Promise<T | null>): Promise<T | null> {
    if (!redisClientPool.enabled()) return loader();
    const client = await redisClientPool.client();
    const cached = await client.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as T;
    const loaded = await loader();
    if (loaded === null || loaded === undefined) return loaded;
    await client.set(key, JSON.stringify(loaded), 'EX', ttlSec).catch(() => undefined);
    return loaded;
  }
}
