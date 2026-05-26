import { BindingRepo } from '../db/BindingRepo.js';
import { HealthRepo } from '../db/HealthRepo.js';
import { ValidatorRepo } from '../db/ValidatorRepo.js';

export class ResolverApi {
  constructor(private bindings:BindingRepo, private validators:ValidatorRepo, private health:HealthRepo) {}
  resolveValidatorForTenant(input:{tenant_id:string; network:string; intent_type?:string}){
    const binding = this.bindings.active(input.tenant_id, input.network);
    if(!binding) throw Object.assign(new Error('network_binding_unavailable'), { code:'network_binding_unavailable' });
    const primary = this.validators.get(binding.default_validator_id);
    if(!primary) throw new Error('validator_not_found');
    const latest = this.health.latest(primary.id);
    const primaryDown = primary.status !== 'active' || latest?.health_status === 'unhealthy';
    const chosen = primaryDown && binding.fallback_validator_id ? this.validators.get(binding.fallback_validator_id) : primary;
    if(!chosen || chosen.status === 'disabled') throw Object.assign(new Error('network_binding_unavailable'), { code:'network_binding_unavailable' });
    return { tenant_id:input.tenant_id, network:input.network, validator_id:chosen.id, participant_endpoint_ref:chosen.participant_endpoint_ref, jwt_issuer:chosen.jwt_issuer ?? null, tls_profile:chosen.tls_profile ?? null, capacity_tier:chosen.capacity_tier, regions:chosen.regions, fallback_used:chosen.id !== primary.id };
  }
}
