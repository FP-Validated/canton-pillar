import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAuditSink } from '../src/repositories/api-requests.js';
import { auth, postHeaders, testServer } from './_helpers.js';

test('audit hook records success and error and masks sensitive fields', async () => {
  const server = await testServer();
  const before = defaultAuditSink.entries().length;
  await server.inject({ method: 'POST', url: '/v1/webhook_endpoints', headers: { ...postHeaders('audit-success'), authorization: auth.authorization }, payload: { url: 'https://example.com/hook', enabled_events: ['*'], client_secret: 'body-secret' } });
  await server.inject({ method: 'POST', url: '/v1/accounts', headers: auth, payload: { display_name: 'No Key', nested: { secret_value: 'body-secret' } } });
  const entries = defaultAuditSink.entries().slice(before);
  assert.equal(entries.length, 2);
  assert.equal(entries.some((entry) => entry.status_code === 200), true);
  assert.equal(entries.some((entry) => entry.status_code && entry.status_code >= 400), true);
  for (const entry of entries) {
    assert.equal(entry.request_headers.authorization, '[masked]');
    if ('idempotency-key' in entry.request_headers) assert.equal(entry.request_headers['idempotency-key'], '[masked]');
    assert.equal(JSON.stringify(entry.request_body).includes('body-secret'), false);
  }
});
