import { z } from 'zod';
import { assertKnownMeter } from '../registry/MeterRegistry.js';
export const UsageEnvelope = z.object({ tenant_id:z.string(), environment_id:z.string(), deployment_mode:z.string(), livemode:z.boolean(), meter:z.string(), quantity:z.string(), unit:z.string(), source_service:z.string(), source_event_time:z.string(), request_id:z.string(), operation_id:z.string().optional(), dedupe_key:z.string(), billable:z.boolean().default(true), attributes:z.record(z.string()).default({}) });
export type UsageEnvelope = z.infer<typeof UsageEnvelope>;
export class StreamConsumer { private seen = new Set<string>(); public rows: UsageEnvelope[] = [];
  consume(raw: unknown) { const env = UsageEnvelope.parse(raw); assertKnownMeter(env.meter); const key = `${env.tenant_id}:${env.dedupe_key}`; if (this.seen.has(key)) return false; this.seen.add(key); this.rows.push(env); return true; }
}
