import { pillarFetch, request } from './common';
export function loadWebhooks() { return pillarFetch<any>(request, '/webhook_endpoints'); }
export function loadWebhookDeliveries(id: string) { return pillarFetch<any>(request, `/webhook_endpoints/${encodeURIComponent(id)}/deliveries`); }
