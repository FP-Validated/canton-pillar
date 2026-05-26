export async function configureWebhook(input: Record<string, any>) { return { id: input.webhook_endpoint_id ?? 'we_onboarding', test_ping: 'succeeded' }; }
