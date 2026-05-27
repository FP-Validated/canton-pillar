import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, test } from 'node:test';
import { registerAuth } from '../src/middleware/auth.js';
import { pool } from '../src/db/client.js';
import Fastify from 'fastify';

const originalQuery = pool.query.bind(pool);

afterEach(() => {
  (pool as any).query = originalQuery;
  delete process.env.PILLAR_DEMO_DATA;
});

async function server() {
  const app = Fastify({ logger: false });
  app.get('/private', async (request) => ({ accountId: request.accountId, auth: request.auth }));
  await registerAuth(app);
  return app;
}

test('auth middleware rejects missing and invalid API keys', async () => {
  (pool as any).query = async () => ({ rows: [] });
  const app = await server();
  try {
    assert.equal((await app.inject('/private')).statusCode, 401);
    const invalid = await app.inject({ url: '/private', headers: { authorization: 'Bearer plr_sk_test_missing' } });
    assert.equal(invalid.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('auth middleware authenticates a DB-backed active API key hash', async () => {
  const presented = 'plr_sk_test_valid';
  const expectedHash = createHash('sha256').update(presented).digest('hex');
  (pool as any).query = async (_sql: string, params: unknown[]) => {
    assert.equal(params[0], expectedHash);
    return { rows: [{ id: 'key_1', tenant_id: 'acct_1', mode: 'test', scopes: ['holdings:read'], status: 'active' }] };
  };
  const app = await server();
  try {
    const response = await app.inject({ url: '/private', headers: { authorization: `Bearer ${presented}` } });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.accountId, 'acct_1');
    assert.equal(body.auth.keyId, 'key_1');
    assert.deepEqual(body.auth.scopes, ['holdings:read']);
  } finally {
    await app.close();
  }
});
