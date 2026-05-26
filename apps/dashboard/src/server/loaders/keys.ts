import { pillarApi } from '../pillar-api-proxy';
export async function loadKeys() { try { return await pillarApi('/api_keys'); } catch { return { object:'list', data:[], has_more:false, url:'/api_keys', capability_enabled:false }; } }
