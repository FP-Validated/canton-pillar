import assert from 'node:assert/strict';
import test from 'node:test';

process.env.PILLAR_DB = 'memory';
const Events = await import('../src/repositories/event-repo.js');

test('events are tenant scoped in memory fallback', async () => {
  const a = await Events.listEvents({ tenantId: 'acct_a', livemode: false, apiVersion: '2026-05-26' });
  const b = await Events.listEvents({ tenantId: 'acct_b', livemode: false, apiVersion: '2026-05-26' });
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].id, b[0].id);
});

test('enqueueReplay is idempotent per tenant and key', async () => {
  await Events.listEvents({ tenantId: 'acct_replay', livemode: false });
  const first = await Events.enqueueReplay('evt_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZE', { tenantId: 'acct_replay', idempotencyKey: 'idem_1' });
  const second = await Events.enqueueReplay('evt_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZE', { tenantId: 'acct_replay', idempotencyKey: 'idem_1' });
  assert.deepEqual(second, first);
  assert.equal(first.replay.status, 'queued');
});
