import { loadList, qs } from './common';
export function loadEvents(filters: { types?: string; 'created.gte'?: string; limit?: number } = {}) { return loadList(`/events${qs(filters)}`); }
export function loadEvent(id: string) { return loadList(`/events/${encodeURIComponent(id)}`); }
