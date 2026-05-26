import type { OnboardingSession } from '../types.js';
export async function webhookStep(s: OnboardingSession, input: Record<string, any>){ return { ...s, status:'in_progress', current_step:'first_transfer', step_state:{...s.step_state, webhook:{configured:true, ...input}} }; }
