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
      echo "Usage: $0 [--check|--confirm]"
      echo
      echo "Resets the local Postgres volume. Destructive under --confirm."
      exit 0;;
  esac
done

if [[ "$MODE" == "check" ]]; then
  echo "tools/dev/reset-db.sh --check — would stop postgres, remove pillar_pg volume."
  echo "Pass --confirm to actually destroy local Postgres data."
  exit 0
fi

if [[ "${PILLAR_DEPLOYMENT_MODE:-hosted}" != "hosted" && "${PILLAR_ENV:-local}" != "local" ]]; then
  echo "refusing to reset DB outside local profile (PILLAR_ENV=${PILLAR_ENV:-local})" >&2
  exit 1
fi

docker compose -f infra/compose/local.yml stop postgres || true
docker compose -f infra/compose/local.yml rm --force postgres || true
docker volume rm pillar-local_pillar_pg || true
echo "Local Postgres volume removed. Restart with: tools/dev/up.sh"
