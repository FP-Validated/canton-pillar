import { pillarApi } from '../pillar-api-proxy';
export async function loadBalances() { try { return await pillarApi('/balances'); } catch { return { object:'list', data:[], has_more:false, url:'/balances', capability_enabled:false }; } }
