export const reportTemplateScopes = ['report_templates:read','report_templates:write'] as const;
export function archiveTemplate(template: { archived?: boolean }) { return { ...template, archived: true }; }
export function runTemplate(id: string, interval: string) { return { id: `exp_${id.replace(/^rpt_/, '')}_${interval}`, object: 'export_job', status: 'queued' }; }
