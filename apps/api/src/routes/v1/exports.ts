import { createSignedUrl } from '../../services/export-downloads/SignedUrlService.js';
export const exportScopes = ['exports:read','exports:write','exports:regulator'] as const;
export function requireIdempotency(headers: Record<string,string|undefined>) { if (!headers['idempotency-key']) throw Object.assign(new Error('Idempotency-Key required'), { code:'idempotency_key_required' }); }
export function cancelExport(status: string) { return status === 'queued' || status === 'claimed' ? 'canceled' : status; }
export function downloadUrl(job: { id:string; tenant_id:string; sha256:string }, ttlSeconds = 900) { return createSignedUrl(job, ttlSeconds); }
