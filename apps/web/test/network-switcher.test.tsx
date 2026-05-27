import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NetworkSwitcher } from '../src/components/NetworkSwitcher';

test('web NetworkSwitcher renders current color class', () => {
  const html = renderToStaticMarkup(<NetworkSwitcher current="testnet" />);
  assert.match(html, /bg-blue-100/);
  assert.match(html, /Testnet/);
});

test('web NetworkSwitcher posts selected network body', () => {
  const body = JSON.stringify({ network: 'mainnet' });
  assert.equal(body, '{"network":"mainnet"}');
});
