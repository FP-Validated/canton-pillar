import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, assertErrorEnvelope, nonAdminAuth, postHeaders, testServer } from './_helpers.js';

const cases = [
  { status: 400, request: { url: '/v1/accounts?limit=0', headers: auth } },
  { status: 401, request: { url: '/v1/accounts' } },
  { status: 403, request: { url: '/v1/openapi.json', headers: nonAdminAuth } },
  { status: 404, request: { url: '/v1/accounts/acct_missing', headers: auth } },
  { status: 409, request: async (server: any) => {
      const body = { amount: '1', asset: 'asst_demo', from_account: 'acct_aaaa', to_account: 'acct_bbbb' };
      await server.inject({ method: 'POST', url: '/v1/transfer_intents', headers: postHeaders('err-conflict'), payload: body });
      return { method: 'POST', url: '/v1/transfer_intents', headers: postHeaders('err-conflict'), payload: { ...body, amount: '2' } };
    } },
  { status: 400, request: { method: 'POST', url: '/v1/accounts', headers: postHeaders('err-zod'), payload: { metadata: [] } } },
];

test('standard error envelopes include request_id and doc_url', async () => {
  const server = await testServer();
  for (const entry of cases) {
    const request = typeof entry.request === 'function' ? await entry.request(server) : entry.request;
    const response = await server.inject(request as any);
    assert.equal(response.statusCode, entry.status);
    assertErrorEnvelope(response.json(), String(response.headers['pillar-request-id']));
  }
});

test('ZodError is mapped to invalid_request_error', async () => {
  const server = await testServer();
  const response = await server.inject({ method: 'POST', url: '/v1/accounts', headers: postHeaders('err-zod-type'), payload: { metadata: [] } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.type, 'invalid_request_error');
});

test('unknown routes map to not_found_error without stack leakage', async () => {
  const server = await testServer();
  const response = await server.inject({ url: '/v1/no_such_route', headers: auth });
  const text = response.body;
  assert.equal(response.statusCode, 404);
  assert.ok(response.json().error?.type === 'not_found_error' || response.json().message === 'Route GET:/v1/no_such_route not found');
  assert.equal(/\n\s*at\s/.test(text), false);
});
