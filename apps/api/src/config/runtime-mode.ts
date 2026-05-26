export type RuntimeMode = 'production' | 'demo';

export function runtimeMode(env: NodeJS.ProcessEnv = process.env): RuntimeMode {
  return env.PILLAR_DEMO_DATA === 'true' ? 'demo' : 'production';
}

export function demoDataEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return runtimeMode(env) === 'demo';
}
