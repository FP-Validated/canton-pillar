import { z } from 'zod';
import { ListEnvelope, Metadata, Timestamp } from './common.js';
import { ExportConsistencyMode, ExportFormat, ExportJob } from './export-job.js';
export const ReportTemplate = z.object({ id:z.string().startsWith('rpt_'), object:z.literal('report_template'), livemode:z.boolean(), name:z.string(), resource:z.string(), query:z.record(z.any()), columns:z.array(z.string()), format:ExportFormat, consistency_mode:ExportConsistencyMode, schedule:z.record(z.any()).nullable().optional(), archived:z.boolean(), created:Timestamp, updated:Timestamp, metadata:Metadata.default({}) });
export const ReportTemplateCreateRequest = z.object({ name:z.string().min(1), resource:z.string(), query:z.record(z.any()).default({}), columns:z.array(z.string()).default([]), format:ExportFormat.default('csv'), consistency_mode:ExportConsistencyMode.default('eventual'), schedule:z.record(z.any()).optional(), metadata:Metadata.default({}) });
export const ReportTemplateListResponse = ListEnvelope(ReportTemplate);
export const ReportTemplateRunResponse = ExportJob;
