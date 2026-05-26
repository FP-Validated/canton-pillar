#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

MODE="check"
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check";;
    --confirm) MODE="confirm";;
    -h|--help)
      cat <<EOF
Usage: $0 [--check|--confirm]

Resets the local Canton sandbox ledger. Default is dry-run / --check.
This is destructive when used with --confirm.
Not for any non-local environment.
EOF
      exit 0;;
  esac
done

if [[ "$MODE" == "check" ]]; then
  echo "tools/dev/reset-ledger.sh --check — would stop canton-sandbox, prune ledger volume."
  echo "Pass --confirm to actually destroy local ledger state."
  exit 0
fi

if [[ "${PILLAR_DEPLOYMENT_MODE:-hosted}" != "hosted" && "${PILLAR_ENV:-local}" != "local" ]]; then
  echo "refusing to reset ledger outside local profile (PILLAR_ENV=${PILLAR_ENV:-local})" >&2
  exit 1
fi

docker compose -f infra/compose/local.yml rm --stop --force canton-sandbox || true
echo "Local sandbox ledger reset. Restart with: tools/dev/up.sh"
