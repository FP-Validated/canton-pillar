import type { FastifyInstance } from 'fastify';
import { renderList } from '../../http/pagination.js';
import { presentHolding } from '../../presenters/index.js';
import { getHolding, listHoldings } from '../../repositories/projection-repo.js';

export async function holdingsRoutes(s: FastifyInstance) {
  s.get('/holdings', async (r) => {
    const q: any = r.query;
    const rows = await listHoldings(r.accountId, { account: q.account, asset: q.asset, status: q.status, limit: q.limit ? Number(q.limit) : undefined, startingAfter: q.starting_after, endingBefore: q.ending_before });
    return renderList('/v1/holdings', rows.map(x => presentHolding({ ...x, livemode: r.auth.livemode })));
  });
  s.get('/holdings/:id', async (r) => presentHolding({ ...(await getHolding(r.accountId, (r.params as any).id)), livemode: r.auth.livemode }));
}
