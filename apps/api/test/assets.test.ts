import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, assertListEnvelope, postHeaders, testServer } from './_helpers.js';

test('assets create requires Idempotency-Key', async () => {
  const server = await testServer();
  const response = await server.inject({ method: 'POST', url: '/v1/assets', headers: auth, payload: { code: 'USD', name: 'Dollar', scale: 2 } });
  assert.equal(response.statusCode, 400);
});

test('assets create, retrieve, list, and update happy path', async () => {
  const server = await testServer();
  const created = await server.inject({ method: 'POST', url: '/v1/assets', headers: postHeaders('asset-create'), payload: { code: 'USD', name: 'Dollar', scale: 2, transferable: true, redeemable: true } });
  const asset = created.json();
  assert.equal(created.statusCode, 200);
  assert.match(asset.id, /^asst_/);
  assert.equal(asset.object, 'asset');

  const retrieved = await server.inject({ url: `/v1/assets/${asset.id}`, headers: auth });
  assert.equal(retrieved.json().id, asset.id);

  const listed = await server.inject({ url: '/v1/assets', headers: auth });
  assertListEnvelope(listed.json(), '/v1/assets');

  const updated = await server.inject({ method: 'POST', url: `/v1/assets/${asset.id}`, headers: postHeaders('asset-update'), payload: { name: 'Updated Dollar' } });
  assert.equal(updated.json().name, 'Updated Dollar');
});
