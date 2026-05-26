import type { FastifyInstance } from 'fastify';

const now = '2026-05-26T00:00:00.000Z';
const networks = [
  { id:'net_dev', object:'network', slug:'dev', display_name:'Canton Devnet', kind:'devnet', livemode:false, default_synchronizer_id:'sync_dev', status:'active', created:now, updated:now },
  { id:'net_testnet', object:'network', slug:'testnet', display_name:'Canton Testnet', kind:'testnet', livemode:false, default_synchronizer_id:'sync_testnet', status:'active', created:now, updated:now },
  { id:'net_mainnet', object:'network', slug:'mainnet', display_name:'Canton Mainnet', kind:'mainnet', livemode:true, default_synchronizer_id:'sync_mainnet', status:'active', created:now, updated:now }
];
const providers:any[] = [];
const validators:any[] = [];
const health:any[] = [];
const list = (url:string, data:any[]) => ({ object:'list', url, has_more:false, data });
const id = (prefix:string) => `${prefix}_01JY0000000000000000000000`;

export async function adminNetworkRoutes(s: FastifyInstance) {
  s.get('/admin/network/networks', async () => list('/v1/admin/network/networks', networks));
  s.get('/admin/network/networks/:slug', async (req:any, reply) => networks.find(n => n.slug === req.params.slug) ?? reply.notFound('network not found'));
  s.get('/admin/network/validator_providers', async () => list('/v1/admin/network/validator_providers', providers));
  s.post('/admin/network/validator_providers', async (req:any) => { const p={ id:id('valp'), object:'validator_provider', status:'pending_verification', created:now, updated:now, ...req.body }; providers.push(p); return p; });
  for (const action of ['verify','pause','disable','enable']) s.post(`/admin/network/validator_providers/:id/${action}`, async (req:any, reply) => { const p=providers.find(x=>x.id===req.params.id); if(!p) return reply.notFound('provider not found'); p.status=action==='verify'||action==='enable'?'verified':action==='pause'?'paused':'disabled'; p.updated=now; return p; });
  s.get('/admin/network/validators', async () => list('/v1/admin/network/validators', validators));
  s.post('/admin/network/validators', async (req:any) => { const n=networks.find(x=>x.slug===req.body.network) ?? networks[0]; const v={ id:id('val'), object:'validator', network_id:n.id, status:'disabled', created:now, updated:now, regions:[], capacity_tier:'standard', jwt_issuer:null, tls_profile:null, ...req.body }; validators.push(v); return v; });
  for (const action of ['activate','degrade','disable']) s.post(`/admin/network/validators/:id/${action}`, async (req:any, reply) => { const v=validators.find(x=>x.id===req.params.id); if(!v) return reply.notFound('validator not found'); v.status=action==='activate'?'active':action==='degrade'?'degraded':'disabled'; v.updated=now; return v; });
  s.get('/admin/network/validators/health', async () => list('/v1/admin/network/validators/health', health));
}
