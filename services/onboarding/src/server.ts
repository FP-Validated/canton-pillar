import { createServer } from 'node:http'; import { randomUUID } from 'node:crypto'; import { advanceSession, nextAction } from './engine.js'; import type { OnboardingSession } from './types.js';
const sessions = new Map<string, OnboardingSession>(); const json=(res:any,code:number,body:any)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(body));};
export function createOnboardingSession(tenant_id='tnt_demo', environment_id='env_test'): OnboardingSession { const ts=new Date().toISOString(); return { id:`onb_${randomUUID().replaceAll('-','')}`, tenant_id, environment_id, status:'in_progress', current_step:'organization', step_state:{}, evidence_file_ids:[], created_at:ts, updated_at:ts }; }
export const server = createServer(async (req,res)=>{ if(req.url==='/health') return json(res,200,{status:'ok'}); if(req.method==='POST' && req.url==='/sessions'){ const s=createOnboardingSession(); sessions.set(s.id,s); return json(res,200,{...s,next_action:nextAction(s)});} return json(res,404,{error:'not_found'}); });
if (process.env.NODE_ENV !== 'test') server.listen(Number(process.env.PORT ?? 8093));
export { advanceSession, nextAction };
