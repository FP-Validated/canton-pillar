import type { FastifyInstance } from 'fastify';
const dsars=new Map<string,any>(); const now=()=>new Date().toISOString();
export async function privacyRoutes(s: FastifyInstance){
 s.post('/privacy/dsar', async r=>{ const b:any=r.body??{}; const rec={ id:`dsar_${Date.now()}`, object:'dsar_request', livemode:r.auth.livemode, subject_id:b.subject_id, request_type:b.request_type??'access', status:'submitted', created:now()}; dsars.set(rec.id,rec); return rec; });
 s.get('/privacy/dsar/:id', async r=>dsars.get((r.params as any).id)??{ id:(r.params as any).id, object:'dsar_request', livemode:r.auth.livemode, status:'submitted', created:now() });
}
