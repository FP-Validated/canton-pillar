import { pillarFetch, request } from './common';
export async function loadOverview() {
  const [usage, operations, health] = await Promise.all([
    pillarFetch<any>(request, '/usage/current_period'),
    pillarFetch<any>(request, '/operations?limit=10&status=ledger_committed'),
    pillarFetch<any>(request, '/health')
  ]);
  return { usage, operations, health };
}
