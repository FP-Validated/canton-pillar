import { z } from 'zod';
import { ListEnvelope, Timestamp } from '../common.js';

export const DeploymentMode = z.enum(['hosted','customer-validator','self-hosted']);
export const ValidatorProviderStatus = z.enum(['pending_verification','verified','paused','disabled']);
export const ValidatorProviderSchema = z.object({ id:z.string().regex(/^valp_/), object:z.literal('validator_provider'), slug:z.string(), display_name:z.string(), contact_email:z.string().email(), website_url:z.string().url().nullable(), deployment_modes:z.array(DeploymentMode).min(1), status:ValidatorProviderStatus, created:Timestamp, updated:Timestamp });
export const ValidatorProviderCreateRequest = z.object({ slug:z.string().min(1), display_name:z.string().min(1), contact_email:z.string().email(), website_url:z.string().url().optional(), deployment_modes:z.array(DeploymentMode).min(1) });
export const ValidatorProviderListResponse = ListEnvelope(ValidatorProviderSchema);
