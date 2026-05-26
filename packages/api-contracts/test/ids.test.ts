import test from 'node:test';
import assert from 'node:assert/strict';
import * as ids from '../src/schemas/ids.js';
const suffix = '01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z';
const pairs = [['acct_', ids.AccountId], ['asst_', ids.AssetId], ['bal_', ids.BalanceId], ['hld_', ids.HoldingId], ['issint_', ids.IssueIntentId], ['redint_', ids.RedeemIntentId], ['trint_', ids.TransferIntentId], ['hold_', ids.HoldId], ['op_', ids.OperationId], ['evt_', ids.EventId], ['we_', ids.WebhookEndpointId], ['ak_', ids.ApiKeyId], ['req_', ids.RequestId]] as const;
test('ids accept own prefix and reject wrong prefix', () => { for (const [prefix, schema] of pairs) { assert.equal(schema.safeParse(prefix + suffix).success, true); assert.equal(schema.safeParse('bad_' + suffix).success, false); } });
