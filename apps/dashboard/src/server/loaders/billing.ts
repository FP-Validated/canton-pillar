import { pillarFetch, request } from './common';
export async function loadBilling() {
  const [usage, invoices, portal] = await Promise.all([
    pillarFetch<any>(request, '/usage'),
    pillarFetch<any>(request, '/invoices'),
    pillarFetch<any>(request, '/billing/portal_url', { method: 'POST', idempotencyKey: `dashboard-portal-${Date.now()}` })
  ]);
  return { usage, invoices, portal };
}
export function loadUsage() { return pillarFetch<any>(request, '/usage'); }
