import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, restrictedAuth, testServer } from './_helpers.js';

test('safe unsupported expansion is ignored on routes without expansion support', async () => {
  const server = await testServer();
  const response = await server.inject({ url: '/v1/accounts?expand[]=not_supported', headers: auth });
  assert.equal(response.statusCode, 200);
});

test('deep expansion is ignored on routes without expansion support', async () => {
  const server = await testServer();
  const response = await server.inject({ url: '/v1/accounts?expand[]=a.b.c.d.e', headers: auth });
  assert.equal(response.statusCode, 200);
});

test('ledger expansion is admin-only', async () => {
  const server = await testServer();
  const response = await server.inject({ url: '/v1/operations/op_demo?expand[]=ledger_trace', headers: restrictedAuth });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.type, 'permission_error');
});
