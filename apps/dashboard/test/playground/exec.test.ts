import assert from 'node:assert/strict';
import test from 'node:test';
import { executePlaygroundRequest } from '../../src/server/playground/exec';

process.env.PILLAR_DASHBOARD_TEST_SESSION = JSON.stringify({ user:{id:'user_a',email:'a@example.com'}, memberships:[{tenant:{id:'tenant_a',slug:'a',display_name:'A'},role:'admin'}], active_tenant_id:'tenant_a' });
process.env.PILLAR_API_BASE_URL = 'http://pillar.test';
process.env.PILLAR_DASHBOARD_JWT_SECRET = 'test-secret';
test('executePlaygroundRequest injects idempotency key and Pillar-Version', async () => {
  const calls: any[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init: any) => {
    calls.push(init);
    return new Response(JSON.stringify({ id: 'ti_123', operation: 'op_123' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as any;
  try {
    const result = await executePlaygroundRequest({ method: 'POST', path: '/transfer_intents', body: { amount: '100.00' } });
    assert.equal(result.status, 200);
    assert.equal(result.operationLink, '/dashboard/operations/op_123');
    const headers = calls[0].headers as Headers;
    assert.equal(headers.get('pillar-version'), '2026-05-26');
    assert.match(headers.get('idempotency-key') ?? '', /^[0-9a-f-]{36}$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
