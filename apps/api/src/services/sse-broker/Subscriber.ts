import type { SseEvent } from './Broker.js';

export interface SseSubscriber extends AsyncIterable<SseEvent> {
  close(): void;
}
