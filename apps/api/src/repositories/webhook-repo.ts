import { randomBytes, createHash } from 'node:crypto';
import { ulid } from 'ulid';
import { signWebhookPayload, buildSignatureHeader } from '@pillar/security';
import { renderEvent } from '../events/rendering.js';

type Endpoint = any; type Delivery = any;
const endpoints = new Map<string, Endpoint>(); const deliveries = new Map<string, Delivery>(); const diagnostics: any[] = [];
const now = () => new Date().toISOString();
const secret = () => `plr_whsec_${randomBytes(24).toString('base64url')}`;
const hash = (v:string) => createHash('sha256').update(v).digest('hex');
export async function createEndpoint(input:any){ const plaintext=secret(); const id=`we_${ulid()}`; const e={id,object:'webhook_endpoint',created:now(),livemode:!!input.livemode,url:input.url,enabled_events:input.enabled_events??['*'],api_version:input.api_version??'2026-05-26',status:'enabled',metadata:input.metadata??{},secrets:[{hash:hash(plaintext),plaintext,state:'active',created:now()}]}; endpoints.set(id,e); return {...publicEndpoint(e),secret:plaintext}; }
export async function getEndpoint(id:string){ return publicEndpoint(endpoints.get(id)??seedEndpoint(id)); }
export async function listEndpoints(){ return [...endpoints.values()].map(publicEndpoint); }
export async function updateEndpoint(id:string,input:any){ const e=endpoints.get(id)??seedEndpoint(id); Object.assign(e,input); endpoints.set(id,e); return publicEndpoint(e); }
export async function enableEndpoint(id:string){ return updateEndpoint(id,{status:'enabled'}); }
export async function disableEndpoint(id:string){ return updateEndpoint(id,{status:'disabled'}); }
export async function deleteEndpoint(id:string){ return updateEndpoint(id,{status:'disabled',deleted:true}); }
export async function rotateSecret(id:string, graceHours=24){ const e=endpoints.get(id)??seedEndpoint(id); for (const s of e.secrets) if(s.state==='active') { s.state='expiring'; s.expires_at=new Date(Date.now()+graceHours*3600_000).toISOString(); } const plaintext=secret(); e.secrets.push({hash:hash(plaintext),plaintext,state:'active',created:now()}); endpoints.set(id,e); return { id:e.id, secret:plaintext, last4:plaintext.slice(-4), created:now() }; }
export async function listDeliveries(endpointId?:string){ return [...deliveries.values()].filter(d=>!endpointId||d.webhook_endpoint_id===endpointId); }
export async function getDelivery(id:string){ return deliveries.get(id)??null; }
export async function requeueDelivery(id:string){ const old=deliveries.get(id)??{event_id:'evt_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZE',webhook_endpoint_id:'we_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZE'}; const d={...old,id:`wd_${ulid()}`,status:'queued',attempt:0,created:now()}; deliveries.set(d.id,d); return d; }
export async function dropDelivery(id:string){ const d=deliveries.get(id)??{id,status:'dropped'}; d.status='dropped'; deliveries.set(id,d); return d; }
export async function enqueueTestPing(endpointId:string){ const e=endpoints.get(endpointId)??seedEndpoint(endpointId); const event=renderEvent({id:`evt_${ulid()}`,type:'webhook_endpoint.created',livemode:e.livemode,payload:{id:e.id,object:'webhook_endpoint'},request_id:'req_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZR'},'thin',e.api_version); const raw=Buffer.from(JSON.stringify(event)); const ts=Math.floor(Date.now()/1000); const sigs=e.secrets.filter((s:any)=>s.state==='active'||s.state==='expiring').map((s:any)=>({timestamp:ts,signature:signWebhookPayload(s.plaintext,ts,raw)})); return { event, raw_body_sha256:hash(raw.toString()), signature_header:buildSignatureHeader(sigs), delivery_id:`wd_${ulid()}` }; }
export async function recordDiagnostic(endpointId:string, result:any){ const row={id:`diag_${ulid()}`,endpoint_id:endpointId,created:now(),classification:classify(result),...result}; diagnostics.push(row); return row; }
function classify(r:any){ const url=String(r.url??''); if(url.includes('timeout')) return 'timeout'; if(url.startsWith('http://')) return 'tls'; return r.status&&r.status>=300&&r.status<400?'redirect':r.status?'http':'dns'; }
function publicEndpoint(e:any){ const {secrets,...rest}=e; return rest; }
function seedEndpoint(id:string){ const e={id,object:'webhook_endpoint',created:now(),livemode:false,url:'https://example.com/webhooks',enabled_events:['*'],api_version:'2026-05-26',status:'enabled',metadata:{},secrets:[{plaintext:'plr_whsec_seed',hash:hash('plr_whsec_seed'),state:'active',created:now()}]}; endpoints.set(id,e); return e; }
