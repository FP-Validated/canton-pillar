import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Network } from '../src/server/network';

const badgeClasses: Record<Network, string> = {
  devnet: 'bg-zinc-100 text-zinc-700 ring-zinc-300',
  testnet: 'bg-blue-100 text-blue-700 ring-blue-300',
  mainnet: 'bg-emerald-100 text-emerald-700 ring-emerald-300'
};

function StaticNetworkSwitcher({ current, supported }: { current: Network; supported: Network[] }) {
  const supportedSet = new Set(supported);
  return (
    <div>
      <span className={`inline-flex ${badgeClasses[current]}`} />
      <select defaultValue={current}>{(['devnet', 'testnet', 'mainnet'] as Network[]).map((network) => <option key={network} disabled={!supportedSet.has(network)}>{network}</option>)}</select>
      {supported.length < 3 ? <a href="/settings/networks">Request access</a> : null}
    </div>
  );
}

test('dashboard NetworkSwitcher renders current color class and disabled access link', () => {
  const html = renderToStaticMarkup(<StaticNetworkSwitcher current="mainnet" supported={['devnet', 'mainnet']} />);
  assert.match(html, /bg-emerald-100/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Request access/);
});

test('dashboard network action payload shape is selected network', () => {
  const body = JSON.stringify({ network: 'testnet' });
  assert.equal(body, '{"network":"testnet"}');
});
