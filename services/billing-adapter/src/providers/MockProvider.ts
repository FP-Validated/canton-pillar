import crypto from 'node:crypto';
import type { ProviderAdapter, ProviderInvoice } from './ProviderAdapter.js';
export class MockProvider implements ProviderAdapter { exported = new Map<string, unknown>();
 async exportUsage(key:string, rollup:unknown) { this.exported.set(key, rollup); return { idempotency_key:key, accepted:true }; }
 async importInvoice(id:string): Promise<ProviderInvoice> { return { id, tenant_id:'tenant_default', amount:'0', currency:'usd', period_start:'2026-05-01T00:00:00.000Z', period_end:'2026-06-01T00:00:00.000Z' }; }
 async createPortalUrl(customerRef:string) { return { url:`https://provider.example/portal/${customerRef}`, expires_at:new Date(Date.now()+900000).toISOString() }; }
 verifyWebhook(payload:string, signature:string, secret:string) { const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex'); return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); }
}
