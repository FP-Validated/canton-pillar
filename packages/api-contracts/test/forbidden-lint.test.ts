import test from 'node:test';
import assert from 'node:assert/strict';
import { scanText } from '../scripts/forbidden-substring-lint.js';
test('forbidden lint allow marker works', () => { const competitor = 'stri' + 'pe'; assert.equal(scanText('safe line').length, 0); assert.equal(scanText(`contains ${competitor}`).length, 1); assert.equal(scanText('backend canton // allowed: canton').length, 0); });
