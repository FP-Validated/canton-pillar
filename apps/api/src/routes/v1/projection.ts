import type { FastifyInstance } from 'fastify';
import { PillarError } from '../../errors/pillar-error.js';
import { renderList } from '../../http/pagination.js';
import { balance, holding } from './data.js';
import { presentBalance, presentHolding } from '../../presenters/index.js';
export async function balancesRoutes(s:FastifyInstance){ s.get('/balances', async(r)=>{ if((r.query as any).consistency==='strict') throw PillarError.projection(); const b=presentBalance(balance(r.auth.livemode)); return renderList('/v1/balances',[b]);}); s.get('/balances/:id', async(r)=> presentBalance({...balance(r.auth.livemode), id:(r.params as any).id})); }
export async function holdingsRoutes(s:FastifyInstance){ s.get('/holdings', async(r)=>{ if((r.query as any).consistency==='strict') throw PillarError.projection(); const h=presentHolding(holding(r.auth.livemode)); return renderList('/v1/holdings',[h]);}); s.get('/holdings/:id', async(r)=> presentHolding({...holding(r.auth.livemode), id:(r.params as any).id})); }
