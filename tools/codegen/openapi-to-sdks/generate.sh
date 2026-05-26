#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
pnpm --filter @pillar/sdk-node codegen
pnpm --filter @pillar/sdk-python codegen || true
./gradlew :packages:sdk-java:generate --console=plain
