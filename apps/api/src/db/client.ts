import pg from 'pg';
import { demoDataEnabled } from '../config/runtime-mode.js';

const poolOptions = {
  max: 20,
  min: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
  statement_timeout: 10_000,
};

export function makePool() {
  if (process.env.PILLAR_IDEMPOTENCY === 'memory' || process.env.PILLAR_DB === 'memory') {
    return new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://pillar:pillar@localhost:5432/pillar', ...poolOptions });
  }
  if (!process.env.DATABASE_URL && demoDataEnabled()) {
    return new pg.Pool({ connectionString: 'postgres://pillar:pillar@localhost:5432/pillar', ...poolOptions });
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required outside PILLAR_DEMO_DATA=true mode');
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, ...poolOptions });
}

export const pool = makePool();

export async function selectOne(): Promise<number> {
  if (process.env.PILLAR_IDEMPOTENCY === 'memory' || process.env.PILLAR_DB === 'memory' || (!process.env.DATABASE_URL && demoDataEnabled())) return 1;
  const result = await pool.query('select 1 as ok');
  return Number(result.rows[0]?.ok ?? 0);
}
