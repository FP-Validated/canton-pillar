export type UsageEnvelope = { tenant_id:string; environment_id:string; deployment_mode:string; livemode:boolean; meter:string; quantity:string; unit:string; source_service:string; source_event_time:string; request_id:string; operation_id?:string; dedupe_key:string; billable?:boolean; attributes:Record<string,string> };
export interface UsageStreamClient { publishNonBlocking(envelope: UsageEnvelope): boolean; drain?(): Promise<void>; }
export class BoundedUsageStreamClient implements UsageStreamClient {
  private queue: UsageEnvelope[] = [];
  constructor(private readonly max = 1024) {}
  publishNonBlocking(envelope: UsageEnvelope): boolean { if (this.queue.length >= this.max) return false; this.queue.push(envelope); void this.flush(); return true; }
  async flush() { this.queue.splice(0, this.queue.length); }
}
export const usageStream = new BoundedUsageStreamClient(Number(process.env.USAGE_EMIT_QUEUE_MAX ?? 1024));
