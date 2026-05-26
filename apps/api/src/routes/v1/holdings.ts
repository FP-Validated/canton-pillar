import type { FastifyInstance } from 'fastify';
import { renderList } from '../../http/pagination.js';
import { presentHolding } from '../../presenters/index.js';
import { getHolding, listHoldings, projectionExists } from '../../repositories/projection-repo.js';
import { PillarError } from '../../errors/pillar-error.js';

function projectionStale(offset?: string) {
  const err = PillarError.projection('projection_stale_error', 'Projection is stale.');
  err.statusCode = 409;
  (err as any).as_of_ledger_offset = offset;
  return err;
}

export async function holdingsRoutes(s: FastifyInstance) {
  s.get('/holdings', async (r) => {
    const q: any = r.query;
    const rows = await listHoldings(r.accountId, { account: q.account, asset: q.asset, status: q.status, limit: q.limit ? Number(q.limit) : undefined, startingAfter: q.starting_after, endingBefore: q.ending_before });
    if (q.consistency === 'strong' && rows.some(row => row.projection?.stale)) {
      const staleOffset = rows.find(row => row.projection?.stale)?.projection?.as_of_ledger_offset;
      throw projectionStale(staleOffset);
    }
    return renderList('/v1/holdings', rows.map(x => presentHolding({ ...x, livemode: r.auth.livemode })));
  });
  s.get('/holdings/:id', async (r) => {
    const row = await getHolding(r.accountId, (r.params as any).id);
    if (!projectionExists(row)) throw s.httpErrors.notFound('Resource not found.');
    if ((r.query as any)?.consistency === 'strong' && row?.projection?.stale) {
      throw projectionStale(row.projection?.as_of_ledger_offset);
    }
    return presentHolding({ ...row, livemode: r.auth.livemode });
  });
}
