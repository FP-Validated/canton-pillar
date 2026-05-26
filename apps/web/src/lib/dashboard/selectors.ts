import { accounts, apiRequestLog, assets, balances, holdings, holds, issueIntents, operations, redeemIntents, transferIntents, webhookDeliveries } from '@/lib/mockData';

export function formatRelative(iso: string): string {
  const base = new Date('2026-05-26T08:45:00.000Z').getTime();
  const delta = Math.max(0, base - new Date(iso).getTime());
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatCurrency(decimalString: string, code = 'USD'): string {
  const value = Number(decimalString || 0);
  return `${code} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(n: number): string { return n.toLocaleString('en-US'); }

export const allIntents = () => [...issueIntents, ...redeemIntents, ...transferIntents];

export function recentIntents(limit = 10) { return allIntents().sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, limit); }

export function intentVolume24h() { return transferIntents.filter((item) => item.status === 'succeeded').reduce((sum, item) => sum + Number(item.amount), 0).toFixed(2); }

function series(seed: number, length = 12) { return Array.from({ length }, (_, index) => Math.round(Math.abs(Math.sin(seed + index * 1.7)) * 70 + seed * 3 + index)); }

export function kpiSparklines() {
  const latency = operations.map((op) => op.latency_ms);
  return { totalVolume: series(11), pending: series(5), succeeded: series(8), failed: series(3), deliverySuccess: series(webhookDeliveries.filter((d) => d.status === 'delivered').length), p95Latency: series(Math.round(Math.max(...latency) / 100)) };
}

export function systemStatus() {
  const degraded = webhookDeliveries.some((delivery) => delivery.status === 'dead_lettered');
  return { api: 'ok' as const, projection: degraded ? 'degraded' as const : 'ok' as const, ledgerParticipant: 'ok' as const, webhookDispatcher: degraded ? 'degraded' as const : 'ok' as const };
}

export function intentTrendBars() {
  const labels = ['May 20', 'May 21', 'May 22', 'May 23', 'May 24', 'May 25', 'May 26'];
  const intents = allIntents();
  return labels.map((label, index) => ({ label: label.replace('May ', 'M'), value: index === 6 ? intents.length : 2 + ((index * 3) % 5) }));
}

export function accountSummary(id: string) {
  const account = accounts.find((item) => item.id === id);
  const accountBalances = balances.filter((item) => item.account_id === id);
  const accountHoldings = holdings.filter((item) => item.account_id === id);
  return { account, totalBalance: accountBalances.reduce((sum, item) => sum + Number(item.total), 0).toFixed(2), holdings: accountHoldings.length, reserved: accountBalances.reduce((sum, item) => sum + Number(item.reserved), 0).toFixed(2) };
}

export function assetSummary(id: string) {
  const asset = assets.find((item) => item.id === id);
  const assetHoldings = holdings.filter((item) => item.asset_id === id);
  const activeHolds = holds.filter((item) => item.asset_id === id && ['active', 'requires_action'].includes(item.status));
  return { asset, totalQuantity: assetHoldings.reduce((sum, item) => sum + Number(item.quantity), 0).toFixed(2), holdings: assetHoldings.length, activeHolds: activeHolds.length };
}

export function latencyStats() {
  const values = operations.map((item) => item.latency_ms).sort((a, b) => a - b);
  const pick = (p: number) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
  return { avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length), p50: pick(0.5), p95: pick(0.95), max: Math.max(...values) };
}

export function requestStats() {
  const avg = Math.round(apiRequestLog.reduce((sum, item) => sum + item.latency_ms, 0) / apiRequestLog.length);
  const errors = apiRequestLog.filter((item) => item.status_code >= 400).length;
  return { avgLatency: avg, errorRate: Math.round((errors / apiRequestLog.length) * 100), rps: (apiRequestLog.length / 60).toFixed(2) };
}
