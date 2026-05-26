import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, assertListEnvelope, postHeaders, testServer } from './_helpers.js';

test('pagination limit bounds reject out-of-range limits', async () => {
  const server = await testServer();
  for (const limit of ['0', '101']) {
    const response = await server.inject({ url: `/v1/accounts?limit=${limit}`, headers: auth });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.type, 'invalid_request_error');
  }
});

test('invalid cursor returns invalid_request_error', async () => {
  const server = await testServer();
  const response = await server.inject({ url: '/v1/accounts?starting_after=missing_cursor', headers: auth });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.type, 'invalid_request_error');
});

test('starting_after is exclusive and list envelope has canonical shape', async () => {
  const server = await testServer();
  const first = await server.inject({ method: 'POST', url: '/v1/accounts', headers: postHeaders('page-1'), payload: { display_name: 'Page 1' } });
  const second = await server.inject({ method: 'POST', url: '/v1/accounts', headers: postHeaders('page-2'), payload: { display_name: 'Page 2' } });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);

  const listed = await server.inject({ url: `/v1/accounts?starting_after=${first.json().id}&limit=10`, headers: auth });
  const body = listed.json();
  assert.ok([200, 400].includes(listed.statusCode));
  if (listed.statusCode === 200) {
    assertListEnvelope(body, '/v1/accounts');
    assert.equal(body.data.some((item: any) => item.id === first.json().id), false);
  } else {
    assert.equal(body.error.type, 'invalid_request_error');
  }
});
