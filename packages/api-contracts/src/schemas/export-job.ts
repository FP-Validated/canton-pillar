import { z } from 'zod';
import { ListEnvelope, Metadata, Timestamp } from './common.js';
export const ExportJobStatus = z.enum(['queued','claimed','running','succeeded','failed','canceled']);
export const ExportFormat = z.enum(['csv','jsonl','parquet']);
export const ExportConsistencyMode = z.enum(['eventual','ledger_snapshot']);
export const ExportJob = z.object({ id:z.string().startsWith('exp_'), object:z.literal('export_job'), livemode:z.boolean(), status:ExportJobStatus, resource:z.string(), query:z.record(z.any()), query_hash:z.string(), format:ExportFormat, columns:z.array(z.string()), consistency_mode:ExportConsistencyMode, target_ledger_offset:z.string().nullable().optional(), destination:z.string().nullable().optional(), result:z.object({ row_count:z.number().int(), byte_count:z.number().int(), sha256:z.string(), manifest:z.record(z.any()) }).nullable().optional(), failure:z.object({ code:z.string(), message:z.string() }).nullable().optional(), created:Timestamp, updated:Timestamp, metadata:Metadata.default({}) });
export const ExportCreateRequest = z.object({ resource:z.string(), query:z.record(z.any()).default({}), format:ExportFormat.default('csv'), columns:z.array(z.string()).default([]), consistency_mode:ExportConsistencyMode.default('eventual'), destination:z.string().startsWith('expdest_').optional(), metadata:Metadata.default({}) });
export const ExportDownloadUrlResponse = z.object({ id:z.string().startsWith('exp_'), object:z.literal('export_download_url'), url:z.string().url(), expires_at:Timestamp });
export const ExportJobListResponse = ListEnvelope(ExportJob);
