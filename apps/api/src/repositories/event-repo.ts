import { ulid } from 'ulid';
import { renderEvent } from '../events/rendering.js';
const events:any[]=[]; const replays=new Map<string,any>();
function seed(livemode=false){ if(!events.length) events.push({id:'evt_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZE',type:'transfer_intent.succeeded',livemode,created:new Date().toISOString(),payload:{id:'trint_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZE',object:'transfer_intent',status:'succeeded'},request_id:'req_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZR'}); }
export async function listEvents(filters:any={}){ seed(filters.livemode); return events.filter(e=>(!filters.types?.length||filters.types.includes(e.type))&&(!('livemode'in filters)||e.livemode===filters.livemode)).map(e=>renderEvent(e,filters.mode??'thin',filters.apiVersion)); }
export async function getEvent(id:string, mode:'thin'|'snapshot'='thin', apiVersion='2026-05-26'){ seed(false); return renderEvent(events.find(e=>e.id===id)??{...events[0],id},mode,apiVersion); }
export async function enqueueReplay(id:string, opts:any={}){ const key=`${id}:${opts.idempotencyKey??''}`; if(replays.has(key)) return replays.get(key); const event=await getEvent(id,'thin',opts.apiVersion); const replay={...event,replay:{id:`rpl_${ulid()}`,event_id:id,status:'queued',range:{from:opts.from,to:opts.to}}}; replays.set(key,replay); return replay; }
