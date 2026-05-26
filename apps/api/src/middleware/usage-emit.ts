import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { usageStream, type UsageEnvelope, type UsageStreamClient } from '../stream/UsageStreamClient.js';

export const usageEmitMetric = { pillar_usage_emit_failed_total: 0 };
export type UsageEmitInput = Omit<UsageEnvelope,'source_event_time'|'dedupe_key'|'quantity'|'unit'|'source_service'|'attributes'> & { meter:string; quantity?:string; unit?:string; source_service?:string; attributes?:Record<string,string>; idempotent_replay?:boolean };
export function buildUsageEnvelope(input: UsageEmitInput): UsageEnvelope {
  const meter = input.idempotent_replay ? 'api.request.replayed' : input.meter;
  return { ...input, meter, quantity: input.quantity ?? '1', unit: input.unit ?? 'count', source_service: input.source_service ?? 'api', source_event_time: new Date().toISOString(), dedupe_key: `${input.tenant_id}:${input.request_id}:${meter}:${input.operation_id ?? 'none'}`, billable: !input.idempotent_replay && meter !== 'api.request.replayed', attributes: sanitizeAttributes(input.attributes ?? {}) };
}
export function sanitizeAttributes(attrs: Record<string,string>) { return Object.fromEntries(Object.entries(attrs).filter(([k,v]) => k.length <= 64 && v.length <= 256 && !/body|payload|email|name|card|canton|daml/i.test(k))); }
export function emitUsageAccepted(input: UsageEmitInput, client: UsageStreamClient = usageStream, fallbackPath = process.env.USAGE_FALLBACK_PATH ?? '/var/lib/pillar/usage-fallback.ndjson') {
  const env = buildUsageEnvelope(input);
  if (client.publishNonBlocking(env)) return { emitted:true, envelope:env };
  usageEmitMetric.pillar_usage_emit_failed_total += 1;
  try { mkdirSync(dirname(fallbackPath), { recursive:true }); appendFileSync(fallbackPath, `${JSON.stringify(env)}\n`); } catch { usageEmitMetric.pillar_usage_emit_failed_total += 1; }
  return { emitted:false, envelope:env };
}
