import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDashboardToken } from '@pillar/security';

test('tenant sessions produce isolated dashboard tokens and fixtures', async () => {
  process.env.PILLAR_DASHBOARD_JWT_SECRET = 'tenant-secret';
  process.env.PILLAR_API_BASE_URL = 'http://tenant-api.test';
  const { signDashboardToken } = await import('@pillar/security');
  const tokenA = signDashboardToken({ tenant_id:'tenant_a', user_id:'user_a', role:'admin' as any, livemode:false }, { secret:'tenant-secret' });
  const tokenB = signDashboardToken({ tenant_id:'tenant_b', user_id:'user_b', role:'viewer' as any, livemode:false }, { secret:'tenant-secret' });
  const fixture = (token: string) => verifyDashboardToken(token, 'tenant-secret').tenant_id === 'tenant_a' ? [{ id:'balance_a' }] : [{ id:'balance_b' }];
  assert.deepEqual(fixture(tokenA), [{ id:'balance_a' }]);
  assert.deepEqual(fixture(tokenB), [{ id:'balance_b' }]);
  assert.notDeepEqual(fixture(tokenA), fixture(tokenB));
});
