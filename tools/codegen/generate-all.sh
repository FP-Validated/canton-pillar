#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "==> Daml bindings codegen (stub)"
bash tools/codegen/daml-codegen/generate.sh --check

echo "==> OpenAPI SDK codegen (stub)"
bash tools/codegen/openapi-to-sdks/generate.sh --check

echo "All codegen stubs OK (no artifacts produced in P0)."
