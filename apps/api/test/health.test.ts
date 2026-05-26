import test from 'node:test';
import assert from 'node:assert/strict';
import { testServer } from './_helpers.js';

test('GET /v1/health returns health envelope', async () => {
  const server = await testServer();
  const response = await server.inject({ url: '/v1/health' });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.api_version, 'string');
  assert.ok(response.headers['pillar-request-id']);
  assert.ok(body.timestamp === undefined || typeof body.timestamp === 'string');
});
