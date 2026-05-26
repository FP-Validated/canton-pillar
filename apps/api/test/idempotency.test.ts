import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, postHeaders, testServer } from './_helpers.js';

process.env.PILLAR_IDEMPOTENCY = 'memory';
test('mutating POST without Idempotency-Key is rejected', async () => {
  const server = await testServer();
  const response = await server.inject({ method: 'POST', url: '/v1/accounts', headers: auth, payload: { display_name: 'No Key' } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'idempotency_key_required');
});

test('same idempotency key and same body returns cached response', async () => {
  const server = await testServer();
  const payload = { amount: '1', asset: 'asst_demo', from_account: 'acct_aaaa', to_account: 'acct_bbbb' };
  const first = await server.inject({ method: 'POST', url: '/v1/transfer_intents', headers: postHeaders('idem-same'), payload });
  const second = await server.inject({ method: 'POST', url: '/v1/transfer_intents', headers: postHeaders('idem-same'), payload });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json().id, second.json().id);
});

test('same idempotency key with different body returns idempotency_key_reused 409', async () => {
  const server = await testServer();
  const payload = { amount: '1', asset: 'asst_demo', from_account: 'acct_aaaa', to_account: 'acct_bbbb' };
  await server.inject({ method: 'POST', url: '/v1/transfer_intents', headers: postHeaders('idem-different'), payload });
  const conflict = await server.inject({ method: 'POST', url: '/v1/transfer_intents', headers: postHeaders('idem-different'), payload: { ...payload, amount: '2' } });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error.code, 'idempotency_key_reused');
});
