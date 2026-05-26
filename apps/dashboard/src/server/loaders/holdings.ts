import { loadList, qs } from './common';
export function loadHoldings(filters: { account?: string; asset?: string; status?: string; limit?: number } = {}) { return loadList(`/holdings${qs(filters)}`); }
