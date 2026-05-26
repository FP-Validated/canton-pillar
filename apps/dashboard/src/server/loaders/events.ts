import { pillarApi } from '../pillar-api-proxy';
export async function loadEvents() { try { return await pillarApi('/events'); } catch { return { object:'list', data:[], has_more:false, url:'/events', capability_enabled:false }; } }
