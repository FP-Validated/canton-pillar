# Pillar Regression Contract

> Anything listed here that breaks is an automatic block on merge, release, or deploy promotion.

## 1. Scope

This contract is the mission-wide negative-space gate for Pillar. It applies to every phase, PR, release candidate, deployment mode, refactor, migration, and generated artifact that can affect public `/v1` behavior, object identity, ledger traceability, idempotency, webhooks, projections, deployment wiring, or security controls.

Authoritative inputs:

| Area                           | Authority                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mission invariants             | [README.md §0](./README.md#0-mission-control-methodology)                                                                                                                                                           |
| Phase execution gates          | [README.md §3](./README.md#3-gate-model), [Phase 00](./Phase_00_Foundation.md) through [Phase 10](./Phase_10_GA_Hardening.md)                                                                                       |
| API grammar                    | [Phase 02](./Phase_02_API_Contract.md), [03 Pillar API Grammar v1](../Architecture/03_Pillar%20API%20Grammar%20v1.md), [04 Object Model](../Architecture/04_Object%20Model.md)                                      |
| DB/idempotency/trace substrate | [Phase 03](./Phase_03_DB_Idempotency.md), [11 Request Logs Ledger Trace Audit](../Architecture/11.Request%20Logs%20Ledger%20Trace%20Audit.md)                                                                       |
| Ledger runtime                 | [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [07 Canton-native runtime](../Architecture/07_Canton-native%20runtime.md), [09 Pillar Ledger Sync Layer](../Architecture/09_Pillar%20Ledger%20Sync%20Layer.md)    |
| Projection/reconciliation      | [Phase 05](./Phase_05_Projection_Reconciliation.md), [05 asset read model](../Architecture/05_asset%20read%20model.md), [21 Search Data Export Reporting](../Architecture/21_Search%20Data%20Export%20Reporting.md) |
| Webhooks/events                | [Phase 06](./Phase_06_Webhook_Event_System.md), [10 Event / Webhook System](../Architecture/10_Event_Webhook%20System.md), [22 Pillar Observability](../Architecture/22_Pillar%20Observability.md)                  |
| Deployment modes               | [Phase 09](./Phase_09_CICD_Helm_Deployment.md), [18 Deployment](../Architecture/18_Deployment.md)                                                                                                                   |
| Security/compliance            | [Phase 08](./Phase_08_Security_Compliance.md), [12 Security](../Architecture/12_Security.md), [19 Compliance](../Architecture/19_Compliance.md)                                                                     |
| GA promotion                   | [Phase 10](./Phase_10_GA_Hardening.md), [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)                                                                                                       |

A change passes this contract only when all applicable checks in §11 pass and no reviewer can point to a violated clause below.

## 2. Invariant clauses (numbered, atomic, testable)

| Clause | Invariant clause                                                                                                                    | Enforcement mechanism                                                                                                                       | Owning phase doc                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| IC-01  | Canton Ledger is the single economic source of truth.                                                                               | Projection-rebuild checks, ledger-command sandbox integration, chaos reconciliation: `P5.G06`, `P10.L01`.                                   | [Phase 05](./Phase_05_Projection_Reconciliation.md), [Phase 10](./Phase_10_GA_Hardening.md)                                        |
| IC-02  | Pillar DB stores only Projection / Audit / Config. Asset state in DB is regenerable.                                                | Migration verification forbids authoritative asset tables; projection upsert/rebuild tests must prove rows are derived: `P3.D05`, `P5.G06`. | [Phase 03](./Phase_03_DB_Idempotency.md), [Phase 05](./Phase_05_Projection_Reconciliation.md)                                      |
| IC-03  | Public `/v1` API never exposes `contractId`, `templateId`, `partyId`, `participantId`, `packageId`, or `commandId`.                 | OpenAPI/schema lint plus golden response forbidden-substring scan: `P2.C02`, `P2.C03`.                                                      | [Phase 02](./Phase_02_API_Contract.md)                                                                                             |
| IC-04  | Every mutation goes through `intent -> operation -> command_id -> update_id/offset`.                                                | Operation trace view and ledger-command completion tests: `P3.D04`, `P4.E06`, `P4.F05`.                                                     | [Phase 03](./Phase_03_DB_Idempotency.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md)                                         |
| IC-05  | Same external intended change implies same `operation_id` and same `command_id`; each attempt gets a new `submission_id`.           | Idempotency replay tests and dedup retry tests: `P3.D03`, `P4.F04`, `P10.L01`.                                                              | [Phase 03](./Phase_03_DB_Idempotency.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [Phase 10](./Phase_10_GA_Hardening.md) |
| IC-06  | Events are emitted from projected ledger state, not from optimistic API state.                                                      | Event projector ownership and dispatcher e2e checks: `P5.G05`, `P6.H03`.                                                                    | [Phase 05](./Phase_05_Projection_Reconciliation.md), [Phase 06](./Phase_06_Webhook_Event_System.md)                                |
| IC-07  | Webhooks are signed with HMAC-SHA256, versioned per endpoint, retried, and replayable.                                              | Signer vectors, dispatcher e2e, retry/DLQ, replay tests: `P6.H02`, `P6.H03`, `P6.H04`, `P6.H05`.                                            | [Phase 06](./Phase_06_Webhook_Event_System.md)                                                                                     |
| IC-08  | `deploymentMode` (`hosted`, `customer-validator`, `self-hosted`) changes infrastructure wiring only. `/v1` grammar does not change. | Compose/Helm matrix smoke, OpenAPI diff across modes, values-schema checks: `P9.J01`, `P9.J04`, `P10.L01`.                                  | [Phase 09](./Phase_09_CICD_Helm_Deployment.md), [Phase 10](./Phase_10_GA_Hardening.md)                                             |
| IC-09  | `Idempotency-Key` plus request hash plus tenant key uniquely determines response and operation identity.                            | Idempotency package unit tests, route tests for mutation headers, conflict tests: `P3.D03`, `P4.E06`.                                       | [Phase 03](./Phase_03_DB_Idempotency.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md)                                         |
| IC-10  | Projection must be rebuildable from Canton Ledger / PQS at any time.                                                                | Rebuild runner, byte-equal comparator, reconciliation alerts, chaos projection-corruption drill: `P5.G06`, `P5.G07`, `P10.L01`.             | [Phase 05](./Phase_05_Projection_Reconciliation.md), [Phase 10](./Phase_10_GA_Hardening.md)                                        |

## 3. Public API surface contract

### 3.1 `/v1` stability

- `/v1` path grammar is frozen after Phase 02 reaches GA through [Phase 10](./Phase_10_GA_Hardening.md).
- Any breaking request/response/path/status/error/event change after that point requires a new public API version, not mutation of existing `/v1` semantics.
- `Pillar-Version` may select compatible response versions; it must not expose Canton internals.
- SDKs, CLI, Workbench, OpenAPI, webhook payload rendering, and examples must pin or declare the API version they exercise.

### 3.2 Forbidden fields in public `/v1` responses

Forbidden substrings are case-insensitive and apply to all public response bodies, OpenAPI examples, golden fixtures, SDK snapshots, webhook payloads, CLI JSON output, and Workbench customer-facing JSON panes.

| Forbidden substring | Why it is blocked                                                 | Check mechanism                                                                                   |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `contractId`        | Daml contract identity is internal and fragment-prone.            | Golden snapshot diff plus schema lint in `P2.C03`; event/API response scan in `P6.E08`.           |
| `templateId`        | Daml template identity is internal implementation detail.         | Golden snapshot diff plus schema lint in `P2.C03`; contract schema lint in `P2.C02`.              |
| `partyId`           | Canton party topology is not customer API grammar.                | Golden snapshot diff plus schema lint in `P2.C03`; security leakage checks in `P8.K07`.           |
| `participantId`     | Participant ownership differs by deployment mode and is internal. | Golden snapshot diff plus schema lint in `P2.C03`; deployment-mode diff in `P9.J04`.              |
| `packageId`         | DAR/package selection is internal release/runtime state.          | Golden snapshot diff plus schema lint in `P2.C03`; ledger-command presenter tests in `P4.F03`.    |
| `commandId`         | Canton command dedup identity is internal trace data.             | Golden snapshot diff plus schema lint in `P2.C03`; trace expansion admin-only checks in `P4.F05`. |
| `submissionId`      | Attempt identity is internal and changes per retry.               | Golden snapshot diff plus schema lint in `P2.C03`; dedup tests in `P4.F04`.                       |
| `updateId`          | Ledger update identity is internal trace data.                    | Golden snapshot diff plus schema lint in `P2.C03`; projection/event response checks in `P5.G05`.  |

### 3.3 Mandatory public object fields

Every public object returned by `/v1`, webhook payload `data.object`, SDK deserialization, CLI JSON output, and Workbench customer-facing JSON must contain:

| Field      | Rule                                                                             |
| ---------- | -------------------------------------------------------------------------------- |
| `id`       | Opaque Pillar public ID with a registered prefix from §4.                        |
| `object`   | Stable snake_case object discriminator from the API contract.                    |
| `created`  | Creation timestamp in the API contract's canonical timestamp format.             |
| `livemode` | Boolean mode indicator derived from key/tenant environment, not deployment mode. |
| `metadata` | Customer metadata object; empty object when absent.                              |

### 3.4 Cursor pagination grammar

List endpoints must preserve this grammar:

```text
limit=<positive bounded integer>
starting_after=<object id cursor>
ending_before=<object id cursor>
response.has_more=<boolean>
```

Allowed additions must be backward-compatible. Replacing cursor names, changing cursor direction semantics, or returning non-deterministic page boundaries for a fixed projection offset is a regression.

## 4. Object identity contract

### 4.1 Public ID prefixes

| Prefix    | Object/surface     | Owning phase                                                                                        | Regression condition                                                                 |
| --------- | ------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `acct_`   | Account            | [Phase 02](./Phase_02_API_Contract.md)                                                              | Reused for any non-account object or removed from account responses.                 |
| `asst_`   | Asset              | [Phase 02](./Phase_02_API_Contract.md)                                                              | Reused for any non-asset object or removed from asset responses.                     |
| `bal_`    | Balance            | [Phase 05](./Phase_05_Projection_Reconciliation.md)                                                 | Reused for non-balance object or made ledger-derived from DB truth.                  |
| `hld_`    | Holding            | [Phase 05](./Phase_05_Projection_Reconciliation.md)                                                 | Reused for non-holding object or tied to raw contract fragmentation.                 |
| `issint_` | Issue intent       | [Phase 04](./Phase_04_Ledger_Command_Runtime.md)                                                    | Reused for another intent type or not connected to `op_*`.                           |
| `redint_` | Redeem intent      | [Phase 04](./Phase_04_Ledger_Command_Runtime.md)                                                    | Reused for another intent type or not connected to `op_*`.                           |
| `trint_`  | Transfer intent    | [Phase 04](./Phase_04_Ledger_Command_Runtime.md)                                                    | Reused for another intent type or not connected to `op_*`.                           |
| `hold_`   | Hold / hold intent | [Phase 04](./Phase_04_Ledger_Command_Runtime.md)                                                    | Reused for non-hold object or not ledger-traceable.                                  |
| `op_`     | Operation          | [Phase 03](./Phase_03_DB_Idempotency.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md)          | Regenerated for the same external intended change or disconnected from ledger trace. |
| `evt_`    | Event              | [Phase 05](./Phase_05_Projection_Reconciliation.md), [Phase 06](./Phase_06_Webhook_Event_System.md) | Created from optimistic API state or changed during delivery replay.                 |
| `we_`     | Webhook endpoint   | [Phase 06](./Phase_06_Webhook_Event_System.md)                                                      | Reused for delivery/event IDs or exposes endpoint secret after create/rotate.        |
| `ak_`     | API key object     | [Phase 08](./Phase_08_Security_Compliance.md)                                                       | Reused for raw secret value or omitted from audit/auth trace.                        |

### 4.2 Permanence

- Prefix collision is a regression.
- Once an ID prefix is shipped publicly, it is permanent for that object family.
- Prefix removal, aliasing, or reuse requires a new API version and an ADR under §13.
- Internal identifiers (`command_id`, `submission_id`, `update_id`, ledger offset, participant identity) must not be encoded into public ID strings.

## 5. Ledger trace contract

Every external mutation must produce this durable trace spine:

```text
api_request
  -> intent
  -> operation
  -> ledger_command_request
  -> (command_id, submission_id)
  -> (update_id, ledger_offset)
```

Rules:

| Rule                     | Required behavior                                                                                                                                                                                      | Primary enforcement          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Trace completeness       | A support/admin trace by `op_*` can find request, idempotency record, intent, command request, command attempt, completion/update, projection checkpoint, event, and webhook delivery when applicable. | `P3.D04`, `P4.F05`, `P6.H03` |
| Stable economic identity | The same external intended change reuses the same `operation_id` and same `command_id`.                                                                                                                | `P3.D03`, `P4.F04`           |
| Attempt identity         | Each actual submission attempt gets a new `submission_id`; retrying must not create a new economic operation.                                                                                          | `P4.F04`                     |
| Completion correlation   | Committed operations record `update_id` and `ledger_offset` before projection-dependent final states are exposed.                                                                                      | `P4.F05`, `P5.E07`           |
| Reconciler round-trip    | The reconciler can start with `op_*`, locate the ledger offset/update, and verify projection/event materialization for that offset range.                                                              | `P5.G06`, `P5.G07`           |

## 6. Idempotency contract

| Case                              | Required behavior                                                                                                                 | Regression if                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Missing key on mutation           | All mutation endpoints reject the request before route mutation with structured `idempotency_key_required` error.                 | Any mutation can enqueue intent/operation/command without `Idempotency-Key`.                     |
| Same key + same request hash      | Return the original status, headers covered by the API contract, and response body byte-equal.                                    | Replay re-renders a different body, creates a new operation, or changes ledger command identity. |
| Same key + different request hash | Return `409 Conflict` with structured `idempotency_error`.                                                                        | The request is accepted, silently ignored, or returns an untyped error.                          |
| Accepted attempt trace            | The idempotency record retains the original `operation_id`, request hash, response snapshot, tenant key, API version, and status. | Support cannot trace from idempotency key to `op_*`, or replay loses operation identity.         |
| Crash recovery                    | A process crash between request acceptance and command completion resumes or classifies safely without duplicate economic change. | Retry submits a different `command_id` for the same intended change.                             |

Primary enforcement: [Phase 03](./Phase_03_DB_Idempotency.md) `P3.D03`, [Phase 04](./Phase_04_Ledger_Command_Runtime.md) `P4.E06`/`P4.F04`, [Phase 10](./Phase_10_GA_Hardening.md) `P10.L01`.

## 7. Webhook contract

| Surface          | Required behavior                                                                                               | Primary enforcement               |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Signature header | Every delivery includes `Pillar-Signature: t=<unix>,v1=<base64 hmac-sha256>`.                                   | `P6.H02`, `P6.H03`                |
| Signing input    | The HMAC input is exactly `t + "." + raw_body` using raw bytes, not parsed/re-serialized JSON.                  | `P6.H02` signer/verifier vectors. |
| Payload version  | Signed payload includes `api_version` matching the endpoint's pinned version.                                   | `P6.H01`, `P6.H03`, `P6.E08`      |
| Replay semantics | Manual replay creates a new delivery identity; `event.id` is preserved.                                         | `P6.H05`                          |
| Secret rotation  | Endpoint secret rotation supports overlap; old and new secrets validate during the rotation window.             | `P6.H01`, `P8.K06`                |
| Event authority  | Ledger-derived events are emitted from projected ledger state, not the dispatcher and not optimistic API state. | `P5.G05`, `P6.H03`                |
| Retry/DLQ        | Delivery retry is durable and replayable; endpoint failure never rolls back ledger-confirmed state.             | `P6.H04`, `P10.L01`               |

## 8. Projection contract

| Rule                         | Required behavior                                                                                                                                                             | Primary enforcement          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Regenerability               | Projection tables are regenerable from Canton Ledger plus PQS for the selected tenant/environment/scope.                                                                      | `P5.G06`                     |
| Byte-equal rebuild           | For the same offset range and inputs, rebuild output is byte-equal to the previous canonical projection output.                                                               | `P5.G06`, `P10.L01`          |
| Offset watermark             | Every projection-derived API response includes `as_of_ledger_offset`.                                                                                                         | `P5.E07`                     |
| No source-of-truth promotion | Projection tables may serve reads and events, but never authorize final asset movement as economic truth.                                                                     | `P5.G03`, `P5.G04`, `P8.K07` |
| Gap detection                | Offset gaps, checksum mismatches, or balance/holding divergence produce reconciliation diffs and alerts.                                                                      | `P5.G07`, `P10.L04`          |
| Customer-facing invisibility | Projection responses expose balances/holdings/events, not contract IDs, template IDs, participant IDs, or raw offsets except the required opaque `as_of_ledger_offset` field. | `P2.C03`, `P5.E07`, `P6.E08` |

## 9. Deployment-mode contract

`deploymentMode` may change ownership, network topology, secret references, participant endpoint, chart values, and operational runbooks. It must not change public API grammar.

| Mode                 | Allowed differences                                                                                           | Forbidden differences                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `hosted`             | Pillar-operated participant/validator, managed data plane, Pillar-owned infra secrets.                        | Different `/v1` paths, object fields, error codes, idempotency semantics, webhook signatures, SDK method names. |
| `customer-validator` | Customer-owned participant, customer endpoint availability, customer-controlled participant auth material.    | Different `/v1` grammar or leaking customer participant IDs in public responses.                                |
| `self-hosted`        | Customer runs chart/images/DAR/data stores/participant connectivity; Helm values point to customer resources. | Client code changes caused by Helm values or deployment topology.                                               |

Rules:

- `/v1` grammar is identical across hosted, customer-validator, and self-hosted modes.
- Helm value changes must not require API client updates.
- `Pillar-Mode`/health metadata can describe operational mode; it must not alter route names, object names, pagination, idempotency, webhook event names, or error grammar.
- Release rollback, chart upgrade, DAR upload, and migrator jobs must preserve existing public object identity and idempotency records.

Primary enforcement: [Phase 09](./Phase_09_CICD_Helm_Deployment.md) `P9.J01`, `P9.J04`, `P9.J05`, `P9.J08`; [Phase 10](./Phase_10_GA_Hardening.md) `P10.L01`, `P10.L08`.

## 10. Security contract

| Control                  | Required behavior                                                                                                                                                                           | Primary enforcement          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| API key storage          | API key secrets are stored hashed only; raw secret is returned only at creation where applicable.                                                                                           | `P8.K01`, `P8.K07`           |
| Webhook endpoint secrets | Webhook endpoint secrets are retrievable only at create and rotate; retrieve/list/inspector never expose them.                                                                              | `P6.H01`, `P6.H06`, `P8.K07` |
| Participant transport    | mTLS to participant is required in staging and production profiles.                                                                                                                         | `P4.F02`, `P8.K06`, `P9.J02` |
| Audit coverage           | Every authenticated request creates an audit log entry, including failed auth and authorization denials.                                                                                    | `P8.K03`, `P8.K07`           |
| Auth before mutation     | Authentication, authorization, scope checks, and rate limits run before idempotency mutation and route handler side effects.                                                                | `P8.K02`, `P8.K03`           |
| Secret minimization      | Images, Helm values, logs, Workbench, inspector feeds, audit rows, and examples must not contain raw API keys, webhook secrets, participant JWTs, mTLS private keys, or vendor credentials. | `P8.K07`, `P9.J03`, `P9.J04` |
| Replay resistance        | Webhook timestamp tolerance, constant-time signature verification, idempotency conflict handling, and audit trace must reject unsafe replay.                                                | `P6.H02`, `P3.D03`, `P8.K07` |

## 11. Test enforcement map

| Clause                | Enforcement                                                                                                                                                     | Lives in                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IC-01                 | Ledger-source-of-truth reconciliation and rebuild checks: `P5.G06`, `P10.L01`.                                                                                  | [Phase 05](./Phase_05_Projection_Reconciliation.md) `services/reconciler/src/main/kotlin`; [Phase 10](./Phase_10_GA_Hardening.md) `tests/chaos`                                                                                                                                                                                                                  |
| IC-02                 | Projection/audit/config-only migration and rebuild checks: `P3.D05`, `P5.G06`.                                                                                  | [Phase 03](./Phase_03_DB_Idempotency.md) `packages/db/migrations/0050_projections`; [Phase 05](./Phase_05_Projection_Reconciliation.md) `services/reconciler/src/main/kotlin`                                                                                                                                                                                    |
| IC-03                 | Forbidden-internals schema lint and golden snapshots: `P2.C02`, `P2.C03`.                                                                                       | [Phase 02](./Phase_02_API_Contract.md) `packages/api-contracts/schemas`, `packages/api-contracts/golden`                                                                                                                                                                                                                                                         |
| IC-04                 | Operation trace view and completion correlation tests: `P3.D04`, `P4.E06`, `P4.F05`.                                                                            | [Phase 03](./Phase_03_DB_Idempotency.md) `packages/db/migrations/0040_intents_operations`; [Phase 04](./Phase_04_Ledger_Command_Runtime.md) `apps/api/src/routes/v1/*_intents`, `services/ledger-command/src/main/kotlin/completion`                                                                                                                             |
| IC-05                 | Idempotency replay/conflict and dedup retry tests: `P3.D03`, `P4.F04`, `P10.L01`.                                                                               | [Phase 03](./Phase_03_DB_Idempotency.md) `packages/idempotency`; [Phase 04](./Phase_04_Ledger_Command_Runtime.md) `services/ledger-command/src/main/kotlin/dedup`; [Phase 10](./Phase_10_GA_Hardening.md) `tests/chaos`                                                                                                                                          |
| IC-06                 | Projected event creation and dispatcher e2e: `P5.G05`, `P6.H03`.                                                                                                | [Phase 05](./Phase_05_Projection_Reconciliation.md) `services/projection-worker/src/main/kotlin/projectors`; [Phase 06](./Phase_06_Webhook_Event_System.md) `services/webhook-dispatcher`                                                                                                                                                                        |
| IC-07                 | Signer vectors, dispatcher, retry/DLQ, manual replay: `P6.H02`, `P6.H03`, `P6.H04`, `P6.H05`.                                                                   | [Phase 06](./Phase_06_Webhook_Event_System.md) `packages/security/src/webhook`, `services/webhook-dispatcher`, `apps/api/src/routes/v1/events`                                                                                                                                                                                                                   |
| IC-08                 | Deployment matrix and mode-neutral OpenAPI diff: `P9.J01`, `P9.J04`, `P10.L01`.                                                                                 | [Phase 09](./Phase_09_CICD_Helm_Deployment.md) `infra/compose/local.yml`, `infra/helm/pillar`; [Phase 10](./Phase_10_GA_Hardening.md) `tests/chaos`                                                                                                                                                                                                              |
| IC-09                 | Idempotency uniqueness and mutation route header enforcement: `P3.D03`, `P4.E06`.                                                                               | [Phase 03](./Phase_03_DB_Idempotency.md) `packages/idempotency`; [Phase 04](./Phase_04_Ledger_Command_Runtime.md) `apps/api/src/routes/v1/*_intents`                                                                                                                                                                                                             |
| IC-10                 | Projection byte-equal rebuild, diff alerts, corruption drill: `P5.G06`, `P5.G07`, `P10.L01`.                                                                    | [Phase 05](./Phase_05_Projection_Reconciliation.md) `services/reconciler/src/main/kotlin`; [Phase 10](./Phase_10_GA_Hardening.md) `tests/chaos`                                                                                                                                                                                                                  |
| §3 Public API surface | OpenAPI path/component validation, object schema tests, golden snapshots, forbidden-substring lint: `P2.C01`, `P2.C02`, `P2.C03`.                               | [Phase 02](./Phase_02_API_Contract.md) `packages/api-contracts/openapi`, `packages/api-contracts/schemas`, `packages/api-contracts/golden`                                                                                                                                                                                                                       |
| §4 Object identity    | ID prefix tests and object schema snapshots: `P2.C02`, `P2.C03`; operation/event/key prefix checks: `P3.D04`, `P5.G05`, `P8.K01`.                               | [Phase 02](./Phase_02_API_Contract.md) `packages/api-contracts/schemas`; [Phase 03](./Phase_03_DB_Idempotency.md) `packages/db/migrations/0040_intents_operations`; [Phase 05](./Phase_05_Projection_Reconciliation.md) `services/projection-worker/src/main/kotlin/projectors`; [Phase 08](./Phase_08_Security_Compliance.md) `apps/api/src/routes/v1/api_keys` |
| §5 Ledger trace       | Trace view, command queue, completion correlation, reconciler round-trip: `P3.D04`, `P4.E06`, `P4.F05`, `P5.G06`.                                               | [Phase 03](./Phase_03_DB_Idempotency.md) `operation_trace_view`; [Phase 04](./Phase_04_Ledger_Command_Runtime.md) `services/ledger-command/src/main/kotlin/completion`; [Phase 05](./Phase_05_Projection_Reconciliation.md) `services/reconciler/src/main/kotlin`                                                                                                |
| §6 Idempotency        | Replay byte-equality, conflict, crash recovery, mutation header checks: `P3.D03`, `P4.E06`, `P4.F04`.                                                           | [Phase 03](./Phase_03_DB_Idempotency.md) `packages/idempotency`; [Phase 04](./Phase_04_Ledger_Command_Runtime.md) `apps/api/src/routes/v1/*_intents`, `services/ledger-command/src/main/kotlin/dedup`                                                                                                                                                            |
| §7 Webhook            | Header/signing vectors, endpoint version pinning, dispatcher e2e, DLQ, replay, rotation: `P6.H01`, `P6.H02`, `P6.H03`, `P6.H04`, `P6.H05`, `P8.K06`.            | [Phase 06](./Phase_06_Webhook_Event_System.md) `apps/api/src/routes/v1/webhook_endpoints`, `packages/security/src/webhook`, `services/webhook-dispatcher`; [Phase 08](./Phase_08_Security_Compliance.md) `packages/security/src/rotation`                                                                                                                        |
| §8 Projection         | Projection row idempotency, byte-equal rebuild, offset watermark, mismatch alert: `P5.G02`, `P5.G03`, `P5.G04`, `P5.G06`, `P5.G07`, `P5.E07`.                   | [Phase 05](./Phase_05_Projection_Reconciliation.md) `services/projection-worker/src/main/kotlin`, `services/reconciler/src/main/kotlin`, `apps/api/src/routes/v1/balances`, `apps/api/src/routes/v1/holdings`                                                                                                                                                    |
| §9 Deployment-mode    | Compose auth/local e2e, Helm lint/template, migration job, release workflow, chaos rollback: `P9.J01`, `P9.J02`, `P9.J04`, `P9.J05`, `P9.J08`, `P10.L01`.       | [Phase 09](./Phase_09_CICD_Helm_Deployment.md) `infra/compose`, `infra/helm/pillar`, `.github/workflows/release.yml`; [Phase 10](./Phase_10_GA_Hardening.md) `tests/chaos`                                                                                                                                                                                       |
| §10 Security          | API key lifecycle, audit enrichment, secret rotation, pen-test checklist, image/chart secret scans: `P8.K01`, `P8.K03`, `P8.K06`, `P8.K07`, `P9.J03`, `P9.J04`. | [Phase 08](./Phase_08_Security_Compliance.md) `apps/api/src/routes/v1/api_keys`, `apps/api/src/middleware/audit.ts`, `packages/testing/src/security`; [Phase 09](./Phase_09_CICD_Helm_Deployment.md) `infra/docker`, `infra/helm/pillar`                                                                                                                         |

## 12. Canonical registries (binding)

### 12.1 Canonical paths

| Concern                | Canonical path                                          |
| ---------------------- | ------------------------------------------------------- |
| OpenAPI source         | `packages/api-contracts/openapi/pillar-v1.yaml`         |
| Object schemas         | `packages/api-contracts/schemas/`                       |
| Examples / fixtures    | `packages/api-contracts/examples/`                      |
| Golden snapshots       | `packages/api-contracts/golden/`                        |
| Generated dist         | `packages/api-contracts/dist/pillar-<api-version>.yaml` |
| CLI                    | `tools/cli/`                                            |
| Ledger command service | `services/ledger-command/`                              |
| Projection worker      | `services/projection-worker/`                           |
| Workflow orchestrator  | `services/workflow-orchestrator/`                       |
| Webhook dispatcher     | `services/webhook-dispatcher/`                          |
| Helm chart             | `infra/helm/pillar/`                                    |
| Search indexer         | `services/search-indexer/`                              |
| Export worker          | `services/export-worker/`                               |
| Template registry      | `services/template-registry/`                           |
| Usage meter            | `services/usage-meter/`                                 |
| Billing adapter        | `services/billing-adapter/`                             |
| Onboarding service     | `services/onboarding/`                                  |
| Customer dashboard     | `apps/dashboard/`                                       |
| Docs site              | `apps/docs/`                                            |

Forbidden aliases (do not introduce or reintroduce): `packages/api-contract/` (singular), `packages/openapi/`.

### 12.2 Migration range registry

| Range                       | Owner                                                                                     | Owning phase |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------------ |
| `0000_extensions`           | shared                                                                                    | P0           |
| `0010_config`               | tenants/accounts/party_mappings                                                           | P3           |
| `0020_audit`                | api_requests/audit_log                                                                    | P3           |
| `0030_idempotency`          | idempotency_keys                                                                          | P3           |
| `0040_intents_operations`   | intents/operations/ledger_command_requests                                                | P3           |
| `0050_projections`          | balances/holdings/projection_checkpoints                                                  | P3           |
| `0060_events_webhooks`      | event*log/webhook*\*                                                                      | P3           |
| `0070_reconciliation`       | reconciliation_runs/diffs                                                                 | P3           |
| `0080_security_compliance`  | api_keys + audit enrichment                                                               | P8           |
| `0081_compliance_decisions` | compliance_decisions                                                                      | P8           |
| `0082_evidence_files`       | evidence_files (references only)                                                          | P8           |
| `0090_search_reporting`     | export_jobs, report_templates, search_index_checkpoints, export_destinations              | P11          |
| `0100_template_registry`    | template_descriptors, package_versions, upgrade_plans, compatibility_records, dar_uploads | P12          |
| `0110_usage_metering`       | usage_events (partitioned), usage_rollups, pricing_plans, customer_billing, invoices      | P14          |

Reusing a range number across phases is a regression. Renumbering an already-shipped migration is a regression.

### 12.3 Deployment mode enum

Canonical values: `hosted`, `customer-validator`, `self-hosted`.
Aliases that may appear in architecture cross-references but never in Helm values, config files, OpenAPI examples, or health responses: `hosted-validator`, `validator`, `Pillar-operated participant`, `customer-hosted`, `Hybrid`, `Fully self-hosted`.
Any code path that surfaces deployment mode externally MUST use the canonical enum.

## 13. Change management

| Change type                                 |            Allowed? | Required process                                                                                                                                        |
| ------------------------------------------- | ------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a new regression clause                 |                 Yes | Additive update to this file, link owning phase/doc, add enforcement row in §11.                                                                        |
| Strengthen an existing clause               |                 Yes | Update this file and the owning phase gate; existing tests may become stricter.                                                                         |
| Clarify wording without semantic change     |                 Yes | Reviewer verifies no enforcement or obligation was weakened.                                                                                            |
| Remove a clause                             | No, unless governed | Requires an ADR in `DECISIONS.md` superseding the originating decision and identifying replacement enforcement.                                         |
| Weaken a clause                             | No, unless governed | Requires an ADR in `DECISIONS.md` superseding the originating decision, plus phase-doc updates that preserve compatibility or define a new API version. |
| Make phase docs stricter than this contract |                 Yes | Phase docs may strengthen these clauses.                                                                                                                |
| Make phase docs weaker than this contract   |                  No | This file wins; the phase doc must be corrected before promotion.                                                                                       |

Rules:

- Adding a regression clause is allowed at any time when it protects shipped or phase-gated behavior.
- Removing or weakening a clause requires an ADR in `DECISIONS.md` superseding the originating decision.
- Phase docs may strengthen but never weaken this contract.
- If a phase gate and this contract disagree, treat the stricter requirement as active and file the doc correction in the current phase.
- A release candidate cannot promote with a waived regression clause unless the waiver is itself an approved ADR and the public API/versioning impact is explicit.
