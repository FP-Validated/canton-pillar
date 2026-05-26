import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { buildOpenApi, sortKeys } from '../src/build-openapi.js';
import * as schemas from '../src/schemas/index.js';

const update = process.argv.includes('--update');
export function stable(value: unknown) { return JSON.stringify(sortKeys(value), null, 2) + '\n'; }
function readJson(path: string) { return JSON.parse(readFileSync(path, 'utf8')); }
const map: Record<string, any> = {
 'transfer-intent-create.request.json': schemas.TransferIntentCreateRequest, 'transfer-intent-create.response.json': schemas.TransferIntentSchema, 'transfer-intent-succeeded.response.json': schemas.TransferIntentSchema,
 'issue-intent-create.request.json': schemas.IssueIntentCreateRequest, 'issue-intent-create.response.json': schemas.IssueIntentSchema,
 'redeem-intent-create.request.json': schemas.RedeemIntentCreateRequest, 'redeem-intent-create.response.json': schemas.RedeemIntentSchema,
 'hold-create.request.json': schemas.HoldCreateRequest, 'hold-create.response.json': schemas.HoldSchema, 'hold-release.request.json': schemas.HoldReleaseRequest, 'hold-release.response.json': schemas.HoldSchema,
 'account-create.request.json': schemas.AccountCreateRequest, 'account.response.json': schemas.AccountSchema, 'account-list.response.json': schemas.AccountListResponse,
 'asset-create.request.json': schemas.AssetCreateRequest, 'asset.response.json': schemas.AssetSchema, 'asset-list.response.json': schemas.AssetListResponse,
 'balance.response.json': schemas.BalanceSchema, 'balance-list.response.json': schemas.BalanceListResponse, 'holding.response.json': schemas.HoldingSchema, 'holding-list.response.json': schemas.HoldingListResponse,
 'operation.response.json': schemas.OperationSchema, 'operation-list.response.json': schemas.OperationListResponse, 'event.response.json': schemas.EventSchema, 'event-list.response.json': schemas.EventListResponse,
 'webhook-endpoint-create.request.json': schemas.WebhookEndpointCreateRequest, 'webhook-endpoint.response.json': schemas.WebhookEndpointSchema, 'webhook-endpoint-rotate-secret.response.json': schemas.RotateSecretResponse,
 'api-key-create.request.json': schemas.ApiKeyCreateRequest, 'api-key-create.response.json': schemas.ApiKeyCreateResponse, 'api-key.response.json': schemas.ApiKeySchema,
 'error-invalid-request.json': schemas.ErrorEnvelope, 'error-idempotency-required.json': schemas.ErrorEnvelope, 'error-rate-limit.json': schemas.ErrorEnvelope, 'error-version.json': schemas.ErrorEnvelope, 'error-ledger.json': schemas.ErrorEnvelope,
 'list-envelope.example.json': schemas.AccountListResponse
};
for (const [file, schema] of Object.entries(map)) schema.parse(readJson(join(process.cwd(), 'examples', file)));
const goldenMap: Record<string, unknown> = Object.fromEntries(['transfer-intent-create.response.json','issue-intent-create.response.json','redeem-intent-create.response.json','hold-create.response.json','account-list.response.json','asset-list.response.json','balance.response.json','holding.response.json','operation.response.json','event.response.json','webhook-endpoint.response.json','api-key-create.response.json'].map(f => [f, readJson(join(process.cwd(),'examples',f))]));
goldenMap['pillar-v1.openapi.json'] = buildOpenApi();
mkdirSync(join(process.cwd(),'golden'), { recursive: true });
const mismatches: string[] = [];
for (const [file, value] of Object.entries(goldenMap)) {
  const path = join(process.cwd(), 'golden', file);
  const next = stable(value);
  if (update || !existsSync(path)) writeFileSync(path, next);
  else { const current = readFileSync(path, 'utf8'); if (current !== next) mismatches.push(`${basename(path)} mismatch\nexpected ${current.slice(0,120)}\nactual ${next.slice(0,120)}`); }
}
if (mismatches.length) { console.error(mismatches.join('\n')); process.exit(1); }
console.log(`Validated ${Object.keys(map).length} examples and ${Object.keys(goldenMap).length} golden files`);
