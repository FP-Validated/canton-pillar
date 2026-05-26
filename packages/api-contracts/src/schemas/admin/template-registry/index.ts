import { z } from 'zod';
export const templateRegistryId = z.string().min(1);
export const darUploadSchema = z.object({ id: templateRegistryId, object: z.literal('dar_upload'), sha256: z.string(), status: z.string() });
export const packageVersionSchema = z.object({ id: templateRegistryId, object: z.literal('package_version'), package_id: z.string(), package_version: z.string(), status: z.string(), registry_version: z.number().int() });
export const upgradePlanSchema = z.object({ id: templateRegistryId, object: z.literal('upgrade_plan'), state: z.string() });
export const compatibilityRecordSchema = z.object({ participant_id: z.string(), environment: z.string(), status: z.enum(['missing','uploaded','vetted','compatible','stale','incompatible','side_channel_detected']) });
