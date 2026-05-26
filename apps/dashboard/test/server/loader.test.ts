import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDashboardToken } from '@pillar/security';

const session = { user:{id:'user_a',email:'a@example.com'}, memberships:[{tenant:{id:'tenant_a',slug:'a',display_name:'A'},role:'admin'}], active_tenant_id:'tenant_a' };
process.env.PILLAR_DASHBOARD_TEST_SESSION = JSON.stringify(session);
process.env.PILLAR_API_BASE_URL = 'http://pillar.test';
process.env.PILLAR_DASHBOARD_JWT_SECRET = 'test-secret';

function mock(status = 200, body: any = { object:'list', data:[{id:'row_a'}], has_more:false }, delay = 0) {
  globalThis.fetch = async (_url: any, init: any) => {
    const auth = String(init?.headers?.get?.('authorization') ?? '');
    const payload = verifyDashboardToken(auth.replace('Bearer ', ''), 'test-secret');
    assert.equal(payload.tenant_id, 'tenant_a');
    if (delay) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        init?.signal?.addEventListener('abort', () => { clearTimeout(timer); const e = new Error('aborted'); (e as any).name = 'AbortError'; reject(e); });
      });
    }
    return new Response(JSON.stringify(body), { status, headers: { 'content-type':'application/json' } });
  };
}

test('loaders return happy path and tenant-scoped token', async () => {
  mock();
  const { loadBalances } = await import('../../src/server/loaders/balances');
  const r = await loadBalances();
  assert.equal(r.ok, true);
  assert.equal((r as any).value.data[0].id, 'row_a');
});

test('404 returns err for empty state', async () => {
  mock(404, { code:'not_found', message:'missing' });
  const { pillarFetch } = await import('../../src/server/pillar-client');
  const r = await pillarFetch(undefined, '/balances');
  assert.equal(r.ok, false);
  assert.equal((r as any).status, 404);
});

test('5xx returns error state result', async () => {
  mock(503, { code:'unavailable', message:'down' });
  const { pillarFetch } = await import('../../src/server/pillar-client');
  const r = await pillarFetch(undefined, '/balances');
  assert.equal(r.ok, false);
  assert.equal((r as any).error.code, 'unavailable');
});

test('timeout returns timeout error', async () => {
  mock(200, { ok:true }, 50);
  const { pillarFetch } = await import('../../src/server/pillar-client');
  const r = await pillarFetch(undefined, '/slow', { timeoutMs: 1 });
  assert.equal(r.ok, false);
  assert.equal((r as any).error.code, 'timeout');
});
