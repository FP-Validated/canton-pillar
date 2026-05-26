import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountStatus, ApiKeyStatus, AssetStatus, HoldStatus, HoldingStatus, IntentStatus, OperationStatus, WebhookEndpointStatus } from '../src/schemas/index.js';
const cases = [
 [IntentStatus, ['requires_action','processing','succeeded','failed','canceled','expired']], [OperationStatus, ['received','queued','submitted','in_flight','ledger_committed','projected','failed','unknown','reconciled']], [AccountStatus, ['active','restricted','suspended','closed']], [AssetStatus, ['draft','active','paused','retired']], [HoldingStatus, ['active','partially_reserved','reserved','frozen','redeeming','closed']], [HoldStatus, ['requires_action','active','released','expired','failed']], [WebhookEndpointStatus, ['enabled','disabled']], [ApiKeyStatus, ['active','expired','revoked']]
] as const;
test('status enums have exact values', () => { for (const [schema, values] of cases) { assert.deepEqual(schema.options, values); assert.equal(schema.safeParse('other').success, false); } });
