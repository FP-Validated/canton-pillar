import test from 'node:test';
import assert from 'node:assert/strict';
import { Metadata } from '../src/schemas/common.js';
test('metadata limits are enforced', () => { assert.equal(Metadata.safeParse(Object.fromEntries(Array.from({length:51},(_,i)=>[`k${i}`,'v']))).success, false); assert.equal(Metadata.safeParse({'':'v'}).success, false); assert.equal(Metadata.safeParse({['x'.repeat(41)]:'v'}).success, false); assert.equal(Metadata.safeParse({ok:'x'.repeat(501)}).success, false); assert.equal(Metadata.safeParse({'bad[key]':'v'}).success, false); assert.equal(Metadata.safeParse({ok:''}).success, true); });
