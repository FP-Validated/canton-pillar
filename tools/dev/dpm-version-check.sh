#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOL_VERSIONS="$ROOT_DIR/.tool-versions"

if [[ ! -f "$TOOL_VERSIONS" ]]; then
  echo "dpm-version-check: .tool-versions not found at $TOOL_VERSIONS" >&2
  exit 1
fi

PINNED_DAML_VERSION="$(awk '/^daml /{print $2}' "$TOOL_VERSIONS")"
if [[ -z "$PINNED_DAML_VERSION" ]]; then
  echo "dpm-version-check: no 'daml <version>' line in .tool-versions" >&2
  exit 1
fi

if ! command -v dpm >/dev/null 2>&1; then
  echo "dpm-version-check: dpm command not installed. Pinned: $PINNED_DAML_VERSION" >&2
  echo "Install per .tool-versions and re-run." >&2
  exit 1
fi

INSTALLED_DAML_VERSION="$(dpm version 2>/dev/null | awk '/^[[:space:]]*\\*/{print $2; exit}' || true)"
if [[ -z "$INSTALLED_DAML_VERSION" ]]; then
  echo "dpm-version-check: could not find an installed Daml SDK from 'dpm version'." >&2
  exit 1
fi

if [[ "$INSTALLED_DAML_VERSION" != "$PINNED_DAML_VERSION" ]]; then
  echo "dpm-version-check: MISMATCH. installed=$INSTALLED_DAML_VERSION, pinned=$PINNED_DAML_VERSION" >&2
  exit 1
fi

echo "dpm-version-check: OK (Daml SDK $INSTALLED_DAML_VERSION matches pin $PINNED_DAML_VERSION)"
exit 0
