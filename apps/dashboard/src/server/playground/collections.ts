if (process.env.NODE_ENV !== 'test') await import('server-only');

export type PlaygroundCollection = {
  id: string;
  userId: string;
  tenantId: string;
  name: string;
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  updatedAt: string;
};

const collections = new Map<string, PlaygroundCollection[]>();

function key(userId: string, tenantId: string) { return `${userId}:${tenantId}`; }

export function listPlaygroundCollections(userId: string, tenantId: string): PlaygroundCollection[] {
  return [...(collections.get(key(userId, tenantId)) ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function savePlaygroundCollection(input: Omit<PlaygroundCollection, 'id' | 'updatedAt'> & { id?: string }): PlaygroundCollection {
  const bucketKey = key(input.userId, input.tenantId);
  const existing = collections.get(bucketKey) ?? [];
  const saved: PlaygroundCollection = { ...input, id: input.id ?? `col_${crypto.randomUUID().replace(/-/g, '')}`, updatedAt: new Date().toISOString() };
  collections.set(bucketKey, [saved, ...existing.filter(item => item.id !== saved.id)]);
  return saved;
}

export const playgroundCollectionsOpenIssue = 'Collections are in-memory per user+tenant until /v1/admin/identity/users/:id/playground_collections or a tenant-scoped table exists.';
