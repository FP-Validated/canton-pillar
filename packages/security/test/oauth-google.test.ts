import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, test } from 'node:test';
import { verifyIdToken, OAuthVerificationError } from '../src/oauth/google.js';
import { clearJwksCacheForTest } from '../src/oauth/jwks.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
const kid = 'kid_test';
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearJwksCacheForTest();
});

function stubKeys(keys: Array<JsonWebKey & { kid: string }>) {
  globalThis.fetch = async () => new Response(JSON.stringify({ keys }), { status: 200, headers: { 'content-type': 'application/json' } });
}
function b64(value: unknown) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function token(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid }) {
  const h = b64(header);
  const p = b64(payload);
  const sig = sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url');
  return `${h}.${p}.${sig}`;
}
function payload(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { sub: 'sub_1', email: 'a@example.com', email_verified: true, aud: 'client_1', iss: 'https://accounts.google.com', exp: now + 600, iat: now, ...overrides };
}
async function expectCode(idToken: string, code: string) {
  await assert.rejects(() => verifyIdToken(idToken, { audience: 'client_1' }), (err) => err instanceof OAuthVerificationError && err.code === code);
}

test('verifyIdToken validates an RS256 Google ID token', async () => {
  stubKeys([{ ...jwk, kid }]);
  const result = await verifyIdToken(token(payload()), { audience: 'client_1' });
  assert.equal(result.sub, 'sub_1');
  assert.equal(result.email, 'a@example.com');
});

test('verifyIdToken exposes specific failure codes', async () => {
  stubKeys([{ ...jwk, kid }]);
  await expectCode(token(payload(), { alg: 'RS256', kid: 'missing' }), 'jwk_not_found');
  await expectCode(`${token(payload()).slice(0, -1)}x`, 'signature_invalid');
  await expectCode(token(payload({ aud: 'other' })), 'audience_mismatch');
  await expectCode(token(payload({ iss: 'https://issuer.example' })), 'issuer_mismatch');
  await expectCode(token(payload({ exp: Math.floor(Date.now() / 1000) - 301 })), 'token_expired');
  await expectCode(token(payload({ iat: Math.floor(Date.now() / 1000) + 301 })), 'token_not_yet_valid');
});
