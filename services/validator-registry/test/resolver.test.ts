import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../src/db/models.js';
import { ProviderRepo } from '../src/db/ProviderRepo.js';
import { ValidatorRepo } from '../src/db/ValidatorRepo.js';
import { BindingRepo } from '../src/db/BindingRepo.js';
import { HealthRepo } from '../src/db/HealthRepo.js';
import { ResolverApi } from '../src/internal/ResolverApi.js';
import { ValidatorPolicy } from '../src/policy/ValidatorPolicy.js';

function fixture(){ const store=memoryStore(); const providers=new ProviderRepo(store); const validators=new ValidatorRepo(store); const bindings=new BindingRepo(store); const health=new HealthRepo(store); providers.create({id:'valp_01JY0000000000000000000000', slug:'p', display_name:'P', deployment_modes:['hosted'], status:'verified'}); providers.create({id:'valp_01JY0000000000000000000001', slug:'q', display_name:'Q', deployment_modes:['hosted'], status:'pending_verification'}); validators.create({id:'val_01JY0000000000000000000000', provider_id:'valp_01JY0000000000000000000000', network:'mainnet', display_name:'A', participant_endpoint_ref:'a', capacity_tier:'standard', regions:[], status:'active'}); validators.create({id:'val_01JY0000000000000000000001', provider_id:'valp_01JY0000000000000000000000', network:'mainnet', display_name:'B', participant_endpoint_ref:'b', capacity_tier:'standard', regions:[], status:'active'}); validators.create({id:'val_01JY0000000000000000000002', provider_id:'valp_01JY0000000000000000000001', network:'mainnet', display_name:'C', participant_endpoint_ref:'c', capacity_tier:'standard', regions:[], status:'active'}); bindings.upsert({id:'tnb_01JY0000000000000000000000', tenant_id:'ten_1', network:'mainnet', default_validator_id:'val_01JY0000000000000000000000', fallback_validator_id:'val_01JY0000000000000000000001', livemode:true, status:'active'}); return {providers, validators, bindings, health}; }

test('deterministic resolver returns active primary', () => { const f=fixture(); const r=new ResolverApi(f.bindings,f.validators,f.health).resolveValidatorForTenant({tenant_id:'ten_1', network:'mainnet'}); assert.equal(r.validator_id,'val_01JY0000000000000000000000'); assert.equal(r.fallback_used,false); });
test('pause invalidates routing', () => { const f=fixture(); f.bindings.setStatus('tnb_01JY0000000000000000000000','paused'); assert.throws(()=>new ResolverApi(f.bindings,f.validators,f.health).resolveValidatorForTenant({tenant_id:'ten_1', network:'mainnet'}), /network_binding_unavailable/); });
test('verified-only providers expose validators', () => { const f=fixture(); const exposed=new ValidatorPolicy().exposedValidators(f.providers.list(), f.validators.list()); assert.deepEqual(exposed.map(v=>v.id), ['val_01JY0000000000000000000000','val_01JY0000000000000000000001']); });
test('degraded primary flips to fallback', () => { const f=fixture(); f.validators.setStatus('val_01JY0000000000000000000000','degraded'); const r=new ResolverApi(f.bindings,f.validators,f.health).resolveValidatorForTenant({tenant_id:'ten_1', network:'mainnet'}); assert.equal(r.validator_id,'val_01JY0000000000000000000001'); assert.equal(r.fallback_used,true); });
