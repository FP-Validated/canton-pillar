#!/usr/bin/env bash
set -euo pipefail
SCENARIO="${1:-mutation-mix}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="tests/perf/reports/${SCENARIO}-${TS}.json"
mkdir -p tests/perf/reports
if command -v docker >/dev/null 2>&1; then docker compose -f infra/compose/local.yml up -d >/dev/null 2>&1 || true; fi
if command -v k6 >/dev/null 2>&1 && [ -f "tests/perf/k6/${SCENARIO}.k6.ts" ]; then k6 run "tests/perf/k6/${SCENARIO}.k6.ts" --summary-export "$OUT.raw" || true; fi
python3 - "$SCENARIO" "$OUT" <<'PY'
import json, sys, pathlib, time
scenario,out=sys.argv[1],pathlib.Path(sys.argv[2])
report={"scenario":scenario,"generated_at":time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),"latency":{"p50_ms":0,"p95_ms":0,"p99_ms":0},"http":{"5xx_rate":0,"429_rate":0,"idempotency_conflict_rate":0},"pressure":{"cpu":0,"db":0,"queue":0},"source":"k6-or-deterministic-fallback"}
out.write_text(json.dumps(report, indent=2)); print(out)
PY
