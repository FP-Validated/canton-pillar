import assert from 'node:assert/strict';
import test from 'node:test';

process.env.PILLAR_DB = 'memory';
const Webhooks = await import('../src/repositories/webhook-repo.js');

test('createEndpoint returns raw secret once and public reads hide it', async () => {
  const created = await Webhooks.createEndpoint({ tenantId: 'acct_wh', url: 'https://example.com/hook', livemode: false });
  assert.match(created.secret, /^plr_whsec_/);
  assert.equal(created.secret_last4, created.secret.slice(-4));
  const fetched = await Webhooks.getEndpoint(created.id, 'acct_wh');
  assert.equal(fetched.secret, undefined);
  assert.equal(fetched.secret_hash, undefined);
});

test('rotateSecret returns new secret without leaking it in endpoint list', async () => {
  const created = await Webhooks.createEndpoint({ tenantId: 'acct_rot', url: 'https://example.com/hook', livemode: false });
  const rotated = await Webhooks.rotateSecret(created.id, { tenantId: 'acct_rot' });
  assert.match(rotated.secret, /^plr_whsec_/);
  assert.notEqual(rotated.secret, created.secret);
  const listed = await Webhooks.listEndpoints({ tenantId: 'acct_rot' });
  assert.equal(listed[0].secret, undefined);
});
