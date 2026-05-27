import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { assertErrorEnvelope } from './_helpers.js';

async function server() {
  process.env.PILLAR_DEMO_DATA = 'true';
  delete process.env.PILLAR_NETWORK_TEST_UNBOUND;
  const app = await createServer();
  test.after(async () => { await app.close(); });
  return app;
}

test('network middleware defaults missing network to devnet', async () => {
  const app = await server();
  const response = await app.inject({ url: '/v1/network' });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['pillar-network'], 'devnet');
  assert.equal(body.object, 'network_context');
  assert.equal(body.current, 'devnet');
  assert.equal(body.livemode, false);
});

test('network middleware rejects invalid network', async () => {
  const app = await server();
  const response = await app.inject({ url: '/v1/network', headers: { 'Pillar-Network': 'qa' } });
  const body = response.json();
  assert.equal(response.statusCode, 400);
  assertErrorEnvelope(body);
  assert.equal(body.error.code, 'network_invalid');
});

test('network middleware lets header override cookie', async () => {
  const app = await server();
  const response = await app.inject({ url: '/v1/network', headers: { 'Pillar-Network': 'mainnet', cookie: 'pillar-network=testnet' } });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['pillar-network'], 'mainnet');
  assert.equal(body.current, 'mainnet');
  assert.equal(body.livemode, true);
});

test('network middleware rejects authed tenant without active binding', async () => {
  const app = await server();
  process.env.PILLAR_NETWORK_TEST_UNBOUND = 'true';
  const response = await app.inject({ url: '/v1/network', headers: { authorization: 'Bearer plr_sk_test_demo', 'Pillar-Network': 'devnet' } });
  const body = response.json();
  assert.equal(response.statusCode, 403);
  assertErrorEnvelope(body);
  assert.equal(body.error.code, 'network_not_bound');
});
