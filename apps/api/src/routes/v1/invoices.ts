import type { FastifyInstance } from 'fastify';
const invoice = { id:'inv_01JY0000000000000000000000', object:'invoice', livemode:false, customer_billing:'cb_01JY0000000000000000000000', status:'open', currency:'usd', subtotal:'0', total:'0', period_start:'2026-05-01T00:00:00.000Z', period_end:'2026-06-01T00:00:00.000Z', lines:[], created:'2026-05-26T00:00:00.000Z', updated:'2026-05-26T00:00:00.000Z' };
export async function invoicesRoutes(s: FastifyInstance) {
  s.get('/invoices', async () => ({ object:'list', url:'/v1/invoices', has_more:false, data:[invoice] }));
  s.get('/invoices/:id', async (req:any) => ({ ...invoice, id:req.params.id }));
  s.post('/invoices/:id/dispute', async (req:any) => ({ ...invoice, id:req.params.id, status:'disputed', dispute:{ status:'submitted', evidence:req.body ?? {}, submitted_at:new Date().toISOString() } }));
}
