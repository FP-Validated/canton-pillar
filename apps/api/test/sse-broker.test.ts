import assert from 'node:assert/strict';
import test from 'node:test';
import { SseBroker } from '../src/services/sse-broker/index.js';

test('subscriber overflow emits stream.overflow and drops oldest', async () => {
  const broker = new SseBroker(4096, 2);
  const sub = broker.subscribe('acct_demo', false);
  broker.publish('acct_demo', false, { id: 'evt_0001', type: 'a', data: { n: 1 } });
  broker.publish('acct_demo', false, { id: 'evt_0002', type: 'a', data: { n: 2 } });
  broker.publish('acct_demo', false, { id: 'evt_0003', type: 'a', data: { n: 3 } });
  const it = sub[Symbol.asyncIterator]();
  assert.equal((await it.next()).value.type, 'stream.overflow');
  assert.equal((await it.next()).value.id, 'evt_0002');
  assert.equal((await it.next()).value.id, 'evt_0003');
  sub.close();
});
