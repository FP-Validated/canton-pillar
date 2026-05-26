import { z } from 'zod';
import { EventId, RequestId } from './ids.js';
import { Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const EventSchema = z.object({ id: EventId, object: z.literal('event'), created: Timestamp, livemode: Livemode, type: z.string(), api_version: z.string(), data: z.object({ object: z.unknown(), previous_attributes: z.record(z.unknown()).optional() }), request: z.object({ id: RequestId, idempotency_key: z.string().optional() }), metadata: Metadata });
export const EventCreateRequest = z.never();
export const EventListResponse = ListEnvelope(EventSchema);
