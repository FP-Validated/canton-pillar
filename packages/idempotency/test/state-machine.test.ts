import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { IdempotencyStore } from '../src/index.js';

test('state machine replay and conflict', async t => {
  if (!process.env.DATABASE_URL) return;

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  t.after(() => pool.end());

  await pool.query('delete from idempotency_keys');

  const s = new IdempotencyStore(pool);
  assert.equal((await s.claim('t', 'k', 'h')).status, 'new');
  assert.equal((await s.claim('t', 'k', 'x')).status, 'conflict');
  await s.complete('t', 'k', 200, { ok: true });
  assert.equal((await s.claim('t', 'k', 'h')).status, 'completed');
});
