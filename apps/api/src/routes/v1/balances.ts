import type { FastifyInstance } from 'fastify';
import { renderList } from '../../http/pagination.js';
import { presentBalance } from '../../presenters/index.js';
import { getBalance, getOperationProjection, listBalances } from '../../repositories/projection-repo.js';

export async function balancesRoutes(s: FastifyInstance) {
  s.get('/balances', async (r, reply) => {
    const q: any = r.query;
    if (q.consistency === 'wait_for_operation') {
      if (!q.operation) throw s.httpErrors.badRequest('operation is required for wait_for_operation');
      const op = await getOperationProjection(r.accountId, q.operation);
      if (q.simulate_lag === 'true') return reply.code(202).send({ object: 'projection_pending', operation: q.operation, projection_lag: { seconds: 31, status: 'behind' } });
      if (op.status !== 'projected') return reply.code(202).send({ object: 'projection_pending', operation: q.operation, projection_lag: { seconds: 1, status: 'pending' } });
    }
    const rows = await listBalances(r.accountId, { account: q.account, asset: q.asset, limit: q.limit ? Number(q.limit) : undefined, startingAfter: q.starting_after, endingBefore: q.ending_before });
    return renderList('/v1/balances', rows.map(x => presentBalance({ ...x, livemode: r.auth.livemode })));
  });
  s.get('/balances/:id', async (r) => {
    const row = await getBalance(r.accountId, r.accountId, (r.params as any).id);
    return presentBalance({ ...row, id: (r.params as any).id, livemode: r.auth.livemode });
  });
}
