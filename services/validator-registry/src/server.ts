import Fastify from 'fastify';
import { ulid } from 'ulid';
import { memoryStore } from './db/models.js';
import { ProviderRepo } from './db/ProviderRepo.js';
import { ValidatorRepo } from './db/ValidatorRepo.js';
import { BindingRepo } from './db/BindingRepo.js';
import { HealthRepo } from './db/HealthRepo.js';
import { AuditRepo } from './db/AuditRepo.js';
import { ResolverApi } from './internal/ResolverApi.js';
import { ValidatorPolicy } from './policy/ValidatorPolicy.js';

export function buildServer() {
  const app = Fastify(); const store = memoryStore(); const providers = new ProviderRepo(store); const validators = new ValidatorRepo(store); const bindings = new BindingRepo(store); const health = new HealthRepo(store); const audit = new AuditRepo(store); const resolver = new ResolverApi(bindings, validators, health); const policy = new ValidatorPolicy();
  app.get('/internal/validator-registry/health', async()=>({status:'ok'}));
  app.post('/internal/validator-registry/providers', async(req:any)=>providers.create({ id:`valp_${ulid()}`, status:'pending_verification', deployment_modes:['hosted'], ...req.body }));
  app.post('/internal/validator-registry/providers/:id/verify', async(req:any)=>{ const p=providers.setStatus(req.params.id,'verified'); audit.append({provider_id:p.id, action:'provider_verified'}); return p; });
  app.post('/internal/validator-registry/validators', async(req:any)=>validators.create({ id:`val_${ulid()}`, status:'disabled', capacity_tier:'standard', regions:[], ...req.body }));
  app.post('/internal/validator-registry/validators/:id/activate', async(req:any)=>{ const v=validators.get(req.params.id); if(!v) throw new Error('validator_not_found'); const p=providers.get(v.provider_id); if(!p) throw new Error('provider_not_found'); policy.assertActivation(p); validators.setStatus(v.id,'active'); audit.append({validator_id:v.id, action:'validator_activated'}); return v; });
  app.post('/internal/validator-registry/bindings', async(req:any)=>bindings.upsert({ id:req.body.id ?? `tnb_${ulid()}`, status:'active', ...req.body }));
  app.post('/internal/validator-registry/bindings/:id/pause', async(req:any)=>bindings.setStatus(req.params.id,'paused'));
  app.post('/internal/validator-registry/resolve', async(req:any)=>resolver.resolveValidatorForTenant(req.body));
  app.get('/internal/validator-registry/validators/exposed', async()=>policy.exposedValidators(providers.list(), validators.list()));
  return { app, store, repos:{providers, validators, bindings, health, audit}, resolver, policy };
}
if (import.meta.url === `file://${process.argv[1]}`) buildServer().app.listen({ port:Number(process.env.PORT ?? 8094), host:'0.0.0.0' });
