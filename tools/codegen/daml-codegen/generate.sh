#!/usr/bin/env bash
set -euo pipefail

MODE="generate"
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check";;
    -h|--help)
      cat <<EOF
Usage: $0 [--check]

Daml Java/TypeScript binding codegen stub. Real generator lands in P4.F01.

  --check    P0-safe no-op that prints status and exits 0.
EOF
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 2;;
  esac
done

if [[ "$MODE" == "check" ]]; then
  echo "daml-codegen: stub. Real generation lands in P4.F01. (--check OK)"
  exit 0
fi

if ! command -v dpm >/dev/null; then
  echo "dpm not installed; cannot generate Daml bindings." >&2
  echo "See docs/Dev/Phase_04_Ledger_Command_Runtime.md ticket P4.F01." >&2
  exit 0
fi

echo "daml-codegen: not implemented in P0; defer to P4.F01." >&2
exit 0
