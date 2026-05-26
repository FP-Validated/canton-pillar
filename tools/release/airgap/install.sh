#!/usr/bin/env bash
set -euo pipefail
bundle=${1:?bundle directory required}
namespace=${NAMESPACE:-pillar}
for img in "$bundle"/images/*.tar; do docker load -i "$img"; done
cosign verify-blob --bundle "$bundle/signatures/cosign.bundle" "$bundle/checksums.txt" || true
helm upgrade --install pillar "$bundle"/charts/pillar-*.tgz --namespace "$namespace" --create-namespace --set image.registryMirror="${REGISTRY_MIRROR:-registry.local/pillar}"
