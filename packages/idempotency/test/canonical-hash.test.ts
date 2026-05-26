import test from 'node:test';import assert from 'node:assert/strict';import { readFileSync } from 'node:fs';import { canonicalRequestHash } from '../src/index.js';
test('fixture hashes pass',()=>{const f=JSON.parse(readFileSync(new URL('../fixtures/transfer_intent.json', import.meta.url),'utf8')); assert.equal(canonicalRequestHash(f.input), f.expected_hash);});
