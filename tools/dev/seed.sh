#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

MODE="check"
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check";;
    --confirm) MODE="confirm";;
    -h|--help) echo "Usage: $0 [--check|--confirm]"; exit 0;;
  esac
done

if [[ "$MODE" == "check" ]]; then
  echo "tools/dev/seed.sh — no-op in Phase 0. Real seed fixtures land in Phase 3 (packages/db/seeds)."
  exit 0
fi

echo "tools/dev/seed.sh — no-op in Phase 0. See docs/Dev/Phase_03_DB_Idempotency.md." >&2
exit 0
