export type SseEvent = { id: string; type: string; data: unknown; ts: number; tenantId?: string; livemode: boolean };
export type SseFilter = { types?: string[]; afterId?: string };

type SubscriberState = { tenantId: string; livemode: boolean; filter: SseFilter; queue: SseEvent[]; wait?: () => void; closed: boolean; lastSeenId?: string; overflowed?: boolean };

const keyFor = (tenantId: string, livemode: boolean) => `${tenantId}:${livemode ? 'live' : 'test'}`;

export class SseBroker {
  private rings = new Map<string, SseEvent[]>();
  private subscribers = new Set<SubscriberState>();
  constructor(private readonly capacity = 4096, private readonly subscriberCapacity = 256) {}

  publish(tenantId: string, livemode: boolean, event: Omit<SseEvent, 'tenantId' | 'livemode' | 'ts'> & { ts?: number }) {
    if (!event.id.startsWith('evt_')) throw new Error('sse_event_id_must_start_evt');
    const full: SseEvent = { ...event, tenantId, livemode, ts: event.ts ?? Date.now() };
    const key = keyFor(tenantId, livemode);
    const ring = this.rings.get(key) ?? [];
    ring.push(full);
    while (ring.length > this.capacity) ring.shift();
    this.rings.set(key, ring);
    for (const sub of this.subscribers) {
      if (sub.closed || sub.tenantId !== tenantId || sub.livemode !== livemode) continue;
      if (sub.filter.types?.length && !sub.filter.types.includes(full.type)) continue;
      if (sub.queue.length >= this.subscriberCapacity) {
        sub.queue.shift();
        sub.overflowed = true;
      }
      sub.queue.push(full);
      sub.lastSeenId = full.id;
      sub.wait?.(); sub.wait = undefined;
    }
  }

  subscribe(tenantId: string, livemode: boolean, filter: SseFilter = {}) {
    const state: SubscriberState = { tenantId, livemode, filter, queue: [], closed: false };
    const ring = this.rings.get(keyFor(tenantId, livemode)) ?? [];
    const start = filter.afterId ? ring.findIndex(e => e.id === filter.afterId) + 1 : ring.length;
    for (const event of ring.slice(Math.max(0, start))) if (!filter.types?.length || filter.types.includes(event.type)) state.queue.push(event);
    this.subscribers.add(state);
    return {
      close: () => { state.closed = true; this.subscribers.delete(state); state.wait?.(); },
      async *[Symbol.asyncIterator](): AsyncIterableIterator<SseEvent> {
        try {
          while (!state.closed) {
            if (state.overflowed) {
              state.overflowed = false;
              yield { id: state.lastSeenId ?? 'evt_overflow', type: 'stream.overflow', data: { last_seen_id: state.lastSeenId }, ts: Date.now(), tenantId, livemode };
              continue;
            }
            const next = state.queue.shift();
            if (next) { yield next; continue; }
            await new Promise<void>(resolve => { state.wait = resolve; });
          }
        } finally { state.closed = true; }
      }
    };
  }
}

export const defaultSseBroker = new SseBroker();
