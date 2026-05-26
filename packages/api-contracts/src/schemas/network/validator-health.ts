import { z } from 'zod';
import { ListEnvelope, Timestamp } from '../common.js';

export const ValidatorHealthSnapshotSchema = z.object({ object:z.literal('validator_health_snapshot'), validator_id:z.string().regex(/^val_/), sampled_at:Timestamp, health_status:z.enum(['healthy','degraded','unhealthy','unknown']), latency_ms:z.number().int().nonnegative().nullable(), error_class:z.string().nullable(), sequencer_offset_lag_seconds:z.number().int().nonnegative().nullable(), package_visibility_status:z.enum(['visible','missing','unknown']) });
export const ValidatorHealthListResponse = ListEnvelope(ValidatorHealthSnapshotSchema);
