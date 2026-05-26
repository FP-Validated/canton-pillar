import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import * as s from './schemas/index.js';

extendZodWithOpenApi(z);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const expectedPaths = [
'/v1/accounts','/v1/accounts/{id}','/v1/assets','/v1/assets/{id}','/v1/balances','/v1/balances/{id}','/v1/holdings','/v1/holdings/{id}',
'/v1/issue_intents','/v1/issue_intents/{id}','/v1/issue_intents/{id}/confirm','/v1/issue_intents/{id}/cancel','/v1/redeem_intents','/v1/redeem_intents/{id}','/v1/redeem_intents/{id}/confirm','/v1/redeem_intents/{id}/cancel','/v1/transfer_intents','/v1/transfer_intents/{id}','/v1/transfer_intents/{id}/confirm','/v1/transfer_intents/{id}/cancel','/v1/holds','/v1/holds/{id}','/v1/holds/{id}/release','/v1/holds/{id}/cancel','/v1/operations','/v1/operations/{id}','/v1/events','/v1/events/{id}','/v1/events/{id}/resend','/v1/events/replay','/v1/webhook_endpoints','/v1/webhook_endpoints/{id}','/v1/webhook_endpoints/{id}/enable','/v1/webhook_endpoints/{id}/disable','/v1/webhook_endpoints/{id}/rotate_secret','/v1/webhook_endpoints/{id}/test','/v1/webhook_endpoints/{id}/deliveries','/v1/api_keys','/v1/api_keys/{id}','/v1/api_keys/{id}/rotate','/v1/api_keys/{id}/revoke','/v1/api_keys/{id}/expire','/v1/openapi.json','/v1/health',
'/v1/files','/v1/evidence_files','/v1/export_jobs','/v1/report_templates','/v1/usage_events','/v1/invoices','/v1/onboarding','/v1/admin/template_registry/templates','/v1/admin/template_registry/templates/{id}/versions/{version}'
];
export const reservedPaths = expectedPaths.slice(-9);
const components = {
AccountSchema:s.AccountSchema, AccountCreateRequest:s.AccountCreateRequest, AccountUpdateRequest:s.AccountUpdateRequest, AccountListResponse:s.AccountListResponse,
AssetSchema:s.AssetSchema, AssetCreateRequest:s.AssetCreateRequest, AssetUpdateRequest:s.AssetUpdateRequest, AssetListResponse:s.AssetListResponse,
BalanceSchema:s.BalanceSchema, BalanceListResponse:s.BalanceListResponse, HoldingSchema:s.HoldingSchema, HoldingListResponse:s.HoldingListResponse,
IssueIntentSchema:s.IssueIntentSchema, IssueIntentCreateRequest:s.IssueIntentCreateRequest, IssueIntentListResponse:s.IssueIntentListResponse,
RedeemIntentSchema:s.RedeemIntentSchema, RedeemIntentCreateRequest:s.RedeemIntentCreateRequest, RedeemIntentListResponse:s.RedeemIntentListResponse,
TransferIntentSchema:s.TransferIntentSchema, TransferIntentCreateRequest:s.TransferIntentCreateRequest, TransferIntentListResponse:s.TransferIntentListResponse,
HoldSchema:s.HoldSchema, HoldCreateRequest:s.HoldCreateRequest, HoldReleaseRequest:s.HoldReleaseRequest, HoldListResponse:s.HoldListResponse,
OperationSchema:s.OperationSchema, OperationListResponse:s.OperationListResponse, EventSchema:s.EventSchema, EventListResponse:s.EventListResponse,
WebhookEndpointSchema:s.WebhookEndpointSchema, WebhookEndpointCreateRequest:s.WebhookEndpointCreateRequest, WebhookEndpointUpdateRequest:s.WebhookEndpointUpdateRequest, RotateSecretResponse:s.RotateSecretResponse, WebhookEndpointListResponse:s.WebhookEndpointListResponse,
ApiKeySchema:s.ApiKeySchema, ApiKeyCreateRequest:s.ApiKeyCreateRequest, ApiKeyCreateResponse:s.ApiKeyCreateResponse, ApiKeyListResponse:s.ApiKeyListResponse,
ErrorEnvelope:s.ErrorEnvelope, HealthEnvelope:s.HealthEnvelope
} as const;
export function sortKeys(v: unknown): unknown { if (Array.isArray(v)) return v.map(sortKeys); if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,val])=>[k,sortKeys(val)])); return v; }
const ref = (name: string) => ({ '$ref': `#/components/schemas/${name}` });
const errorRef = ref('ErrorEnvelope');
const errorResponses = Object.fromEntries(['400','401','403','404','409','422','429','500'].map(code => [code, { description: `Error ${code}`, content: { 'application/json': { schema: errorRef } } }]));
const ok = (schema: string) => ({ description: 'OK', content: { 'application/json': { schema: ref(schema) } } });
const emptyReq = { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } };
const request = (schema: string) => ({ content: { 'application/json': { schema: ref(schema) } }, required: true });
const idem = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 255 } };
const auth = { name: 'Authorization', in: 'header', required: true, schema: { type: 'string' } };
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
function op(method: string, path: string, tag: string, action: string, responseSchema: string, requestSchema?: string) {
  const mut = ['post','patch','delete'].includes(method);
  return { [method]: { operationId: `${tag.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())}${action}`, summary: `${action} ${tag}`, tags:[tag], parameters: [auth, ...(path.includes('{id}') ? [idParam] : []), ...(mut ? [idem] : [])], requestBody: requestSchema ? request(requestSchema) : (mut ? emptyReq : undefined), responses: { '200': ok(responseSchema), ...errorResponses } } };
}
export function buildOpenApi() {
  const registry = new OpenAPIRegistry();
  for (const [name, schema] of Object.entries(components)) registry.register(name, schema);
  const generator = new OpenApiGeneratorV3(registry.definitions);
  const doc: any = generator.generateDocument({ openapi:'3.0.3', info:{ title:'Pillar API', version:'1.0.0' } });
  doc.components.parameters = { AuthorizationHeader: auth, IdempotencyKeyHeader: idem };
  doc.components.responses = errorResponses;
  const add=(path:string, operations:any)=>{ doc.paths[path]={...(doc.paths[path]??{}),...operations}; };
  add('/v1/accounts', {...op('post','/v1/accounts','accounts','create','AccountSchema','AccountCreateRequest'),...op('get','/v1/accounts','accounts','list','AccountListResponse')}); add('/v1/accounts/{id}', {...op('get','/v1/accounts/{id}','accounts','retrieve','AccountSchema'),...op('post','/v1/accounts/{id}','accounts','update','AccountSchema','AccountUpdateRequest')});
  add('/v1/assets', {...op('post','/v1/assets','assets','create','AssetSchema','AssetCreateRequest'),...op('get','/v1/assets','assets','list','AssetListResponse')}); add('/v1/assets/{id}', {...op('get','/v1/assets/{id}','assets','retrieve','AssetSchema'),...op('post','/v1/assets/{id}','assets','update','AssetSchema','AssetUpdateRequest')});
  add('/v1/balances', op('get','/v1/balances','balances','list','BalanceListResponse')); add('/v1/balances/{id}', op('get','/v1/balances/{id}','balances','retrieve','BalanceSchema'));
  add('/v1/holdings', op('get','/v1/holdings','holdings','list','HoldingListResponse')); add('/v1/holdings/{id}', op('get','/v1/holdings/{id}','holdings','retrieve','HoldingSchema'));
  for (const [r, schema, req, list] of [['issue_intents','IssueIntentSchema','IssueIntentCreateRequest','IssueIntentListResponse'],['redeem_intents','RedeemIntentSchema','RedeemIntentCreateRequest','RedeemIntentListResponse'],['transfer_intents','TransferIntentSchema','TransferIntentCreateRequest','TransferIntentListResponse']] as const) { add(`/v1/${r}`, {...op('post',`/v1/${r}`,r,'create',schema,req),...op('get',`/v1/${r}`,r,'list',list)}); add(`/v1/${r}/{id}`, op('get',`/v1/${r}/{id}`,r,'retrieve',schema)); add(`/v1/${r}/{id}/confirm`, op('post',`/v1/${r}/{id}/confirm`,r,'confirm',schema)); add(`/v1/${r}/{id}/cancel`, op('post',`/v1/${r}/{id}/cancel`,r,'cancel',schema)); }
  add('/v1/holds', {...op('post','/v1/holds','holds','create','HoldSchema','HoldCreateRequest'),...op('get','/v1/holds','holds','list','HoldListResponse')}); add('/v1/holds/{id}', op('get','/v1/holds/{id}','holds','retrieve','HoldSchema')); add('/v1/holds/{id}/release', op('post','/v1/holds/{id}/release','holds','release','HoldSchema','HoldReleaseRequest')); add('/v1/holds/{id}/cancel', op('post','/v1/holds/{id}/cancel','holds','cancel','HoldSchema'));
  add('/v1/operations', op('get','/v1/operations','operations','list','OperationListResponse')); add('/v1/operations/{id}', op('get','/v1/operations/{id}','operations','retrieve','OperationSchema'));
  add('/v1/events', op('get','/v1/events','events','list','EventListResponse')); add('/v1/events/{id}', op('get','/v1/events/{id}','events','retrieve','EventSchema')); add('/v1/events/{id}/resend', op('post','/v1/events/{id}/resend','events','resend','EventSchema')); add('/v1/events/replay', op('post','/v1/events/replay','events','replay','EventListResponse'));
  add('/v1/webhook_endpoints', {...op('post','/v1/webhook_endpoints','webhook_endpoints','create','WebhookEndpointSchema','WebhookEndpointCreateRequest'),...op('get','/v1/webhook_endpoints','webhook_endpoints','list','WebhookEndpointListResponse')}); add('/v1/webhook_endpoints/{id}', {...op('get','/v1/webhook_endpoints/{id}','webhook_endpoints','retrieve','WebhookEndpointSchema'),...op('post','/v1/webhook_endpoints/{id}','webhook_endpoints','update','WebhookEndpointSchema','WebhookEndpointUpdateRequest'),...op('delete','/v1/webhook_endpoints/{id}','webhook_endpoints','delete','WebhookEndpointSchema')}); for (const a of ['enable','disable','test']) add(`/v1/webhook_endpoints/{id}/${a}`, op('post',`/v1/webhook_endpoints/{id}/${a}`,'webhook_endpoints',a,'WebhookEndpointSchema')); add('/v1/webhook_endpoints/{id}/rotate_secret', op('post','/v1/webhook_endpoints/{id}/rotate_secret','webhook_endpoints','rotateSecret','RotateSecretResponse')); add('/v1/webhook_endpoints/{id}/deliveries', op('get','/v1/webhook_endpoints/{id}/deliveries','webhook_endpoints','listDeliveries','EventListResponse'));
  add('/v1/api_keys', {...op('post','/v1/api_keys','api_keys','create','ApiKeyCreateResponse','ApiKeyCreateRequest'),...op('get','/v1/api_keys','api_keys','list','ApiKeyListResponse')}); add('/v1/api_keys/{id}', op('get','/v1/api_keys/{id}','api_keys','retrieve','ApiKeySchema')); for (const a of ['rotate','revoke','expire']) add(`/v1/api_keys/{id}/${a}`, op('post',`/v1/api_keys/{id}/${a}`,'api_keys',a,a==='rotate'?'ApiKeyCreateResponse':'ApiKeySchema'));
  add('/v1/openapi.json', { get: { operationId:'openapiRetrieve', summary:'Retrieve OpenAPI JSON', tags:['Meta'], responses:{'200':{description:'OK'}} }}); add('/v1/health', { get: { operationId:'healthRetrieve', summary:'Retrieve health', tags:['Meta'], responses:{'200':ok('HealthEnvelope')} }});
  for (const p of reservedPaths) add(p, { get: { operationId: `reserved${p.replace(/[^A-Za-z0-9]+/g,'_')}`, summary:'Reserved for a later phase', tags:['Reserved'], 'x-pillar-reserved': true, responses:{'501':{description:'Deferred', content:{'application/json':{schema:errorRef}}}} }});
  return sortKeys(doc);
}
export function writeCodegen() { const names = Object.keys(components).filter(n=>!['ErrorEnvelope','HealthEnvelope'].includes(n)); const used = new Map<string, number>(); const lines = [`import { z } from 'zod';`, `import { ${names.join(', ')} } from '../schemas/index.js';`, '', ...names.map(n=>{ const base=n.replace(/Schema$|Response$|Request$/,''); const count=used.get(base)??0; used.set(base,count+1); return `export type ${count ? `${base}${count + 1}` : base} = z.infer<typeof ${n}>;`; }), '']; const out=join(root,'src/codegen/schemas.gen.ts'); mkdirSync(dirname(out),{recursive:true}); writeFileSync(out, lines.join('\n')); }
export function writeOpenApi() { const doc = buildOpenApi(); const yamlPath=join(root,'openapi/pillar-v1.yaml'); const jsonPath=join(root,'dist/openapi/pillar-v1.json'); mkdirSync(dirname(yamlPath),{recursive:true}); mkdirSync(dirname(jsonPath),{recursive:true}); writeFileSync(yamlPath, YAML.stringify(doc)); writeFileSync(jsonPath, JSON.stringify(doc,null,2)+'\n'); writeCodegen(); return doc; }
writeOpenApi();
