import { pillarFetch, type PillarApiError, type Result, emptyList } from '../pillar-client';

export type LoaderResult<T> = Result<T, PillarApiError>;
export const request = undefined as Request | undefined;
export function qs(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}
export async function loadList<T = any>(path: string): Promise<LoaderResult<T>> { return pillarFetch<T>(request, path); }
export { pillarFetch, emptyList };
