import test from 'node:test'; import assert from 'node:assert/strict';
test('dispute carries structured evidence',()=>{ const dispute={status:'submitted', evidence:{reason:'metering'}}; assert.equal(dispute.evidence.reason,'metering'); });
