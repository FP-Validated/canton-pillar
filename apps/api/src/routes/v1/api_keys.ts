import type { FastifyInstance } from 'fastify';
import { createApiKey, hashApiKey } from '@pillar/security';
import { renderList } from '../../http/pagination.js';
const store = new Map<string, any>();
const now = () => new Date().toISOString();
const publicKey = (k:any) => ({ id:k.id, object:'api_key', livemode:k.mode==='live', prefix:k.prefix, last4:k.last4, scopes:k.scopes, status:k.status, created:k.created_at, expires_at:k.expires_at });
export async function p8ApiKeysRoutes(s: FastifyInstance) {
  s.post('/api_keys', async r => { const body:any=r.body??{}; const kind=body.key_type??'sk'; const mode=(body.mode??(r.auth.livemode?'live':'test')) as 'test'|'live'; const key=createApiKey(kind, mode); const hashed=await hashApiKey(key.secret, { id: process.env.PILLAR_API_KEY_PEPPER_ID??'default', value: process.env.PILLAR_API_KEY_PEPPER??'dev-pepper' }); const rec={ id:`key_${Date.now()}`, tenant_id:r.accountId, account_id:r.accountId, mode, prefix:key.prefix, last4:key.last4, scopes:body.scopes??['*'], status:'active', created_at:now(), expires_at:body.expires_at, ...hashed }; store.set(rec.id, rec); return { ...publicKey(rec), secret:key.secret }; });
  s.get('/api_keys', async r => renderList('/v1/api_keys', [...store.values()].map(publicKey)));
  s.get('/api_keys/:id', async r => publicKey(store.get((r.params as any).id) ?? { id:(r.params as any).id, mode:r.auth.livemode?'live':'test', prefix:'plr_sk_test', last4:'demo', scopes:[], status:'active', created_at:now() }));
  s.post('/api_keys/:id/revoke', async r => { const rec=store.get((r.params as any).id); if (rec) { rec.status='revoked'; rec.revoked_at=now(); } return publicKey(rec ?? { id:(r.params as any).id, mode:'test', prefix:'plr_sk_test', last4:'demo', scopes:[], status:'revoked', created_at:now() }); });
  s.post('/api_keys/:id/rotate', async r => { const old=store.get((r.params as any).id); if (old) old.status='revoked'; const key=createApiKey(old?.key_type??'sk', old?.mode??'test'); return { ...publicKey({ ...(old??{}), id:(r.params as any).id, prefix:key.prefix, last4:key.last4, status:'active', created_at:now(), scopes:old?.scopes??['*'], mode:old?.mode??'test' }), secret:key.secret } });
  s.post('/api_keys/:id/expire', async r => { const rec=store.get((r.params as any).id); if (rec) { rec.status='expired'; rec.expired_at=now(); } return publicKey(rec ?? { id:(r.params as any).id, mode:'test', prefix:'plr_sk_test', last4:'demo', scopes:[], status:'expired', created_at:now() }); });
}
