import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenApi } from '../src/build-openapi.js';
test('mutating operations require Idempotency-Key', () => { const doc = buildOpenApi() as any; for (const [path, item] of Object.entries<any>(doc.paths)) for (const method of ['post','patch','delete']) if (item[method]) { const names = (item[method].parameters ?? []).filter((p:any)=>p.required).map((p:any)=>p.name); assert.ok(names.includes('Idempotency-Key'), `${method.toUpperCase()} ${path}`); } });
