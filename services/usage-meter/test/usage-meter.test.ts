import test from 'node:test'; import assert from 'node:assert/strict';
import { StreamConsumer } from '../src/consumer/StreamConsumer.js';
import { rebuildRollup } from '../src/rollups/HourlyRollup.js';
import { RollupReconciler } from '../src/reconciliation/RollupReconciler.js';
const env = { tenant_id:'t', environment_id:'e', deployment_mode:'managed', livemode:false, meter:'api.request.accepted', quantity:'1', unit:'count', source_service:'api', source_event_time:new Date().toISOString(), request_id:'req', dedupe_key:'d', billable:true, attributes:{} };
test('dedup and unknown meter rejected', () => { const c = new StreamConsumer(); assert.equal(c.consume(env), true); assert.equal(c.consume(env), false); assert.throws(()=>c.consume({...env, dedupe_key:'x', meter:'bad'})); });
test('rollup byte-equal repeated run and replay nonbillable', () => { const events = [{...env}, {...env, dedupe_key:'r', meter:'api.request.replayed', billable:false}]; const a = JSON.stringify(rebuildRollup(events,'hour','2026-05-01T00:00:00.000Z','2026-05-01T01:00:00.000Z')); const b = JSON.stringify(rebuildRollup(events,'hour','2026-05-01T00:00:00.000Z','2026-05-01T01:00:00.000Z')); assert.equal(a,b); assert.match(a, /"quantity":"1"/); });
test('reconciliation mismatch blocks close', () => { assert.throws(()=>new RollupReconciler().blockMonthlyClose([env], [])); });
