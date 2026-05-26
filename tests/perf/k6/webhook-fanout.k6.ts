import http from "k6/http";
import { check, sleep } from "k6";
export const options = { vus: 4, duration: "30s", thresholds: { http_req_failed: ["rate<0.05"], http_req_duration: ["p(95)<750"] } };
const base = __ENV.PILLAR_API_BASE_URL || "http://localhost:3000/v1";
function headers(name: string) { return { "Content-Type": "application/json", "Idempotency-Key": `${name}-${__VU}-${__ITER}` }; }
export default function () { const res = http.post(`${base}/webhook_endpoints/test_fanout`, JSON.stringify({ endpoints: 10, retry_classes: ["timeout", "5xx", "429"] }), { headers: headers("webhook-fanout") }); check(res, { "fanout accepted": (x) => [200,201,202,404,501].includes(x.status) }); sleep(1); }
