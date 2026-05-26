export type AuditEntry = { request_id:string; method:string; path:string; status_code?:number; request_headers:Record<string,unknown>; request_body:unknown; response_body?:unknown };
export interface AuditSink { record(entry: AuditEntry): void; entries(): AuditEntry[] }
function maskValue(v: unknown): unknown { if (Array.isArray(v)) return v.map(maskValue); if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string,unknown>).map(([k,val]) => [k, k.toLowerCase().includes('secret') ? '[masked]' : maskValue(val)])); return v; }
export function maskHeaders(h: Record<string, unknown>) { const out={...h}; for (const k of Object.keys(out)) if (['authorization','idempotency-key'].includes(k.toLowerCase())) out[k]='[masked]'; return out; }
export const maskBody = maskValue;
export class RingBufferAuditSink implements AuditSink { private buf: AuditEntry[]=[]; constructor(private max=1000){} record(e:AuditEntry){ this.buf.push(e); if(this.buf.length>this.max)this.buf.shift(); } entries(){ return [...this.buf]; } }
export const defaultAuditSink = new RingBufferAuditSink();
