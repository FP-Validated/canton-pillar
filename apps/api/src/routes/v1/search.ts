export const searchErrors = ['invalid_search_query','unsupported_search_field','unsupported_search_operator','too_many_search_clauses','search_stale'] as const;
export function parseSearchQuery(query: Record<string, unknown>) { return { resource: String(query.resource ?? 'transfer'), query: String(query.query ?? ''), limit: Math.min(Number(query.limit ?? 10), 100) }; }
export function searchIndexFreshness(lagSeconds: number) { if (lagSeconds > 300) return { status: 409, code: 'search_stale' }; return { status: 200, lag_seconds: lagSeconds }; }
