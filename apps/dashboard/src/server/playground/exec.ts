if (process.env.NODE_ENV !== 'test') await import('server-only');
import { randomUUID } from 'node:crypto';
import { pillarFetch } from '../pillar-client';

export type PlaygroundExecInput = {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
};

export type PlaygroundExecResult = { status: number; headers: Record<string, string>; body: unknown; durationMs: number; operationLink?: string };

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function withQuery(path: string, query?: Record<string, unknown>) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) for (const item of value) params.append(key, String(item));
    else params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
}

function operationLink(body: unknown): string | undefined {
  const value = body && typeof body === 'object' ? (body as any).operation : undefined;
  const id = typeof value === 'string' ? value : value?.id;
  return typeof id === 'string' && id ? `/dashboard/operations/${id}` : undefined;
}

export async function executePlaygroundRequest(input: PlaygroundExecInput, request?: Request): Promise<PlaygroundExecResult> {
  const method = input.method.toUpperCase();
  const headers = new Headers(input.headers);
  if (!headers.has('Pillar-Version')) headers.set('Pillar-Version', process.env.PILLAR_API_VERSION ?? '2026-05-26');
  const start = Date.now();
  const result = await pillarFetch<unknown>(request, withQuery(input.path, input.query), {
    method,
    headers,
    body: input.body === undefined || input.body === null || method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(input.body),
    idempotencyKey: MUTATING.has(method) ? randomUUID() : undefined,
  });
  const durationMs = Date.now() - start;
  const responseHeaders = Object.fromEntries((result.headers ?? new Headers()).entries());
  if (!result.ok) return { status: result.status ?? result.error.status ?? 500, headers: responseHeaders, body: { error: result.error }, durationMs };
  return { status: 200, headers: responseHeaders, body: result.value, durationMs, operationLink: operationLink(result.value) };
}
