import type { FastifyInstance, FastifyRequest } from 'fastify';
import { IssueIntentCreateRequest, RedeemIntentCreateRequest, TransferIntentCreateRequest } from '@pillar/api-contracts/schemas';
import { renderList } from '../../http/pagination.js';
import { intent, operation } from './data.js';
import { presentIssueIntent, presentRedeemIntent, presentTransferIntent } from '../../presenters/index.js';
import { enqueueIntent, type IntentKind } from '../../db/intent-enqueue.js';

function expand(req: FastifyRequest, value: any) {
  const raw = (req.query as any)?.expand;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (list.includes('operation')) value.operation = operation(req.auth.livemode, value.id, value.operation);
  if (list.includes('latest_event')) value.latest_event = null;
  return value;
}

async function createIntent(req: FastifyRequest, kind: Extract<IntentKind, 'issue'|'redeem'|'transfer'>, body: any) {
  const idem = req.headers['idempotency-key'];
  const enq = await enqueueIntent({ tenantId: req.accountId, livemode: req.auth.livemode, intentKind: kind, payload: body, idempotencyKey: Array.isArray(idem) ? idem[0] : idem ?? req.requestId, requestId: req.requestId, apiKeyId: req.auth.keyId });
  return expand(req, intent(kind, req.auth.livemode, { ...body, id: enq.intentId, operation: enq.operationId, latest_event: null, status: enq.status }));
}

export async function issueIntentsRoutes(s:FastifyInstance){ s.post('/issue_intents', async r=>presentIssueIntent(await createIntent(r,'issue',IssueIntentCreateRequest.parse(r.body)))); s.get('/issue_intents', async r=>renderList('/v1/issue_intents',[presentIssueIntent(intent('issue',r.auth.livemode))])); s.get('/issue_intents/:id', async r=>presentIssueIntent({...intent('issue',r.auth.livemode),id:(r.params as any).id})); s.post('/issue_intents/:id/confirm', async r=>presentIssueIntent({...intent('issue',r.auth.livemode),id:(r.params as any).id,status:'processing'})); s.post('/issue_intents/:id/cancel', async r=>presentIssueIntent({...intent('issue',r.auth.livemode),id:(r.params as any).id,status:'canceled'})); }
export async function redeemIntentsRoutes(s:FastifyInstance){ s.post('/redeem_intents', async r=>presentRedeemIntent(await createIntent(r,'redeem',RedeemIntentCreateRequest.parse(r.body)))); s.get('/redeem_intents', async r=>renderList('/v1/redeem_intents',[presentRedeemIntent(intent('redeem',r.auth.livemode))])); s.get('/redeem_intents/:id', async r=>presentRedeemIntent({...intent('redeem',r.auth.livemode),id:(r.params as any).id})); s.post('/redeem_intents/:id/confirm', async r=>presentRedeemIntent({...intent('redeem',r.auth.livemode),id:(r.params as any).id,status:'processing'})); s.post('/redeem_intents/:id/cancel', async r=>presentRedeemIntent({...intent('redeem',r.auth.livemode),id:(r.params as any).id,status:'canceled'})); }
export async function transferIntentsRoutes(s:FastifyInstance){ s.post('/transfer_intents', async r=>presentTransferIntent(await createIntent(r,'transfer',TransferIntentCreateRequest.parse(r.body)))); s.get('/transfer_intents', async r=>renderList('/v1/transfer_intents',[presentTransferIntent(intent('transfer',r.auth.livemode))])); s.get('/transfer_intents/:id', async r=>presentTransferIntent({...intent('transfer',r.auth.livemode),id:(r.params as any).id})); s.post('/transfer_intents/:id/confirm', async r=>presentTransferIntent({...intent('transfer',r.auth.livemode),id:(r.params as any).id,status:'processing'})); s.post('/transfer_intents/:id/cancel', async r=>presentTransferIntent({...intent('transfer',r.auth.livemode),id:(r.params as any).id,status:'canceled'})); }
