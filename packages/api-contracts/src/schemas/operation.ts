import { z } from 'zod';
import { IssueIntentId, OperationId, RedeemIntentId, TransferIntentId, HoldId } from './ids.js';
import { Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const OperationStatus = z.enum(['received', 'queued', 'submitted', 'in_flight', 'ledger_committed', 'projected', 'failed', 'unknown', 'reconciled']);
export const LedgerTraceSchema = z.object({ update_id: z.string(), ledger_offset: z.string(), participant_id: z.string(), synchronizer_id: z.string(), ledger_record_time: Timestamp });
export const OperationSchema = z.object({ id: OperationId, object: z.literal('operation'), created: Timestamp, livemode: Livemode, intent: z.union([IssueIntentId, RedeemIntentId, TransferIntentId, HoldId]), status: OperationStatus, metadata: Metadata, ledger_trace: LedgerTraceSchema.optional() });
export const OperationCreateRequest = z.never();
export const OperationListResponse = ListEnvelope(OperationSchema);
