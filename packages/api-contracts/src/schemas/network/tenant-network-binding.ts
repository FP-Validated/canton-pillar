import { z } from 'zod';
import { ListEnvelope, Timestamp } from '../common.js';

export const TenantNetworkBindingStatus = z.enum(['active','paused','disabled']);
export const TenantNetworkBindingSchema = z.object({ id:z.string().regex(/^tnb_/), object:z.literal('tenant_network_binding'), tenant_id:z.string(), network:z.string(), network_id:z.string().regex(/^net_/), default_validator_id:z.string().regex(/^val_/), fallback_validator_id:z.string().regex(/^val_/).nullable(), livemode:z.boolean(), status:TenantNetworkBindingStatus, created:Timestamp, updated:Timestamp });
export const TenantNetworkBindingUpsertRequest = z.object({ network:z.enum(['dev','testnet','mainnet','custom']), validator:z.string().regex(/^val_/), fallback:z.string().regex(/^val_/).optional() });
export const TenantNetworkBindingListResponse = ListEnvelope(TenantNetworkBindingSchema);
