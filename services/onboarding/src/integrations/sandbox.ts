export async function provisionSandbox(input: Record<string, any>) { return { tenant_id: input.tenant_id, environment_id: input.environment_id, provisioned: true }; }
