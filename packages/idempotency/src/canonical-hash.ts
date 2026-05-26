import { createHash } from 'node:crypto';

export type CanonicalRequest = {
  method: string;
  path_template?: string;
  pathTemplate?: string;
  api_version?: string;
  apiVersion?: string;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  headersSubset?: Record<string, string | undefined>;
};

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

function normalizeDecimal(value: string): string {
  if (!DECIMAL_RE.test(value)) return value.trim();
  const sign = value.startsWith('-') ? '-' : '';
  const unsigned = sign ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fraction.replace(/0+$/, '');
  const normalized = normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
  return normalized === '0' ? '0' : `${sign}${normalized}`;
}

function norm(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(norm);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, norm(val)]),
    );
  }
  if (typeof value === 'string') return normalizeDecimal(value.trim());
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(norm(value ?? {}));
}

function normalizeHeaders(req: CanonicalRequest, pathTemplate: string) {
  const input = { ...(req.headers ?? {}), ...(req.headersSubset ?? {}) };
  const headers = Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => ['pillar-version'].includes(key.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key.toLowerCase(), String(value ?? '').trim()]),
  );
  return { ...headers, 'pillar-path-template': `${req.method.toUpperCase()} ${pathTemplate}` };
}

export function canonicalRequestHash(req: CanonicalRequest): string {
  const pathTemplate = req.pathTemplate ?? req.path_template ?? '';
  const apiVersion = req.apiVersion ?? req.api_version ?? '';
  const payload = {
    method: req.method.toUpperCase(),
    path_template: pathTemplate,
    api_version: apiVersion,
    body: JSON.parse(canonicalJson(req.body)),
    headers: normalizeHeaders(req, pathTemplate),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
