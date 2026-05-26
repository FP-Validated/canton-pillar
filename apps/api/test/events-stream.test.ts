import assert from 'node:assert/strict';
import test from 'node:test';
import { auth, testServer } from './_helpers.js';
import { SseBroker } from '../src/routes/v1/events-stream.js';

test('GET /v1/events:stream rejects unauthenticated requests', async () => {
  const server = await testServer();
  const res = await server.inject({ method: 'GET', url: '/v1/events:stream?livemode=true' });
  assert.equal(res.statusCode, 401);
});

test('broker publish is resumable from Last-Event-Id and tenant scoped', async () => {
  SseBroker.publish('acct_demo', false, { id: 'evt_resume1', type: 'holding.updated', data: { id: 'hld_1' } });
  SseBroker.publish('acct_other', false, { id: 'evt_other1', type: 'holding.updated', data: { id: 'hld_other' } });
  SseBroker.publish('acct_demo', false, { id: 'evt_resume2', type: 'balance.updated', data: { id: 'bal_1' } });
  const sub = SseBroker.subscribe('acct_demo', false, { afterId: 'evt_resume1' });
  const first = await sub[Symbol.asyncIterator]().next();
  assert.equal(first.value.id, 'evt_resume2');
  assert.equal(first.value.type, 'balance.updated');
  sub.close();
});

test('livemode mismatch is forbidden', async () => {
  const server = await testServer();
  const res = await server.inject({ method: 'GET', url: '/v1/events:stream?livemode=true', headers: auth });
  assert.equal(res.statusCode, 403);
});
