export type JavaSnippetInput = {
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

function javaString(value: string): string {
  return JSON.stringify(value);
}

export function generateJavaSnippet(input: JavaSnippetInput): string {
  const method = input.method.toUpperCase();
  const body = input.body !== undefined && input.body !== null && method !== 'GET' && method !== 'HEAD' ? JSON.stringify(stable(input.body), null, 2) : null;
  const query = input.query && Object.keys(input.query).length ? `\n    .queryJson(${javaString(JSON.stringify(stable(input.query)))})` : '';
  const headers = input.headers && Object.keys(input.headers).length ? `\n    .headersJson(${javaString(JSON.stringify(stable(input.headers)))})` : '';
  return [
    'import com.pillar.PillarClient;',
    '',
    'PillarClient pillar = new PillarClient(System.getenv("PILLAR_API_KEY"));',
    `var response = pillar.request(${javaString(method)}, ${javaString(input.path)})${query}${headers}${body ? `\n    .bodyJson(${javaString(body)})` : ''}`,
    '    .execute();',
    'System.out.println(response);',
  ].join('\n');
}
