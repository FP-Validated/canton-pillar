import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import * as F from '@pillar/api-contracts/fixtures';
import { HoldCreateRequest, HoldReleaseRequest } from '@pillar/api-contracts/schemas';
import { renderList } from '../../http/pagination.js';
import { event, hold, operation, now, nid } from './data.js';
import { presentApiKey, presentApiKeyCreate, presentEvent, presentHold, presentOperation, presentWebhookEndpoint, presentWebhookSecret } from '../../presenters/index.js';
import { getOperationProjection } from '../../repositories/projection-repo.js';
import * as Webhooks from '../../repositories/webhook-repo.js';
import * as Events from '../../repositories/event-repo.js';
import { enqueueIntent } from '../../db/intent-enqueue.js';

function idem(r:any){ const h=r.headers['idempotency-key']; return Array.isArray(h)?h[0]:h??r.requestId; }
function expandHold(r:any, value:any){ const raw=r.query?.expand; const list=Array.isArray(raw)?raw:raw?[raw]:[]; if(list.includes('operation')) value.operation=operation(r.auth.livemode,value.id,value.operation); if(list.includes('latest_event')) value.latest_event=null; return value; }
export async function holdsRoutes(s:FastifyInstance){
  s.post('/holds', async r=>{
    const b = HoldCreateRequest.parse(r.body);
    const enq = await enqueueIntent({
      tenantId: r.accountId,
      livemode: r.auth.livemode,
      intentKind: 'hold_create',
      payload: b,
      idempotencyKey: idem(r),
      requestId: r.requestId,
      apiKeyId: r.auth.keyId
    });
    return presentHold(expandHold(r, hold(r.auth.livemode, { ...b, id: enq.intentId, operation: enq.operationId, latest_event: null, status: 'active' })));
  });
  s.get('/holds', async r => renderList('/v1/holds', [presentHold(hold(r.auth.livemode))]));
  s.get('/holds/:id', async r => presentHold({ ...hold(r.auth.livemode), id: (r.params as any).id }));
  s.post('/holds/:id/release', async r => {
    const b: any = HoldReleaseRequest.parse(r.body);
    if (b.hold_id && b.hold_id !== (r.params as any).id) {
      throw s.httpErrors.badRequest('hold_id must match route id');
    }
    const holdId = (r.params as any).id as string;
    const payload = { ...b, hold_id: holdId, original_operation_id: (r.body as any)?.operation };
    const enq = await enqueueIntent({
      tenantId: r.accountId,
      livemode: r.auth.livemode,
      intentKind: 'hold_release',
      payload,
      idempotencyKey: idem(r),
      requestId: r.requestId,
      apiKeyId: r.auth.keyId
    });
    return presentHold(expandHold(r, hold(r.auth.livemode, { ...payload, id: holdId, operation: enq.operationId, status: 'released' })));
  });
  s.post('/holds/:id/cancel', async r=>presentHold({...hold(r.auth.livemode),id:(r.params as any).id,status:'released'}));
}
export async function operationsRoutes(s:FastifyInstance){ s.get('/operations', async r=>renderList('/v1/operations',[presentOperation({ id:'op_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZG', object:'operation', livemode:r.auth.livemode, created:now(), intent:'trint_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZE', status:'projected', metadata:{} })])); s.get('/operations/:id', async r=>{ const op=await getOperationProjection(r.accountId,(r.params as any).id); const ex=(r.query as any)?.['expand[]']??(r.query as any)?.expand; const list:any[]=Array.isArray(ex)?ex:ex?[ex]:[]; const expanded=list.includes('ledger_trace'); const value:any={ id:'op_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZG', object:'operation', livemode:r.auth.livemode, created:op.projected_at, intent:'trint_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZE', status:op.status, metadata:{} }; if(expanded && (r.auth.scopes.includes('*')||r.auth.scopes.includes('admin'))) value.ledger_trace={ update_id:op.update_id, ledger_offset:op.ledger_offset, participant_id:op.participant_id, synchronizer_id:op.synchronizer_id, ledger_record_time:op.ledger_record_time }; return presentOperation(value); }); }
export async function eventsRoutes(s:FastifyInstance){
  s.get('/events', async r=>renderList('/v1/events', await Events.listEvents({ types: (r.query as any)?.type ? String((r.query as any).type).split(',') : undefined, livemode:r.auth.livemode, mode:(r.query as any)?.payload_mode, apiVersion:r.apiVersion })));
  s.get('/events/:id', async r=>presentEvent(await Events.getEvent((r.params as any).id, ((r.query as any)?.payload_mode === 'snapshot' ? 'snapshot' : 'thin'), r.apiVersion)));
  s.post('/events/:id/resend', async r=>presentEvent(await Events.enqueueReplay((r.params as any).id,{ idempotencyKey: idem(r), apiVersion:r.apiVersion })));
  s.post('/events/:id/replay', async r=>presentEvent(await Events.enqueueReplay((r.params as any).id,{ idempotencyKey: idem(r), apiVersion:r.apiVersion, ...(r.body as any) })));
}
export async function webhookEndpointsRoutes(s:FastifyInstance){
  s.post('/webhook_endpoints', async r=>{ const created=await Webhooks.createEndpoint({ ...(r.body as any), livemode:r.auth.livemode, api_version:(r.body as any)?.api_version??r.apiVersion }); const {secret,...endpoint}=created; return { ...presentWebhookEndpoint(endpoint), secret }; });
  s.get('/webhook_endpoints', async r=>renderList('/v1/webhook_endpoints',(await Webhooks.listEndpoints()).map(presentWebhookEndpoint)));
  s.get('/webhook_endpoints/:id', async r=>presentWebhookEndpoint(await Webhooks.getEndpoint((r.params as any).id)));
  s.post('/webhook_endpoints/:id', async r=>presentWebhookEndpoint(await Webhooks.updateEndpoint((r.params as any).id,r.body)));
  s.delete('/webhook_endpoints/:id', async r=>presentWebhookEndpoint(await Webhooks.deleteEndpoint((r.params as any).id)));
  s.post('/webhook_endpoints/:id/enable', async r=>presentWebhookEndpoint(await Webhooks.enableEndpoint((r.params as any).id)));
  s.post('/webhook_endpoints/:id/disable', async r=>presentWebhookEndpoint(await Webhooks.disableEndpoint((r.params as any).id)));
  s.post('/webhook_endpoints/:id/rotate_secret', async r=>presentWebhookSecret(await Webhooks.rotateSecret((r.params as any).id, (r.body as any)?.grace_hours ?? 24)));
  s.post('/webhook_endpoints/:id/test', async r=>Webhooks.enqueueTestPing((r.params as any).id));
  s.post('/webhook_endpoints/:id/test_ping', async r=>Webhooks.enqueueTestPing((r.params as any).id));
  s.post('/webhook_endpoints/:id/diagnostics', async r=>Webhooks.recordDiagnostic((r.params as any).id,{ ...(r.body as any), url:(r.body as any)?.url }));
  s.get('/webhook_endpoints/:id/deliveries', async r=>renderList('/v1/webhook_endpoints/'+(r.params as any).id+'/deliveries', await Webhooks.listDeliveries((r.params as any).id)));
}
export async function webhookDlqRoutes(s:FastifyInstance){
  s.get('/webhook_dlq/:id', async r=>await Webhooks.getDelivery((r.params as any).id) ?? { id:(r.params as any).id, object:'webhook_delivery', status:'failed' });
  s.post('/webhook_dlq/:id/requeue', async r=>Webhooks.requeueDelivery((r.params as any).id));
  s.post('/webhook_dlq/:id/drop', async r=>Webhooks.dropDelivery((r.params as any).id));
  s.post('/webhook_dlq/:id/replay', async r=>Webhooks.requeueDelivery((r.params as any).id));
}
export async function apiKeysRoutes(s:FastifyInstance){ s.post('/api_keys', async r=>presentApiKeyCreate({...F.apiKeyCreate,id:nid('ak_'),secret:`plr_sk_test_${ulid()}`,created:now(),livemode:r.auth.livemode,...(r.body as any)})); s.get('/api_keys', async r=>renderList('/v1/api_keys',[presentApiKey({...F.apiKey,created:now(),livemode:r.auth.livemode})])); s.get('/api_keys/:id', async r=>presentApiKey({...F.apiKey,id:(r.params as any).id,created:now(),livemode:r.auth.livemode})); s.post('/api_keys/:id/rotate', async r=>presentApiKeyCreate({...F.apiKeyCreate,id:(r.params as any).id,secret:`plr_sk_test_${ulid()}`,created:now(),livemode:r.auth.livemode})); s.post('/api_keys/:id/revoke', async r=>presentApiKey({...F.apiKey,id:(r.params as any).id,status:'revoked'})); s.post('/api_keys/:id/expire', async r=>presentApiKey({...F.apiKey,id:(r.params as any).id,status:'expired'})); }
