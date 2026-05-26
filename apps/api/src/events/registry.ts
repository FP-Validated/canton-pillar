import { EVENT_TYPE_REGISTRY } from '@pillar/api-contracts/schemas';

export function requireKnownEventType(type: string) {
  const found = EVENT_TYPE_REGISTRY.find(e => e.type === type);
  if (!found) throw new Error(`Unknown event type: ${type}`);
  return found;
}

export function expandWildcardSubscription(patterns: string[]): string[] {
  const all = EVENT_TYPE_REGISTRY.map(e => e.type);
  const out = new Set<string>();
  for (const pattern of patterns.length ? patterns : ['*']) {
    if (pattern === '*') all.forEach(t => out.add(t));
    else if (pattern.endsWith('.*')) all.filter(t => t.startsWith(pattern.slice(0, -1))).forEach(t => out.add(t));
    else { requireKnownEventType(pattern); out.add(pattern); }
  }
  return [...out].sort();
}
