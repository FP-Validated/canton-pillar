import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, assertErrorEnvelope, testServer } from './_helpers.js';

const validRequestId = 'req_01JY7Z7PK5F6WQ9H8A1M4N2P3Q';

test('request id is passed through when valid', async () => {
  const server = await testServer();
  const response = await server.inject({ url: '/v1/health', headers: { 'x-request-id': validRequestId } });
  assert.equal(response.headers['pillar-request-id'], validRequestId);
});

test('request id is generated when absent or malformed', async () => {
  const server = await testServer();
  const absent = await server.inject({ url: '/v1/health' });
  const malformed = await server.inject({ url: '/v1/health', headers: { 'x-request-id': 'not-valid' } });
  assert.match(String(absent.headers['pillar-request-id']), /^req_[A-Z0-9]{26}$/i);
  assert.match(String(malformed.headers['pillar-request-id']), /^req_[A-Z0-9]{26}$/i);
  assert.notEqual(malformed.headers['pillar-request-id'], 'not-valid');
});

test('error responses carry the same request id', async () => {
  const server = await testServer();
  const response = await server.inject({ url: '/v1/accounts', headers: { ...auth, 'x-request-id': validRequestId, 'pillar-version': '1900-01-01' } });
  assert.equal(response.headers['pillar-request-id'], validRequestId);
  assertErrorEnvelope(response.json(), validRequestId);
});
