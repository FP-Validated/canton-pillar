import { pillarApi } from '../pillar-api-proxy';
export async function loadBilling() { try { return await pillarApi('/usage_events'); } catch { return { object:'list', data:[], has_more:false, url:'/usage_events', capability_enabled:false }; } }
