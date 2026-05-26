import test from 'node:test';
import { auth, assertNoForbiddenPublicFields, postHeaders, testServer } from './_helpers.js';

test('sample 200 responses contain no forbidden Canton substrings', async () => {
  const server = await testServer();
  const account = await server.inject({ method: 'POST', url: '/v1/accounts', headers: postHeaders('forbid-account'), payload: { display_name: 'Forbidden Check' } });
  const asset = await server.inject({ method: 'POST', url: '/v1/assets', headers: postHeaders('forbid-asset'), payload: { code: 'USD', name: 'Dollar', scale: 2, transferable: true, redeemable: true } });
  const intent = await server.inject({ method: 'POST', url: '/v1/transfer_intents', headers: postHeaders('forbid-intent'), payload: { amount: '1', asset: 'asst_demo', from_account: 'acct_aaaa', to_account: 'acct_bbbb' } });
  const operation = await server.inject({ url: '/v1/operations/op_demo', headers: auth });
  const balances = await server.inject({ url: '/v1/balances', headers: auth });
  const holdings = await server.inject({ url: '/v1/holdings', headers: auth });
  const events = await server.inject({ url: '/v1/events', headers: auth });
  for (const response of [account, asset, intent, operation, balances, holdings, events]) assertNoForbiddenPublicFields(response.json());
});
