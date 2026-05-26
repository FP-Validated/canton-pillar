# Remediation Plan R0..R6

## R0 — Reconcile integration and honesty surface

Scope: wire the M15.A identity routes into API registration, export the missing `@pillar/security` symbols, restore failing Makefile gates, and rewrite README/SCORING so the repository no longer claims executable maturity it does not have.

Exit condition: security/API/dashboard targeted typecheck/build/test gates pass, Makefile gate targets no longer swallow failures with `|| true`, `make state` prints `docs/Dev/SCORING.md`, and README/SCORING describe the current non-production state.

## R1 — Daml lifecycle correctness

Scope: make Hold release, consume, and expire choices atomically update `Holding.activeHolds` and `Holding.amount`; ensure intent confirm choices actually move Holdings and create `OperationTrace` records.

Exit condition: ledger-script or equivalent Canton-backed tests demonstrate issue, hold, release, consume, expire, transfer confirm, and operation trace creation against the Daml packages.

## R2 — API correctness

Scope: remove projection fallback responses, gate demo data behind `PILLAR_DEMO_DATA=true`, and make idempotency DB-only with a canonical request hash.

Exit condition: API tests prove projection misses return explicit unavailable/not-found errors unless demo mode is enabled, and retry/conflict behavior is served from the database idempotency table only.

## R3 — Real ledger-command worker

Scope: implement `services/ledger-command` as a real worker that polls operations, attempts work, builds Daml commands, submits to Canton, consumes completions, and updates operation state.

Exit condition: an integration run against Canton sandbox shows an operation moving from pending to submitted to completed or failed with command/workflow/update correlation persisted.

## R4 — Perf/network hardening

Scope: add a Redis cache layer for projection reads, Envoy sidecar for `/v1` routing with rate-limit and circuit breaker behavior, PostgreSQL pool tuning, and reusable gRPC channel pools.

Exit condition: load and failure tests show bounded latency/error behavior for projection reads and ledger submissions with cache, sidecar, pool, and channel reuse enabled.

## R5 — End-to-end vertical slice

Scope: prove `POST /v1/issue_intents` flows through API, sandbox ledger submission, projection update, event creation, and signed webhook delivery.

Exit condition: a single repeatable command starts the local stack and verifies issue intent creation through signed webhook receipt with no mocked ledger or webhook components.

## R6 — Honest re-scoring with evidence links

Scope: re-score P0..P14 and M15.A/B against executable evidence produced by R1..R5, linking each claim to logs, tests, commits, or runbooks.

Exit condition: `docs/Dev/SCORING.md` contains evidence-linked statuses, no PASS is claimed without an executable command or artifact, and `make state` reports the same status table.
