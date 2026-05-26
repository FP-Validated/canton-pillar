import type { FastifyInstance } from 'fastify';
import { renderList } from '../../http/pagination.js';
import { operation } from './data.js';
import { presentOperation } from '../../presenters/index.js';
import { getOperationProjection } from '../../repositories/projection-repo.js';

function wantsLedgerTrace(r: any) { const raw = r.query?.['expand[]'] ?? r.query?.expand; const vals = Array.isArray(raw) ? raw : raw ? [raw] : []; return vals.includes('ledger_trace'); }
function safeOperation(r: any, id?: string) { const base = presentOperation({ ...operation(r.auth.livemode), id: id ?? operation(r.auth.livemode).id }); return base; }
export async function operationsRoutes(s: FastifyInstance) {
  s.get('/operations', async r => renderList('/v1/operations', [safeOperation(r)]));
  s.get('/operations/:id', async r => {
    const id = (r.params as any).id;
    const value: any = safeOperation(r, id);
    if (wantsLedgerTrace(r)) {
      const p = await getOperationProjection(r.accountId, id);
      value.ledger_trace = { update_id: p.update_id, ledger_offset: p.ledger_offset, participant_id: 'participant', synchronizer_id: 'sync' };
    }
    return value;
  });
}
