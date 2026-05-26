import pg from 'pg';
import { createPool } from '../../../../packages/db/src/index.js';

const DEFAULT_DATABASE_URL = 'postgres://pillar:pillar@localhost:5432/pillar';

export const pool = process.env.PILLAR_DB === 'memory'
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL })
  : createPool(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
