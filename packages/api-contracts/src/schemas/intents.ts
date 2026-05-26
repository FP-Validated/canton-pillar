import { z } from 'zod';
import { AccountId, AssetId, EventId, HoldingId, IssueIntentId, OperationId, RedeemIntentId, TransferIntentId } from './ids.js';
import { DecimalString, Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const IntentStatus = z.enum(['requires_action', 'processing', 'succeeded', 'failed', 'canceled', 'expired']);
const BaseIntent = { created: Timestamp, livemode: Livemode, status: IntentStatus, amount: DecimalString, asset: AssetId, metadata: Metadata, operation: OperationId, latest_event: EventId.nullable() };
export const IssueIntentSchema = z.object({ id: IssueIntentId, object: z.literal('issue_intent'), ...BaseIntent, account: AccountId });
export const RedeemIntentSchema = z.object({ id: RedeemIntentId, object: z.literal('redeem_intent'), ...BaseIntent, account: AccountId, source_holding: HoldingId.optional() });
export const TransferIntentSchema = z.object({ id: TransferIntentId, object: z.literal('transfer_intent'), ...BaseIntent, from_account: AccountId, to_account: AccountId });
export const IssueIntentCreateRequest = z.object({ amount: DecimalString, asset: AssetId, account: AccountId, confirm: z.boolean().optional(), metadata: Metadata.optional() });
export const RedeemIntentCreateRequest = z.object({ amount: DecimalString, asset: AssetId, account: AccountId, source_holding: HoldingId.optional(), confirm: z.boolean().optional(), metadata: Metadata.optional() });
export const TransferIntentCreateRequest = z.object({ amount: DecimalString, asset: AssetId, from_account: AccountId, to_account: AccountId, confirm: z.boolean().optional(), metadata: Metadata.optional() });
export const IssueIntentUpdateRequest = z.object({ metadata: Metadata.optional() });
export const RedeemIntentUpdateRequest = z.object({ metadata: Metadata.optional() });
export const TransferIntentUpdateRequest = z.object({ metadata: Metadata.optional() });
export const IssueIntentListResponse = ListEnvelope(IssueIntentSchema);
export const RedeemIntentListResponse = ListEnvelope(RedeemIntentSchema);
export const TransferIntentListResponse = ListEnvelope(TransferIntentSchema);
