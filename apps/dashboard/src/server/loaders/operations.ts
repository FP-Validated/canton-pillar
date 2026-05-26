import { loadList, qs } from './common';
export function loadOperations(filters: { limit?: number; status?: string } = {}) { return loadList(`/operations${qs(filters)}`); }
export function loadOperation(id: string) { return loadList(`/operations/${encodeURIComponent(id)}`); }
