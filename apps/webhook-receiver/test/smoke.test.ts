import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildReceiver } from '../src/server.js';

test('health endpoint returns ok with capacity', async () => {
  const { app } = buildReceiver({ capacity: 5 });
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.capacity, 5);
  assert.equal(res.body.captured, 0);
});

test('capture stores and lists requests', async () => {
  const { app, captured } = buildReceiver({ capacity: 3 });
  const r1 = await request(app)
    .post('/capture/webhook-1')
    .set('content-type', 'application/json')
    .set('pillar-signature', 't=1779775200,v1=fakehex')
    .send({ id: 'evt_test', type: 'transfer_intent.succeeded' });
  assert.equal(r1.status, 202);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].path, '/capture/webhook-1');
  assert.equal(captured[0].bodyJson && (captured[0].bodyJson as { id: string }).id, 'evt_test');

  const list = await request(app).get('/capture');
  assert.equal(list.status, 200);
  assert.equal(list.body.count, 1);
});

test('capacity ring-buffer evicts oldest', async () => {
  const { app, captured } = buildReceiver({ capacity: 2 });
  for (const id of ['a', 'b', 'c']) {
    await request(app).post('/capture').set('content-type', 'application/json').send({ id });
  }
  assert.equal(captured.length, 2);
  assert.equal((captured[0].bodyJson as { id: string }).id, 'b');
  assert.equal((captured[1].bodyJson as { id: string }).id, 'c');
});
