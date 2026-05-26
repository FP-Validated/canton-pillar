export type SchemaField = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type Param = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
};

export type Endpoint = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  description: string;
  headers: string[];
  pathParams?: Param[];
  queryParams?: Param[];
  bodyParams?: Param[];
  response: string;
  request: string;
  responseJson: string | object;
  errors: string[];
};

export type ResourceDoc = {
  slug: string;
  title: string;
  objectName: string;
  description: string;
  schema: SchemaField[];
  example: Record<string, unknown>;
  endpoints: Endpoint[];
};

export const baseUrl = 'https://api.pillar.example/v1';
export const maskedSecret = 'plr_sk_test_51HY...';
export const version = '2026-05-26';
export const requestId = 'req_01J0F8Q4Y6B7C8D9E0F1G2H3J4';

export const navSections = [
  {
    title: 'Getting started',
    items: [
      ['Overview', '/api'],
      ['Authentication', '/api/authentication'],
      ['Versioning', '/api/versioning'],
      ['Idempotency', '/api/idempotency'],
      ['Pagination', '/api/pagination'],
      ['Errors', '/api/errors'],
      ['Metadata', '/api/metadata'],
      ['Expand', '/api/expand'],
    ],
  },
  {
    title: 'Resources',
    items: [
      ['Accounts', '/api/accounts'],
      ['Assets', '/api/assets'],
      ['Balances', '/api/balances'],
      ['Holdings', '/api/holdings'],
      ['Issue intents', '/api/issue-intents'],
      ['Redeem intents', '/api/redeem-intents'],
      ['Transfer intents', '/api/transfer-intents'],
      ['Holds', '/api/holds'],
      ['Operations', '/api/operations'],
      ['Events', '/api/events'],
      ['Webhook endpoints', '/api/webhook-endpoints'],
      ['API keys', '/api/api-keys'],
    ],
  },
] as const;

const account = {
  id: 'acct_01J0F8P1A2B3C4D5E6F7G8H9J0',
  object: 'account',
  created: '2026-05-26T08:00:00.000Z',
  livemode: false,
  display_name: 'Sender Treasury',
  status: 'active',
  metadata: { customer_ref: 'cust_sender' },
};
const asset = {
  id: 'asst_01J0F8P2A2B3C4D5E6F7G8H9J1',
  object: 'asset',
  created: '2026-05-26T08:00:00.000Z',
  livemode: false,
  code: 'USDC',
  name: 'USD Coin',
  scale: 2,
  status: 'active',
  transferable: true,
  redeemable: true,
  metadata: {},
};
const balance = {
  id: 'bal_01J0F8P3A2B3C4D5E6F7G8H9J2',
  object: 'balance',
  created: '2026-05-26T08:10:00.000Z',
  livemode: false,
  account: account.id,
  asset: asset.id,
  available: '1000.00',
  pending: '50.00',
  reserved: '200.00',
  settled: '1200.00',
  as_of_ledger_offset: '000000000000123456',
  as_of_ledger_time: '2026-05-26T08:10:00.000Z',
  metadata: {},
};
const holding = {
  id: 'hldg_01J0F8P4A2B3C4D5E6F7G8H9J3',
  object: 'holding',
  created: '2026-05-26T08:10:00.000Z',
  livemode: false,
  account: account.id,
  asset: asset.id,
  amount: '500.00',
  status: 'active',
  restrictions: [],
  source_intent: 'issint_01J0F8P5A2B3C4D5E6F7G8H9J4',
  metadata: {},
};
const operation = {
  id: 'op_01J0F8P9A2B3C4D5E6F7G8H9J8',
  object: 'operation',
  created: '2026-05-26T08:10:00.000Z',
  livemode: false,
  intent: 'trint_01J0F8P7A2B3C4D5E6F7G8H9J6',
  status: 'ledger_committed',
  metadata: {},
};
const event = {
  id: 'evt_01J0F8Q0A2B3C4D5E6F7G8H9J9',
  object: 'event',
  created: '2026-05-26T08:10:02.000Z',
  livemode: false,
  type: 'transfer_intent.succeeded',
  api_version: version,
  data: { object: { id: 'trint_01J0F8P7A2B3C4D5E6F7G8H9J6', object: 'transfer_intent', status: 'succeeded' }, previous_attributes: { status: 'processing' } },
  request: { id: requestId, idempotency_key: '9f2d1c8e-7a9c-4e6a-9fb9-f1a5c9f88b31' },
  metadata: {},
};

function curl(method: string, path: string, body?: unknown, idempotent = false) {
  const headers = [`-H "Authorization: Bearer ${maskedSecret}"`, `-H "Pillar-Version: ${version}"`];
  if (idempotent) headers.push('-H "Idempotency-Key: 9f2d1c8e-7a9c-4e6a-9fb9-f1a5c9f88b31"');
  if (body) headers.push('-H "Content-Type: application/json"');
  const bodyText = body ? ` \\\n  -d '${JSON.stringify(body, null, 2)}'` : '';
  return `curl ${method === 'GET' ? '' : `-X ${method} `}${baseUrl}${path} \\\n  ${headers.join(' \\\n  ')}${bodyText}`;
}
function listEnvelope(url: string, item: object) { return { object: 'list', url, has_more: false, data: [item] }; }
function endpoint(method: Endpoint['method'], path: string, description: string, responseJson: string | object, opts: Partial<Endpoint> = {}): Endpoint {
  const idempotent = method !== 'GET' && method !== 'DELETE';
  return {
    method, path, description,
    headers: ['Authorization', 'Pillar-Version', ...(idempotent ? ['Idempotency-Key'] : [])],
    response: opts.response ?? (path.includes('list') ? 'A list envelope.' : 'The requested object.'),
    request: opts.request ?? curl(method, path.replace('{id}', String((responseJson as any).id ?? 'id')), opts.bodyParams ? Object.fromEntries(opts.bodyParams.filter(p => p.required).map(p => [p.name, sampleFor(p.name)])) : undefined, idempotent),
    responseJson,
    errors: opts.errors ?? ['invalid_parameter', 'not_found_error', ...(idempotent ? ['idempotency_key_required', 'idempotency_key_reused'] : [])],
    pathParams: opts.pathParams,
    queryParams: opts.queryParams,
    bodyParams: opts.bodyParams,
  };
}
function sampleFor(name: string) {
  const samples: Record<string, unknown> = { display_name: 'Sender Treasury', metadata: { order_id: 'ord_123' }, code: 'USDC', name: 'USD Coin', scale: 2, transferable: true, redeemable: true, amount: '100.00', asset: asset.id, account: account.id, from_account: account.id, to_account: 'acct_01J0F8P1B2B3C4D5E6F7G8H9J0', expires_at: '2026-05-27T08:10:00.000Z', purpose: 'transfer_reservation', url: 'https://example.com/pillar/webhooks', enabled_events: ['transfer_intent.succeeded'], name_key: 'CI test key', scopes: ['accounts:write'] };
  return samples[name] ?? 'value';
}
const commonListParams: Param[] = [
  { name: 'limit', type: 'integer', description: 'Maximum number of objects, 1 to 100.' },
  { name: 'starting_after', type: 'string', description: 'Exclusive cursor ID.' },
  { name: 'ending_before', type: 'string', description: 'Exclusive cursor ID.' },
];
const idParam = (prefix: string): Param[] => [{ name: 'id', type: 'string', required: true, description: `${prefix} ID.` }];
const metadataField = { name: 'metadata', type: 'object', required: true, description: 'String key/value metadata.' };
const baseFields = (id: string, object: string): SchemaField[] => [
  { name: 'id', type: 'string', required: true, description: `${id} identifier.` },
  { name: 'object', type: 'string', required: true, description: `Always ${object}.` },
  { name: 'created', type: 'timestamp', required: true, description: 'RFC3339 UTC creation time.' },
  { name: 'livemode', type: 'boolean', required: true, description: 'True for live mode objects.' },
];
const intentFields = (prefix: string, object: string, extra: SchemaField[]): SchemaField[] => [...baseFields(prefix, object), { name: 'status', type: 'enum', required: true, description: 'requires_action, processing, succeeded, failed, canceled, expired.' }, { name: 'amount', type: 'string', required: true, description: 'Decimal string.' }, { name: 'asset', type: 'string', required: true, description: 'asst_ ID.' }, ...extra, metadataField, { name: 'operation', type: 'string', required: true, description: 'op_ ID.' }, { name: 'latest_event', type: 'string/null', required: true, description: 'evt_ ID when emitted.' }];

const issue = { id: 'issint_01J0F8P5A2B3C4D5E6F7G8H9J4', object: 'issue_intent', created: '2026-05-26T08:10:00.000Z', livemode: false, status: 'processing', amount: '100.00', asset: asset.id, account: account.id, metadata: {}, operation: 'op_01J0F8P5Z2B3C4D5E6F7G8H9J4', latest_event: null };
const redeem = { id: 'redint_01J0F8P6A2B3C4D5E6F7G8H9J5', object: 'redeem_intent', created: '2026-05-26T08:10:00.000Z', livemode: false, status: 'processing', amount: '75.00', asset: asset.id, account: account.id, metadata: {}, operation: 'op_01J0F8P6Z2B3C4D5E6F7G8H9J5', latest_event: null };
const transfer = { id: 'trint_01J0F8P7A2B3C4D5E6F7G8H9J6', object: 'transfer_intent', created: '2026-05-26T08:10:00.000Z', livemode: false, status: 'processing', amount: '100.00', asset: asset.id, from_account: account.id, to_account: 'acct_01J0F8P1B2B3C4D5E6F7G8H9J0', metadata: { order_id: 'ord_123' }, operation: operation.id, latest_event: event.id };
const hold = { id: 'hold_01J0F8P8A2B3C4D5E6F7G8H9J7', object: 'hold', created: '2026-05-26T08:10:00.000Z', livemode: false, status: 'active', amount: '25.00', asset: asset.id, account: account.id, expires_at: '2026-05-27T08:10:00.000Z', purpose: 'transfer_reservation', operation: 'op_01J0F8P8Z2B3C4D5E6F7G8H9J7', metadata: {} };
const webhook = { id: 'we_01J0F8Q1A2B3C4D5E6F7G8H9JA', object: 'webhook_endpoint', created: '2026-05-26T08:00:00.000Z', livemode: false, url: 'https://example.com/pillar/webhooks', enabled_events: ['transfer_intent.succeeded'], api_version: version, status: 'enabled', metadata: {} };
const apiKey = { id: 'ak_01J0F8Q2A2B3C4D5E6F7G8H9JB', object: 'api_key', created: '2026-05-26T08:00:00.000Z', livemode: false, name: 'CI test key', prefix: 'plr_sk_test_', last4: '8b31', scopes: ['accounts:write', 'assets:write', 'intents:create'], status: 'active', metadata: {} };

export const resources: ResourceDoc[] = [
  { slug:'accounts', title:'Accounts', objectName:'account', description:'An account groups balances, holdings, and intent activity for one business entity.', schema:[...baseFields('acct_','account'),{name:'display_name',type:'string',required:true,description:'Human-readable account label.'},{name:'status',type:'enum',required:true,description:'active, restricted, suspended, closed.'},metadataField], example:account, endpoints:[endpoint('POST','/accounts','Create an account.',account,{bodyParams:[{name:'display_name',type:'string',required:true,description:'Account label.'},{name:'metadata',type:'object',description:'String key/value metadata.'}]}),endpoint('GET','/accounts','List accounts.',listEnvelope('/v1/accounts',account),{queryParams:commonListParams,response:'A list of account objects.'}),endpoint('GET','/accounts/{id}','Retrieve an account.',account,{pathParams:idParam('acct_')}),endpoint('POST','/accounts/{id}','Update account display name, status, or metadata.',{...account,display_name:'Sender Treasury Updated'},{pathParams:idParam('acct_'),bodyParams:[{name:'display_name',type:'string',description:'New label.'},{name:'status',type:'enum',description:'restricted, suspended, closed, or active.'},{name:'metadata',type:'object',description:'String key/value metadata.'}]})]},
  { slug:'assets', title:'Assets', objectName:'asset', description:'An asset defines a transferable or redeemable unit with fixed decimal scale.', schema:[...baseFields('asst_','asset'),{name:'code',type:'string',required:true,description:'Short asset code.'},{name:'name',type:'string',required:true,description:'Display name.'},{name:'scale',type:'integer',required:true,description:'Decimal scale.'},{name:'status',type:'enum',required:true,description:'draft, active, paused, retired.'},{name:'transferable',type:'boolean',required:true,description:'Whether transfers are allowed.'},{name:'redeemable',type:'boolean',required:true,description:'Whether redemptions are allowed.'},metadataField], example:asset, endpoints:[endpoint('POST','/assets','Create an asset.',asset,{bodyParams:[{name:'code',type:'string',required:true,description:'Asset code.'},{name:'name',type:'string',required:true,description:'Display name.'},{name:'scale',type:'integer',required:true,description:'Decimal scale.'},{name:'transferable',type:'boolean',description:'Allow transfers.'},{name:'redeemable',type:'boolean',description:'Allow redemptions.'},{name:'metadata',type:'object',description:'String key/value metadata.'}]}),endpoint('GET','/assets','List assets.',listEnvelope('/v1/assets',asset),{queryParams:commonListParams}),endpoint('GET','/assets/{id}','Retrieve an asset.',asset,{pathParams:idParam('asst_')}),endpoint('POST','/assets/{id}','Update mutable asset configuration.',{...asset,status:'paused'},{pathParams:idParam('asst_'),bodyParams:[{name:'name',type:'string',description:'Display name.'},{name:'status',type:'enum',description:'draft, active, paused, retired.'},{name:'transferable',type:'boolean',description:'Allow transfers.'},{name:'redeemable',type:'boolean',description:'Allow redemptions.'},{name:'metadata',type:'object',description:'String key/value metadata.'}]})]},
  { slug:'balances', title:'Balances', objectName:'balance', description:'A balance summarizes available, pending, reserved, and settled quantities for an account and asset.', schema:[...baseFields('bal_','balance'),{name:'account',type:'string',required:true,description:'acct_ ID.'},{name:'asset',type:'string',required:true,description:'asst_ ID.'},{name:'available',type:'string',required:true,description:'Decimal string.'},{name:'pending',type:'string',required:true,description:'Decimal string.'},{name:'reserved',type:'string',required:true,description:'Decimal string.'},{name:'settled',type:'string',required:true,description:'Decimal string.'},{name:'as_of_ledger_offset',type:'string',required:true,description:'Stable projection offset.'},{name:'as_of_ledger_time',type:'timestamp',required:true,description:'Projection time.'},metadataField], example:balance, endpoints:[endpoint('GET','/balances','List balances.',listEnvelope('/v1/balances',balance),{queryParams:[...commonListParams,{name:'account',type:'string',description:'Filter by acct_ ID.'},{name:'asset',type:'string',description:'Filter by asst_ ID.'},{name:'consistency',type:'string',description:'Reserved query parameter for future read consistency controls.'}]}),endpoint('GET','/balances/{id}','Retrieve a balance.',balance,{pathParams:idParam('bal_')})]},
  { slug:'holdings', title:'Holdings', objectName:'holding', description:'A holding represents a specific active quantity owned by an account.', schema:[...baseFields('hldg_','holding'),{name:'account',type:'string',required:true,description:'acct_ ID.'},{name:'asset',type:'string',required:true,description:'asst_ ID.'},{name:'amount',type:'string',required:true,description:'Decimal string.'},{name:'status',type:'enum',required:true,description:'active, partially_reserved, reserved, frozen, redeeming, closed.'},{name:'restrictions',type:'array',required:true,description:'Public restriction labels.'},{name:'source_intent',type:'string',required:true,description:'issint_ ID.'},metadataField], example:holding, endpoints:[endpoint('GET','/holdings','List holdings.',listEnvelope('/v1/holdings',holding),{queryParams:[...commonListParams,{name:'account',type:'string',description:'Filter by acct_ ID.'},{name:'asset',type:'string',description:'Filter by asst_ ID.'},{name:'expand[]',type:'array',description:'Allowed expansions such as account or asset.'}],errors:['unsupported_expand','invalid_parameter']}),endpoint('GET','/holdings/{id}','Retrieve a holding.',holding,{pathParams:idParam('hldg_'),queryParams:[{name:'expand[]',type:'array',description:'Allowed expansions such as account or asset.'}],errors:['unsupported_expand','not_found_error']})]},
  { slug:'issue-intents', title:'Issue intents', objectName:'issue_intent', description:'An issue intent requests creation of asset quantity for an account.', schema:intentFields('issint_','issue_intent',[{name:'account',type:'string',required:true,description:'acct_ ID receiving quantity.'}]), example:issue, endpoints:[endpoint('POST','/issue_intents','Create an issue intent.',issue,{bodyParams:[{name:'amount',type:'string',required:true,description:'Decimal string.'},{name:'asset',type:'string',required:true,description:'asst_ ID.'},{name:'account',type:'string',required:true,description:'acct_ ID.'},{name:'metadata',type:'object',description:'String key/value metadata.'}]}),endpoint('GET','/issue_intents/{id}','Retrieve an issue intent.',issue,{pathParams:idParam('issint_')}),endpoint('POST','/issue_intents/{id}/confirm','Confirm an issue intent.',{...issue,status:'processing'},{pathParams:idParam('issint_')}),endpoint('POST','/issue_intents/{id}/cancel','Cancel an issue intent.',{...issue,status:'canceled'},{pathParams:idParam('issint_'),errors:['intent_already_final','idempotency_key_required']})]},
  { slug:'redeem-intents', title:'Redeem intents', objectName:'redeem_intent', description:'A redeem intent requests removal of asset quantity from an account.', schema:intentFields('redint_','redeem_intent',[{name:'account',type:'string',required:true,description:'acct_ ID redeemed from.'}]), example:redeem, endpoints:[endpoint('POST','/redeem_intents','Create a redeem intent.',redeem,{bodyParams:[{name:'amount',type:'string',required:true,description:'Decimal string.'},{name:'asset',type:'string',required:true,description:'asst_ ID.'},{name:'account',type:'string',required:true,description:'acct_ ID.'},{name:'metadata',type:'object',description:'String key/value metadata.'}],errors:['insufficient_holding','idempotency_key_required']}),endpoint('GET','/redeem_intents/{id}','Retrieve a redeem intent.',redeem,{pathParams:idParam('redint_')}),endpoint('POST','/redeem_intents/{id}/confirm','Confirm a redeem intent.',{...redeem,status:'processing'},{pathParams:idParam('redint_')}),endpoint('POST','/redeem_intents/{id}/cancel','Cancel a redeem intent.',{...redeem,status:'canceled'},{pathParams:idParam('redint_'),errors:['intent_already_final','idempotency_key_required']})]},
  { slug:'transfer-intents', title:'Transfer intents', objectName:'transfer_intent', description:'A transfer intent moves asset quantity from one account to another.', schema:intentFields('trint_','transfer_intent',[{name:'from_account',type:'string',required:true,description:'Source acct_ ID.'},{name:'to_account',type:'string',required:true,description:'Destination acct_ ID.'}]), example:transfer, endpoints:[endpoint('POST','/transfer_intents','Create a transfer intent.',transfer,{bodyParams:[{name:'amount',type:'string',required:true,description:'Decimal string.'},{name:'asset',type:'string',required:true,description:'asst_ ID.'},{name:'from_account',type:'string',required:true,description:'Source acct_ ID.'},{name:'to_account',type:'string',required:true,description:'Destination acct_ ID.'},{name:'metadata',type:'object',description:'String key/value metadata.'}],errors:['insufficient_holding','asset_not_transferable','idempotency_key_required']}),endpoint('GET','/transfer_intents/{id}','Retrieve a transfer intent.',transfer,{pathParams:idParam('trint_')}),endpoint('GET','/transfer_intents','List transfer intents.',listEnvelope('/v1/transfer_intents',transfer),{queryParams:commonListParams}),endpoint('POST','/transfer_intents/{id}/confirm','Confirm a transfer intent.',{...transfer,status:'processing'},{pathParams:idParam('trint_')}),endpoint('POST','/transfer_intents/{id}/cancel','Cancel a transfer intent.',{...transfer,status:'canceled'},{pathParams:idParam('trint_'),errors:['intent_already_final','idempotency_key_required']})]},
  { slug:'holds', title:'Holds', objectName:'hold', description:'A hold reserves asset quantity on an account until released, canceled, or expired.', schema:[...baseFields('hold_','hold'),{name:'status',type:'enum',required:true,description:'requires_action, active, released, expired, failed.'},{name:'amount',type:'string',required:true,description:'Decimal string.'},{name:'asset',type:'string',required:true,description:'asst_ ID.'},{name:'account',type:'string',required:true,description:'acct_ ID.'},{name:'expires_at',type:'timestamp',required:true,description:'Expiration time.'},{name:'purpose',type:'string',required:true,description:'Reservation purpose.'},{name:'operation',type:'string',required:true,description:'op_ ID.'},metadataField], example:hold, endpoints:[endpoint('POST','/holds','Create a hold.',hold,{bodyParams:[{name:'amount',type:'string',required:true,description:'Decimal string.'},{name:'asset',type:'string',required:true,description:'asst_ ID.'},{name:'account',type:'string',required:true,description:'acct_ ID.'},{name:'expires_at',type:'timestamp',required:true,description:'Expiration time.'},{name:'purpose',type:'string',required:true,description:'Reservation purpose.'},{name:'metadata',type:'object',description:'String key/value metadata.'}],errors:['insufficient_holding','idempotency_key_required']}),endpoint('GET','/holds/{id}','Retrieve a hold.',hold,{pathParams:idParam('hold_')}),endpoint('GET','/holds','List holds.',listEnvelope('/v1/holds',hold),{queryParams:commonListParams}),endpoint('POST','/holds/{id}/release','Release a hold.',{...hold,status:'released'},{pathParams:idParam('hold_')}),endpoint('POST','/holds/{id}/cancel','Cancel a hold.',{...hold,status:'released'},{pathParams:idParam('hold_')})]},
  { slug:'operations', title:'Operations', objectName:'operation', description:'An operation tracks asynchronous command progress for a mutation.', schema:[...baseFields('op_','operation'),{name:'intent',type:'string',required:true,description:'Related intent ID.'},{name:'status',type:'enum',required:true,description:'received, queued, submitted, in_flight, ledger_committed, projected, failed, unknown, reconciled.'},metadataField], example:operation, endpoints:[endpoint('GET','/operations/{id}','Retrieve an operation. Admin-only expand[]=ledger_trace is gated by default.',operation,{pathParams:idParam('op_'),queryParams:[{name:'expand[]',type:'array',description:'Admin-only ledger_trace expansion.'}],errors:['unsupported_expand','permission_error']}),endpoint('GET','/operations','List operations.',listEnvelope('/v1/operations',operation),{queryParams:commonListParams})]},
  { slug:'events', title:'Events', objectName:'event', description:'An event records a state transition and can be delivered to webhooks.', schema:[...baseFields('evt_','event'),{name:'type',type:'string',required:true,description:'Event type.'},{name:'api_version',type:'string',required:true,description:'Payload API version.'},{name:'data',type:'object',required:true,description:'Event payload.'},{name:'request',type:'object',required:true,description:'Request correlation.'},metadataField], example:event, endpoints:[endpoint('GET','/events/{id}','Retrieve an event.',event,{pathParams:idParam('evt_')}),endpoint('GET','/events','List events.',listEnvelope('/v1/events',event),{queryParams:[...commonListParams,{name:'type',type:'string',description:'Filter by event type.'}]}),endpoint('POST','/events/{id}/resend','Resend an event to configured endpoints.',event,{pathParams:idParam('evt_')}),endpoint('POST','/events/{id}/replay','Idempotently replay event processing.',event,{pathParams:idParam('evt_')})]},
  { slug:'webhook-endpoints', title:'Webhook endpoints', objectName:'webhook_endpoint', description:'A webhook endpoint configures event delivery to an HTTPS URL.', schema:[...baseFields('we_','webhook_endpoint'),{name:'url',type:'string',required:true,description:'HTTPS delivery URL.'},{name:'enabled_events',type:'array',required:true,description:'Subscribed event types.'},{name:'api_version',type:'string',required:true,description:'Pinned payload version.'},{name:'status',type:'enum',required:true,description:'enabled or disabled.'},metadataField], example:webhook, endpoints:[endpoint('POST','/webhook_endpoints','Create a webhook endpoint.',webhook,{bodyParams:[{name:'url',type:'string',required:true,description:'HTTPS URL.'},{name:'enabled_events',type:'array',required:true,description:'Event type allowlist.'},{name:'metadata',type:'object',description:'String key/value metadata.'}]}),endpoint('GET','/webhook_endpoints/{id}','Retrieve a webhook endpoint.',webhook,{pathParams:idParam('we_')}),endpoint('GET','/webhook_endpoints','List webhook endpoints.',listEnvelope('/v1/webhook_endpoints',webhook),{queryParams:commonListParams}),endpoint('POST','/webhook_endpoints/{id}/update','Update URL, enabled events, or metadata.',webhook,{pathParams:idParam('we_'),bodyParams:[{name:'url',type:'string',description:'HTTPS URL.'},{name:'enabled_events',type:'array',description:'Event type allowlist.'},{name:'metadata',type:'object',description:'String key/value metadata.'}]}),endpoint('POST','/webhook_endpoints/{id}/enable','Enable deliveries.',{...webhook,status:'enabled'},{pathParams:idParam('we_')}),endpoint('POST','/webhook_endpoints/{id}/disable','Disable deliveries.',{...webhook,status:'disabled'},{pathParams:idParam('we_')}),endpoint('POST','/webhook_endpoints/{id}/rotate_secret','Rotate signing secret.',webhook,{pathParams:idParam('we_')}),endpoint('POST','/webhook_endpoints/{id}/test','Send a test delivery.',{ id:'we_del_01J0F8Q3A2B3C4D5E6F7G8H9JC', object:'webhook_delivery', status:'pending', webhook_endpoint:webhook.id, created:'2026-05-26T08:12:00.000Z' },{pathParams:idParam('we_')}),endpoint('GET','/webhook_endpoints/{id}/deliveries','List endpoint deliveries.',listEnvelope('/v1/webhook_endpoints/'+webhook.id+'/deliveries',{ id:'we_del_01J0F8Q3A2B3C4D5E6F7G8H9JC', object:'webhook_delivery', status:'delivered' }),{pathParams:idParam('we_'),queryParams:commonListParams}),endpoint('DELETE','/webhook_endpoints/{id}','Delete a webhook endpoint.',{ id:webhook.id, object:'webhook_endpoint', deleted:true },{pathParams:idParam('we_'),headers:['Authorization','Pillar-Version']})]},
  { slug:'api-keys', title:'API keys', objectName:'api_key', description:'An API key descriptor shows safe metadata for a credential without exposing the secret value.', schema:[...baseFields('ak_','api_key'),{name:'name',type:'string',required:true,description:'Key label.'},{name:'prefix',type:'string',required:true,description:'Credential family prefix.'},{name:'last4',type:'string',required:true,description:'Last four visible characters.'},{name:'scopes',type:'array',required:true,description:'Allowed scopes.'},{name:'status',type:'enum',required:true,description:'active, expired, revoked.'},metadataField], example:apiKey, endpoints:[endpoint('POST','/api_keys','Create an API key descriptor and return the one-time secret.',{...apiKey,secret:maskedSecret},{bodyParams:[{name:'name',type:'string',required:true,description:'Key label.'},{name:'scopes',type:'array',required:true,description:'Allowed scopes.'},{name:'metadata',type:'object',description:'String key/value metadata.'}]}),endpoint('GET','/api_keys/{id}','Retrieve an API key descriptor.',apiKey,{pathParams:idParam('ak_')}),endpoint('GET','/api_keys','List API key descriptors.',listEnvelope('/v1/api_keys',apiKey),{queryParams:commonListParams}),endpoint('POST','/api_keys/{id}/rotate','Rotate an API key and return the one-time new secret.',{...apiKey,secret:maskedSecret},{pathParams:idParam('ak_')}),endpoint('POST','/api_keys/{id}/revoke','Revoke an API key.',{...apiKey,status:'revoked'},{pathParams:idParam('ak_')}),endpoint('POST','/api_keys/{id}/expire','Expire an API key.',{...apiKey,status:'expired'},{pathParams:idParam('ak_')})]},
];

export function getResource(slug: string) { return resources.find((resource) => resource.slug === slug); }
