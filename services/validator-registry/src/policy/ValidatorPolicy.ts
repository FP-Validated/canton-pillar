import type { Binding, Provider, Validator } from '../db/models.js';
export class ValidatorPolicy {
  canActivate(provider:Provider){ return provider.status === 'verified'; }
  assertActivation(provider:Provider){ if(!this.canActivate(provider)) throw new Error('provider_not_verified'); }
  assertBinding(binding:Binding, validator:Validator, fallback?:Validator){ if(binding.livemode && validator.network !== 'mainnet') throw new Error('livemode_requires_mainnet'); if(fallback && fallback.network !== validator.network) throw new Error('fallback_network_mismatch'); if(validator.status === 'disabled') throw new Error('validator_disabled'); }
  exposedValidators(providers:Provider[], validators:Validator[]){ const verified = new Set(providers.filter(p=>p.status==='verified').map(p=>p.id)); return validators.filter(v=>verified.has(v.provider_id) && v.status !== 'disabled'); }
}
