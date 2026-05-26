import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, assertListEnvelope, testServer } from './_helpers.js';

test('balances cursor pagination and wait_for_operation', async () => {
  const s = await testServer();
  const list = await s.inject({ method: 'GET', url: '/v1/balances?limit=1', headers: auth });
  assert.equal(list.statusCode, 200);
  const body = list.json(); assertListEnvelope(body, '/v1/balances'); assert.equal(body.data.length, 1);
  const ok = await s.inject({ method: 'GET', url: '/v1/balances?consistency=wait_for_operation&operation=op_123', headers: auth });
  assert.equal(ok.statusCode, 200);
  const pending = await s.inject({ method: 'GET', url: '/v1/balances?consistency=wait_for_operation&operation=op_123&simulate_lag=true', headers: auth });
  assert.equal(pending.statusCode, 202); assert.equal(pending.json().object, 'balance_pending');
});
