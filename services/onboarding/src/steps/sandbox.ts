import type { OnboardingSession } from '../types.js';
export async function sandboxStep(s: OnboardingSession, input: Record<string, any>){ return { ...s, status:'in_progress', current_step:'api_key', step_state:{...s.step_state, sandbox:{provisioned:true, ...input}} }; }
