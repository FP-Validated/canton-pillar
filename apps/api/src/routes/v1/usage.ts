import type { FastifyInstance } from 'fastify';
const sample = { id:'uro_01JY0000000000000000000000', object:'usage_rollup', livemode:false, tenant_id:'tenant_default', environment_id:'env_default', meter:'api.request.accepted', granularity:'month', period_start:'2026-05-01T00:00:00.000Z', period_end:'2026-06-01T00:00:00.000Z', quantity:'0', unit:'count', event_count:0, created:'2026-05-26T00:00:00.000Z', updated:'2026-05-26T00:00:00.000Z' };
export async function usageRoutes(s: FastifyInstance) {
  s.get('/usage', async () => ({ object:'list', url:'/v1/usage', has_more:false, data:[sample] }));
  s.get('/usage/current_period', async () => ({ object:'current_period_summary', livemode:false, period_start:sample.period_start, period_end:sample.period_end, totals:[sample], forecast:[] }));
}
