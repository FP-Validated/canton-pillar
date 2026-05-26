import { loadList, qs } from './common';
export function loadBalances(filters: { account?: string; asset?: string; limit?: number } = {}) { return loadList(`/balances${qs(filters)}`); }
