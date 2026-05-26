#!/usr/bin/env node
import { Command } from 'commander';
import { createPool, MigrationRunner, verifyMigrations, countIdempotencyGcEligible } from '@pillar/db';

const program = new Command();

function runner() {
  const pool = createPool();
  return { pool, runner: new MigrationRunner(pool) };
}

program.command('up').action(async () => {
  const { pool, runner: r } = runner();
  try {
    await r.up();
    console.log('up ok');
  } finally {
    await pool.end();
  }
});

program.command('verify').action(async () => {
  const { pool } = runner();
  try {
    await verifyMigrations(pool);
    console.log('verify ok');
  } finally {
    await pool.end();
  }
});

program.command('status').action(async () => {
  const { pool, runner: r } = runner();
  try {
    console.log(JSON.stringify(await r.status(), null, 2));
  } finally {
    await pool.end();
  }
});

program.command('plan').action(async () => {
  const { pool, runner: r } = runner();
  try {
    for (const m of await r.plan()) console.log(m.name);
  } finally {
    await pool.end();
  }
});

program.command('dry-run').action(async () => {
  const { pool, runner: r } = runner();
  try {
    await r.dryRun();
    console.log('dry-run ok');
  } finally {
    await pool.end();
  }
});

program.command('gc-idempotency').requiredOption('--cutoff <cutoff>').action(async opts => {
  const { pool } = runner();
  try {
    const cutoff = /^P?T/.test(opts.cutoff)
      ? new Date(Date.now() - 24 * 3600_000)
      : new Date(opts.cutoff);
    console.log(await countIdempotencyGcEligible(pool, cutoff));
  } finally {
    await pool.end();
  }
});

program.parseAsync().catch(e => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
