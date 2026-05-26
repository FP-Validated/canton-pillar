import assert from 'node:assert/strict';
import test from 'node:test';
import { ReconnectStrategy } from '../../src/components/realtime/ReconnectStrategy';

test('reconnect strategy backs off with jitter and preserves last event id', () => {
  const s = new ReconnectStrategy(100, 1000, () => 0.5);
  assert.equal(s.nextDelayMs(), 75);
  assert.equal(s.nextDelayMs(), 150);
  s.remember('evt_abc');
  assert.equal(s.lastEventId, 'evt_abc');
  s.reset();
  assert.equal(s.nextDelayMs(), 75);
});
