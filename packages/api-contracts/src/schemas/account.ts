import { z } from 'zod';
import { AccountId } from './ids.js';
import { Livemode, ListEnvelope, Metadata, Timestamp } from './common.js';

export const AccountStatus = z.enum(['active', 'restricted', 'suspended', 'closed']);
export const AccountSchema = z.object({ id: AccountId, object: z.literal('account'), created: Timestamp, livemode: Livemode, display_name: z.string().max(100), status: AccountStatus, metadata: Metadata });
export const AccountCreateRequest = z.object({ display_name: z.string().max(100), metadata: Metadata.optional() });
export const AccountUpdateRequest = z.object({ display_name: z.string().max(100).optional(), metadata: Metadata.optional() });
export const AccountListResponse = ListEnvelope(AccountSchema);
