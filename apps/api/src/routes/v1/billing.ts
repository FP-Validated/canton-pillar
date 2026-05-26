import type { FastifyInstance } from 'fastify';
const plan = { id:'plan_01JY0000000000000000000000', object:'pricing_plan', name:'Default', status:'published', currency:'usd', meter_config:{}, provider_price_map:{}, effective_from:'2026-05-01T00:00:00.000Z', created:'2026-05-26T00:00:00.000Z', updated:'2026-05-26T00:00:00.000Z' };
const customer = { id:'cb_01JY0000000000000000000000', object:'customer_billing', livemode:false, tenant_id:'tenant_default', environment_id:'env_default', plan:plan.id, status:'active', created:plan.created, updated:plan.updated };
export async function billingRoutes(s: FastifyInstance) {
  s.post('/billing/portal_url', async () => process.env.DEPLOYMENT_MODE === 'self-hosted' ? { error:{ type:'invalid_request_error', code:'unsupported_in_deployment_mode', message:'Billing portal is not available in this deployment mode.' } } : { object:'billing_portal_url', url:'https://provider.example/portal/session', expires_at:new Date(Date.now()+900000).toISOString() });
  s.get('/pricing_plans', async () => ({ object:'list', url:'/v1/pricing_plans', has_more:false, data:[plan] }));
  s.post('/pricing_plans', async () => plan);
  s.get('/customer_billing/:id', async (req:any) => ({ ...customer, id:req.params.id }));
}
