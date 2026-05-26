#!/usr/bin/env bash
set -euo pipefail
DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; fi
VERSION="${RELEASE_VERSION:-0.1.0}"
OUT="release-readiness/generated/${VERSION}"
mkdir -p "$OUT"
MANIFEST="$OUT/manifest.json"
python3 - "$MANIFEST" "$DRY_RUN" <<'PY'
import hashlib, json, pathlib, sys, time
manifest=pathlib.Path(sys.argv[1]); dry=sys.argv[2] == '1'
roots=[pathlib.Path('infra/observability'), pathlib.Path('tests/chaos'), pathlib.Path('tests/perf')]
items=[]
for root in roots:
    if root.exists():
        for path in sorted(p for p in root.rglob('*') if p.is_file()):
            data=path.read_bytes(); items.append({'path':str(path),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
manifest.write_text(json.dumps({'generated_at':time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),'dry_run':dry,'artifacts':items}, indent=2))
print(manifest)
PY
