export type JsonWebKeyWithKid = JsonWebKey & { kid: string; [key: string]: unknown };

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const CACHE_TTL_MS = 86_400_000;

let cachedAt = 0;
let cachedKeys = new Map<string, JsonWebKeyWithKid>();

async function refreshKeys(now = Date.now()) {
  const response = await fetch(GOOGLE_JWKS_URL);
  if (!response.ok) throw new Error(`google_jwks_fetch_failed:${response.status}`);
  const body = await response.json() as { keys?: JsonWebKeyWithKid[] };
  const next = new Map<string, JsonWebKeyWithKid>();
  for (const key of body.keys ?? []) {
    if (key.kid) next.set(key.kid, key);
  }
  cachedKeys = next;
  cachedAt = now;
}

export async function getKey(kid: string): Promise<JsonWebKeyWithKid | null> {
  const now = Date.now();
  if (!cachedKeys.has(kid) || now - cachedAt > CACHE_TTL_MS) {
    await refreshKeys(now);
  }
  return cachedKeys.get(kid) ?? null;
}

export function clearJwksCacheForTest() {
  cachedAt = 0;
  cachedKeys = new Map();
}
