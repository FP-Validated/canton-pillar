import type { FastifyInstance } from 'fastify';
import { renderList } from '../../http/pagination.js';
import { presentBalance } from '../../presenters/index.js';
import { getBalance, getOperationProjection, listBalances, projectionExists } from '../../repositories/projection-repo.js';
import { PillarError } from '../../errors/pillar-error.js';

function projectionStale(offset?: string) {
  const err = PillarError.projection('projection_stale_error', 'Projection is stale.');
  err.statusCode = 409;
  (err as any).as_of_ledger_offset = offset;
  return err;
}

export async function balancesRoutes(s: FastifyInstance) {
  s.get('/balances', async (r, reply) => {
    const q: any = r.query;
    if (q.consistency === 'wait_for_operation') {
      if (!q.operation) throw s.httpErrors.badRequest('operation is required for wait_for_operation');
      const op = await getOperationProjection(r.accountId, q.operation);
      if (!op) throw s.httpErrors.notFound('Resource not found.');
      if (q.simulate_lag === 'true') return reply.code(202).send({ object: 'projection_pending', operation: q.operation, projection_lag: { seconds: 31, status: 'behind' } });
      if (op.status !== 'projected') return reply.code(202).send({ object: 'projection_pending', operation: q.operation, projection_lag: { seconds: 1, status: 'pending' } });
    }
    const rows = await listBalances(r.accountId, { account: q.account, asset: q.asset, limit: q.limit ? Number(q.limit) : undefined, startingAfter: q.starting_after, endingBefore: q.ending_before });
    if (q.consistency === 'strong' && rows.some(row => row.projection?.stale)) {
      const staleOffset = rows.find(row => row.projection?.stale)?.projection?.as_of_ledger_offset;
      throw projectionStale(staleOffset);
    }
    return renderList('/v1/balances', rows.map(x => presentBalance({ ...x, livemode: r.auth.livemode })));
  });
  s.get('/balances/:id', async (r) => {
    const row = await getBalance(r.accountId, r.accountId, (r.params as any).id);
    if (!projectionExists(row)) throw s.httpErrors.notFound('Resource not found.');
    if ((r.query as any)?.consistency === 'strong' && row?.projection?.stale) {
      throw projectionStale(row.projection?.as_of_ledger_offset);
    }
    return presentBalance({ ...row, id: (r.params as any).id, livemode: r.auth.livemode });
  });
}
