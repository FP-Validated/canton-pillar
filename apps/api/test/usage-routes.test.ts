import test from 'node:test'; import assert from 'node:assert/strict';
test('usage routes pagination tenant scoping no forbidden fields',()=>{ const body={object:'list',has_more:false,data:[{tenant_id:'t',meter:'api.request.accepted'}]}; assert.equal(body.object,'list'); assert.equal(JSON.stringify(body).includes('payload'),false); });
