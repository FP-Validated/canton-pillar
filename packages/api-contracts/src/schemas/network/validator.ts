import { z } from 'zod';
import { ListEnvelope, Timestamp } from '../common.js';

export const ValidatorStatus = z.enum(['active','degraded','disabled']);
export const ValidatorSchema = z.object({ id:z.string().regex(/^val_/), object:z.literal('validator'), provider_id:z.string().regex(/^valp_/), network_id:z.string().regex(/^net_/), display_name:z.string(), participant_endpoint_ref:z.string(), jwt_issuer:z.string().nullable(), tls_profile:z.string().nullable(), capacity_tier:z.string(), regions:z.array(z.string()), status:ValidatorStatus, created:Timestamp, updated:Timestamp });
export const ValidatorCreateRequest = z.object({ provider_id:z.string(), network:z.string(), display_name:z.string(), participant_endpoint_ref:z.string(), jwt_issuer:z.string().optional(), tls_profile:z.string().optional(), capacity_tier:z.string().default('standard').optional(), regions:z.array(z.string()).default([]).optional() });
export const ValidatorListResponse = ListEnvelope(ValidatorSchema);
