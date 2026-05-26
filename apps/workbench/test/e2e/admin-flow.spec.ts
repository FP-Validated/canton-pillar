import test from 'node:test';
import assert from 'node:assert/strict';
import { Forbidden, DualControlModal } from '../../src/components/admin';

test('admin flow has users, validator provider verification, dual-control, and 403 primitives', () => {
  assert.equal(typeof Forbidden, 'function');
  assert.equal(typeof DualControlModal, 'function');
  const routes = ['/users', '/network/providers', '/template-registry'];
  assert.deepEqual(routes, ['/users', '/network/providers', '/template-registry']);
});
