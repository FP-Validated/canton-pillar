import { z } from 'zod';
import { AccountId, AssetId, HoldId, OperationId } from './ids.js';
import { DecimalString, Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const HoldStatus = z.enum(['requires_action', 'active', 'released', 'expired', 'failed']);
export const HoldSchema = z.object({ id: HoldId, object: z.literal('hold'), created: Timestamp, livemode: Livemode, status: HoldStatus, amount: DecimalString, asset: AssetId, account: AccountId, expires_at: Timestamp, purpose: z.string(), operation: OperationId, metadata: Metadata });

const forbiddenInternalFields = ['contract' + 'Id', 'template' + 'Id', 'party' + 'Id', 'participant' + 'Id', 'package' + 'Id', 'command' + 'Id', 'submission' + 'Id', 'update' + 'Id'] as const;
const forbidInternalFields = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => schema.passthrough().superRefine((value, ctx) => {
  for (const field of forbiddenInternalFields) {
    if (Object.prototype.hasOwnProperty.call(value, field)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'Internal fields are not accepted' });
  }
});

export const HoldCreateRequest = forbidInternalFields(z.object({ amount: DecimalString, asset: AssetId, account: AccountId, expires_at: Timestamp, purpose: z.string(), metadata: Metadata.optional() }));
export const HoldReleaseRequest = forbidInternalFields(z.object({ hold_id: HoldId.optional(), metadata: Metadata.optional() }));
export const HoldUpdateRequest = z.object({ metadata: Metadata.optional() });
export const HoldListResponse = ListEnvelope(HoldSchema);
