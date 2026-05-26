import test from 'node:test'; import assert from 'node:assert/strict'; import { mkdtempSync, readFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { emitUsageAccepted } from '../src/middleware/usage-emit.js';
const base = { tenant_id:'t', environment_id:'e', deployment_mode:'managed', livemode:false, meter:'intent.created', request_id:'req', attributes:{} };
test('non-blocking and replay no double-count',()=>{ const r=emitUsageAccepted({...base, idempotent_replay:true}, { publishNonBlocking:()=>true }); assert.equal(r.envelope.meter,'api.request.replayed'); assert.equal(r.envelope.billable,false); });
test('fallback file on stream outage',()=>{ const file=join(mkdtempSync(join(tmpdir(),'usage-')),'fallback.ndjson'); emitUsageAccepted(base, { publishNonBlocking:()=>false }, file); assert.match(readFileSync(file,'utf8'), /intent.created/); });
