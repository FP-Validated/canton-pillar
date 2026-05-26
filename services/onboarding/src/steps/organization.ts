import type { OnboardingSession } from '../types.js';
export async function organizationStep(s: OnboardingSession, input: Record<string, any>){ return { ...s, status:'in_progress', current_step:'kyb', step_state:{...s.step_state, organization: input} }; }
