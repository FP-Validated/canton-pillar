export type CurlSnippetInput = {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
};

const API_BASE = 'https://api.pillar.dev';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function encodeQuery(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) for (const item of value) params.append(key, String(item));
    else params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort(), 2);
}

export function generateCurlSnippet(input: CurlSnippetInput): string {
  const method = input.method.toUpperCase();
  const lines = [`curl --request ${method} ${shellQuote(`${API_BASE}${input.path}${encodeQuery(input.query)}`)}`];
  const headers = { Authorization: 'Bearer $PILLAR_API_KEY', ...input.headers };
  for (const [name, value] of Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  --header ${shellQuote(`${name}: ${value}`)}`);
  }
  if (input.body !== undefined && input.body !== null && method !== 'GET' && method !== 'HEAD') {
    lines.push(`  --data ${shellQuote(typeof input.body === 'string' ? input.body : stableJson(input.body))}`);
  }
  return lines.map((line, index) => index === lines.length - 1 ? line : `${line} \\`).join('\n');
}
