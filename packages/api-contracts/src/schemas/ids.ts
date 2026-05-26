import { z } from 'zod';

export const pillarId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}[A-Za-z0-9_-]{4,80}$`));

export const AccountId = pillarId('acct_');
export const AssetId = pillarId('asst_');
export const BalanceId = pillarId('bal_');
export const HoldingId = pillarId('hld_');
export const IssueIntentId = pillarId('issint_');
export const RedeemIntentId = pillarId('redint_');
export const TransferIntentId = pillarId('trint_');
export const HoldId = pillarId('hold_');
export const OperationId = pillarId('op_');
export const EventId = pillarId('evt_');
export const WebhookEndpointId = pillarId('we_');
export const ApiKeyId = pillarId('ak_');
export const RequestId = pillarId('req_');
