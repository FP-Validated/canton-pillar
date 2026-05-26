import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, nonAdminAuth, assertNoForbiddenPublicFields, testServer } from './_helpers.js';

test('operation ledger_trace expansion is admin gated', async () => {
  const s = await testServer();
  const def = await s.inject({ method: 'GET', url: '/v1/operations/op_123', headers: auth });
  assert.equal(def.statusCode, 200); assert.equal(def.json().ledger_trace, undefined); assertNoForbiddenPublicFields(def.json());
  const denied = await s.inject({ method: 'GET', url: '/v1/operations/op_123?expand[]=ledger_trace', headers: nonAdminAuth });
  assert.equal(denied.statusCode, 403);
  const admin = await s.inject({ method: 'GET', url: '/v1/operations/op_123?expand[]=ledger_trace', headers: auth });
  assert.equal(admin.statusCode, 200); assert.equal(admin.json().ledger_trace.update_id, 'upd_opaque');
});
