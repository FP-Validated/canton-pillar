import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, assertListEnvelope, postHeaders, testServer } from './_helpers.js';

test('accounts create requires Idempotency-Key', async () => {
  const server = await testServer();
  const response = await server.inject({ method: 'POST', url: '/v1/accounts', headers: auth, payload: { display_name: 'Treasury' } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'idempotency_key_required');
});

test('accounts create, retrieve, list, and update happy path', async () => {
  const server = await testServer();
  const created = await server.inject({ method: 'POST', url: '/v1/accounts', headers: postHeaders('acct-create'), payload: { display_name: 'Treasury', metadata: { team: 'ops' } } });
  const account = created.json();
  assert.equal(created.statusCode, 200);
  assert.match(account.id, /^acct_/);
  assert.equal(account.object, 'account');
  assert.equal(account.display_name, 'Treasury');

  const retrieved = await server.inject({ url: `/v1/accounts/${account.id}`, headers: auth });
  assert.equal(retrieved.json().id, account.id);

  const listed = await server.inject({ url: '/v1/accounts', headers: auth });
  assertListEnvelope(listed.json(), '/v1/accounts');

  const updated = await server.inject({ method: 'POST', url: `/v1/accounts/${account.id}`, headers: postHeaders('acct-update'), payload: { display_name: 'Treasury Updated' } });
  assert.equal(updated.json().display_name, 'Treasury Updated');
});
