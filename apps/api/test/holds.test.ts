import test from 'node:test';
import assert from 'node:assert/strict';
import { postHeaders, testServer } from './_helpers.js';

test('holds create and release return expected status transitions', async () => {
  const server = await testServer();
  const created = await server.inject({ method: 'POST', url: '/v1/holds', headers: postHeaders('hold-create'), payload: { amount: '5', asset: 'asst_demo', account: 'acct_aaaa', expires_at: '2026-05-27T00:00:00.000Z', purpose: 'settlement' } });
  const hold = created.json();
  assert.equal(created.statusCode, 200);
  assert.match(hold.id, /^hold_/);
  assert.equal(hold.status, 'active');

  const released = await server.inject({ method: 'POST', url: `/v1/holds/${hold.id}/release`, headers: postHeaders('hold-release'), payload: {} });
  assert.equal(released.statusCode, 200);
  assert.equal(released.json().status, 'released');
});
