import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, assertListEnvelope, postHeaders, testServer } from './_helpers.js';

test('api keys create one-time secret and descriptors never echo full secret', async () => {
  const server = await testServer();
  const created = await server.inject({ method: 'POST', url: '/v1/api_keys', headers: postHeaders('key-create'), payload: { name: 'Integration' } });
  const key = created.json();
  assert.equal(created.statusCode, 200);
  assert.match(key.secret, /^plr_sk_test_/);
  assert.equal(typeof key.last4, 'string');

  const listed = await server.inject({ url: '/v1/api_keys', headers: auth });
  assertListEnvelope(listed.json(), '/v1/api_keys');
  assert.equal(JSON.stringify(listed.json()).includes('plr_sk_test_'), false);
  const got = await server.inject({ url: `/v1/api_keys/${key.id}`, headers: auth });
  assert.equal('secret' in got.json(), false);
});

test('api keys rotate returns new secret once and revoke/expire transition status', async () => {
  const server = await testServer();
  const rotated = await server.inject({ method: 'POST', url: '/v1/api_keys/ak_demo/rotate', headers: postHeaders('key-rotate'), payload: {} });
  assert.equal(rotated.statusCode, 200);
  assert.match(rotated.json().secret, /^plr_sk_test_/);
  const revoked = await server.inject({ method: 'POST', url: '/v1/api_keys/ak_demo/revoke', headers: postHeaders('key-revoke'), payload: {} });
  assert.equal(revoked.json().status, 'revoked');
  const expired = await server.inject({ method: 'POST', url: '/v1/api_keys/ak_demo/expire', headers: postHeaders('key-expire'), payload: {} });
  assert.equal(expired.json().status, 'expired');
});
