# Remediation Plan R0..R6

## R0 — Reconcile integration and honesty surface

Scope: wire the M15.A identity routes into API registration, export the missing `@pillar/security` symbols, restore failing Makefile gates, and rewrite README/SCORING so the repository no longer claims executable maturity it does not have.

Exit condition: security/API/dashboard targeted typecheck/build/test gates pass, Makefile gate targets no longer swallow failures with `|| true`, `make state` prints `docs/Dev/SCORING.md`, and README/SCORING describe the current non-production state.

## R1 — Daml lifecycle correctness

Scope: make Hold release, consume, and expire choices atomically update `Holding.activeHolds` and `Holding.amount`; ensure intent confirm choices actually move Holdings and create `OperationTrace` records.

Exit condition: ledger-script or equivalent Canton-backed tests demonstrate issue, hold, release, consume, expire, transfer confirm, and operation trace creation against the Daml packages.

## R2 — API correctness — DONE

Scope: projection fallback responses removed from the R2-owned API repository paths; demo projection rows are gated behind `PILLAR_DEMO_DATA=true`; mutating-route idempotency now uses the `@pillar/idempotency` DB state machine by default with the in-memory adapter available only when `PILLAR_IDEMPOTENCY=memory`.

Canonical request hash fields: HTTP method, path template (`METHOD /v1/.../{id}/action` via `pillar-path-template`), API version, normalized JSON body with deep key sort and decimal-string normalization, and `Pillar-Version`.

Env switches: `PILLAR_IDEMPOTENCY` (`memory` for tests/dev only, DB otherwise), `PILLAR_DEMO_DATA` (`true` enables deterministic demo projection rows when `DATABASE_URL` is unset), `PILLAR_PROJECTION_STALE_SECONDS` (strong-read stale threshold, default 60).

Exit condition: idempotency package build/test and API memory-mode typecheck/test passed in this remediation pass; DB-mode verification remains for the parent integration wave with Postgres/migrator.

## R3 — Real ledger-command worker — DONE

Scope: `services/ledger-command` now polls queued requests, creates per-attempt `sub_<uuid>` values, enforces ADR-0011 `cmd_<24-hex>` derivation, builds Daml command envelopes, submits through the submitter boundary, and writes completion correlation back to operation rows. `packages/ledger-types` bindings were regenerated from the R1 DARs and expose the required Holding, Intent, and OperationTrace choices.

Exit condition: package Java binding compile, ledger-command Kotlin compile, and ledger-command tests exit 0 with in-process harness coverage for submission uniqueness, deterministic command identity, command shape, and completion write-back. Sandbox verification remains opt-in with `PILLAR_SANDBOX_LEDGER=true`.

## R4 — Perf/network hardening

Scope: add a Redis cache layer for projection reads, Envoy sidecar for `/v1` routing with rate-limit and circuit breaker behavior, PostgreSQL pool tuning, and reusable gRPC channel pools.

Exit condition: load and failure tests show bounded latency/error behavior for projection reads and ledger submissions with cache, sidecar, pool, and channel reuse enabled.

## R5 — End-to-end vertical slice

Scope: prove `POST /v1/issue_intents` flows through API, sandbox ledger submission, projection update, event creation, and signed webhook delivery.

Exit condition: a single repeatable command starts the local stack and verifies issue intent creation through signed webhook receipt with no mocked ledger or webhook components.

## R6 — Honest re-scoring with evidence links

Scope: re-score P0..P14 and M15.A/B against executable evidence produced by R1..R5, linking each claim to logs, tests, commits, or runbooks.

Exit condition: `docs/Dev/SCORING.md` contains evidence-linked statuses, no PASS is claimed without an executable command or artifact, and `make state` reports the same status table.
