import { z } from 'zod';
import { AccountId, AssetId, BalanceId } from './ids.js';
import { DecimalString, Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const BalanceSchema = z.object({ id: BalanceId, object: z.literal('balance'), created: Timestamp, livemode: Livemode, account: AccountId, asset: AssetId, available: DecimalString, pending: DecimalString, reserved: DecimalString, settled: DecimalString, as_of_ledger_offset: z.string(), as_of_ledger_time: Timestamp, metadata: Metadata });
export const BalanceCreateRequest = z.never();
export const BalanceListResponse = ListEnvelope(BalanceSchema);
