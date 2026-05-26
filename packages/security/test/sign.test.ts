import assert from 'node:assert/strict';
import test from 'node:test';
import one from '../src/webhook/test-vectors/one-secret.json' assert { type: 'json' };
import { buildSignatureHeader, signWebhookPayload } from '../src/index.js';

test('signs exact raw body bytes and builds exact header', () => {
  const signature = signWebhookPayload(one.secrets[0], one.timestamp, Buffer.from(one.rawBody));
  assert.equal(signature, one.header.split('v1=')[1]);
  assert.equal(buildSignatureHeader([{ timestamp: one.timestamp, signature }]), one.header);
});
