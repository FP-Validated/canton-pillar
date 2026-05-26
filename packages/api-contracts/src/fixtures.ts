export const ts = '2026-05-26T00:00:00.000Z';
export const ids = {
  acct1:'acct_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z', acct2:'acct_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7Z8', asst:'asst_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7Z9', bal:'bal_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZA', hld:'hld_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZB', iss:'issint_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZC', red:'redint_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZD', tr:'trint_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZE', hold:'hold_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZF', op:'op_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZG', evt:'evt_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZH', we:'we_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZJ', ak:'ak_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZK', req:'req_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZM'
};
const metadata = { reference: 'demo' };
export const account = { id:ids.acct1, object:'account', created:ts, livemode:false, display_name:'Treasury', status:'active', metadata };
export const asset = { id:ids.asst, object:'asset', created:ts, livemode:false, code:'USDTEST', name:'Test Dollar', scale:2, status:'active', transferable:true, redeemable:true, metadata };
export const balance = { id:ids.bal, object:'balance', created:ts, livemode:false, account:ids.acct1, asset:ids.asst, available:'100.00', pending:'0', reserved:'10.00', settled:'110.00', as_of_ledger_offset:'42', as_of_ledger_time:ts, metadata };
export const holding = { id:ids.hld, object:'holding', created:ts, livemode:false, account:ids.acct1, asset:ids.asst, amount:'100.00', status:'active', restrictions:[], source_intent:ids.iss, metadata };
export const operation = { id:ids.op, object:'operation', created:ts, livemode:false, intent:ids.tr, status:'projected', ledger:{ backend:'canton', update_reference:'opaque-update-ref', offset:'42' }, metadata }; // allowed: canton
export const event = { id:ids.evt, object:'event', created:ts, livemode:false, type:'transfer_intent.succeeded', api_version:'2026-05-26', data:{ object:{ id:ids.tr, object:'transfer_intent' } }, request:{ id:ids.req, idempotency_key:'idem-key' }, metadata };
export const transferIntent = { id:ids.tr, object:'transfer_intent', created:ts, livemode:false, status:'processing', amount:'25.00', asset:ids.asst, from_account:ids.acct1, to_account:ids.acct2, metadata, operation:ids.op, latest_event:ids.evt };
export const transferIntentSucceeded = { ...transferIntent, status:'succeeded' };
export const issueIntent = { id:ids.iss, object:'issue_intent', created:ts, livemode:false, status:'processing', amount:'100.00', asset:ids.asst, account:ids.acct1, metadata, operation:ids.op, latest_event:ids.evt };
export const redeemIntent = { id:ids.red, object:'redeem_intent', created:ts, livemode:false, status:'processing', amount:'10.00', asset:ids.asst, account:ids.acct1, source_holding:ids.hld, metadata, operation:ids.op, latest_event:ids.evt };
export const hold = { id:ids.hold, object:'hold', created:ts, livemode:false, status:'active', amount:'5.00', asset:ids.asst, account:ids.acct1, expires_at:'2026-05-27T00:00:00.000Z', purpose:'settlement', operation:ids.op, metadata };
export const webhookEndpoint = { id:ids.we, object:'webhook_endpoint', created:ts, livemode:false, url:'https://example.com/webhooks/pillar', enabled_events:['transfer_intent.succeeded'], api_version:'2026-05-26', status:'enabled', metadata };
export const rotateSecret = { id:ids.we, secret:'whsec_test_secret', last4:'cret', created:ts };
export const apiKey = { id:ids.ak, object:'api_key', created:ts, livemode:false, name:'Server key', prefix:'pk_test', last4:'7Z7K', scopes:['accounts:read'], status:'active', metadata };
export const apiKeyCreate = { ...apiKey, secret:'pk_test_secret_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZK' };
export const list = (url:string, item:unknown) => ({ object:'list', url, has_more:false, data:[item] });
