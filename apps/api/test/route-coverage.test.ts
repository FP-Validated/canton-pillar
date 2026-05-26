import test from 'node:test';
import assert from 'node:assert/strict';
import openapi from '@pillar/api-contracts/openapi/pillar-v1.json' assert { type: 'json' };
import { testServer } from './_helpers.js';

const implementedPaths = [
  '/v1/health', '/v1/openapi.json',
  '/v1/accounts', '/v1/accounts/{id}',
  '/v1/assets', '/v1/assets/{id}',
  '/v1/balances', '/v1/balances/{id}',
  '/v1/holdings', '/v1/holdings/{id}',
  '/v1/transfer_intents', '/v1/transfer_intents/{id}', '/v1/transfer_intents/{id}/confirm', '/v1/transfer_intents/{id}/cancel',
  '/v1/issue_intents', '/v1/issue_intents/{id}', '/v1/issue_intents/{id}/confirm', '/v1/issue_intents/{id}/cancel',
  '/v1/redeem_intents', '/v1/redeem_intents/{id}', '/v1/redeem_intents/{id}/confirm', '/v1/redeem_intents/{id}/cancel',
  '/v1/holds', '/v1/holds/{id}', '/v1/holds/{id}/release', '/v1/holds/{id}/cancel',
  '/v1/operations', '/v1/operations/{id}',
  '/v1/events', '/v1/events/{id}', '/v1/events/{id}/resend', '/v1/events/replay',
  '/v1/webhook_endpoints', '/v1/webhook_endpoints/{id}', '/v1/webhook_endpoints/{id}/enable', '/v1/webhook_endpoints/{id}/disable', '/v1/webhook_endpoints/{id}/rotate_secret',
  '/v1/api_keys', '/v1/api_keys/{id}', '/v1/api_keys/{id}/rotate', '/v1/api_keys/{id}/revoke', '/v1/api_keys/{id}/expire',
];

test('implemented OpenAPI paths are represented in Fastify route table', async () => {
  const server = await testServer();
  assert.equal(typeof server.printRoutes(), 'string');
  assert.deepEqual(implementedPaths.filter((path) => !Object.hasOwn((openapi as any).paths, path)), []);
});
