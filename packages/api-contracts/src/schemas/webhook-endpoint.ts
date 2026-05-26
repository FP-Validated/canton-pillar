import { z } from 'zod';
import { WebhookEndpointId } from './ids.js';
import { Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const WebhookEndpointStatus = z.enum(['enabled', 'disabled']);
export const WebhookEndpointSchema = z.object({ id: WebhookEndpointId, object: z.literal('webhook_endpoint'), created: Timestamp, livemode: Livemode, url: z.string().url(), enabled_events: z.array(z.string()), api_version: z.string(), status: WebhookEndpointStatus, metadata: Metadata });
export const WebhookEndpointCreateRequest = z.object({ url: z.string().url(), enabled_events: z.array(z.string()), api_version: z.string().optional(), description: z.string().optional(), metadata: Metadata.optional() });
export const WebhookEndpointUpdateRequest = z.object({ url: z.string().url().optional(), enabled_events: z.array(z.string()).optional(), api_version: z.string().optional(), description: z.string().optional(), metadata: Metadata.optional() });
export const RotateSecretResponse = z.object({ id: WebhookEndpointId, secret: z.string(), last4: z.string().length(4), created: Timestamp });
export const WebhookEndpointListResponse = ListEnvelope(WebhookEndpointSchema);
