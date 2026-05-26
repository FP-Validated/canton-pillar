import type pg from 'pg';
import { loadMigrations } from './migration-runner.js';
export function extractVerifyBlocks(sql:string): string[] { const out:string[]=[]; const re=/-- verify:\n([\s\S]*?)-- \/verify/g; let m; while((m=re.exec(sql))) out.push(m[1].trim()); return out; }
export async function verifyMigrations(pool: pg.Pool, root?: string) { for (const m of await loadMigrations(root)) for (const block of extractVerifyBlocks(m.sql)) { const statements=block.split(';').map(s=>s.trim()).filter(Boolean); for(const s of statements){ const r=await pool.query(s); const ok=r.rows.length>0 && Object.values(r.rows[0]).some(Boolean); if(!ok) throw new Error(`verify failed: ${m.name}: ${s}`); } } return true; }
