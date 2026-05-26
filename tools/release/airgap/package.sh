#!/usr/bin/env bash
set -euo pipefail
out=${1:-pillar-airgap}
mkdir -p "$out/images" "$out/charts" "$out/dars" "$out/sboms" "$out/signatures"
services=(api ledger-command projection-worker workflow-orchestrator webhook-dispatcher compliance-adapter reconciler template-registry export-worker usage-meter search-indexer migrator dar-uploader)
for svc in "${services[@]}"; do
  img="${REGISTRY:-ghcr.io/fp-validated}/pillar-${svc}:${VERSION:?VERSION required}"
  docker pull "$img"
  docker save "$img" -o "$out/images/pillar-${svc}.tar"
done
helm package infra/helm/pillar -d "$out/charts"
cp -R daml/.daml/dist/*.dar "$out/dars/" 2>/dev/null || true
find "$out" -type f -print0 | sort -z | xargs -0 shasum -a 256 > "$out/checksums.txt"
printf '{"version":"%s","registry":"%s"}
' "$VERSION" "${REGISTRY:-ghcr.io/fp-validated}" > "$out/manifest.json"
tar -czf "${out}.tgz" "$out"
