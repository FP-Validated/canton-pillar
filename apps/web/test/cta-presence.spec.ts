import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const landing = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../src/components/Nav.tsx', import.meta.url), 'utf8');

test('landing CTA points sign-in with Google at signup and docs at docs', () => {
  assert.match(landing, /primaryCta=\{\{ label: 'Sign in with Google', href: '\/signup' \}\}/);
  assert.match(landing, /secondaryCta=\{\{ label: 'Read the docs', href: '\/docs' \}\}/);
  assert.doesNotMatch(landing, /href: '\/get-api-keys'/);
});

test('navigation exposes signup sign-in link', () => {
  assert.match(nav, /href="\/signup"/);
  assert.match(nav, />\s*Sign in\s*</);
});
