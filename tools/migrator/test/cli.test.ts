import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('cli plan loads', () => {
  const builtCli = fileURLToPath(new URL('../dist/src/bin/migrator.js', import.meta.url));
  const r = spawnSync(process.execPath, [builtCli, 'plan'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env },
    encoding: 'utf8',
  });

  if (!process.env.DATABASE_URL) return;
  assert.equal(r.status, 0, `migrator command failed: ${r.stderr}`);
});
