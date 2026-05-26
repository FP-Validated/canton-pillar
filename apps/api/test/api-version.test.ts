import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, testServer } from './_helpers.js';

test('API version resolves from supported header before account default or SDK fallback', async () => {
  const server = await testServer();
  const response = await server.inject({ url: '/v1/accounts', headers: { ...auth, 'pillar-version': '2026-05-26' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['pillar-version'], '2026-05-26');
});

test('SDK pinned fallback resolves when no version header is present', async () => {
  const server = await testServer();
  const response = await server.inject({ url: '/v1/accounts', headers: auth });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['pillar-version'], '2026-05-26');
});

test('unsupported API version returns version_error', async () => {
  const server = await testServer();
  const response = await server.inject({ url: '/v1/accounts', headers: { ...auth, 'pillar-version': '1900-01-01' } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.type, 'version_error');
});
