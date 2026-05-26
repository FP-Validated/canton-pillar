import test from 'node:test';
import assert from 'node:assert/strict';
import { DualControlModal } from '../../src/components/admin/DualControlModal';

test('dual-control modal component is exported', () => {
  assert.equal(typeof DualControlModal, 'function');
});
