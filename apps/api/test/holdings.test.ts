import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, assertListEnvelope, assertNoForbiddenPublicFields, testServer } from './_helpers.js';

test('holdings cursor pagination and filters do not expose internals', async () => {
  const s = await testServer();
  const res = await s.inject({ method: 'GET', url: '/v1/holdings?limit=1&account=acct_demo&status=active', headers: auth });
  assert.equal(res.statusCode, 200);
  const body = res.json(); assertListEnvelope(body, '/v1/holdings'); assert.equal(body.data.length, 1); assertNoForbiddenPublicFields(body);
});
