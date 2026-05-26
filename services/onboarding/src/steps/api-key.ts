import type { OnboardingSession } from '../types.js';
export async function apiKeyStep(s: OnboardingSession, input: Record<string, any>){ return { ...s, status:'in_progress', current_step:'webhook', first_api_key_id: input.key_id ?? s.first_api_key_id ?? 'key_onboarding', step_state:{...s.step_state, api_key:{created:true}} }; }
