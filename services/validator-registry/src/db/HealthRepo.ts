import type { Health, Store } from './models.js';
export class HealthRepo { constructor(private store:Store) {} latest(validator_id:string){ return this.store.health.filter(h=>h.validator_id===validator_id).sort((a,b)=>b.sampled_at.localeCompare(a.sampled_at))[0]; } list(){ return this.store.health; } append(h:Health){ this.store.health.push(h); return h; } }
