# Pillar Phase Implementation Scoring

## Status (honest)

This is a planning/development repository. The earlier per-phase 9.5 PASS verdicts were scored against scaffolding deliverables (files in place, typecheck/lint clean) rather than executable Canton-backed correctness. A reviewer audit on 2026-05-26 reset scoring to reflect actual runtime maturity. See Remediation Plan R0..R6 in docs/Dev/REMEDIATION.md.

> Per-phase score sheet. PASS threshold: **≥9.5/10**. Phase advancement is blocked until the current phase passes.

## Rubric (per phase, out of 10)

| Weight | Criterion               | What "full credit" looks like                                                                                                 |
| -----: | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
|    2.0 | Ticket completeness     | Every ticket's `Path`+`Output` from the phase doc has matching files on disk. No missing tickets.                             |
|    2.0 | Build gate              | Every `### Build gate` command in the phase doc exits 0, verified by a subagent with shell access. Output snippet recorded.   |
|    2.0 | Verify gate             | Every `### Verify gate` item satisfied with file/test/run evidence.                                                           |
|    1.5 | Invariant gate          | Cross-phase invariants enforced (Canton-invisible API, projection-only DB, signed webhooks, deploymentMode neutrality, etc.). |
|    1.0 | No fabrication          | Every claimed test/check is real and runnable. No fake stubs. No placeholders in production paths.                            |
|    1.0 | Code quality            | Idiomatic per language; error handling; no obvious bugs; follows project conventions.                                         |
|    0.5 | Cross-phase consistency | Uses canonical paths registry, migration range registry, deployment-mode enum, ticket ID scheme, ADR decisions.               |

## Score sheet

| Phase | Status | Evidence | Notes |
| ----- | ------ | -------- | ----- |
| P0 Foundation | PARTIAL | Toolchain pins in `.tool-versions`; root `package.json`, `pnpm-workspace.yaml`, `settings.gradle.kts`, `daml/multi-package.yaml`; `dpm build --all` previously reported exit 0. | Root scaffold and pins are present, but no executable Canton-backed E2E run is recorded. |
| P1 Daml Model | PASS | `dpm build --all` exits 0; per-package `dpm test` exits 0 for `pillar-core` (3 scripts), `pillar-assets` (5 scripts), `pillar-intents` (0 scripts), `pillar-ops` (6 scripts), `pillar-token-adapter` (2 scripts), `pillar-test` (13 scripts). `pillar-test` uses real ledger Script assertions with `createCmd`, `exerciseCmd`, `queryContractId`, `queryFilter`, and `submitMustFail`; Hold create/release/consume/expire atomically updates `Holding.activeHolds` and `Holding.amount` while archiving the companion `Hold`. | Holding-anchored hold lifecycle implemented; intent confirm/fail/succeed choices move real Holdings and exercise OperationTrace choices. |
| P2 API Contract | BROAD PROTOTYPE | `packages/api-contracts/openapi/pillar-v1.yaml`; generated JSON/golden tests previously reported exit 0; R2 removed projection fallback evidence in `apps/api/src/repositories/projection-repo.ts` for owned routes. | Schemas, OpenAPI, and golden fixtures are present; fallback removal improved API honesty, but live runtime coverage remains incomplete. |
| P3 DB/Idempotency | PASS_ON_IDEMPOTENCY | `packages/db/migrations/0000_*..0130_*`; migrator verify previously reported exit 0; `apps/api/src/middleware/idempotency.ts` delegates to `@pillar/idempotency`; canonical-hash fixtures prove semantic parity/conflict hashing. | DB-only default idempotency path is in place; in-memory path is gated to `PILLAR_IDEMPOTENCY=memory` for tests/dev. |
| P4 Ledger Command Runtime | STUB | `services/ledger-command`; Gradle compile/test previously reported exit 0. | Kotlin module exists with config and handlers but no real Canton submission worker E2E. |
| P5 Projection/Reconciliation | PARTIAL | Projection routes/repositories in `apps/api/src/routes/v1/projection.ts`; R2 removed fallback fabrication from `apps/api/src/repositories/projection-repo.ts`; migrations and services present. | Projection fallback is removed/gated, but projection services still lack live ledger-derived reconciliation proof. |
| P6 Webhook System | PARTIAL | HMAC signer/verifier in `packages/security/src/webhook`; webhook route and dispatcher service files present; tests previously reported exit 0. | HMAC signer is solid; dispatcher loop and DLQ are stubbed. |
| P7 SDK/CLI/Workbench | SCAFFOLD | SDK packages, CLI, Workbench app, and generated clients exist. | Typed clients and CLI command grammar exist; not exercised against a live runtime. |
| P8 Security/Compliance | PARTIAL | Argon2 key hashing/API key code; scope catalog; compliance adapter service files; migrations. | Argon2 keys and scope catalog exist; compliance/KYC/sanctions adapters are stubs. |
| P9 CI/CD/Helm | SCAFFOLD | `infra/helm/pillar`; Dockerfiles; GitHub workflow files; compose configs. | Chart, values, and workflows render; full multi-arch, cosign, and SLSA evidence is plan-only. |
| P10 GA Hardening | SCAFFOLD | Chaos/perf scripts under `tests/` and `tools/perf`; observability dashboards/rules under `infra/observability`. | Chaos/perf scripts exist; no real run. |
| P11 Search/Export/Reporting | PROTOTYPE | API routes, migrations, search-indexer/export-worker services. | Routes and workers compile; no live indexer/export proof. |
| P12 Template Registry | PROTOTYPE | Template registry migration, service, API/admin surface, Helm wiring. | Schema and service compile; signature verify and upgrade choreography untested against real DARs. |
| P13 Dashboard/Docs/Onboarding | SCAFFOLD | Dashboard/docs/onboarding apps and routes; onboarding service; Helm surfaces. | Apps build; not bound to live identity or live tenant data. |
| P14 Usage/Billing | PROTOTYPE | Usage/billing migrations, middleware, worker, dashboard billing files. | Non-blocking middleware and worker exist; not exercised against a real provider. |
| M15.A Identity/OAuth | PARTIAL | Identity migrations/service/routes; `apps/api/src/routes/v1/auth/identity.ts`; `apps/api/src/routes/v1/admin/identity/index.ts`; R0 route registration. | Migrations, service, and routes exist; Google OAuth not exercised end-to-end; routes registration was not wired before R0. |
| M15.B Network/Validator Registry | PARTIAL | Network/validator migrations/service/admin routes; `apps/api/src/routes/v1/admin/network/index.ts`; `apps/api/src/routes/v1/network/index.ts`. | Migrations, service, and admin routes exist; live validator probing untested. |

## Mission completion criterion

No phase is currently PASS against executable Canton-backed correctness. R0..R6 must land and be re-scored with evidence before declaring production readiness.
