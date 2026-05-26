import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { account, apiKey, apiKeyCreate, asset, balance, event, hold, holding, ids, issueIntent, list, operation, redeemIntent, rotateSecret, transferIntent, transferIntentSucceeded, webhookEndpoint } from '../src/fixtures.js';
const meta={reference:'demo'};
const examples: Record<string, unknown> = {
 'transfer-intent-create.request.json':{amount:'25.00',asset:ids.asst,from_account:ids.acct1,to_account:ids.acct2,confirm:true,metadata:meta}, 'transfer-intent-create.response.json':transferIntent, 'transfer-intent-succeeded.response.json':transferIntentSucceeded,
 'issue-intent-create.request.json':{amount:'100.00',asset:ids.asst,account:ids.acct1,confirm:true,metadata:meta}, 'issue-intent-create.response.json':issueIntent,
 'redeem-intent-create.request.json':{amount:'10.00',asset:ids.asst,account:ids.acct1,source_holding:ids.hld,confirm:true,metadata:meta}, 'redeem-intent-create.response.json':redeemIntent,
 'hold-create.request.json':{amount:'5.00',asset:ids.asst,account:ids.acct1,expires_at:'2026-05-27T00:00:00.000Z',purpose:'settlement',metadata:meta}, 'hold-create.response.json':hold, 'hold-release.request.json':{metadata:meta}, 'hold-release.response.json':{...hold,status:'released'},
 'account-create.request.json':{display_name:'Treasury',metadata:meta}, 'account.response.json':account, 'account-list.response.json':list('/v1/accounts', account),
 'asset-create.request.json':{code:'USDTEST',name:'Test Dollar',scale:2,transferable:true,redeemable:true,metadata:meta}, 'asset.response.json':asset, 'asset-list.response.json':list('/v1/assets', asset),
 'balance.response.json':balance, 'balance-list.response.json':list('/v1/balances', balance), 'holding.response.json':holding, 'holding-list.response.json':list('/v1/holdings', holding),
 'operation.response.json':operation, 'operation-list.response.json':list('/v1/operations', operation), 'event.response.json':event, 'event-list.response.json':list('/v1/events', event),
 'webhook-endpoint-create.request.json':{url:webhookEndpoint.url,enabled_events:webhookEndpoint.enabled_events,api_version:webhookEndpoint.api_version,description:'Primary endpoint',metadata:meta}, 'webhook-endpoint.response.json':webhookEndpoint, 'webhook-endpoint-rotate-secret.response.json':rotateSecret,
 'api-key-create.request.json':{name:apiKey.name,scopes:apiKey.scopes,metadata:meta}, 'api-key-create.response.json':apiKeyCreate, 'api-key.response.json':apiKey,
 'error-invalid-request.json':{error:{type:'invalid_request_error',code:'invalid_parameter',message:'Invalid parameter.',param:'amount',request_id:ids.req}},
 'error-idempotency-required.json':{error:{type:'invalid_request_error',code:'idempotency_key_required',message:'Idempotency key is required.',request_id:ids.req}},
 'error-rate-limit.json':{error:{type:'rate_limit_error',code:'rate_limit_exceeded',message:'Rate limit exceeded.',request_id:ids.req}},
 'error-version.json':{error:{type:'version_error',code:'api_version_unsupported',message:'API version is unsupported.',request_id:ids.req}},
 'error-ledger.json':{error:{type:'ledger_error',code:'ledger_command_rejected',message:'Ledger command rejected.',request_id:ids.req}},
 'list-envelope.example.json':list('/v1/accounts', account)
};
const out=join(process.cwd(),'examples'); mkdirSync(out,{recursive:true}); for (const [name,value] of Object.entries(examples)) writeFileSync(join(out,name), JSON.stringify(value,null,2)+'\n');
