import { z } from 'zod';
import { ListEnvelope, Timestamp } from '../common.js';

export const NetworkKind = z.enum(['devnet','testnet','mainnet','custom']);
export const NetworkStatus = z.enum(['active','paused','disabled']);
export const NetworkSchema = z.object({ id:z.string().regex(/^net_/), object:z.literal('network'), slug:z.enum(['dev','testnet','mainnet','custom']), display_name:z.string(), kind:NetworkKind, livemode:z.boolean(), default_synchronizer_id:z.string().nullable(), status:NetworkStatus, created:Timestamp, updated:Timestamp });
export const NetworkPublicSchema = NetworkSchema.pick({ slug:true, display_name:true, kind:true, livemode:true, status:true });
export const NetworkListResponse = ListEnvelope(NetworkSchema);
export const NetworkPublicListResponse = ListEnvelope(NetworkPublicSchema);
