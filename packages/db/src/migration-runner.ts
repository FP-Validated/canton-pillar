import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const currentFileDir = dirname(fileURLToPath(import.meta.url));
const packageRoot =
  currentFileDir.endsWith('/dist/src') || currentFileDir.endsWith('\\dist\\src')
    ? dirname(dirname(currentFileDir))
    : basename(currentFileDir) === 'src'
      ? dirname(currentFileDir)
      : currentFileDir;
const defaultMigrationsRoot = `${packageRoot}/migrations`;
const migrationLockKey = BigInt.asIntN(
  64,
  BigInt('0x' + createHash('sha256').update('pillar_migration').digest('hex').slice(0, 16)),
).toString();

export type Migration = { name: string; sql: string; checksum: string; variant: 'versioned' | 'repeatable' };

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.sql')) out.push(p);
  }
  return out;
}

export async function loadMigrations(root = defaultMigrationsRoot): Promise<Migration[]> {
  const files = (await walk(root)).sort();
  return Promise.all(
    files.map(async f => {
      const sql = await readFile(f, 'utf8');
      const name = relative(root, f).replaceAll('\\', '/');
      return {
        name,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
        variant: name.startsWith('repeatable/') ? 'repeatable' : 'versioned',
      };
    }),
  );
}

export class MigrationRunner {
  constructor(private pool: pg.Pool, private root?: string) {}

  async ensureLedger(c: pg.PoolClient) {
    await c.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now(), variant text not null check (variant in ('versioned','repeatable')))",
    );
  }

  async applied() {
    const c = await this.pool.connect();
    try {
      await this.ensureLedger(c);
      const r = await c.query('select * from _migrations order by name');
      return r.rows;
    } finally {
      c.release();
    }
  }

  async plan() {
    const migrations = await loadMigrations(this.root);
    const applied = new Map((await this.applied()).map((r: any) => [r.name, r]));
    return migrations.filter(
      m => !applied.has(m.name) || (m.variant === 'repeatable' && applied.get(m.name).checksum !== m.checksum),
    );
  }

  async up() {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await this.ensureLedger(c);
      await c.query('SELECT pg_advisory_xact_lock($1::bigint)', [migrationLockKey]);

      const migrations = await loadMigrations(this.root);
      for (const m of migrations) {
        const prev = await c.query('select checksum,variant from _migrations where name=$1', [m.name]);
        if (prev.rowCount && prev.rows[0].checksum !== m.checksum && m.variant === 'versioned') {
          throw new Error(`checksum drift: ${m.name}`);
        }
        if (prev.rowCount && prev.rows[0].checksum === m.checksum) continue;

        await c.query(m.sql);
        await c.query(
          'insert into _migrations(name,checksum,variant) values($1,$2,$3) on conflict(name) do update set checksum=excluded.checksum, applied_at=now(), variant=excluded.variant',
          [m.name, m.checksum, m.variant],
        );
      }

      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  async status() {
    const migrations = await loadMigrations(this.root);
    const applied = new Map((await this.applied()).map((r: any) => [r.name, r]));
    return migrations.map(m => ({
      name: m.name,
      applied: applied.has(m.name),
      checksum: m.checksum,
      drift: applied.has(m.name) && applied.get(m.name).checksum !== m.checksum,
    }));
  }

  async dryRun() {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await this.ensureLedger(c);
      for (const m of await this.plan()) await c.query(m.sql);
      await c.query('ROLLBACK');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}
