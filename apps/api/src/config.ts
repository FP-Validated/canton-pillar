export type DeploymentMode = 'hosted' | 'customer-validator' | 'self-hosted';
export const SUPPORTED_API_VERSION = '2026-05-26';
export type Config = { port: number; baseUrl: string; apiVersion: string; deploymentMode: DeploymentMode };
export function loadConfig(env = process.env): Config {
  const deploymentMode = env.DEPLOYMENT_MODE ?? 'hosted';
  if (!['hosted','customer-validator','self-hosted'].includes(deploymentMode)) throw new Error('Invalid DEPLOYMENT_MODE');
  return { port: Number(env.API_PORT ?? 4000), baseUrl: env.API_BASE_URL ?? 'http://localhost:4000', apiVersion: env.PILLAR_API_VERSION ?? SUPPORTED_API_VERSION, deploymentMode: deploymentMode as DeploymentMode };
}
