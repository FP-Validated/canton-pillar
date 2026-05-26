import { pillarFetch, request } from './common';
export function loadOnboarding(id = 'current') { return pillarFetch<any>(request, `/onboarding/${encodeURIComponent(id)}`); }
export function loadOnboardingNextAction(id = 'current') { return pillarFetch<any>(request, `/onboarding/${encodeURIComponent(id)}/next_action`); }
