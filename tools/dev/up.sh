#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

MODE="run"
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check";;
    -h|--help) echo "Usage: $0 [--check]"; exit 0;;
  esac
done

if [[ "$MODE" == "check" ]]; then
  echo "tools/dev/up.sh — would run: docker compose -f infra/compose/local.yml up -d"
  exit 0
fi

exec docker compose -f infra/compose/local.yml up -d
