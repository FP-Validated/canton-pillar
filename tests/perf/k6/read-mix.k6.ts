import http from "k6/http";
import { check, sleep } from "k6";
export const options = { vus: 4, duration: "30s", thresholds: { http_req_failed: ["rate<0.05"], http_req_duration: ["p(95)<750"] } };
const base = __ENV.PILLAR_API_BASE_URL || "http://localhost:3000/v1";
function headers(name: string) { return { "Content-Type": "application/json", "Idempotency-Key": `${name}-${__VU}-${__ITER}` }; }
export default function () { const paths = ["/balances", "/holdings", "/operations"]; const res = http.get(`${base}${paths[__ITER % paths.length]}?limit=25`); check(res, { "read bounded": (x) => x.status < 500 || x.status === 501 }); sleep(1); }
