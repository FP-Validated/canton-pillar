# OpenAPI → SDK codegen

Stub. Real codegen lands in Phase 07 (ticket P7.I01..I14).

P0 deliverable: this directory exists so the boundary is reserved and `make codegen` does not fail.

When Phase 07 lands, this generator will read `packages/api-contracts/openapi/pillar-v1.yaml`
and emit:

- `packages/sdk-node/src/generated/`
- `packages/sdk-python/pillar/generated/`
- `packages/sdk-java/src/main/java/.../generated/`

The `--check` flag MUST always succeed in P0 by design.
