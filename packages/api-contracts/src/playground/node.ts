export type NodeSnippetInput = {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
};

function stable(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
}

export function generateNodeSnippet(input: NodeSnippetInput): string {
  const method = input.method.toUpperCase();
  const options: Record<string, unknown> = { method };
  if (input.query && Object.keys(input.query).length) options.query = stable(input.query);
  if (input.headers && Object.keys(input.headers).length) options.headers = stable(input.headers);
  if (input.body !== undefined && input.body !== null && method !== 'GET' && method !== 'HEAD') options.body = stable(input.body);
  return [
    "import { PillarClient } from '@pillar/sdk-node';",
    '',
    "const pillar = new PillarClient({ apiKey: process.env.PILLAR_API_KEY! });",
    `const response = await pillar.request(${JSON.stringify(input.path)}, ${JSON.stringify(options, null, 2)});`,
    'console.log(response);',
  ].join('\n');
}
