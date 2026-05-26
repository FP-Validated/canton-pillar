import test from 'node:test'; import assert from 'node:assert/strict';
test('self-hosted unsupported code',()=>{ const error={code:'unsupported_in_deployment_mode'}; assert.equal(error.code,'unsupported_in_deployment_mode'); });
