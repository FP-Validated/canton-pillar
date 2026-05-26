type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  quit(): Promise<unknown>;
};

type RedisCtor = new (url: string, options?: Record<string, unknown>) => RedisLike;

class NoopRedis implements RedisLike {
  async get() { return null; }
  async set() { return undefined; }
  async publish() { return undefined; }
  async quit() { return undefined; }
}

export class RedisClientPool {
  private clients: RedisLike[] | null = null;
  private next = 0;

  enabled(): boolean { return !!process.env.PILLAR_CACHE_REDIS_URL; }

  private async init(): Promise<RedisLike[]> {
    if (!this.enabled()) return [new NoopRedis()];
    if (this.clients) return this.clients;
    const mod = await import('ioredis');
    const Redis = (mod.default ?? mod) as unknown as RedisCtor;
    const url = process.env.PILLAR_CACHE_REDIS_URL!;
    this.clients = Array.from({ length: 10 }, () => new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2, enableOfflineQueue: false }));
    return this.clients;
  }

  async client(): Promise<RedisLike> {
    const clients = await this.init();
    const client = clients[this.next % clients.length];
    this.next += 1;
    return client;
  }

  async close(): Promise<void> {
    if (!this.clients) return;
    await Promise.allSettled(this.clients.map(c => c.quit()));
    this.clients = null;
  }
}

export const redisClientPool = new RedisClientPool();
