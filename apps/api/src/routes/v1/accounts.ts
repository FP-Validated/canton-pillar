import type { FastifyInstance } from 'fastify';
import { AccountCreateRequest, AccountUpdateRequest } from '@pillar/api-contracts/schemas';
import { tenantRepository } from '../../repositories/tenant-repository.js';
import { PillarError } from '../../errors/pillar-error.js';
import { applyCursor, renderList } from '../../http/pagination.js';
import { presentAccount } from '../../presenters/index.js';
export async function accountsRoutes(s:FastifyInstance){
 s.post('/accounts', async (r)=> presentAccount(tenantRepository.createAccount(AccountCreateRequest.parse(r.body), r.auth.livemode)));
 s.get('/accounts', async (r)=>{const p=applyCursor(tenantRepository.listAccounts(), r.query as any); return renderList('/v1/accounts', p.data.map(presentAccount), p.has_more)});
 s.get('/accounts/:id', async (r)=>{const a=tenantRepository.getAccount((r.params as any).id); if(!a) throw PillarError.notFound(); return presentAccount(a)});
 s.post('/accounts/:id', async (r)=>{const a=tenantRepository.updateAccount((r.params as any).id, AccountUpdateRequest.parse(r.body)); if(!a) throw PillarError.notFound(); return presentAccount(a)});
}
