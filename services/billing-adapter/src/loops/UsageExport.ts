import type { ProviderAdapter } from '../providers/ProviderAdapter.js';
export class UsageExport { constructor(private provider: ProviderAdapter) {} exportClosedMonthly(rollup:{ tenant_id:string; meter:string; period_start:string; period_end:string }) { const key = `${rollup.tenant_id}:${rollup.meter}:${rollup.period_start}:${rollup.period_end}`; return this.provider.exportUsage(key, rollup); } }
