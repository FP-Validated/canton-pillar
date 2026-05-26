import pg from 'pg'; import type { OnboardingSession } from '../types.js';
export class SessionRepo { constructor(private pool: pg.Pool) {}
  async create(s: OnboardingSession) { await this.pool.query(`insert into onboarding_state (id,tenant_id,environment_id,status,current_step,step_state,evidence_file_ids,first_api_key_id,first_transfer_intent_id,completion_event_id,created_at,updated_at,completed_at,kyb_decision_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (id) do update set updated_at=excluded.updated_at`, [s.id,s.tenant_id,s.environment_id,s.status,s.current_step,s.step_state,s.evidence_file_ids,s.first_api_key_id,s.first_transfer_intent_id,s.completion_event_id,s.created_at,s.updated_at,s.completed_at,s.kyb_decision_id]); return s; }
  async get(id:string) { const r=await this.pool.query('select * from onboarding_state where id=$1',[id]); return r.rows[0] as OnboardingSession|undefined; }
  async save(s: OnboardingSession) { s.updated_at=new Date().toISOString(); await this.create(s); return s; }
}
export function makePool(connectionString=process.env.DATABASE_URL) { return new pg.Pool({ connectionString, max: 20, min: 2, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 2_000, statement_timeout: 10_000 }); }
