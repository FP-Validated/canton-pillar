#!/usr/bin/env bash
set -euo pipefail

MODE="generate"
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check";;
    -h|--help)
      cat <<EOF
Usage: $0 [--check]

OpenAPI → SDK codegen stub. Real generator lands in P7.

  --check    P0-safe no-op that prints status and exits 0.
EOF
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 2;;
  esac
done

if [[ "$MODE" == "check" ]]; then
  echo "openapi-to-sdks: stub. Real generation lands in P7. (--check OK)"
  exit 0
fi

echo "openapi-to-sdks: not implemented in P0; defer to P7 tickets P7.I01..P7.I14." >&2
exit 0
