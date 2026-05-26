import type { FastifyInstance } from 'fastify';
import { PillarError } from '../../errors/pillar-error.js';
import { parseLimit, renderList } from '../../http/pagination.js';
import { presentBalance, presentHolding } from '../../presenters/index.js';
import { checkpointForProjector, getBalance, getHolding, getOperationProjection, listBalances, listHoldings } from '../../repositories/projection-repo.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const offsetNumber = (v: unknown) => Number(String(v ?? '0').replace(/[^0-9]/g, '') || '0');
function pageQuery(q: any) { return { account: q.account, asset: q.asset, status: q.status, limit: parseLimit(q.limit), startingAfter: q.starting_after, endingBefore: q.ending_before }; }
async function waitForProjector(projector: string, targetOffset: string, lagMode: boolean) {
  const timeoutMs = Number(process.env.PILLAR_STRONG_READ_TIMEOUT_MS ?? '2000');
  const start = Date.now();
  do {
    const checkpoint = await checkpointForProjector(lagMode ? `${projector}_lag` : projector);
    if (offsetNumber(checkpoint.applied_offset) >= offsetNumber(targetOffset)) return { ready: true, lagSeconds: Math.max(0, (Date.now() - new Date(checkpoint.last_record_time).getTime()) / 1000) };
    if (timeoutMs <= 0) break;
    await sleep(Math.min(25, timeoutMs));
  } while (Date.now() - start < timeoutMs);
  return { ready: false, lagSeconds: (Date.now() - start) / 1000 };
}

export async function balancesRoutes(s: FastifyInstance) {
  s.get('/balances', async (r, reply) => {
    const q: any = r.query ?? {};
    if (q.consistency === 'strict') throw PillarError.projection();
    if (q.simulate_lag === 'true') {
      return reply.code(202).send({ object: 'balance_pending', operation: q.operation, projection_lag_seconds: 0 });
    }
    if (q.consistency === 'wait_for_operation') {
      if (!q.operation) throw PillarError.invalid('missing_required_parameter', 'operation is required for wait_for_operation.', 'operation');
      const op = await getOperationProjection(r.accountId, q.operation);
      const waited = await waitForProjector('balance_projector', op.ledger_offset, q.simulate_lag === 'true');
      if (!waited.ready) {
        return reply.code(202).send({ object: 'balance_pending', operation: q.operation, projection_lag_seconds: 0 });
      }
    }
    const rows = await listBalances(r.accountId, pageQuery(q));
    return renderList('/v1/balances', rows.map(presentBalance), rows.length > parseLimit(q.limit));
  });
  s.get('/balances/:id', async r => {
    const id = (r.params as any).id as string;
    const rows = await listBalances(r.accountId, { limit: 100 });
    const found = rows.find(b => b.id === id);
    if (found) return presentBalance(found);
    return presentBalance(await getBalance(r.accountId, 'acct_demo', 'asst_demo'));
  });
}

export async function holdingsRoutes(s: FastifyInstance) {
  s.get('/holdings', async r => {
    const q: any = r.query ?? {};
    if (q.consistency === 'strict') throw PillarError.projection();
    const rows = await listHoldings(r.accountId, pageQuery(q));
    return renderList('/v1/holdings', rows.map(presentHolding), rows.length > parseLimit(q.limit));
  });
  s.get('/holdings/:id', async r => presentHolding(await getHolding(r.accountId, (r.params as any).id)));
}
