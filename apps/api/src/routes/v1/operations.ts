import type { FastifyInstance } from 'fastify';
import { renderList } from '../../http/pagination.js';
import { operation } from './data.js';
import { presentOperation } from '../../presenters/index.js';
import { getOperationProjection } from '../../repositories/projection-repo.js';
import { PillarError } from '../../errors/pillar-error.js';

function wantsLedgerTrace(r: any) { const raw = r.query?.['expand[]'] ?? r.query?.expand; const vals = Array.isArray(raw) ? raw : raw ? [raw] : []; return vals.includes('ledger_trace'); }
function safeOperation(r: any, id?: string) { return presentOperation({ ...operation(r.auth.livemode), id: id ?? operation(r.auth.livemode).id }); }
function projectionStale(offset?: string) { const err = PillarError.projection('projection_stale_error', 'Projection is stale.'); err.statusCode = 409; (err as any).as_of_ledger_offset = offset; return err; }

export async function operationsRoutes(s: FastifyInstance) {
  s.get('/operations', async r => renderList('/v1/operations', [safeOperation(r)]));
  s.get('/operations/:id', async r => {
    const id = (r.params as any).id;
    const projection = await getOperationProjection(r.accountId, id);
    if ((projection as any).missing) throw s.httpErrors.notFound('Resource not found.');
    if ((r.query as any)?.consistency === 'strong' && projection.projection?.stale) throw projectionStale((projection.projection as any).as_of_ledger_offset);
    const value: any = safeOperation(r, id);
    if (wantsLedgerTrace(r)) value.ledger_trace = { update_id: projection.update_id, ledger_offset: projection.ledger_offset, participant_id: 'participant', synchronizer_id: 'sync' };
    return value;
  });
}
