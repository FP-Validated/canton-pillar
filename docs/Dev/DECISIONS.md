# Pillar Architecture Decision Record

> Append-only. New decisions go to the bottom. NEVER edit a past decision; supersede it with a new entry that links back.

## Index

| ID                                                                                                                    | Status   | Title                                                                                                 | Supersedes | Phases affected                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-0001](#adr-0001-canton-ledger-as-sole-source-of-truth)                                                           | Accepted | Canton Ledger as sole source of truth                                                                 | -          | [P1](./Phase_01_Daml_Model.md), [P4](./Phase_04_Ledger_Command_Runtime.md), [P5](./Phase_05_Projection_Reconciliation.md), [P10](./Phase_10_GA_Hardening.md)                                                                                                                                                                                                                                                                           |
| [ADR-0002](#adr-0002-stripe-style-external-api-surface-canton-internals-hidden)                                       | Accepted | Stripe-style external API surface; Canton internals hidden                                            | -          | [P2](./Phase_02_API_Contract.md), [P4](./Phase_04_Ledger_Command_Runtime.md), [P7](./Phase_07_SDK_CLI_Workbench.md), [P8](./Phase_08_Security_Compliance.md)                                                                                                                                                                                                                                                                           |
| [ADR-0003](#adr-0003-intent-first-write-path)                                                                         | Accepted | Intent-first write path                                                                               | -          | [P1](./Phase_01_Daml_Model.md), [P2](./Phase_02_API_Contract.md), [P3](./Phase_03_DB_Idempotency.md), [P4](./Phase_04_Ledger_Command_Runtime.md), [P6](./Phase_06_Webhook_Event_System.md)                                                                                                                                                                                                                                             |
| [ADR-0004](#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt)                         | Accepted | Stable operation_id → stable command_id; unique submission_id per attempt                             | -          | [P3](./Phase_03_DB_Idempotency.md), [P4](./Phase_04_Ledger_Command_Runtime.md), [P5](./Phase_05_Projection_Reconciliation.md), [P8](./Phase_08_Security_Compliance.md)                                                                                                                                                                                                                                                                 |
| [ADR-0005](#adr-0005-projection--audit--config-split-for-pillar-postgres)                                             | Accepted | Projection / Audit / Config split for Pillar Postgres                                                 | -          | [P3](./Phase_03_DB_Idempotency.md), [P5](./Phase_05_Projection_Reconciliation.md), [P6](./Phase_06_Webhook_Event_System.md), [P10](./Phase_10_GA_Hardening.md)                                                                                                                                                                                                                                                                         |
| [ADR-0006](#adr-0006-webhook-first-async-with-hmac-sha256-signing-and-per-endpoint-version-pinning)                   | Accepted | Webhook-first async with HMAC-SHA256 signing and per-endpoint version pinning                         | -          | [P2](./Phase_02_API_Contract.md), [P6](./Phase_06_Webhook_Event_System.md), [P7](./Phase_07_SDK_CLI_Workbench.md), [P8](./Phase_08_Security_Compliance.md)                                                                                                                                                                                                                                                                             |
| [ADR-0007](#adr-0007-language-split-kotlinjvm-for-ledger-facing-services-typescript-for-public-api-and-dev-tooling)   | Accepted | Language split: Kotlin/JVM for ledger-facing services, TypeScript for public API and dev tooling      | -          | [P0](./Phase_00_Foundation.md), [P2](./Phase_02_API_Contract.md), [P4](./Phase_04_Ledger_Command_Runtime.md), [P5](./Phase_05_Projection_Reconciliation.md), [P7](./Phase_07_SDK_CLI_Workbench.md)                                                                                                                                                                                                                                     |
| [ADR-0008](#adr-0008-pillar-native-asset-model-first-cn-token-standard-via-adapter-boundary)                          | Accepted | Pillar-native asset model first, CN Token Standard via adapter boundary                               | -          | [P1](./Phase_01_Daml_Model.md), [P4](./Phase_04_Ledger_Command_Runtime.md), [P5](./Phase_05_Projection_Reconciliation.md), [P7](./Phase_07_SDK_CLI_Workbench.md)                                                                                                                                                                                                                                                                       |
| [ADR-0009](#adr-0009-mission-control-delivery-phase-gated-development-with-ticket-ids-pphasearea-letternn)            | Accepted | Mission control delivery: phase-gated development with ticket IDs `P<phase>.<area-letter><nn>`        | -          | [P0](./Phase_00_Foundation.md), [P1](./Phase_01_Daml_Model.md), [P2](./Phase_02_API_Contract.md), [P3](./Phase_03_DB_Idempotency.md), [P4](./Phase_04_Ledger_Command_Runtime.md), [P5](./Phase_05_Projection_Reconciliation.md), [P6](./Phase_06_Webhook_Event_System.md), [P7](./Phase_07_SDK_CLI_Workbench.md), [P8](./Phase_08_Security_Compliance.md), [P9](./Phase_09_CICD_Helm_Deployment.md), [P10](./Phase_10_GA_Hardening.md) |
| [ADR-0010](#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar) | Accepted | Deployment-mode independence: hosted / customer-validator / self-hosted share identical `/v1` grammar | -          | [P2](./Phase_02_API_Contract.md), [P7](./Phase_07_SDK_CLI_Workbench.md), [P9](./Phase_09_CICD_Helm_Deployment.md), [P10](./Phase_10_GA_Hardening.md)                                                                                                                                                                                                                                                                                   |
| [ADR-0011](#adr-0011-command_id-derivation-spec)                                                                      | Accepted | command_id derivation spec                                                                            | -          | [P4](./Phase_04_Ledger_Command_Runtime.md), [P10](./Phase_10_GA_Hardening.md)                                                                                                                                                                                                                                                                                                                                                          |
| [ADR-0012](#adr-0012-cli-implementation-language)                                                                     | Accepted | CLI implementation language                                                                           | -          | [P7](./Phase_07_SDK_CLI_Workbench.md), [P9](./Phase_09_CICD_Helm_Deployment.md)                                                                                                                                                                                                                                                                                                                                                        |
| [ADR-0013](#adr-0013-initial-sdk-scope)                                                                               | Accepted | Initial SDK scope                                                                                     | -          | [P7](./Phase_07_SDK_CLI_Workbench.md), [P13](./Phase_13_Dashboard_Docs_Onboarding.md)                                                                                                                                                                                                                                                                                                                                                  |
| [ADR-0014](#adr-0014-event-payload-mode)                                                                              | Accepted | Event payload mode                                                                                    | -          | [P2](./Phase_02_API_Contract.md), [P6](./Phase_06_Webhook_Event_System.md), [P7](./Phase_07_SDK_CLI_Workbench.md)                                                                                                                                                                                                                                                                                                                      |
| [ADR-0015](#adr-0015-custody-model-for-v1)                                                                            | Accepted | Custody model for v1                                                                                  | -          | [P3](./Phase_03_DB_Idempotency.md), [P4](./Phase_04_Ledger_Command_Runtime.md), [P5](./Phase_05_Projection_Reconciliation.md), [P8](./Phase_08_Security_Compliance.md)                                                                                                                                                                                                                                                                 |
| [ADR-0016](#adr-0016-multi-tenant-db-isolation)                                                                       | Accepted | Multi-tenant DB isolation                                                                             | -          | [P3](./Phase_03_DB_Idempotency.md), [P8](./Phase_08_Security_Compliance.md), [P9](./Phase_09_CICD_Helm_Deployment.md)                                                                                                                                                                                                                                                                                                                  |
| [ADR-0017](#adr-0017-asset-standard-timing)                                                                           | Accepted | Asset standard timing                                                                                 | -          | [P1](./Phase_01_Daml_Model.md), [P4](./Phase_04_Ledger_Command_Runtime.md), [P9](./Phase_09_CICD_Helm_Deployment.md)                                                                                                                                                                                                                                                                                                                   |
| [ADR-0018](#adr-0018-metadata-pii-policy)                                                                             | Accepted | Metadata PII policy                                                                                   | -          | [P2](./Phase_02_API_Contract.md), [P7](./Phase_07_SDK_CLI_Workbench.md), [P8](./Phase_08_Security_Compliance.md), [P13](./Phase_13_Dashboard_Docs_Onboarding.md)                                                                                                                                                                                                                                                                       |
| [ADR-0019](#adr-0019-strong-read-consistency-semantics)                                                               | Accepted | Strong-read consistency semantics                                                                     | -          | [P2](./Phase_02_API_Contract.md), [P5](./Phase_05_Projection_Reconciliation.md), [P7](./Phase_07_SDK_CLI_Workbench.md)                                                                                                                                                                                                                                                                                                                 |

## Format

Each ADR is a compact binding decision record:

```text
### ADR-NNNN: Title
- Status: Accepted | Superseded by ADR-NNNN | Proposed
- Context: Why this decision exists, with design-pass source references.
- Decision: The binding rule future work must follow.
- Consequences: Phase-level enforcement and operational implications.
- Alternatives considered: Rejected options and why they do not fit Pillar.
- References: Relative links to source-of-authority documents.
```

This log is append-only. To change a decision, add a new ADR with `Status: Accepted`, set `Supersedes: ADR-NNNN` in the index, and link back from the new entry's References.

## ADRs

### ADR-0001: Canton Ledger as sole source of truth

- Status: Accepted
- Context: The mission statement says: "Canton Ledger is the only source of truth." The cross-phase invariants further bind this as "Canton Ledger is the single economic source of truth" and require the Pillar DB to store "only Projection / Audit / Config. Asset state in DB is regenerable."
- Decision: Canton Ledger and Daml contract state are the sole economic source of truth for financial state; Pillar DB state is never authoritative for asset ownership, balance, settlement, lock, redemption, reversal, or claim state.
- Consequences:
  - [Phase_01_Daml_Model.md](./Phase_01_Daml_Model.md) must encode economic state transitions in Daml, not in off-ledger application tables.
  - [Phase_04_Ledger_Command_Runtime.md](./Phase_04_Ledger_Command_Runtime.md) must submit ledger commands for all asset-moving mutations.
  - [Phase_05_Projection_Reconciliation.md](./Phase_05_Projection_Reconciliation.md) must treat projections as rebuildable derivations from Canton Ledger / PQS.
  - [Phase_10_GA_Hardening.md](./Phase_10_GA_Hardening.md) must include recovery and chaos checks proving DB projection loss does not become asset loss.
- Alternatives considered:
  - DB-as-ledger: rejected because Architecture/02 states "DB balance는 절대 권한 판단의 최종 근거가 아니다" and because mutable DB rows would bypass Canton/Daml validation.
  - Dual-write economic state to Canton and Postgres: rejected because reconciliation races would create two competing authorities.
- References:
  - [README invariants 1-2](./README.md#cross-phase-invariants-never-violate)
  - [Architecture/02 — Pillar Complete System Architecture](../Architecture/02_Pillar%20Complete%20System%20Architecture.md)

### ADR-0002: Stripe-style external API surface; Canton internals hidden

- Status: Accepted
- Context: The mission is to ship Pillar as the "Stripe for Canton-backed assets." Invariants require that the public `/v1` API never exposes `contractId`, `templateId`, `partyId`, `participantId`, `packageId`, or `commandId`, while every mutation remains internally traceable through `intent → operation → command_id → update_id/offset`.
- Decision: Pillar's public API is Stripe-style REST over stable public objects and IDs; Canton and Daml identifiers remain internal runtime/audit details unless exposed through a privileged trace surface.
- Consequences:
  - [Phase_02_API_Contract.md](./Phase_02_API_Contract.md) must define balance/holding/intent-first OpenAPI objects, errors, pagination, idempotency, and versioning without Canton primitives.
  - [Phase_04_Ledger_Command_Runtime.md](./Phase_04_Ledger_Command_Runtime.md) must translate public operations to Canton commands behind the API boundary.
  - [Phase_07_SDK_CLI_Workbench.md](./Phase_07_SDK_CLI_Workbench.md) must preserve the Stripe-grade developer model in SDKs, CLI, and Workbench.
  - [Phase_08_Security_Compliance.md](./Phase_08_Security_Compliance.md) must restrict ledger trace expansion and raw Canton identifiers to authorized operational views.
- Alternatives considered:
  - Public Canton JSON Ledger API proxy: rejected because it exposes `party_id`, `contract_id`, templates, choices, participant topology, and package versioning as customer-facing grammar.
  - Contract-first REST API: rejected because Architecture/04 makes balance/holding-first objects the external model and keeps contracts internal.
- References:
  - [README invariants 3-4](./README.md#cross-phase-invariants-never-violate)
  - [Architecture/03 — Pillar API Grammar v1](../Architecture/03_Pillar%20API%20Grammar%20v1.md)
  - [Architecture/04 — Object Model](../Architecture/04_Object%20Model.md)

### ADR-0003: Intent-first write path

- Status: Accepted
- Context: Architecture/06 states that Pillar's Intent model is designed as "Stripe-like public API + Canton-native internal runtime." Architecture/23 specifies an internal write path where a client creates a `transfer_intent`, the API inserts intent/operation/ledger command request records, and the ledger command service later submits Canton commands.
- Decision: Every external write creates an intent and operation first; runtime services compile the intended change into one or more ledger command plans and final state is observed through projection and webhooks.
- Consequences:
  - [Phase_01_Daml_Model.md](./Phase_01_Daml_Model.md) must include intent lifecycle templates and transitions.
  - [Phase_02_API_Contract.md](./Phase_02_API_Contract.md) must expose create/confirm/cancel-style intent workflows rather than raw transaction construction.
  - [Phase_03_DB_Idempotency.md](./Phase_03_DB_Idempotency.md) must persist intent, operation, idempotency, and ledger command request rows in one acceptance transaction.
  - [Phase_04_Ledger_Command_Runtime.md](./Phase_04_Ledger_Command_Runtime.md) must compile operations from stored intent state, not transient HTTP request state.
  - [Phase_06_Webhook_Event_System.md](./Phase_06_Webhook_Event_System.md) must emit final transitions after projected ledger state changes.
- Alternatives considered:
  - Synchronous transaction API: rejected because Canton command completion/update/projection is asynchronous and Architecture/23's write path ends with webhook or GET observation.
  - Client-supplied ledger transaction plans: rejected because it leaks Canton internals and prevents Pillar from enforcing policy, idempotency, and command identity centrally.
- References:
  - [Architecture/06 — TransferIntent / SettlementIntent State Machine](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md)
  - [Architecture/23 — Internal Runtime](../Architecture/23_Implementation%20Plan.md#internal-runtime)

### ADR-0004: Stable operation_id → stable command_id; unique submission_id per attempt

- Status: Accepted
- Context: Invariant 5 states: "Same external intended change ⇒ same `operation_id` ⇒ same `command_id`. New `submission_id` per attempt." Architecture/23 defines the same rule as `same tenant + same endpoint + same idempotency key + same request hash = same operation_id = same command_id` and requires `submission_id` to change on every attempt.
- Decision: Pillar derives a stable `operation_id` and stable Canton `command_id` for the same external intended change, while assigning a unique `submission_id` for each submit attempt.
- Consequences:
  - [Phase_03_DB_Idempotency.md](./Phase_03_DB_Idempotency.md) must bind tenant, endpoint, idempotency key, and request hash to one operation identity.
  - [Phase_04_Ledger_Command_Runtime.md](./Phase_04_Ledger_Command_Runtime.md) must preserve command identity across retries and rotate only submission identity per attempt.
  - [Phase_05_Projection_Reconciliation.md](./Phase_05_Projection_Reconciliation.md) must correlate completions, updates, projection rows, and operation status through command/update identity.
  - [Phase_08_Security_Compliance.md](./Phase_08_Security_Compliance.md) must retain audit evidence connecting request, operation, command, submission attempt, and ledger update.
- Alternatives considered:
  - Random `command_id` per retry: rejected because Canton deduplication and completion correlation would not protect retry-safe operation semantics.
  - Reusing one `submission_id` across retries: rejected because retry attempts need distinct completion/attempt evidence even when they represent the same logical command.
- References:
  - [Architecture/07 — Canton-native runtime](../Architecture/07_Canton-native%20runtime.md)
  - [Architecture/23 — Command Identity](../Architecture/23_Implementation%20Plan.md#2-command-identity)
  - [README invariant 5](./README.md#cross-phase-invariants-never-violate)

### ADR-0005: Projection / Audit / Config split for Pillar Postgres

- Status: Accepted
- Context: Invariant 2 says: "Pillar DB stores only Projection / Audit / Config. Asset state in DB is regenerable." Architecture/23's schema groups split Postgres into `config`, `audit`, `projection`, `webhook`, and `reconciliation`, with economic state represented as projected rows and trace records rather than authority.
- Decision: Pillar Postgres is organized around projection, audit, and configuration responsibilities; webhook delivery and reconciliation tables are operational extensions of those responsibilities, not independent economic state.
- Consequences:
  - [Phase_03_DB_Idempotency.md](./Phase_03_DB_Idempotency.md) must create audit/idempotency/config tables without making them balance authority.
  - [Phase_05_Projection_Reconciliation.md](./Phase_05_Projection_Reconciliation.md) must prove balances, holdings, transfers, operation projections, and checkpoints are rebuildable.
  - [Phase_06_Webhook_Event_System.md](./Phase_06_Webhook_Event_System.md) must persist event and delivery state as an outbox over projected ledger state.
  - [Phase_10_GA_Hardening.md](./Phase_10_GA_Hardening.md) must validate backup/restore, projection rebuild, reconciliation diffs, and audit retention boundaries.
- Alternatives considered:
  - Single business database with mutable asset rows: rejected because it turns Postgres into a shadow ledger.
  - Separate hidden correction tables for reconciliation: rejected because reconciliation must emit diffs and rebuild tasks, not silent economic corrections.
- References:
  - [README invariant 2](./README.md#cross-phase-invariants-never-violate)
  - [Architecture/05 — Asset read model](../Architecture/05_asset%20read%20model.md)
  - [Architecture/23 — DB Schema](../Architecture/23_Implementation%20Plan.md#db-schema)

### ADR-0006: Webhook-first async with HMAC-SHA256 signing and per-endpoint version pinning

- Status: Accepted
- Context: Invariant 7 requires webhooks to be "signed (HMAC-SHA256), versioned per endpoint, retried, replayable." Architecture/10 adopts Stripe's webhook model with thin events, HMAC-SHA256 over `{timestamp}.{raw_payload}`, endpoint-specific secrets, replay handling, and per-endpoint payload versions.
- Decision: Pillar treats webhook delivery as the primary async notification path for final state changes, signs every delivery with HMAC-SHA256, retries/replays durably, and pins event shape to each endpoint's configured API version.
- Consequences:
  - [Phase_02_API_Contract.md](./Phase_02_API_Contract.md) must define Event objects, endpoint version behavior, and webhook-visible resource grammar.
  - [Phase_06_Webhook_Event_System.md](./Phase_06_Webhook_Event_System.md) must implement durable event outbox, delivery attempts, retry, replay, endpoint secret rotation, and signature verification fixtures.
  - [Phase_07_SDK_CLI_Workbench.md](./Phase_07_SDK_CLI_Workbench.md) must support local forwarding, replay, event inspection, and signature verification helpers.
  - [Phase_08_Security_Compliance.md](./Phase_08_Security_Compliance.md) must enforce raw-body signing, timestamp tolerance, constant-time comparison, secret rotation, and delivery audit evidence.
- Alternatives considered:
  - Polling-first finality: rejected because Pillar's async ledger runtime needs push notification for state transitions and webhook-first UX is an explicit invariant.
  - Unsigned internal-only callbacks: rejected because customer endpoints receive untrusted internet traffic and must authenticate payload origin and freshness.
  - Global event version only: rejected because endpoint version pinning is required for safe customer upgrades.
- References:
  - [Architecture/10 — Event / Webhook System](../Architecture/10_Event_Webhook%20System.md)
  - [README invariant 7](./README.md#cross-phase-invariants-never-violate)

### ADR-0007: Language split: Kotlin/JVM for ledger-facing services, TypeScript for public API and dev tooling

- Status: Accepted
- Context: Architecture/23 records the language selection: ledger command runtime and projection/orchestration are Kotlin/JVM; public API is TypeScript + Fastify; webhook dispatcher, Dashboard/Workbench, and Node SDK are TypeScript. The decision text says ledger-facing services stay JVM-first while public API and developer tooling stay TypeScript-first.
- Decision: Use Kotlin/JVM for ledger-facing services that depend on Daml Java codegen, gRPC Ledger API, projection discipline, and retry/offset correctness; use TypeScript for the public API, webhook JSON boundary, Workbench, CLI, and Node developer tooling.
- Consequences:
  - [Phase_00_Foundation.md](./Phase_00_Foundation.md) must establish both JVM/Kotlin and TypeScript workspaces, codegen, build, and dependency conventions.
  - [Phase_02_API_Contract.md](./Phase_02_API_Contract.md) must keep OpenAPI and public object grammar TypeScript-friendly without importing Canton runtime types.
  - [Phase_04_Ledger_Command_Runtime.md](./Phase_04_Ledger_Command_Runtime.md) must implement Daml command construction/submission/completion in Kotlin/JVM.
  - [Phase_05_Projection_Reconciliation.md](./Phase_05_Projection_Reconciliation.md) must implement ledger/PQS projection and reconciliation in Kotlin/JVM.
  - [Phase_07_SDK_CLI_Workbench.md](./Phase_07_SDK_CLI_Workbench.md) must provide TypeScript-first developer tooling and generated SDK surfaces.
- Alternatives considered:
  - All-TypeScript backend: rejected because ledger-facing services benefit from typed Daml Java bindings, JVM gRPC maturity, and strong concurrency primitives.
  - All-JVM platform: rejected because the public API, Workbench, CLI, and Node SDK need fast iteration around JSON/OpenAPI/developer UX.
  - Shared Canton domain types in the public API package: rejected because it would force Canton concerns into `/v1` grammar.
- References:
  - [Architecture/23 — Language Selection](../Architecture/23_Implementation%20Plan.md#language-selection)

### ADR-0008: Pillar-native asset model first, CN Token Standard via adapter boundary

- Status: Accepted
- Context: Architecture/23 lists "첫 버전부터 모든 자산 표준 지원" as a non-goal and says the first version prioritizes "Pillar-native asset + adapter boundary." It also states that Pillar initially implements a Pillar-native asset model while keeping `daml/pillar-token-adapter` and `services/token-standard-adapter` as separate boundaries for CN Token Standard integration.
- Decision: Implement the Pillar-native asset model first; integrate CN Token Standard through explicit adapter modules (`daml/pillar-token-adapter` and `services/token-standard-adapter`) that cannot leak contract-first semantics into the public API.
- Consequences:
  - [Phase_01_Daml_Model.md](./Phase_01_Daml_Model.md) must build the Pillar-native Daml asset/holding/intent model and adapter interfaces without coupling public API objects to CN Token Standard internals.
  - [Phase_04_Ledger_Command_Runtime.md](./Phase_04_Ledger_Command_Runtime.md) must route token-standard-specific command planning through the adapter boundary.
  - [Phase_05_Projection_Reconciliation.md](./Phase_05_Projection_Reconciliation.md) must project CN Token Standard holdings into the same public balance/holding model.
  - [Phase_07_SDK_CLI_Workbench.md](./Phase_07_SDK_CLI_Workbench.md) must expose one Pillar API grammar whether the backing asset is Pillar-native or adapter-backed.
- Alternatives considered:
  - CN Token Standard first: rejected because it would make the initial object model contract/UTXO-standard-first instead of Pillar's balance/holding/intent-first model.
  - Dual-mode from day one: rejected because it widens Phase 1 and Phase 4 before the public grammar, projection model, and adapter boundary are stable.
  - No CN Token Standard path: rejected because Canton Network interoperability remains a required integration direction.
- References:
  - [Architecture/23 — Non-goals](../Architecture/23_Implementation%20Plan.md#non-goals)
  - [Architecture/23 — Open Questions](../Architecture/23_Implementation%20Plan.md#open-questions)
  - [Architecture/23 — Language / module boundary](../Architecture/23_Implementation%20Plan.md#language-selection)

### ADR-0009: Mission control delivery: phase-gated development with ticket IDs `P<phase>.<area-letter><nn>`

- Status: Accepted
- Context: The Dev README says Pillar is "built phase-by-phase, gated, and agent-executable." It defines a ticket as the smallest agent-executable unit and specifies the ticket ID form `Pn.Lxx`, with examples such as `P3.D04`.
- Decision: Delivery is governed from `docs/Dev/` through phase documents, Build/Verify/Invariant gates, and ticket IDs in the form `P<phase>.<area-letter><nn>`; work does not promote to the next phase unless all gates are green.
- Consequences:
  - [Phase_00_Foundation.md](./Phase_00_Foundation.md) through [Phase_10_GA_Hardening.md](./Phase_10_GA_Hardening.md) must remain phase-bounded, with agent-ready tickets, explicit acceptance, and exit gates.
  - [Phase_09_CICD_Helm_Deployment.md](./Phase_09_CICD_Helm_Deployment.md) must make gate commands and deployment promotion reproducible.
  - [Phase_10_GA_Hardening.md](./Phase_10_GA_Hardening.md) must re-check cross-phase invariants before GA promotion.
  - New cross-phase work must be filed into the smallest appropriate phase rather than widening current scope silently.
- Alternatives considered:
  - Backlog-only delivery without phase gates: rejected because it loses the Build/Verify/Invariant promotion model and makes cross-phase invariants unenforceable.
  - Large epic tickets spanning multiple phases: rejected because README defines tickets as the smallest agent-executable unit and says tickets never cross phases.
  - Promoting with known red gates: rejected because the gate model says failing gate means a follow-up ticket inside the current phase and never promotion with red.
- References:
  - [Dev README — Mission Control Methodology](./README.md#0-mission-control-methodology)
  - [Dev README — Gate Model](./README.md#3-gate-model)
  - [Dev README — Ticket Anatomy](./README.md#4-ticket-anatomy)

### ADR-0010: Deployment-mode independence: hosted / customer-validator / self-hosted share identical `/v1` grammar

- Status: Accepted
- Context: Invariant 8 says `deploymentMode` (`hosted`, `customer-validator`, `self-hosted`) changes infrastructure wiring only and `/v1` grammar does not change. Architecture/18 states: "Deployment model changes. API experience does not," and requires hosted, dedicated, hybrid, and fully self-hosted modes to provide the same `/v1` API grammar, object model, SDK, webhook contract, and idempotency semantics.
- Decision: Hosted, customer-validator, and self-hosted deployments share one `/v1` API grammar, object model, webhook contract, SDK behavior, and idempotency semantics; deployment mode changes only control-plane/data-plane wiring and operational responsibility.
- Consequences:
  - [Phase_02_API_Contract.md](./Phase_02_API_Contract.md) must define one OpenAPI contract and object grammar without deployment-mode forks.
  - [Phase_07_SDK_CLI_Workbench.md](./Phase_07_SDK_CLI_Workbench.md) must keep SDK, CLI, and Workbench behavior deployment-neutral.
  - [Phase_09_CICD_Helm_Deployment.md](./Phase_09_CICD_Helm_Deployment.md) must package hosted/customer-validator/self-hosted wiring without changing `/v1` behavior.
  - [Phase_10_GA_Hardening.md](./Phase_10_GA_Hardening.md) must test deployment modes for API parity, idempotency parity, and webhook contract parity.
- Alternatives considered:
  - Separate APIs per deployment mode: rejected because customer code, SDKs, webhooks, and idempotency semantics would fork across infrastructure choices.
  - Exposing Canton participant topology in customer-validator/self-hosted APIs: rejected because deployment mode must not violate the Canton-invisible external API decision.
  - Hosted-first grammar with later self-hosted exceptions: rejected because it would break long-term compatibility and make regulated deployment modes second-class.
- References:
  - [README invariant 8](./README.md#cross-phase-invariants-never-violate)
  - [Architecture/18 — Deployment / Enterprise Architecture](../Architecture/18_Deployment.md)

### ADR-0011: command_id derivation spec

- Status: Accepted
- Context: Invariant 5 and ADR-0004 require that the same external intended change reuse the same `operation_id` and the same Canton `command_id`, while every submission attempt gets a unique `submission_id`. The Phase 04 doc previously left the exact derivation as an Open Question; this blocks idempotency/dedup ticket execution because `P4.F04` cannot be implemented without it.
- Decision: Pillar derives Canton command identity as follows:
  - `operation_id` = ULID stable per accepted intent, persisted in `operations.id`.
  - `command_id` = first 24 hex characters of `SHA256(tenant_id || "|" || operation_id || "|" || command_semantic_version)`. `command_semantic_version` is a Pillar-controlled string of the form `<command_type>:<schema_major>` (e.g. `transfer:v1`).
  - `submission_id` = freshly generated UUIDv4 per submit attempt.
- Consequences:
  - [Phase_04_Ledger_Command_Runtime.md](./Phase_04_Ledger_Command_Runtime.md) `P4.F03` must compute `command_id` from these inputs only; `P4.F04` retries reuse the same `command_id` and rotate only `submission_id`.
  - [Phase_10_GA_Hardening.md](./Phase_10_GA_Hardening.md) chaos suite (`P10.L01`) asserts that retry-storm scenarios do not produce more than one distinct `command_id` per `operation_id`.
  - Future schema-breaking changes to a command shape MUST bump `command_semantic_version` so dedup boundaries remain correct.
- Alternatives considered:
  - Hashing the full request body: rejected because request-body whitespace or field ordering would alter the hash without semantic change.
  - Using `operation_id` directly as `command_id`: rejected because Canton `command_id` namespace is per-application and may need a hash to fit length/charset rules without leaking ULID timestamp prefixes.
- References:
  - [ADR-0004](#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt)
  - [README invariant 5](./README.md#cross-phase-invariants-never-violate)

### ADR-0012: CLI implementation language

- Status: Accepted
- Context: [Architecture/14](../Architecture/14_CLI%20Design.md) floats a Go static binary for the CLI, while the source tree and developer-tooling plan are TypeScript-first and SDK generation already requires TypeScript codegen. The command grammar is the long-lived contract; the runtime implementation language is not.
- Decision: Pillar's `pillar` CLI is TypeScript (Node) at M7. A Go static binary rewrite is a post-GA option, not a v1 commitment. Command grammar is binding; implementation language is not.
- Consequences:
  - [Phase_07_SDK_CLI_Workbench.md](./Phase_07_SDK_CLI_Workbench.md) ships the TypeScript CLI and keeps command grammar stable across implementation changes.
  - [Phase_09_CICD_Helm_Deployment.md](./Phase_09_CICD_Helm_Deployment.md) packages the TypeScript CLI into the Docker image and release artifacts.
  - Any Go binary appears, if at all, in a post-GA backlog ADR that preserves the existing command grammar.
- Alternatives considered:
  - Go from day one: rejected because it doubles SDK/CLI sync effort at M7.
  - Rust: rejected because the CLI/plugin ecosystem is smaller for Pillar's OpenAPI, Node SDK, and developer-tooling path.
- References:
  - [ADR-0007](#adr-0007-language-split-kotlinjvm-for-ledger-facing-services-typescript-for-public-api-and-dev-tooling)
  - [Phase 07 — SDK / CLI / Workbench](./Phase_07_SDK_CLI_Workbench.md)
  - [Architecture/14 — CLI Design](../Architecture/14_CLI%20Design.md)

### ADR-0013: Initial SDK scope

- Status: Accepted
- Context: [Architecture/15](../Architecture/15_SDK%20Design.md) lists seven or more SDK and tooling targets. M7 capacity in the current plan supports three hand-maintained ergonomic wrappers without diluting quality.
- Decision: M7 ships Node, Python, and Java SDKs only. Go, .NET, React hooks, Postman collection, and Terraform provider are post-GA backlog.
- Consequences:
  - [Phase_07_SDK_CLI_Workbench.md](./Phase_07_SDK_CLI_Workbench.md) tickets `P7.I01`, `P7.I02`, and `P7.I03` cover Node, Python, and Java only.
  - A post-GA ADR can add Go first if Pillar-style API demand is highest there.
  - Customer-facing documentation must clearly say "Node, Python, Java officially supported."
- Alternatives considered:
  - All seven targets at M7: rejected because it dilutes correctness, ergonomics, test depth, and release discipline.
  - Node only: rejected because enterprise customers need Java support for backend integration.
- References:
  - [Phase 07 — SDK / CLI / Workbench](./Phase_07_SDK_CLI_Workbench.md)
  - [Phase 13 — Dashboard / Docs / Onboarding](./Phase_13_Dashboard_Docs_Onboarding.md)
  - [Architecture/15 — SDK Design](../Architecture/15_SDK%20Design.md)

### ADR-0014: Event payload mode

- Status: Accepted
- Context: [Architecture/10](../Architecture/10_Event_Webhook%20System.md) and SDK docs disagree on the default event payload mode. Thin payloads are safer because they are smaller and reduce accidental PII exposure; snapshot payloads are more ergonomic for consumers.
- Decision: Thin events are the default. Snapshot mode (`payload_mode=snapshot`) is opt-in per webhook endpoint. Webhook endpoint version pins both shape and mode.
- Consequences:
  - [Phase_06_Webhook_Event_System.md](./Phase_06_Webhook_Event_System.md) ticket `P6.H09` implements per-endpoint `payload_mode`.
  - SDK webhook verifiers handle both thin and snapshot payloads without changing signature semantics.
  - [EVENT_CATALOG.md](./EVENT_CATALOG.md) documents the thin field set per event type and the snapshot superset.
- Alternatives considered:
  - Snapshot default: rejected because rollback is harder when an added field contains PII.
  - Customer-configurable mode per event: deferred because it creates too many v1 knobs and weakens endpoint-level versioning.
- References:
  - [ADR-0006](#adr-0006-webhook-first-async-with-hmac-sha256-signing-and-per-endpoint-version-pinning)
  - [Phase 06 — Webhook Event System](./Phase_06_Webhook_Event_System.md)
  - [Event Catalog](./EVENT_CATALOG.md)
  - [Architecture/10 — Event / Webhook System](../Architecture/10_Event_Webhook%20System.md)

### ADR-0015: Custody model for v1

- Status: Accepted
- Context: README open question 2 leaves custody model unresolved, and custody affects every ledger-touching ticket. The v1 plan needs one model for ledger command routing, projection scoping, compliance ownership, and tenant isolation.
- Decision: Hosted deployments use Pillar-managed parties per tenant (tenant-party model). Customer-validator and self-hosted deployments defer party ownership to the customer. Account-party model and omnibus model are deferred to post-GA via `party_mappings` table extension.
- Consequences:
  - [Phase_04_Ledger_Command_Runtime.md](./Phase_04_Ledger_Command_Runtime.md) resolves `canton_party` per tenant through the `party_mappings` table.
  - [Phase_05_Projection_Reconciliation.md](./Phase_05_Projection_Reconciliation.md) scopes projected balances, holdings, operations, and reconciliation by tenant party.
  - [Phase_08_Security_Compliance.md](./Phase_08_Security_Compliance.md) ties KYC/KYB, evidence, and compliance decisions to tenant ownership.
- Alternatives considered:
  - Account-party from day one: rejected because party creation overhead and upgrade complexity are too high for v1.
  - Omnibus model: rejected because it creates avoidable regulator concerns around customer asset segregation and traceability.
- References:
  - [README open questions](./README.md#5-open-questions-tracked-centrally)
  - [Phase 03 — DB / Idempotency](./Phase_03_DB_Idempotency.md)
  - [Phase 04 — Ledger Command Runtime](./Phase_04_Ledger_Command_Runtime.md)
  - [Phase 05 — Projection / Reconciliation](./Phase_05_Projection_Reconciliation.md)

### ADR-0016: Multi-tenant DB isolation

- Status: Accepted
- Context: README open question 9 leaves multi-tenant isolation unresolved. Shared schema is operationally simpler; per-tenant schema offers stronger isolation; per-tenant deployment is self-hosted and belongs to deployment architecture rather than DB tenancy defaults.
- Decision: Pillar uses shared schema plus row-level `tenant_id` on every projection, audit, and idempotency table. Per-tenant schema is opt-in for regulated tenants via a `tenancy_profile` config. Per-tenant deployment is self-hosted and out of scope of this ADR.
- Consequences:
  - [Phase_03_DB_Idempotency.md](./Phase_03_DB_Idempotency.md) migrations universally include `tenant_id`.
  - Query access enforces tenant scoping through Postgres roles and row-level security policies.
  - Per-tenant schema mode reuses migrations under a configured schema name rather than forking table definitions.
- Alternatives considered:
  - Schema-per-tenant default: rejected because scaling to 1000+ tenants creates migration, observability, and operational pain.
  - Fully separate database per tenant: rejected because v1 operational cost is too high and self-hosted already covers hard isolation.
- References:
  - [README open questions](./README.md#5-open-questions-tracked-centrally)
  - [ADR-0005](#adr-0005-projection--audit--config-split-for-pillar-postgres)
  - [Phase 03 — DB / Idempotency](./Phase_03_DB_Idempotency.md)
  - [Phase 09 — CI/CD / Helm Deployment](./Phase_09_CICD_Helm_Deployment.md)

### ADR-0017: Asset standard timing

- Status: Accepted
- Context: README open question 1 leaves asset standard timing unresolved. [Architecture/17](../Architecture/17_Template%20Registry%20Versioning.md) and [ADR-0008](#adr-0008-pillar-native-asset-model-first-cn-token-standard-via-adapter-boundary) lock the adapter boundary; this ADR locks the delivery timing.
- Decision: M2 ships the Pillar-native asset model. CN Token Standard interoperability via `daml/pillar-token-adapter` and `services/token-standard-adapter` becomes Verify-gate-required at M9 (P9 GA prep). Dual-mode customer-facing assets are post-GA.
- Consequences:
  - [Phase_01_Daml_Model.md](./Phase_01_Daml_Model.md) tickets `P1.B22` through `P1.B24` ship token-adapter Daml interfaces at M2 as compile-only boundaries.
  - Real CN Token Standard interoperability tests are added in M9.
  - Customer documentation does not claim CN Token Standard support before M9 verification passes.
- Alternatives considered:
  - CN Token Standard first: rejected because it locks Pillar to an in-flight standard before the Pillar-native model and adapter boundary are stable.
  - Dual-mode at M2: rejected because it explodes scope across Daml model, runtime, projection, SDKs, and docs.
- References:
  - [ADR-0008](#adr-0008-pillar-native-asset-model-first-cn-token-standard-via-adapter-boundary)
  - [Phase 01 — Daml Model](./Phase_01_Daml_Model.md)
  - [Phase 09 — CI/CD / Helm Deployment](./Phase_09_CICD_Helm_Deployment.md)
  - [Architecture/17 — Template Registry / Versioning](../Architecture/17_Template%20Registry%20Versioning.md)

### ADR-0018: Metadata PII policy

- Status: Accepted
- Context: README open question 7 leaves metadata PII policy unresolved. Metadata is useful for customer ergonomics but becomes a PII landmine if arbitrary free text is accepted without enforcement.
- Decision: Pillar enforces hard validation. The `metadata` field on every public object rejects substrings matching regex packs for emails, phone numbers, government IDs, payment card numbers (PCI-DSS pattern), and free-text values longer than 500 characters. Rejection is HTTP 422 with `metadata_pii_violation` error code.
- Consequences:
  - [Phase_02_API_Contract.md](./Phase_02_API_Contract.md) ticket `P2.C19` includes the pattern validation library and error contract.
  - SDKs surface the same validator for fast local feedback before API submission.
  - The docs site includes an explicit PII policy page that describes what metadata may and may not contain.
- Alternatives considered:
  - Documentation-only policy: rejected because regulator scrutiny requires enforceable controls, not just customer guidance.
  - No metadata field: rejected because it damages customer ergonomics and removes a standard integration affordance.
- References:
  - [README open questions](./README.md#5-open-questions-tracked-centrally)
  - [Phase 02 — API Contract](./Phase_02_API_Contract.md)
  - [Phase 07 — SDK / CLI / Workbench](./Phase_07_SDK_CLI_Workbench.md)
  - [Phase 13 — Dashboard / Docs / Onboarding](./Phase_13_Dashboard_Docs_Onboarding.md)

### ADR-0019: Strong-read consistency semantics

- Status: Accepted
- Context: README open question 6 leaves strong-read consistency unresolved. Pillar's write path is asynchronous and projection-backed, so v1 needs bounded read-after-write semantics without creating unbounded waits or pretending projections are synchronous.
- Decision: `/v1` read endpoints support `consistency=eventual` (default) or `consistency=wait_for_operation&operation=op_...`. The `wait_for_operation` mode waits up to 5 seconds for projection checkpoint greater than or equal to the operation commit offset, then returns the projection or returns the resource with `processing: true` and `projection_lag_seconds`. The hard timeout is 5 seconds; no other consistency modes exist in v1.
- Consequences:
  - [Phase_05_Projection_Reconciliation.md](./Phase_05_Projection_Reconciliation.md) ticket `P5.E07` implements the bounded wait behavior.
  - [Phase_05_Projection_Reconciliation.md](./Phase_05_Projection_Reconciliation.md) ticket `P5.G02` updates checkpoints and emits the internal signal used by bounded waits.
  - SDKs add `client.operations.waitFor(opId)` as a helper over the same bounded projection semantics.
- Alternatives considered:
  - `consistency=strong` with unbounded wait: rejected because it risks breaching API SLOs.
  - Always-strong reads: rejected because it causes read amplification and turns every read into projection synchronization work.
- References:
  - [README open questions](./README.md#5-open-questions-tracked-centrally)
  - [ADR-0003](#adr-0003-intent-first-write-path)
  - [Phase 02 — API Contract](./Phase_02_API_Contract.md)
  - [Phase 05 — Projection / Reconciliation](./Phase_05_Projection_Reconciliation.md)
