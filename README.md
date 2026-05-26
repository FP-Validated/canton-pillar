# Canton Pillar

The payments runtime for Canton-backed assets. A Canton-native runtime exposing a polished `/v1` REST API over a ledger-of-truth model.

## Status

This repository is in active development. It contains:

- A complete Daml package model (pillar-core/pillar-assets/pillar-intents/pillar-ops/pillar-token-adapter/pillar-test) with `dpm build --all` passing on Daml SDK 3.4.11.
- A broad TypeScript/Kotlin scaffolding for API, projection, webhook, identity, validator-registry, compliance, and supporting services.
- A complete OpenAPI 3.1 contract at `packages/api-contracts/openapi/pillar-v1.yaml`.
- A migration tree under `packages/db/migrations/0000_*..0130_*` covering config, audit, idempotency, intents/operations, projections, events/webhooks, reconciliation, security/compliance, search/reporting, template-registry, usage/billing, identity, and networks/validators.

It is NOT yet a production-ready Canton-backed runtime. The next milestones (R0..R6 in `docs/Dev/REMEDIATION.md`) deliver:
- Daml lifecycle atomicity (Hold/Holding).
- A real ledger-command worker (Canton sandbox submission, completion correlation).
- Projection fallback removal.
- DB-only idempotency.
- A working vertical slice issue_intent → projection → event → webhook.

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
3. External API must be developer-friendly and Canton-invisible.
4. Internal runtime must be Canton-native.
5. Operations must be ledger-traceable.
6. Balance/Holding-first, not contract-first.
7. Intent-first, not transaction-first.
8. Webhook-first for async workflow.
9. API grammar must be polished and developer-grade from day one.
10. Deployment model changes, API experience does not.
