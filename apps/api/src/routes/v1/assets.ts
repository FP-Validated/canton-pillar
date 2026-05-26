import type { FastifyInstance } from 'fastify';
import { AssetCreateRequest, AssetUpdateRequest } from '@pillar/api-contracts/schemas';
import { tenantRepository } from '../../repositories/tenant-repository.js';
import { PillarError } from '../../errors/pillar-error.js';
import { applyCursor, renderList } from '../../http/pagination.js';
import { presentAsset } from '../../presenters/index.js';
export async function assetsRoutes(s:FastifyInstance){
 s.post('/assets', async (r)=> presentAsset(tenantRepository.createAsset(AssetCreateRequest.parse(r.body), r.auth.livemode)));
 s.get('/assets', async (r)=>{const p=applyCursor(tenantRepository.listAssets(), r.query as any); return renderList('/v1/assets', p.data.map(presentAsset), p.has_more)});
 s.get('/assets/:id', async (r)=>{const a=tenantRepository.getAsset((r.params as any).id); if(!a) throw PillarError.notFound(); return presentAsset(a)});
 s.post('/assets/:id', async (r)=>{const a=tenantRepository.updateAsset((r.params as any).id, AssetUpdateRequest.parse(r.body)); if(!a) throw PillarError.notFound(); return presentAsset(a)});
}
