import pg from 'pg';
export class Emitter { constructor(private pool?: pg.Pool) {} async emit(type:string, session:any) { const id = session.completion_event_id ?? `evt_${Date.now()}`; if (this.pool) await this.pool.query('insert into event_log (id,type,payload,created_at) values ($1,$2,$3,now()) on conflict do nothing',[id,type,session]).catch(async()=>{}); return { id, type }; } }
