import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const startRoute = readFileSync(new URL('../src/app/signup/start/route.ts', import.meta.url), 'utf8');
const callbackRoute = readFileSync(new URL('../src/app/signup/callback/route.ts', import.meta.url), 'utf8');
const signupPage = readFileSync(new URL('../src/app/signup/page.tsx', import.meta.url), 'utf8');
const loginPage = readFileSync(new URL('../src/app/login/page.tsx', import.meta.url), 'utf8');

test('signup start posts to the OAuth start endpoint and redirects to authorization_url', () => {
  assert.match(startRoute, /method: 'POST'/);
  assert.match(startRoute, /\/auth\/oauth\/google\/start/);
  assert.match(startRoute, /return_to: signupRedirect\(\)/);
  assert.match(startRoute, /NextResponse\.redirect\(body\.authorization_url, 303\)/);
});

test('signup callback exchanges code and state, forwards pillar_session, and redirects to dashboard', () => {
  assert.match(callbackRoute, /searchParams\.get\('code'\)/);
  assert.match(callbackRoute, /searchParams\.get\('state'\)/);
  assert.match(callbackRoute, /\/auth\/oauth\/google\/callback/);
  assert.match(callbackRoute, /startsWith\('pillar_session='\)/);
  assert.match(callbackRoute, /headers\.append\('set-cookie', sessionCookie\)/);
  assert.match(callbackRoute, /body\.return_to \?\? signupRedirect\(\)/);
});

test('signup callback failures render structured signup errors', () => {
  assert.match(callbackRoute, /\/signup\?error=/);
  assert.match(signupPage, /role="alert"/);
  assert.match(signupPage, /invalid_oauth_state/);
  assert.match(signupPage, /hosted_domain_not_allowed/);
  assert.match(signupPage, /oauth_callback_failed/);
});

test('login redirects returning users with an existing session cookie', () => {
  assert.match(loginPage, /cookies\(\)\.has\('pillar_session'\)/);
  assert.match(loginPage, /redirect\('\/dashboard'\)/);
  assert.match(loginPage, /Continue with Google/);
});
