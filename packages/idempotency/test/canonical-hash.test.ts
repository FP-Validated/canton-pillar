import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalRequestHash } from '../src/index.js';

function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

test('semantically equal canonical request fixtures hash equally', () => {
  assert.equal(canonicalRequestHash(fixture('canonical-equal-a.json')), canonicalRequestHash(fixture('canonical-equal-b.json')));
});

test('different canonical request fixtures hash differently', () => {
  assert.notEqual(canonicalRequestHash(fixture('canonical-equal-a.json')), canonicalRequestHash(fixture('canonical-different.json')));
});
