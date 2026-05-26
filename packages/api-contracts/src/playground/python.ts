export type PythonSnippetInput = {
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

function py(value: unknown): string {
  return JSON.stringify(stable(value), null, 2).replace(/true/g, 'True').replace(/false/g, 'False').replace(/null/g, 'None');
}

export function generatePythonSnippet(input: PythonSnippetInput): string {
  const method = input.method.toUpperCase();
  const args: string[] = [`${JSON.stringify(input.path)}`, `method=${JSON.stringify(method)}`];
  if (input.query && Object.keys(input.query).length) args.push(`query=${py(input.query)}`);
  if (input.headers && Object.keys(input.headers).length) args.push(`headers=${py(input.headers)}`);
  if (input.body !== undefined && input.body !== null && method !== 'GET' && method !== 'HEAD') args.push(`body=${py(input.body)}`);
  return [
    'from pillar_sdk_python import PillarClient',
    'import os',
    '',
    'pillar = PillarClient(api_key=os.environ["PILLAR_API_KEY"])',
    `response = pillar.request(${args.join(', ')})`,
    'print(response)',
  ].join('\n');
}
