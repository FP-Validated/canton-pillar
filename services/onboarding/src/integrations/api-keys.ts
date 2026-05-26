export async function createRestrictedApiKey(input: Record<string, any>) { return { id: input.key_id ?? 'key_onboarding', scopes: ['read:onboarding','write:onboarding'] }; }
