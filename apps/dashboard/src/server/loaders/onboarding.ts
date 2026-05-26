import { pillarApi } from '../pillar-api-proxy';
export async function loadOnboarding() { try { return await pillarApi('/onboarding'); } catch { return { object:'list', data:[], has_more:false, url:'/onboarding', capability_enabled:false }; } }
