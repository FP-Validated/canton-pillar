# Daml codegen

Stub. Real Daml Java + TypeScript binding generation lands in Phase 04 (ticket P4.F01).

P0 deliverable: this directory exists so `make codegen` and `tools/codegen/generate-all.sh --check`
do not fail. The `--check` flag is always no-op safe in P0.

When Phase 04 lands, this generator will produce:

- `packages/ledger-types/generated/java/...`
- `packages/ledger-types/generated/typescript/...`

from DAR artifacts in `daml/.daml/dist/`.
