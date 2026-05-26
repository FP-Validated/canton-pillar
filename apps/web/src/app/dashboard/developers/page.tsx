import { DataTable } from '@/components/dashboard/DataTable';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { apiRequestLog } from '@/lib/mockData';

export const metadata = { title: 'Developers – Canton Pillar' };
export default function DevelopersPage() {
  const avg = Math.round(apiRequestLog.reduce((sum, row) => sum + row.latency_ms, 0) / apiRequestLog.length);
  const errors = apiRequestLog.filter((row) => row.status_code >= 400).length;
  const errorRate = `${Math.round((errors / apiRequestLog.length) * 100)}%`;
  const requestsPerMinute = apiRequestLog.length;
  const rows = [...apiRequestLog].sort((a, b) => b.created.localeCompare(a.created));
  return <div className="space-y-6"><h1 className="text-3xl font-bold text-ink">Developers</h1><section className="grid gap-4 md:grid-cols-3"><KpiCard label="Avg latency" value={`${avg}ms`} /><KpiCard label="Error rate" value={errorRate} /><KpiCard label="Requests per minute" value={String(requestsPerMinute)} /></section><DataTable rows={rows} columns={[{ key: 'created', header: 'Created', render: (row) => row.created }, { key: 'method', header: 'Method', render: (row) => <span className="font-mono font-semibold">{row.method}</span> }, { key: 'path', header: 'Path', render: (row) => <span className="font-mono text-xs">{row.path}</span> }, { key: 'status', header: 'Status', render: (row) => <span className={row.status_code >= 400 ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700'}>{row.status_code}</span> }, { key: 'request', header: 'Request ID', render: (row) => <span className="font-mono text-xs">{row.request_id}</span> }, { key: 'key', header: 'API key', render: (row) => <span className="font-mono text-xs">{row.api_key}</span> }, { key: 'latency', header: 'Latency', render: (row) => `${row.latency_ms}ms` }]} /></div>;
}
