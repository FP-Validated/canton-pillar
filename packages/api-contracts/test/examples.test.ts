import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('every example validates via golden runner', () => { execFileSync('pnpm', ['exec','tsx','scripts/golden-runner.ts'], { cwd: process.cwd(), stdio: 'pipe' }); });
