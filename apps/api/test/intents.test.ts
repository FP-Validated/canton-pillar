import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, postHeaders, testServer } from './_helpers.js';

const payload = { amount: '25.00', asset: 'asst_demo', from_account: 'acct_aaaa', to_account: 'acct_bbbb' };

test('transfer intent create requires Idempotency-Key', async () => {
  const server = await testServer();
  const response = await server.inject({ method: 'POST', url: '/v1/transfer_intents', headers: auth, payload });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'idempotency_key_required');
});

test('transfer intent create returns processing status and operation links', async () => {
  const server = await testServer();
  const created = await server.inject({ method: 'POST', url: '/v1/transfer_intents', headers: postHeaders('intent-create'), payload });
  const intent = created.json();
  assert.equal(created.statusCode, 200);
  assert.match(intent.id, /^trint_/);
  assert.equal(intent.status, 'processing');
  assert.match(intent.operation, /^op_/);
  assert.ok(intent.latest_event === null || /^evt_/.test(intent.latest_event));

  const confirmed = await server.inject({ method: 'POST', url: `/v1/transfer_intents/${intent.id}/confirm`, headers: postHeaders('intent-confirm'), payload: {} });
  assert.equal(confirmed.json().status, 'processing');

  const canceled = await server.inject({ method: 'POST', url: `/v1/transfer_intents/${intent.id}/cancel`, headers: postHeaders('intent-cancel'), payload: {} });
  assert.equal(canceled.json().status, 'canceled');
});
