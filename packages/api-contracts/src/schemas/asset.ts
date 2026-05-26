import { z } from 'zod';
import { AssetId } from './ids.js';
import { Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const AssetStatus = z.enum(['draft', 'active', 'paused', 'retired']);
export const AssetSchema = z.object({ id: AssetId, object: z.literal('asset'), created: Timestamp, livemode: Livemode, code: z.string().max(16), name: z.string().max(80), scale: z.number().int().min(0).max(18), status: AssetStatus, transferable: z.boolean(), redeemable: z.boolean(), metadata: Metadata });
export const AssetCreateRequest = z.object({ code: z.string().max(16), name: z.string().max(80), scale: z.number().int().min(0).max(18), transferable: z.boolean(), redeemable: z.boolean(), metadata: Metadata.optional() });
export const AssetUpdateRequest = z.object({ name: z.string().max(80).optional(), status: AssetStatus.optional(), transferable: z.boolean().optional(), redeemable: z.boolean().optional(), metadata: Metadata.optional() });
export const AssetListResponse = ListEnvelope(AssetSchema);
