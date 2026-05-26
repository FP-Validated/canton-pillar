import test from 'node:test';
import assert from 'node:assert/strict';
import { PillarVersionHeader } from '../src/schemas/common.js';
test('PillarVersionHeader accepts date and rejects garbage', () => { assert.equal(PillarVersionHeader.safeParse('2026-05-26').success, true); assert.equal(PillarVersionHeader.safeParse('garbage').success, false); });
