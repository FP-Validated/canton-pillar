import { z } from 'zod';
import { IssueIntentId, OperationId, RedeemIntentId, TransferIntentId, HoldId } from './ids.js';
import { Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const OperationStatus = z.enum(['received', 'queued', 'submitted', 'in_flight', 'ledger_committed', 'projected', 'failed', 'unknown', 'reconciled']);
export const OperationSchema = z.object({ id: OperationId, object: z.literal('operation'), created: Timestamp, livemode: Livemode, intent: z.union([IssueIntentId, RedeemIntentId, TransferIntentId, HoldId]), status: OperationStatus, ledger: z.object({ backend: z.literal('canton'), update_reference: z.string(), offset: z.string() }), metadata: Metadata }); // allowed: canton
export const OperationCreateRequest = z.never();
export const OperationListResponse = ListEnvelope(OperationSchema);
