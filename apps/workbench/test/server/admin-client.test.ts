import test from 'node:test';
import assert from 'node:assert/strict';
import { mintDashboardJwt, type Result } from '../../src/server/pillar-admin-client';
import type { WorkbenchSession } from '../../src/server/session';

const base: WorkbenchSession = { user: { id: 'usr_1', email: 'a@example.com' }, active_tenant_id: 'ten_1', memberships: [], role: 'viewer' };

test('refuses non-admin sessions', () => {
  const result = mintDashboardJwt(base) as Result<string>;
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.error, { type: 'permission_error', code: 'admin_required' });
});

test('allows super_admin sessions', () => {
  const result = mintDashboardJwt({ ...base, role: 'super_admin' });
  assert.equal(result.ok, true);
  if (result.ok) assert.match(result.value, /^ey/);
});
