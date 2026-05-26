import { z } from 'zod';
import { AccountId, AssetId, HoldingId, IssueIntentId, RedeemIntentId, TransferIntentId } from './ids.js';
import { DecimalString, Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const HoldingStatus = z.enum(['active', 'partially_reserved', 'reserved', 'frozen', 'redeeming', 'closed']);
export const HoldingSchema = z.object({ id: HoldingId, object: z.literal('holding'), created: Timestamp, livemode: Livemode, account: AccountId, asset: AssetId, amount: DecimalString, status: HoldingStatus, restrictions: z.array(z.string()), source_intent: z.union([IssueIntentId, RedeemIntentId, TransferIntentId]), metadata: Metadata });
export const HoldingCreateRequest = z.never();
export const HoldingListResponse = ListEnvelope(HoldingSchema);
