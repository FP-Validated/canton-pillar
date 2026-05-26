import { pillarApi } from '../pillar-api-proxy';
export async function loadWebhooks() { try { return await pillarApi('/webhook_endpoints'); } catch { return { object:'list', data:[], has_more:false, url:'/webhook_endpoints', capability_enabled:false }; } }
