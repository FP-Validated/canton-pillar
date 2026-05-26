# Pillar Mission Control — Development Plan

> **Mission:** Ship Pillar as the _The payments runtime for Canton-backed assets_.
> Canton Ledger is the only source of truth. The public API is polished and Canton-invisible. The internal runtime is Canton-native. Everything ledger-traceable.

This directory is the **operational plan** that turns `docs/Architecture/` into agent-executable work.
Architecture docs answer **what** Pillar is. Phase docs answer **how, in what order, and with what gate**.

---

## 0. Mission Control Methodology

Pillar is built phase-by-phase, gated, and agent-executable.

| Element           | Definition                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| **Phase**         | A bounded mission with a single integrating outcome. Exit gates promote work to the next phase.   |
| **Ticket**        | Smallest agent-executable unit. Has `path`, `output`, `acceptance`. Tickets never cross phases.   |
| **Entry gate**    | Preconditions that MUST be green before a phase starts. Usually previous-phase exit gates + deps. |
| **Exit gate**     | Verifiable proof the mission is done. Tests, golden snapshots, e2e, helm lint, etc.               |
| **Invariant**     | Cross-phase rule. Violating one invalidates the platform regardless of phase progress.            |
| **Risk**          | A failure mode large enough to abort the phase. Each risk has an explicit mitigation owner.       |
| **Open question** | Unresolved decision. Blocks design freeze, NEVER blocks ticket execution unless flagged.          |

### Cross-phase invariants (NEVER violate)

1. Canton Ledger is the single economic source of truth.
2. Pillar DB stores **only** Projection / Audit / Config. Asset state in DB is regenerable.
3. Public `/v1` API never exposes `contractId`, `templateId`, `partyId`, `participantId`, `packageId`, `commandId`.
4. Every mutation goes through `intent → operation → command_id → update_id/offset`.
5. Same external intended change ⇒ same `operation_id` ⇒ same `command_id`. New `submission_id` per attempt.
6. Events are emitted from **projected** ledger state, not from optimistic API state.
7. Webhooks are signed (HMAC-SHA256), versioned per endpoint, retried, replayable.
8. `deploymentMode` (`hosted`, `customer-validator`, `self-hosted`) changes infrastructure wiring only. `/v1` grammar does not change.
9. Idempotency-Key + request hash + tenant key uniquely determines response and operation identity.
10. Projection must be rebuildable from Canton Ledger / PQS at any time.

Invariants are enforced by IC-01..IC-10 in `REGRESSION_CONTRACT.md` and audited via verification verdicts V-001..V-003 in `VERIFICATION.md`. New invariants require a superseding ADR per `REGRESSION_CONTRACT.md §13`.

---

## 1. Phase Map

```text
P0 Foundation ──► P1 Daml Model ──► P2 API Contract ──► P3 DB + Idempotency
                                                          │
                                                          ▼
                          P4 Ledger Command Runtime ◄── (intent/operation tables)
                                  │
                                  ▼
                          P5 Projection + Reconciliation
                                  │
                                  ▼
                          P6 Webhook-first Event System
                                  │
                                  ▼
                          P7 SDK / CLI / Workbench
                                  │
                                  ▼
                          P8 Security / Compliance Hardening
                                  │
                                  ▼
                          P9 CI/CD + Helm Deployment
                                  │
                                  ▼
                          P10 GA Hardening (chaos, perf, runbooks)
                                  +-------> P11 Search / Export / Reporting
                                  +-------> P12 Template Registry / Versioning / DAR Lifecycle
                                  +-------> P13 Dashboard / Docs site / Customer onboarding
                                  +-------> P14 Usage Metering / Billing
```

| Phase | Mission                              | Architecture refs | Doc                                                                                    |
| ----- | ------------------------------------ | ----------------- | -------------------------------------------------------------------------------------- |
| P0    | Repository / Toolchain / Sandbox     | 23 §Phase 0, 13   | [Phase_00_Foundation.md](./Phase_00_Foundation.md)                                     |
| P1    | Daml source-of-truth model           | 06, 07, 08, 17    | [Phase_01_Daml_Model.md](./Phase_01_Daml_Model.md)                                     |
| P2    | API contract & object grammar        | 03, 04, 05        | [Phase_02_API_Contract.md](./Phase_02_API_Contract.md)                                 |
| P3    | DB schema & idempotency              | 11, 23 §DB Schema | [Phase_03_DB_Idempotency.md](./Phase_03_DB_Idempotency.md)                             |
| P4    | Ledger command runtime               | 07, 09, 24        | [Phase_04_Ledger_Command_Runtime.md](./Phase_04_Ledger_Command_Runtime.md)             |
| P5    | Projection + reconciliation          | 05, 09, 21        | [Phase_05_Projection_Reconciliation.md](./Phase_05_Projection_Reconciliation.md)       |
| P6    | Webhook-first event system           | 10, 22            | [Phase_06_Webhook_Event_System.md](./Phase_06_Webhook_Event_System.md)                 |
| P7    | SDK / CLI / Workbench / Docs         | 14, 15, 16        | [Phase_07_SDK_CLI_Workbench.md](./Phase_07_SDK_CLI_Workbench.md)                       |
| P8    | Security & compliance                | 12, 19, 20        | [Phase_08_Security_Compliance.md](./Phase_08_Security_Compliance.md)                   |
| P9    | CI/CD + Helm deployment              | 18, 23 §Helm      | [Phase_09_CICD_Helm_Deployment.md](./Phase_09_CICD_Helm_Deployment.md)                 |
| P10   | GA hardening                         | 22, 18, all       | [Phase_10_GA_Hardening.md](./Phase_10_GA_Hardening.md)                                 |
| P11   | Search / Export / Reporting          | 21, 04, 05, 22    | [Phase_11_Search_Export_Reporting.md](./Phase_11_Search_Export_Reporting.md)           |
| P12   | Template Registry / Versioning / DAR | 17, 08, 07, 18    | [Phase_12_Template_Registry_Versioning.md](./Phase_12_Template_Registry_Versioning.md) |
| P13   | Dashboard / Docs site / Onboarding   | 16, 15, 19        | [Phase_13_Dashboard_Docs_Onboarding.md](./Phase_13_Dashboard_Docs_Onboarding.md)       |
| P14   | Usage Metering / Billing             | 01, 18, 19        | [Phase_14_Usage_Metering_Billing.md](./Phase_14_Usage_Metering_Billing.md)             |

### Governance artifacts (cross-phase)

| Artifact                                             | Purpose                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [DECISIONS.md](./DECISIONS.md)                       | Append-only ADR log (ADR-0001..ADR-0019).                                                    |
| [REGRESSION_CONTRACT.md](./REGRESSION_CONTRACT.md)   | Invariant clauses IC-01..IC-10; canonical paths/migrations/enum registries.                  |
| [VERIFICATION.md](./VERIFICATION.md)                 | Append-only verification verdicts (V-001..V-003).                                            |
| [GLOSSARY.md](./GLOSSARY.md)                         | 110+ term definitions; ambiguity resolution.                                                 |
| [DATA_MODEL.md](./DATA_MODEL.md)                     | Cross-plane data model atlas (Canton / DB / API).                                            |
| [API_MATRIX.md](./API_MATRIX.md)                     | Endpoint x op x idempotent x scope x events x deployment.                                    |
| [EVENT_CATALOG.md](./EVENT_CATALOG.md)               | 60+ event types with schema, trigger, mode.                                                  |
| [SLO_CATALOG.md](./SLO_CATALOG.md)                   | 20+ SLOs with SLI/target/burn-rate/runbook.                                                  |
| [THREAT_MODEL.md](./THREAT_MODEL.md)                 | STRIDE per trust boundary; 30+ threats.                                                      |
| [RISK_REGISTER.md](./RISK_REGISTER.md)               | 45+ project risks with score/owner/mitigation.                                               |
| [RELEASE_PLAN.md](./RELEASE_PLAN.md)                 | Versioning, cadence, release types, rollback.                                                |
| [PARALLELIZATION_PLAN.md](./PARALLELIZATION_PLAN.md) | Phase DAG, wave plan, critical path, external dependencies.                                  |
| [RUNBOOKS/](./RUNBOOKS/)                             | Operational runbooks (incident, participant, projection, DAR, keys, webhook, DB, migration). |

---

## 2. Document Convention (per phase)

Every `Phase_NN_*.md` follows exactly this structure so an agent can pick up any phase and execute:

```text
1. Executive Summary       — mission in 5 lines
2. Goals / Non-goals       — explicit scope fences
3. Architecture            — phase-scoped architecture slice
4. API / Object Model      — what becomes externally visible after this phase
5. Internal Runtime        — what services/processes are built or extended
6. DB Schema               — migrations added or touched
7. Failure Modes           — phase-specific risks + mitigations
8. Security / Compliance   — phase-specific controls
9. Implementation Plan     — agent-ready tickets (path / output / acceptance)
10. Open Questions         — what blocks design freeze
11. Agent-ready Checklist  — exit gate
```

---

## 3. Gate Model

Each phase has three gates. Promotion requires **all three green**.

| Gate          | Check                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------- |
| **Build**     | `make bootstrap && make daml-build && make codegen && ./gradlew build && pnpm -w build` is green. |
| **Verify**    | Phase exit acceptance criteria (tests, golden snapshots, e2e scenarios) all pass.                 |
| **Invariant** | Cross-phase invariants (§0) re-checked against the new surface. Reviewer signs.                   |

Failing gate ⇒ open a follow-up ticket inside the **current** phase. NEVER promote with red.

---

## 4. Ticket Anatomy

```
ID:          Pn.Lxx          # phase number . letter+index, e.g. P3.D04
Title:       short imperative
Path:        repo path(s) the agent will touch
Output:      concrete artifact list (files, exported symbols, OpenAPI ops)
Dependencies: prior tickets (ID list)
Acceptance:  observable, runnable check (command + expected outcome)
Owner:       service / area (e.g. apps/api, services/projection-worker)
Risk tag:    one of [low, medium, high, blocker]
```

Tickets are dispatched in parallel inside a phase wherever dependency arrows allow. The mission control board (this directory) tracks promotion; ticket-level status lives in the issue tracker.

---

## 5. Open Questions tracked centrally

These cut across multiple phases — phase docs reference them rather than re-litigating:

1. Asset standard: Pillar-native first vs CN Token Standard first vs dual-mode.
2. Custody model: omnibus / tenant-party / account-party / customer-hosted.
3. External signing scope (which workflows require customer-controlled signing).
4. Settlement finality SLA mapping to `processing` / `succeeded` / `settled` / `final`.
5. Webhook + event retention window.
6. Strong-read consistency (`consistency=wait_for_operation`) policy per endpoint.
7. Metadata PII policy: hard validation vs documentation-only.
8. Compliance hook scope: issue only / transfer too / asset-configurable.
9. Multi-tenant isolation: shared schema vs per-tenant schema vs per-tenant deployment.
10. First-class deployment target: hosted-validator first / customer-validator / self-hosted.

Each phase doc references the subset that gates its exit.

---

## 6. Operating Rules

- **Phase docs are authoritative for sequencing.** Architecture docs are authoritative for design.
- **Never widen a phase.** If new work appears, file it into the smallest later phase that can absorb it.
- **Never narrow a phase silently.** Cutting scope requires explicit decision recorded in that phase's Open Questions.
- **Every ticket must be agent-executable** — path, output, acceptance, no ambiguity.
- **Verification commands are part of the doc** — copy/paste runnable.
