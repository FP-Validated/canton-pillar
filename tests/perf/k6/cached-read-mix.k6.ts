import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

export const cached_hit_ratio = new Rate('cached_hit_ratio');
export const cache_etag_304_ratio = new Rate('cache_etag_304_ratio');
export const p99_ms_read = new Trend('p99_ms_read');

export const options = {
  scenarios: { cached_read_mix: { executor: 'constant-vus', vus: 10, duration: '1m' } },
  thresholds: { http_req_duration: ['p(99)<500'] },
};

const baseUrl = __ENV.PILLAR_BASE_URL || 'http://localhost:8080';
const balances = ['bal_demo0001', 'bal_demo0002', 'bal_demo0003'];
const events = ['evt_demo0001', 'evt_demo0002'];
const etags: Record<string, string> = {};

export default function () {
  const readEvent = Math.random() >= 0.9;
  const id = readEvent ? events[Math.floor(Math.random() * events.length)] : balances[Math.floor(Math.random() * balances.length)];
  const path = readEvent ? `/v1/events/${id}` : `/v1/balances/${id}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${__ENV.PILLAR_API_KEY || 'plr_sk_test_perf'}`, 'Pillar-Version': '2026-06-30.cedar' };
  if (etags[path]) headers['If-None-Match'] = etags[path];
  const res = http.get(`${baseUrl}${path}`, { headers });
  if (res.headers.ETag) etags[path] = String(res.headers.ETag);
  cached_hit_ratio.add(res.timings.duration < 50 || res.status === 304);
  cache_etag_304_ratio.add(res.status === 304);
  p99_ms_read.add(res.timings.duration);
  check(res, { 'read status ok': r => r.status === 200 || r.status === 304 || r.status === 404 });
  sleep(0.1);
}

export function handleSummary(data: unknown) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return { [`tests/perf/reports/cached-read-mix-${ts}.json`]: JSON.stringify(data, null, 2) };
}
