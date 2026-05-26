import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, assertListEnvelope, postHeaders, testServer } from './_helpers.js';

test('events list pagination works and event objects are immutable by API surface', async () => {
  const server = await testServer();
  const listed = await server.inject({ url: '/v1/events?limit=1', headers: auth });
  const body = listed.json();
  assert.equal(listed.statusCode, 200);
  assertListEnvelope(body, '/v1/events');
  assert.equal(body.data.length <= 1, true);
  assert.equal('updated' in body.data[0], false);
});

test('event resend and replay require Idempotency-Key and succeed with one', async () => {
  const server = await testServer();
  const withoutKey = await server.inject({ method: 'POST', url: '/v1/events/evt_demo/resend', headers: auth, payload: {} });
  assert.equal(withoutKey.statusCode, 400);
  const resend = await server.inject({ method: 'POST', url: '/v1/events/evt_demo/resend', headers: postHeaders('event-resend'), payload: {} });
  assert.equal(resend.statusCode, 200);
  const replay = await server.inject({ method: 'POST', url: '/v1/events/evt_demo/replay', headers: postHeaders('event-replay'), payload: {} });
  assert.equal(replay.statusCode, 200);
});
