import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSnippets } from '@pillar/api-contracts';

test('playground snippet generators are deterministic', () => {
  const snippets = generateSnippets({
    method: 'post',
    path: '/transfer_intents',
    query: { expand: 'operation' },
    headers: { 'Pillar-Version': '2026-05-26' },
    body: { amount: '100.00', asset: 'USD' },
  });

  assert.equal(Object.keys(snippets).length, 4);
  assert.match(snippets.curl, /curl --request POST/);
  assert.match(snippets.curl, /--header 'Authorization: Bearer \$PILLAR_API_KEY'/);
  assert.match(snippets.node, /@pillar\/sdk-node/);
  assert.match(snippets.python, /pillar_sdk_python/);
  assert.match(snippets.java, /com\.pillar\.PillarClient/);
  assert.deepEqual(snippets, generateSnippets({
    method: 'post',
    path: '/transfer_intents',
    query: { expand: 'operation' },
    headers: { 'Pillar-Version': '2026-05-26' },
    body: { amount: '100.00', asset: 'USD' },
  }));
});
