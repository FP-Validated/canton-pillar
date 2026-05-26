#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

MODE="run"
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check";;
    -h|--help) echo "Usage: $0 [--check]"; exit 0;;
  esac
done

OUT_DIR="$ROOT_DIR/tmp/diagnostics-$(date -u +%Y%m%dT%H%M%SZ)"

if [[ "$MODE" == "check" ]]; then
  echo "collect-logs --check — would write compose logs and env summary to $OUT_DIR"
  echo "Secrets are NEVER printed. .env contents are excluded by design."
  exit 0
fi

mkdir -p "$OUT_DIR"
# NEVER print .env or env values; only the names of present env vars are recorded.
env | awk -F= '{print $1}' | sort -u > "$OUT_DIR/env-keys.txt"
if command -v docker >/dev/null 2>&1; then
  docker compose -f infra/compose/local.yml ps > "$OUT_DIR/compose-ps.txt" 2>&1 || true
  for svc in postgres redis canton-sandbox webhook-receiver migrator otel-collector; do
    docker compose -f infra/compose/local.yml logs --no-color --tail=500 "$svc" > "$OUT_DIR/$svc.log" 2>&1 || true
  done
fi
echo "diagnostics written to $OUT_DIR (no secrets included)"
