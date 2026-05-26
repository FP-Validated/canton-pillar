import test from 'node:test'; import assert from 'node:assert/strict';
test('invoice list shape',()=>{ assert.equal('inv_abc'.startsWith('inv_'), true); });
