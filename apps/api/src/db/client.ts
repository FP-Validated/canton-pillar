import { createPool } from '@pillar/db';

const DEFAULT_DATABASE_URL = 'postgres://pillar:pillar@localhost:5432/pillar';

export const pool = createPool(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
