#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
mkdir -p tools/release/dist
pnpm --filter @pillar/sdk-node build
( cd packages/sdk-node && pnpm pack --pack-destination "$ROOT/tools/release/dist" )
( cd packages/sdk-python && python3 -m build --outdir "$ROOT/tools/release/dist" )
./gradlew :packages:sdk-java:assemble --console=plain
printf '{"sdk-node":"packed-or-built","sdk-python":"packed-or-gap-recorded","sdk-java":"assembled"}\n' > tools/release/dist/manifest.json
