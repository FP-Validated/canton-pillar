import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, nonAdminAuth, testServer } from './_helpers.js';

test('GET /v1/openapi.json is admin-only and returns OpenAPI JSON with resolved version', async () => {
  const server = await testServer();
  const denied = await server.inject({ url: '/v1/openapi.json', headers: nonAdminAuth });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().error.type, 'permission_error');

  const response = await server.inject({ url: '/v1/openapi.json', headers: auth });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.match(body.openapi, /^3\./);
  assert.ok(body.paths);
  assert.equal(response.headers['pillar-version'], '2026-05-26');
});
