import { z } from 'zod';
import { ListEnvelope, Metadata, Timestamp } from './common.js';
export const ExportDestination = z.object({ id:z.string().startsWith('expdest_'), object:z.literal('export_destination'), livemode:z.boolean(), type:z.enum(['s3','gcs','azure_blob','webhook']), name:z.string(), disabled:z.boolean(), created:Timestamp, updated:Timestamp, metadata:Metadata.default({}) });
export const ExportDestinationCreateRequest = z.object({ type:z.enum(['s3','gcs','azure_blob','webhook']), name:z.string().min(1), config:z.record(z.any()).default({}), secret_ref:z.string().optional(), metadata:Metadata.default({}) });
export const ExportDestinationListResponse = ListEnvelope(ExportDestination);
