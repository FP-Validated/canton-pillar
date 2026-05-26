import { z } from 'zod';
import { ApiKeyId } from './ids.js';
import { Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const ApiKeyStatus = z.enum(['active', 'expired', 'revoked']);
export const ApiKeySchema = z.object({ id: ApiKeyId, object: z.literal('api_key'), created: Timestamp, livemode: Livemode, name: z.string(), prefix: z.string(), last4: z.string().length(4), scopes: z.array(z.string()), status: ApiKeyStatus, metadata: Metadata });
export const ApiKeyCreateRequest = z.object({ name: z.string(), scopes: z.array(z.string()), metadata: Metadata.optional() });
export const ApiKeyUpdateRequest = z.object({ name: z.string().optional(), metadata: Metadata.optional() });
export const ApiKeyCreateResponse = z.object({ id: ApiKeyId, object: z.literal('api_key'), secret: z.string(), name: z.string(), prefix: z.string(), last4: z.string().length(4), scopes: z.array(z.string()), status: ApiKeyStatus, created: Timestamp, livemode: Livemode, metadata: Metadata });
export const ApiKeyListResponse = ListEnvelope(ApiKeySchema);
