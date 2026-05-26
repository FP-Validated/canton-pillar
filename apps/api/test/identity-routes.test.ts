import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { identityAuthRoutes } from '../src/routes/v1/auth/identity.js';

test('oauth start returns authorization url and state', async () => {
  const app = Fastify(); await app.register(identityAuthRoutes);
  const res = await app.inject({ method: 'POST', url: '/auth/oauth/google/start', payload: { return_to: '/dashboard' } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.match(body.authorization_url, /accounts\.google\.com/);
  assert.ok(body.state);
});
