import { z } from 'zod';
import { EventId } from './ids.js';
import { Livemode, Timestamp } from './common.js';

export const EventStreamPayload = z.object({
  id: EventId,
  object: z.literal('event'),
  livemode: Livemode,
  type: z.string().min(1),
  created: Timestamp,
  data: z.unknown(),
});

export const EventStreamFrame = z.object({
  id: EventId,
  event: z.string().min(1),
  data: EventStreamPayload,
});
