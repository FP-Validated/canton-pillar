import type { FastifyInstance } from 'fastify';
import { renderList } from '../../http/pagination.js';
const files = new Map<string, any>(); const now=()=>new Date().toISOString();
const present=(f:any)=>({ id:f.id, object:'evidence_file', livemode:f.livemode, storage_provider:f.storage_provider, content_hash:f.content_hash_visibility==='public'?f.content_hash:'masked', evidence_status:f.evidence_status, retention_policy:f.retention_policy, retain_until:f.retain_until, legal_hold:f.legal_hold, created:f.created_at });
export async function filesRoutes(s: FastifyInstance){
 s.post('/files', async r=>{ const b:any=r.body??{}; const rec={ id:`file_${Date.now()}`, livemode:r.auth.livemode, storage_provider:b.storage_provider??'minio', storage_object_key_ref:b.storage_object_key_ref??`evidence/${Date.now()}`, content_hash:b.content_hash??'sha256:pending', content_hash_visibility:b.content_hash_visibility??'masked', evidence_status:'pending_upload', retention_policy:b.retention_policy??'worm_7y', retain_until:b.retain_until??new Date(Date.now()+86400000).toISOString(), legal_hold:!!b.legal_hold, created_at:now() }; files.set(rec.id,rec); return present(rec); });
 s.get('/files', async()=>renderList('/v1/files',[...files.values()].map(present)));
 s.get('/files/:id', async r=>present(files.get((r.params as any).id)??{id:(r.params as any).id,livemode:r.auth.livemode,storage_provider:'minio',content_hash:'sha256:missing',content_hash_visibility:'masked',evidence_status:'pending_upload',retention_policy:'worm_7y',retain_until:now(),legal_hold:false,created_at:now()}));
 s.post('/files/:id/presigned_upload', async r=>({ object:'presigned_url', file:(r.params as any).id, method:'PUT', expires_at:new Date(Date.now()+300000).toISOString(), url:`https://storage.local/upload/${(r.params as any).id}` }));
 s.post('/files/:id/presigned_download', async r=>({ object:'presigned_url', file:(r.params as any).id, method:'GET', expires_at:new Date(Date.now()+300000).toISOString(), url:`https://storage.local/download/${(r.params as any).id}` }));
}
