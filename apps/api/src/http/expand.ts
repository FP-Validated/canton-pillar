import { PillarError } from '../errors/pillar-error.js';
const allowed = new Set(['asset','account','latest_operation','data.asset','data.account','data.latest_operation','ledger_trace']);
export function parseExpand(q: Record<string, unknown>, admin=false) {
  const raw = q['expand[]'] ?? q.expand;
  const vals = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).flatMap(v => v.split(','));
  for (const v of vals) {
    if (v.split('.').length > 4 || !allowed.has(v)) throw PillarError.invalid('unsupported_expand',`Unsupported expansion: ${v}`,'expand');
    if (v.includes('ledger_trace') && !admin) throw PillarError.permission('Admin scope required.');
  }
  return vals;
}
