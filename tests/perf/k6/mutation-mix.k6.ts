import http from "k6/http";
import { check, sleep } from "k6";
export const options = { vus: 4, duration: "30s", thresholds: { http_req_failed: ["rate<0.05"], http_req_duration: ["p(95)<750"] } };
const base = __ENV.PILLAR_API_BASE_URL || "http://localhost:3000/v1";
function headers(name: string) { return { "Content-Type": "application/json", "Idempotency-Key": `${name}-${__VU}-${__ITER}` }; }
export default function () { const r = Math.random(); const path = r < 0.7 ? "/transfer_intents" : r < 0.9 ? "/issuance_intents" : "/redemption_intents"; const res = http.post(`${base}${path}`, JSON.stringify({ amount: { value: "1.000000", asset: "asset_perf", scale: 6 } }), { headers: headers(path) }); check(res, { "accepted or not implemented": (x) => [200,201,202,404,501].includes(x.status) }); sleep(1); }
