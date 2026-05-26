import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { EndpointTree } from '../../src/components/playground/EndpointTree';

test('EndpointTree renders OpenAPI operations grouped by tag', () => {
  const html = renderToStaticMarkup(<EndpointTree selected="transferIntentscreate" operations={[{ operationId: 'transferIntentscreate', method: 'POST', path: '/transfer_intents', summary: 'Create transfer intent', tags: ['Transfer Intents'], parameters: [] }]} />);
  assert.match(html, /Transfer Intents/);
  assert.match(html, /POST/);
  assert.match(html, /\/playground\/transferIntentscreate/);
});
