import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthorizationUrl, pkceChallenge, verifyIdToken, createCsrfToken, verifyCsrfToken, SessionManager, can, requireRole, signDashboardToken, verifyDashboardToken } from '../src/index.js';

test('google authorization URL includes PKCE and default scopes', () => {
  const url = new URL(buildAuthorizationUrl({ clientId: 'cid', redirectUri: 'https://app/cb', state: 'st', nonce: 'no', codeChallenge: 'cc' }));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(pkceChallenge('abc').length > 10, true);
});


test('csrf constant time compare accepts exact token only', () => {
  const token = createCsrfToken();
  assert.equal(verifyCsrfToken(token, token), true);
  assert.equal(verifyCsrfToken(token, token + 'x'), false);
});

test('session manager hashes, refreshes, and revokes', async () => {
  const rows = new Map<string, any>();
  const store = { async create(r:any){ rows.set(r.sessionHash, r); return r; }, async findByHash(h:string){ return rows.get(h); }, async update(r:any){ rows.set(r.sessionHash, r); } };
  const sm = new SessionManager(store, 'pepper', 1000, 1000);
  const { token, record } = await sm.create('usr_1', 'csrf');
  assert.notEqual(token, record.sessionHash);
  assert.equal((await sm.lookup(token))?.userId, 'usr_1');
  await sm.revoke(token);
  assert.equal(await sm.lookup(token), undefined);
});

test('rbac and dashboard jwt enforce roles', () => {
  assert.equal(can('tenant_admin', 'members', 'invite'), true);
  assert.throws(() => requireRole('tenant_viewer', 'members', 'invite'), /permission_denied/);
  const jwt = signDashboardToken({ tenant_id: 'ten_1', user_id: 'usr_1', role: 'tenant_owner', livemode: false }, { secret: 's' });
  assert.equal(verifyDashboardToken(jwt, 's').role, 'tenant_owner');
  assert.throws(() => verifyDashboardToken(jwt, 'bad'), /invalid_signature/);
});
