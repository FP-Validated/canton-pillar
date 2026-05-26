#!/usr/bin/env bash
set -euo pipefail

MODE="inproc"
for arg in "$@"; do
  case "$arg" in
    --mode=compose) MODE="compose" ;;
    --mode=inproc) MODE="inproc" ;;
    *) echo "unknown argument: $arg" >&2; exit 64 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

API_PID=""
cleanup() {
  if [[ -n "${API_PID}" ]]; then kill "${API_PID}" >/dev/null 2>&1 || true; fi
  if [[ "${MODE}" == "compose" ]]; then docker compose -f infra/compose/local.yml down >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

wait_http() {
  local url="$1" deadline=$((SECONDS + 30))
  until curl -fsS "$url" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then echo "timeout waiting for $url" >&2; exit 1; fi
    sleep 1
  done
}

if [[ "${MODE}" == "compose" ]]; then
  docker compose -f infra/compose/local.yml up -d postgres redis
  export DATABASE_URL="${DATABASE_URL:-postgres://pillar:pillar@127.0.0.1:5432/pillar}"
  export PILLAR_CACHE_REDIS_URL="${PILLAR_CACHE_REDIS_URL:-redis://127.0.0.1:6379}"
else
  export PILLAR_DB="${PILLAR_DB:-memory}"
  export PILLAR_IDEMPOTENCY="${PILLAR_IDEMPOTENCY:-memory}"
  export PILLAR_E2E_ALLOW_SYNTHETIC_WEBHOOK="${PILLAR_E2E_ALLOW_SYNTHETIC_WEBHOOK:-true}"
fi

export PILLAR_IDEMPOTENCY="${PILLAR_IDEMPOTENCY:-db}"
export PILLAR_DEMO_DATA="${PILLAR_DEMO_DATA:-false}"
export PILLAR_CACHE_REDIS_URL="${PILLAR_CACHE_REDIS_URL:-redis://127.0.0.1:6379}"
export PILLAR_TEST_MODE="true"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  pnpm --filter @pillar/db exec tsx src/migration-runner.ts up
  pnpm --filter @pillar/db exec tsx src/migration-runner.ts verify
fi

if [[ "${PILLAR_API_EXTERNAL:-false}" != "true" ]]; then
  PILLAR_PORT="${PILLAR_PORT:-0}"
  if [[ "${PILLAR_PORT}" == "0" ]]; then PILLAR_PORT="$((43000 + RANDOM % 1000))"; fi
  PORT="${PILLAR_PORT}" pnpm --filter @pillar/api exec tsx src/index.ts &
  API_PID="$!"
  export PILLAR_API_URL="${PILLAR_API_URL:-http://127.0.0.1:${PILLAR_PORT}/v1}"
  sleep 2
fi

START_MS=$(node -e 'console.log(Date.now())')
npx tsx tests/e2e/issue-intent-slice/run.ts
END_MS=$(node -e 'console.log(Date.now())')
echo "vertical_slice_mode=${MODE} duration_ms=$((END_MS - START_MS))"
