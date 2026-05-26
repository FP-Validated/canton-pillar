# Canton Pillar

Stripe for Canton-backed assets. A Canton-native runtime exposing a Stripe-grade `/v1` REST API over a ledger-of-truth model.

## Status

Phase 1 (Daml Source-of-Truth Model) complete and verified. See `docs/Dev/SCORING.md` for per-phase scores.

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

## Principles

1. Canton Ledger is the source of truth.
2. Pillar DB stores only Projection / Audit / Config.
3. External API must be Stripe-like and Canton-invisible.
4. Internal runtime must be Canton-native.
5. Operations must be ledger-traceable.
6. Balance/Holding-first, not contract-first.
7. Intent-first, not transaction-first.
8. Webhook-first for async workflow.
9. API grammar must be Stripe-grade from day one.
10. Deployment model changes, API experience does not.
