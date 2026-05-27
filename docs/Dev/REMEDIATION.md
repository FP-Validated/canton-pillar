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

## R4 — Perf/network hardening — DONE

Scope: Redis read-through cache for projection reads, ETag/Cache-Control middleware, PostgreSQL pool tuning, reusable ledger-command gRPC ChannelPool, Envoy sidecar config/Helm/compose wiring, and cached-read-mix k6 scenario are implemented.

Exit condition: API typecheck/build/test, ledger-command compile/test with ChannelPool reuse coverage, Helm lint/template, Envoy YAML parse, and compose config all passed in this remediation pass; full k6 load report remains an operator-run artifact for environment-specific latency evidence.

## R5 — End-to-end vertical slice — DONE

Scope: `tools/e2e/run-vertical-slice.sh` now provides `--mode=inproc` and `--mode=compose` orchestration for the `POST /v1/issue_intents` happy path through idempotent replay, ledger-command request uniqueness, operation observation, projected balance, event listing, and signed webhook receipt. The TypeScript driver writes JSON reports under `tests/e2e/issue-intent-slice/reports/`.

Invariants: same `Idempotency-Key` and body replay returns an identical response; only one `ledger_command_requests` row may exist for the operation; admin operation reads expose ledger trace while public reads do not expose Canton internals; projected balance must reflect issuance; exactly one `issue_intent.succeeded` event must appear; webhook delivery must carry a `Pillar-Signature` verified by `@pillar/security`; public responses must not contain `contractId`, `templateId`, `partyId`, `packageId`, `submissionId`, `commandId`, or `updateId`.

Reproduce: `chmod +x tools/e2e/run-vertical-slice.sh && tools/e2e/run-vertical-slice.sh --mode=inproc`. Use `--mode=compose` to run with local Postgres/Redis and migrator verification.

Exit condition: the repeatable command and dashboard live spec are present; CI evidence target is `tools/e2e/run-vertical-slice.sh --mode=inproc`.

## R6 — Honest re-scoring with evidence links

Scope: re-score P0..P14 and M15.A/B against executable evidence produced by R1..R5, linking each claim to logs, tests, commits, or runbooks.

Exit condition: `docs/Dev/SCORING.md` contains evidence-linked statuses, no PASS is claimed without an executable command or artifact, and `make state` reports the same status table.

## Validator Readiness Gate

Real Canton validator testing is sequenced into three tiers. Each tier names the env config the runtime requires.

### Tier 0 - Unit and contract (no validator)

Daml unit tests, API contract tests, idempotency tests, projection rebuild logic. Works under PILLAR_LEDGER_SUBMITTER=fake.

### Tier 1 - Local sandbox (single-node dpm sandbox)

Required envs:
- PILLAR_LEDGER_SUBMITTER=grpc
- PILLAR_LEDGER_HOST=127.0.0.1
- PILLAR_LEDGER_PORT=6865
- PILLAR_LEDGER_TLS=false
- PILLAR_LEDGER_JWT=<sandbox dev token>
- PILLAR_LEDGER_ACT_AS=<tenant party allocated on sandbox boot>
- PILLAR_LEDGER_APPLICATION_ID=pillar-runtime

First real validator test happens here. Vertical slice E2E (`tools/e2e/run-vertical-slice.sh`) should run against this configuration with PILLAR_DEMO_DATA=false and PILLAR_E2E_ALLOW_SYNTHETIC_WEBHOOK=false.

### Tier 2 - Devnet validator

Requires an external CN devnet validator endpoint, a JWT issuer trusted by that participant, and an allocated tenant party on the devnet topology.

### Tier 3 - Testnet/Mainnet

Uses validator-registry providers; mTLS material reload; production JWT issuer; topology rights aligned with provider party rights.

All PILLAR_DEPLOYMENT_MODE in {production, mainnet, testnet} refuses to boot when PILLAR_LEDGER_SUBMITTER=fake (Main.kt).

## Observability Wave - Service /metrics gaps

- api: expected `GET /metrics` on port 3000 in `apps/api/src/server.ts`; Fastify metrics plugin is not wired.
- projection-worker: expected `GET /metrics` on port 8082 in `services/projection-worker/src/main/kotlin/pillar/projectionworker/Main.kt`; Micrometer metrics exist but no Prometheus HTTP scrape endpoint is exposed.
- webhook-dispatcher: expected `GET /metrics` on port 8083 in `services/webhook-dispatcher/src/main/kotlin/pillar/webhookdispatcher/Main.kt`; Micrometer dependency/constants exist but no Prometheus HTTP scrape endpoint is exposed.
- identity: expected `GET /metrics` on port 8090 in `services/identity/src/server.ts`; no Prometheus scrape endpoint is exposed.
- usage-meter: expected `GET /metrics` on port 8091 in `services/usage-meter/src/server.ts`; no Prometheus scrape endpoint is exposed.
- billing-adapter: expected `GET /metrics` on port 8092 in `services/billing-adapter/src/server.ts`; no Prometheus scrape endpoint is exposed.
- template-registry: expected `GET /metrics` on port 8093 in `services/template-registry/src/main/kotlin/pillar/templateregistry/Main.kt`; Micrometer metrics exist but no Prometheus HTTP scrape endpoint is exposed.
- validator-registry: expected `GET /metrics` on port 8094 in `services/validator-registry/src/server.ts`; no Prometheus scrape endpoint is exposed.
- onboarding: expected `GET /metrics` on port 8095 in `services/onboarding/src/server.ts`; no Prometheus scrape endpoint is exposed.
- search-indexer: expected `GET /metrics` on port 8096 in `services/search-indexer/src/main/kotlin/pillar/searchindexer/Main.kt`; no Prometheus scrape endpoint is exposed.
- export-worker: expected `GET /metrics` on port 8097 in `services/export-worker/src/main/kotlin/pillar/exportworker/ExportWorker.kt`; no Prometheus scrape endpoint is exposed.
- compliance-adapter: expected `GET /metrics` on port 8098 in `services/compliance-adapter/src/main/kotlin/pillar/complianceadapter/Main.kt`; no Prometheus scrape endpoint is exposed.
- workflow-orchestrator: expected `GET /metrics` on port 8099 in `services/workflow-orchestrator/src/main/kotlin/pillar/workfloworchestrator/Main.kt`; Micrometer dependency exists but no Prometheus HTTP scrape endpoint is exposed.
- token-standard-adapter: expected `GET /metrics` on port 8100 in `services/token-standard-adapter/src/main`; no Prometheus scrape endpoint is exposed.
