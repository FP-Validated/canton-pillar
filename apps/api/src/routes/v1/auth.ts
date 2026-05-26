import type { FastifyInstance } from 'fastify';
import { hashState, validateCallback, exchangeOidcSession } from '@pillar/security';
export async function authRoutes(s: FastifyInstance){
 s.get('/auth/oidc/signin', async r=>{ const state=`st_${Date.now()}`, nonce=`no_${Date.now()}`; return { authorization_url:`https://issuer.local/authorize?state=${state}&nonce=${nonce}`, state_hash:hashState(state), nonce_hash:hashState(nonce), mode:r.auth.livemode?'live':'test' }; });
 s.post('/auth/oidc/callback', async r=>{ const b:any=r.body??{}; const claims=validateCallback({ state:b.state, nonce:b.nonce, expectedStateHash:b.expected_state_hash??hashState(b.state??''), expectedNonceHash:b.expected_nonce_hash??hashState(b.nonce??''), aud:b.aud??'pillar', expectedAud:b.expected_aud??'pillar', sub:b.sub??'user', tenantId:r.accountId, mode:r.auth.livemode?'live':'test' }); return exchangeOidcSession({ subject:claims.subject, tenant_id:claims.tenant_id, mode:claims.mode, scopes:b.scopes??['holdings:read'] }, 'pillar-api'); });
}
