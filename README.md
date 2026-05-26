# Canton Pillar

The payments runtime for Canton-backed assets. A Canton-native runtime exposing a polished `/v1` REST API over a ledger-of-truth model.

## Status

This repository is in active development and is not production-ready. R6 executable re-scoring on 2026-05-26 produced this grade distribution across P0..P14, M15.A/B, and R0..R6:

- PASS: 15
- PARTIAL: 9
- SCAFFOLD: 0
- STUB: 0

Current blockers are concrete executable gates: migrator/idempotency failures, public-contract lint failure, onboarding test failure, API auth-route test timeout, and incomplete proof for vertical-slice/chaos gates. See `docs/Dev/SCORING.md` and `docs/Dev/EVIDENCE.md` for command-level evidence.

## Repository layout

```
apps/                Long-running applications (web prototype, webhook receiver)
daml/                Daml source-of-truth packages (pillar-core, pillar-assets, ...)
services/            Kotlin/JVM and Node runtime services
packages/            Shared TypeScript libraries
infra/               Compose, Postgres init, OTel collector, Dockerfiles
tools/               Codegen, dev scripts, release tooling
docs/                Architecture and phase-by-phase Dev plan
```

## Toolchain

Pinned in `.tool-versions`:
- Node 20.18.0
- pnpm 9.12.3
- JDK 21 (Temurin)
- Kotlin 2.0.21
- Gradle 8.10.2
- Daml SDK 3.4.11 (via DPM 1.0.x)

## Quickstart

```bash
pnpm install
cd daml && dpm build --all
pnpm --filter @pillar/web dev    # http://localhost:3000
```

## Vertical Slice

Run the R5 issue-intent vertical slice from the repository root:

```bash
chmod +x tools/e2e/run-vertical-slice.sh
tools/e2e/run-vertical-slice.sh --mode=inproc
tools/e2e/run-vertical-slice.sh --mode=compose
```

`--mode=inproc` uses the API's test/memory mode plus the TypeScript driver and mock webhook receiver. `--mode=compose` brings up local Postgres/Redis, applies and verifies migrations, starts the API in test mode, then runs the same assertions.

## Principles

1. Canton Ledger is the source of truth.
2. Pillar DB stores only Projection / Audit / Config.
3. External API must be developer-friendly and Canton-invisible.
4. Internal runtime must be Canton-native.
5. Operations must be ledger-traceable.
6. Balance/Holding-first, not contract-first.
7. Intent-first, not transaction-first.
8. Webhook-first for async workflow.
9. API grammar must be polished and developer-grade from day one.
10. Deployment model changes, API experience does not.
