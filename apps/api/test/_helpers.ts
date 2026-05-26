import assert from 'node:assert/strict';
import { after } from 'node:test';
import { createServer } from '../src/server.js';

export const auth = { authorization: 'Bearer plr_sk_test_demo' };
export const nonAdminAuth = { authorization: 'Bearer plr_pk_test_demo' };
export const restrictedAuth = { authorization: 'Bearer plr_rk_test_demo' };

export function postHeaders(key: string) {
  return { ...auth, 'idempotency-key': key };
}

export async function testServer() {
  const server = await createServer();
  after(async () => {
    await server.close();
  });
  return server;
}

export function assertErrorEnvelope(body: any, requestId?: string) {
  assert.ok(body.error);
  assert.equal(typeof body.error.type, 'string');
  assert.equal(typeof body.error.code, 'string');
  assert.equal(typeof body.error.message, 'string');
  assert.equal(typeof body.error.request_id, 'string');
  assert.equal(typeof body.error.doc_url, 'string');
  if (requestId) assert.equal(body.error.request_id, requestId);
}

export function assertListEnvelope(body: any, url: string) {
  assert.equal(body.object, 'list');
  assert.equal(body.url, url);
  assert.equal(typeof body.has_more, 'boolean');
  assert.ok(Array.isArray(body.data));
}

export function assertNoForbiddenPublicFields(value: unknown) {
  const text = JSON.stringify(value);
  const forbidden = ['contract' + 'Id', 'template' + 'Id', 'party' + 'Id', 'package' + 'Id', 'submission' + 'Id', 'command' + 'Id'];
  assert.equal(forbidden.some((substring) => text.includes(substring)), false);
}
