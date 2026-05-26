import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, postHeaders, testServer } from './_helpers.js';

test('onboarding create is idempotent and returns onb session', async () => {
  const server = await testServer();
  const a = await server.inject({ method:'POST', url:'/v1/onboarding', headers:postHeaders('onb-create'), payload:{ environment_id:'env_test' } });
  const b = await server.inject({ method:'POST', url:'/v1/onboarding', headers:postHeaders('onb-create'), payload:{ environment_id:'env_test' } });
  assert.equal(a.statusCode, 200);
  assert.match(a.json().id, /^onb_/);
  assert.equal(a.json().id, b.json().id);
});

test('onboarding advance, next action, and cancel', async () => {
  const server = await testServer();
  const created = await server.inject({ method:'POST', url:'/v1/onboarding', headers:postHeaders('onb-flow'), payload:{ environment_id:'env_test' } });
  const id = created.json().id;
  const advanced = await server.inject({ method:'POST', url:`/v1/onboarding/${id}/advance`, headers:postHeaders('onb-advance'), payload:{ step:'organization', input:{ accepted_terms:true } } });
  assert.equal(advanced.json().current_step, 'kyb');
  const next = await server.inject({ method:'GET', url:`/v1/onboarding/${id}/next_action`, headers:auth });
  assert.equal(next.statusCode, 200);
  const canceled = await server.inject({ method:'POST', url:`/v1/onboarding/${id}/cancel`, headers:postHeaders('onb-cancel'), payload:{} });
  assert.equal(canceled.json().status, 'canceled');
});
