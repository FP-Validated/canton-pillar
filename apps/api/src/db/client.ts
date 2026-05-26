import pg from 'pg';
import { createPool } from '../../../../packages/db/src/index.js';
import { demoDataEnabled } from '../config/runtime-mode.js';

export function makePool() {
  if (process.env.PILLAR_IDEMPOTENCY === 'memory' || process.env.PILLAR_DB === 'memory') {
    return new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://pillar:pillar@localhost:5432/pillar' });
  }
  if (!process.env.DATABASE_URL && demoDataEnabled()) {
    return new pg.Pool({ connectionString: 'postgres://pillar:pillar@localhost:5432/pillar' });
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required outside PILLAR_DEMO_DATA=true mode');
  return createPool(process.env.DATABASE_URL);
}

export const pool = makePool();
