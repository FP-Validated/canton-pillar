import { z } from 'zod';
import { AccountId, AssetId, HoldId, OperationId } from './ids.js';
import { DecimalString, Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const HoldStatus = z.enum(['requires_action', 'active', 'released', 'expired', 'failed']);
export const HoldSchema = z.object({ id: HoldId, object: z.literal('hold'), created: Timestamp, livemode: Livemode, status: HoldStatus, amount: DecimalString, asset: AssetId, account: AccountId, expires_at: Timestamp, purpose: z.string(), operation: OperationId, metadata: Metadata });
export const HoldCreateRequest = z.object({ amount: DecimalString, asset: AssetId, account: AccountId, expires_at: Timestamp, purpose: z.string(), metadata: Metadata.optional() });
export const HoldReleaseRequest = z.object({ metadata: Metadata.optional() });
export const HoldUpdateRequest = z.object({ metadata: Metadata.optional() });
export const HoldListResponse = ListEnvelope(HoldSchema);
