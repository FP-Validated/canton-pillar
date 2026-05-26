import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, assertListEnvelope, postHeaders, testServer } from './_helpers.js';

test('webhook endpoints create, rotate secret, list, get, and delete', async () => {
  const server = await testServer();
  const created = await server.inject({ method: 'POST', url: '/v1/webhook_endpoints', headers: postHeaders('we-create'), payload: { url: 'https://example.com/hook', enabled_events: ['*'] } });
  const endpoint = created.json();
  assert.equal(created.statusCode, 200);
  assert.equal(endpoint.object, 'webhook_endpoint');
  assert.match(endpoint.id, /^we_/);

  const rotated = await server.inject({ method: 'POST', url: `/v1/webhook_endpoints/${endpoint.id}/rotate_secret`, headers: postHeaders('we-rotate'), payload: {} });
  assert.match(rotated.json().secret, /^plr_whsec_/);
  assert.equal(typeof rotated.json().last4, 'string');

  const listed = await server.inject({ url: '/v1/webhook_endpoints', headers: auth });
  assertListEnvelope(listed.json(), '/v1/webhook_endpoints');
  const got = await server.inject({ url: `/v1/webhook_endpoints/${endpoint.id}`, headers: auth });
  assert.equal(got.json().id, endpoint.id);
  const deleted = await server.inject({ method: 'POST', url: `/v1/webhook_endpoints/${endpoint.id}`, headers: postHeaders('we-delete'), payload: { deleted: true } });
  assert.equal(deleted.statusCode, 200);
});
