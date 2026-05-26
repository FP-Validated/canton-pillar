# Phase 04 — Ledger Command Runtime

> Build the Canton-native command submission runtime that turns accepted Pillar intents into deterministic, deduplicated Daml commands and correlates completions back to ledger-traceable operations.

## 1. Executive Summary

Phase 04 implements `services/ledger-command`, the first runtime that touches Canton directly. The public API remains Stripe-like; the worker consumes durable command requests from Postgres, resolves party and package configuration, submits Daml commands through the Canton Ledger API, and records the outcome in `operations` and `ledger_command_attempts`.

Core principles embedded in this phase:

1. **Canton Ledger is the source of truth.** Command submission is only a request to change ledger state; committed updates and projection confirm final state.
2. **Pillar DB stores only Projection / Audit / Config.** `operations`, `ledger_command_requests`, and `ledger_command_attempts` are trace and queue state, not asset truth.
3. **External API must be Stripe-like and Canton-invisible.** Customers see intents, holds, balances, events, and operation traces, not parties, contracts, choices, or packages by default.
4. **Internal runtime must be Canton-native.** The worker uses Daml Java bindings, Ledger API command envelopes, `act_as`, `read_as`, `command_id`, `submission_id`, completions, `update_id`, and participant routing.
5. **Operations must be ledger-traceable.** Every mutation has a stable `operation_id`, stable `command_id`, per-attempt `submission_id`, and completion/update correlation.
6. **Balance/Holding-first, not contract-first.** The command builder receives external account/asset/holding intent payloads and compiles to contract-native commands internally.
7. **Intent-first, not transaction-first.** API requests create durable intents and command requests before any ledger attempt is made.
8. **Webhook-first for async workflow.** Phase 04 marks command lifecycle; Phase 05 projection and Phase 06 webhooks publish final customer-visible state.
9. **API grammar must be Stripe-grade from day one.** Retry and duplicate safety must work before exposing mutation endpoints broadly.
10. **Deployment model changes, API experience does not.** Sandbox, staging, and production differ in participant auth and topology, not `/v1` grammar.

Primary architecture sources:

| Source                                                                                                | Phase 04 usage                                                                |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [07 Canton-native runtime](../Architecture/07_Canton-native%20runtime.md)                             | Intent compiler boundary, party mapping, command envelope, dedup distinction. |
| [09 Pillar Ledger Sync Layer](../Architecture/09_Pillar%20Ledger%20Sync%20Layer.md)                   | Completion/update trace, projection handoff, command submission lifecycle.    |
| [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)                                 | Phase 4 deliverables, F01-F06 task breakdown, DB schema, internal runtime.    |
| [24 Business Judgment Pillar Complete](../Architecture/24_Business%20Judgment%20Pillar%20Complete.md) | Stripe-grade idempotency plus Canton command deduplication constraints.       |

Exit condition: `services/ledger-command` can submit issue, transfer, hold, release, and redeem commands against `dpm sandbox`; duplicate retries preserve economic intent by reusing `command_id` while changing `submission_id` per attempt.

## 2. Goals / Non-goals

### Goals

| Goal                           | Description                                                                                                                                           | Gate                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Daml Java binding integration  | Generate and consume Java bindings from `packages/ledger-types` for the approved Phase 01 Daml model.                                                 | Gradle compiles generated bindings and worker code.                                        |
| Ledger API client              | Connect to participant Ledger API with sandbox JWT locally and mTLS/JWT-capable configuration for staging/prod.                                       | Worker health check validates participant reachability.                                    |
| Command builders               | Compile `issue`, `transfer`, `hold`, `hold_release`, and `redeem` request payloads into Daml command envelopes.                                       | Builder tests assert command type, parties, package/template/choice, and payload encoding. |
| Deterministic command identity | Same external intended change maps to the same `operation_id` and same `command_id`; each submit attempt receives a new `submission_id`.              | Duplicate submit tests inspect `ledger_command_attempts`.                                  |
| Dedup state machine            | Move command requests through received, queued, submitted, in-flight, committed/projected, failed, unknown, and reconciled states.                    | Retry tests cover crash and duplicate paths.                                               |
| Completion correlation         | Subscribe to or query completions before/around submit and update `operations` with `latest_submission_id`, `update_id`, `ledger_offset`, and status. | Integration test reaches committed command state.                                          |
| Failure classification         | Classify participant/network/Daml/package failures as retryable, final, or unknown without hiding ledger ambiguity.                                   | Chaos tests cover network loss and interpretation failure.                                 |
| Operation trace shape          | Preserve `op_*` trace fields: `backend=canton`, `command_id`, `submission_id`, `update_id`, `offset`.                                                 | Trace query returns populated fields after completion.                                     |

### Non-goals

| Non-goal                       | Reason                                                                                                                                                        | Later phase                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| New public API grammar         | Phase 04 wires existing Phase 02/03 mutation routes to command requests; it does not redesign `/v1`.                                                          | Phase 02 owns API contract.    |
| New database tables            | Architecture already defines `operations`, `ledger_command_requests`, and `ledger_command_attempts`.                                                          | Phase 03 owns schema.          |
| Projection materialization     | Completion proves command outcome; balances/holdings/events are materialized by projection.                                                                   | Phase 05.                      |
| Webhook dispatch               | Phase 04 does not emit customer webhooks directly.                                                                                                            | Phase 06.                      |
| DAR upload automation          | Worker depends on packages being uploaded/vetted before accepting work.                                                                                       | Phase 09.                      |
| External party signing flow    | Phase 04 supports hosted-party command submission path first. External signing can enqueue different command request types later without changing public API. | Later workflow/security phase. |
| Contract-first customer fields | No endpoint response may require customers to pass contract IDs, template IDs, choices, party IDs, or package IDs.                                            | Never for default public API.  |

## 3. Architecture

### Phase boundary

```text
Phase 02 API Contract
    │ Stripe-like mutation grammar and operation trace object
    ▼
Phase 03 DB + Idempotency
    │ api_requests, idempotency_keys, intents, operations, ledger_command_requests
    ▼
Phase 04 Ledger Command Runtime
    │ Daml Java bindings, command build/submit/dedup/completion correlation
    ▼
Phase 05 Projection + Reconciliation
    │ ledger updates/PQS → balances, holdings, transfers, operations, event_log
    ▼
Phase 06 Webhook-first Event System
    │ event_log → signed webhook deliveries and replay
```

### End-to-end write flow

```text
1. Client calls a mutating /v1 endpoint with Idempotency-Key.
2. apps/api authenticates, validates, canonicalizes request body, and resolves API version.
3. apps/api opens one DB transaction:
   - insert api_requests
   - lock or insert idempotency_keys
   - insert intent row
   - insert operation row with id = op_*
   - insert ledger_command_requests row with command_type + command_payload
   - commit
4. services/ledger-command polls eligible ledger_command_requests using row locking.
5. Worker marks request queued/submitted and inserts ledger_command_attempts row.
6. Worker resolves tenant/account/asset routing from config tables:
   - party_mappings
   - asset bindings/package profile from existing config
   - participant endpoint/auth profile
7. Worker builds a Daml command envelope through generated Java bindings:
   - stable command_id from operation identity
   - new submission_id for this attempt
   - workflow_id tied to intent/operation
   - act_as/read_as from party_mappings
   - deduplication period from participant capability
8. Worker ensures completion tracking readiness, then submits command to Canton Ledger API.
9. Participant accepts, rejects, or the outcome becomes unknown due to crash/network loss.
10. Completion correlation writes operation status and command attempt outcome:
    - latest_submission_id
    - update_id when accepted/committed
    - ledger_offset when known
    - final or retryable failure classification
11. Phase 05 observes ledger updates/PQS and applies projections.
12. Phase 06 emits webhook events from projected event_log rows.
```

### Runtime components

| Component             | Package path                                         | Responsibility                                                                                  |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Request poller        | `services/ledger-command/src/main/kotlin/queue`      | Claim `ledger_command_requests` with `available_at <= now()` and safe leases/fencing.           |
| Command compiler      | `services/ledger-command/src/main/kotlin/command`    | Convert `command_type` + payload into generated Daml Java commands.                             |
| Party resolver        | `services/ledger-command/src/main/kotlin/party`      | Resolve external account IDs to participant-local user/party/permissions from `party_mappings`. |
| Ledger client         | `services/ledger-command/src/main/kotlin/ledger`     | gRPC Ledger API client, auth metadata, TLS, submit, completion stream.                          |
| Dedup handler         | `services/ledger-command/src/main/kotlin/dedup`      | Enforce command identity, attempt identity, retry eligibility, duplicate handling.              |
| Completion correlator | `services/ledger-command/src/main/kotlin/completion` | Match completions by `command_id` / `submission_id` / `update_id` and update operation trace.   |
| Failure classifier    | `services/ledger-command/src/main/kotlin/failure`    | Map gRPC/Canton/Daml errors to retryable, final, or unknown.                                    |

### Data flow contract

```text
apps/api
  └─ creates operation op_123
      ├─ operations.command_id = cmd_op_123_v1_...
      └─ ledger_command_requests(id=lcr_123, operation_id=op_123, status=received)

ledger-command
  ├─ claims lcr_123
  ├─ inserts ledger_command_attempts(id=cmdatt_1, submission_id=sub_1)
  ├─ submits command_id=cmd_op_123_v1_..., submission_id=sub_1
  ├─ records in_flight / accepted / rejected / unknown
  └─ updates operations.latest_submission_id = sub_1

Canton participant
  └─ completion/update includes command_id, submission_id, update_id, offset

projection-worker
  └─ observes update_id and moves operation toward projected final state
```

### Command identity table

| Field                  | Pillar value                                              | Stability                                             | Written by                                 | Purpose                                           |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------- |
| `operation_id`         | `op_*`, public-safe operation identifier                  | Stable for one external intended change               | API idempotency transaction                | Customer/support trace spine.                     |
| `command_id`           | Stable deterministic ID derived from operation identity   | Stable across retries for same intended ledger change | API or ledger-command before first attempt | Canton command deduplication change identity.     |
| `submission_id`        | `sub_*`, unique per actual submit attempt                 | Changes on every attempt                              | ledger-command                             | Attempt identity and completion race correlation. |
| `workflow_id`          | `wf_*` or intent/operation-scoped workflow key            | Stable for business workflow step                     | API/ledger-command                         | Canton workflow correlation.                      |
| `user_id`              | Participant-local internal ledger user for service/tenant | Stable for route while config valid                   | Party resolver                             | Ledger API user and permission scope.             |
| `act_as`               | Party or parties resolved from `party_mappings`           | Stable for operation route                            | Party resolver                             | Ledger authorization and deduplication tuple.     |
| `read_as`              | Parties needed for contract lookup/visibility             | Stable for operation route                            | Party resolver                             | Ledger visibility.                                |
| `deduplication_period` | Participant capability/config value                       | Stable per participant profile                        | Ledger client config                       | Canton duplicate command protection window.       |

Rule from [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md):

```text
same external intended change
= same tenant + same endpoint + same idempotency key + same request hash
= same operation_id
= same command_id
```

`submission_id` must change on every attempt; `command_id` must not change for the same intended ledger change.

## 4. API / Object Model

Phase 04 does not expose Canton objects publicly. It wires Phase 02 public mutation routes into Phase 03 command request rows and defines the operation trace fields that become visible through object expansion, support tooling, CLI, and Workbench.

### Mutation route to command request mapping

| Public route                 | Public object     | Intent/operation effect                                                                | `ledger_command_requests.command_type` | Command builder                                                                                   |
| ---------------------------- | ----------------- | -------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST /v1/issue_intents`     | `issue_intent`    | Creates an issue intent and `op_*` for mint/issue of an asset into an account/holding. | `issue`                                | Create/exercise issue command for configured asset package.                                       |
| `POST /v1/redeem_intents`    | `redeem_intent`   | Creates redemption intent and `op_*` against available holding quantity.               | `redeem`                               | Exercise redeem/burn choice on selected holding/asset workflow.                                   |
| `POST /v1/transfer_intents`  | `transfer_intent` | Creates transfer intent and `op_*` from source to destination account.                 | `transfer`                             | Exercise transfer/allocation command using source holding and destination party/account metadata. |
| `POST /v1/holds`             | `hold`            | Creates hold intent and `op_*` reserving amount from available holding.                | `hold_create`                          | Exercise/create hold or allocation lock according to package profile.                             |
| `POST /v1/holds/:id/release` | `hold`            | Creates release operation for a prior hold.                                            | `hold_release`                         | Exercise release/cancel choice on the hold/allocation contract selected by projection.            |

### API transaction shape

```text
HTTP handler
  ├─ validate endpoint-specific request
  ├─ canonicalize body and idempotency key
  ├─ create intent object: issint_* | redint_* | trint_* | hold_*
  ├─ create operation object: op_*
  └─ enqueue ledger_command_requests row
```

The command payload stored in `ledger_command_requests.command_payload` is internal and versioned. It should include external object IDs and normalized amounts, not raw Daml values.

```json
{
  "version": 1,
  "api_version": "2026-05-26",
  "intent_id": "trint_01J...",
  "operation_id": "op_01J...",
  "tenant_id": "ten_01J...",
  "endpoint": "/v1/transfer_intents",
  "source_account": "acct_src",
  "destination_account": "acct_dst",
  "asset": "asset_usdcx",
  "amount": "100.00",
  "metadata": {
    "client_order_id": "ORD-123"
  }
}
```

### Operation trace object shape

Default public responses may show only `operation` as an ID. Expanded/support responses may include Canton trace metadata under an operation trace object. The object remains Pillar-shaped and never asks customers to manage contracts or templates.

```json
{
  "id": "op_01J...",
  "object": "operation",
  "backend": "canton",
  "status": "processing",
  "intent": "trint_01J...",
  "command_id": "cmd_op_01J_v1_...",
  "submission_id": "sub_01J_attempt_0002",
  "update_id": "upd_...",
  "offset": "000000000000123456",
  "created": 1779800000,
  "updated": 1779800030
}
```

### Status mapping

| Internal command state | Operation status        | Public intent status          | Notes                                                |
| ---------------------- | ----------------------- | ----------------------------- | ---------------------------------------------------- |
| `received`             | `created`               | `processing`                  | API committed queue row.                             |
| `queued`               | `queued`                | `processing`                  | Worker claimed or ready to claim.                    |
| `submitted`            | `submitted`             | `processing`                  | Attempt row exists; submit call started.             |
| `in_flight`            | `submitted`             | `processing`                  | Participant accepted or outcome pending.             |
| `ledger_committed`     | `committed`             | `processing` until projection | Completion/update known, projection not yet applied. |
| `projected`            | `succeeded`             | `succeeded`                   | Phase 05 applied projection.                         |
| `failed`               | `failed`                | `failed`                      | Final failure; no retry will change outcome.         |
| `unknown`              | `processing`            | `processing`                  | Outcome ambiguous; do not duplicate economic change. |
| `reconciled`           | `succeeded` or `failed` | Final projected state         | Reconciliation resolved unknown.                     |

### Canton invisibility rules

| Field                  | Public default    | Expanded/support view             | Reason                                                     |
| ---------------------- | ----------------- | --------------------------------- | ---------------------------------------------------------- |
| Party IDs              | Hidden            | Redacted/internal only            | Customers use accounts, not Daml parties.                  |
| Contract IDs           | Hidden            | Internal support only when needed | Contract-first API is prohibited.                          |
| Template/choice IDs    | Hidden            | Internal only                     | Public grammar must remain stable across package versions. |
| `command_id`           | Hidden by default | Visible in operation trace        | Needed for support/debugging.                              |
| `submission_id`        | Hidden by default | Visible in operation trace        | Attempt-level support/debugging.                           |
| `update_id` / `offset` | Hidden by default | Visible in operation trace        | Ledger audit and projection correlation.                   |

## 5. Internal Runtime

### Command identity rule

The worker must not decide a new ledger change identity on retry. The API/idempotency transaction creates or resolves the durable external intended change; ledger-command preserves that identity.

```text
same external intended change
  -> same tenant_id
  -> same endpoint
  -> same idempotency key
  -> same canonical request hash
  -> same intent_id
  -> same operation_id
  -> same command_id
```

Attempt identity is separate:

```text
same operation_id + retry attempt N -> new submission_id
same operation_id + retry attempt N+1 -> new submission_id
same operation_id across all attempts -> same command_id
```

Deduplication depends on Canton's command identity tuple for the same participant route:

```text
user_id + act_as + command_id
```

Therefore route resolution must be stable for a command request. If `party_mappings` changes while an operation is in-flight, the worker must either continue using the route snapshot stored in the command payload/attempt metadata or mark the request blocked for operator reconciliation; it must not silently submit the same `command_id` under a different `act_as` tuple.

### `command_id` vs `submission_id`

| Scenario                                           | `command_id`               | `submission_id`                                      | Required behavior                                                                            |
| -------------------------------------------------- | -------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| First submit attempt                               | Stable value for operation | New `sub_*`                                          | Insert attempt and submit.                                                                   |
| Worker crashes before submit bytes leave process   | Same as first attempt      | New `sub_*` on retry                                 | Safe retry; previous attempt may be marked abandoned if no network call happened.            |
| Network loss after submit call                     | Same as first attempt      | New only after unknown handling policy allows retry  | Prefer completion lookup/reconciliation before resubmit.                                     |
| Duplicate API retry with same idempotency key/body | Same existing command      | No new submit unless worker policy requires recovery | Return existing processing object.                                                           |
| Participant reports duplicate command              | Same command               | Current attempt submission                           | Treat as accepted/in-flight or correlate to prior completion; do not build a new command ID. |
| Final Daml interpretation failure                  | Same command               | Attempt that failed                                  | Mark final failure; do not retry with mutated payload.                                       |

### Dedup handler state machine

```text
received
  │ API committed ledger_command_requests row
  ▼
queued
  │ worker lease acquired and route/config loaded
  ▼
submitted
  │ ledger_command_attempts row inserted with submission_id
  ▼
in_flight
  │ submit accepted or completion not yet final
  ├───────────────┬──────────────────────┬─────────────────────────┐
  ▼               ▼                      ▼                         ▼
ledger_committed failed                 unknown                   queued
  │               │ final failure        │ ambiguous outcome        │ retryable pre-submit failure
  ▼               ▼                      ▼                         │
projected       terminal              reconciled ◄────────────────┘
  │ Phase 05       no retry              completion/update/reconcile
  ▼
terminal
```

State definitions:

| State              | Owner                     | Meaning                                                                    | Allowed next states                                              |
| ------------------ | ------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `received`         | API                       | Queue row exists, not claimed.                                             | `queued`, `failed` for invalid payload discovered before submit. |
| `queued`           | ledger-command            | Worker owns lease or request is ready for worker.                          | `submitted`, `received` after lease expiry, `failed`.            |
| `submitted`        | ledger-command            | Attempt row exists and submit call is being made.                          | `in_flight`, `failed`, `unknown`.                                |
| `in_flight`        | ledger-command/completion | Submit accepted or outcome pending.                                        | `ledger_committed`, `failed`, `unknown`.                         |
| `ledger_committed` | completion correlator     | Completion/update confirmed with `update_id`.                              | `projected`.                                                     |
| `projected`        | projection-worker         | Projection consumed update and applied business state.                     | terminal or reconciliation correction.                           |
| `failed`           | ledger-command            | Final or exhausted retry failure.                                          | terminal; manual replay only if a new operation is created.      |
| `unknown`          | ledger-command            | Worker cannot prove whether ledger accepted the command.                   | `reconciled`, delayed retry only under dedup-safe policy.        |
| `reconciled`       | reconciler                | Unknown resolved by completion/update lookup or absence after safe window. | `ledger_committed`, `failed`, or `queued`.                       |

### Worker polling and leasing

The worker must claim requests atomically and avoid duplicate concurrent submissions.

```sql
-- Illustrative shape only; exact SQL belongs to Phase 03 schema implementation.
select id
from ledger_command_requests
where status in ('received', 'queued')
  and available_at <= now()
order by created_at
for update skip locked
limit :batch_size;
```

Rules:

| Rule                               | Requirement                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Claim with row lock                | Two workers must not submit the same request concurrently.                      |
| Persist attempt before submit      | A crash after submit must have enough trace to reconcile.                       |
| Completion readiness before submit | Subscribe/check completion cursor before submit to reduce lost-completion race. |
| Backoff in DB                      | Retry schedule is stored with request/attempt metadata, not process memory.     |
| No mutated retry payload           | Retry reuses the same command payload and command ID.                           |
| Unknown is not failure             | Ambiguous outcome remains processing until reconciled.                          |

### Party mapping resolution

`party_mappings` is the source for translating Pillar accounts into participant-local Canton identities.

```text
Input:
  tenant_id
  environment/livemode
  command_type
  account_id(s)
  asset_id
  capability requirement: act_as/read_as/external_sign

Resolution:
  1. Filter active party_mappings by tenant/environment/account.
  2. Filter mappings with required capabilities and valid time range.
  3. Select participant route compatible with asset/synchronizer/package profile.
  4. Produce user_id, act_as, read_as, participant endpoint, synchronizer constraints.
  5. Store route snapshot in ledger_command_attempts metadata.
```

| Command type   | Required mapping                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `issue`        | Issuer/admin account party with `act_as`; recipient account may be encoded as owner/observer depending on package.  |
| `redeem`       | Holder/source account party with `act_as`; issuer/admin may be `read_as` or stakeholder depending on Daml workflow. |
| `transfer`     | Source account party with `act_as`; destination account resolves to target party/account metadata.                  |
| `hold_create`  | Holder/source account party with `act_as` and visibility over selected holding.                                     |
| `hold_release` | Party authorized to release the hold, resolved from original hold/operation/account mapping.                        |

Party IDs are Canton/Daml identities; `user_id` is participant-local. The worker must never assume that the same `user_id` has global meaning across participants.

### Command builder contract

The command builder receives a normalized command request and route snapshot, then returns an immutable command plan.

```kotlin
data class CompiledCommandPlan(
    val tenantId: String,
    val operationId: String,
    val commandId: String,
    val submissionId: String,
    val workflowId: String,
    val userId: String,
    val actAs: List<String>,
    val readAs: List<String>,
    val participantEndpoint: String,
    val deduplicationPeriod: Duration,
    val commands: List<DamlCommand>,
    val trace: CommandTrace
)
```

Builder rules:

| Rule                 | Requirement                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Decimal safety       | Amounts stay decimal strings or fixed-scale values; never floating point.                                          |
| Package profile      | Template/interface/choice selection comes from configured package profile, not hard-coded public route names.      |
| Generated bindings   | Use generated Daml Java classes for create/exercise payload construction.                                          |
| Holding-first lookup | Use projection/active-contract lookup inputs from prior phases; do not expose contract IDs publicly.               |
| Metadata policy      | Only ledger-visible metadata configured by binding profile enters Daml payload; other metadata remains audit-only. |
| Version pinning      | API version and package profile version are part of command payload interpretation.                                |

### Completion correlation

The completion correlator updates trace state; projection remains the final business-state authority.

```text
Completion input:
  command_id
  submission_id
  update_id or rejection status
  offset when available
  record/ledger time
  status details

DB effects:
  update ledger_command_attempts outcome
  update operations.latest_submission_id
  update operations.update_id when present
  update operations.ledger_offset when present
  update operations.status = submitted | committed | failed | unknown
```

Correlation priority:

| Match                                 | Use                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `submission_id + command_id`          | Best attempt-level correlation.                                                          |
| `command_id + user_id + act_as route` | Duplicate/retry correlation when submission ID differs or participant reports duplicate. |
| `update_id`                           | Link completion to update/projection once available.                                     |
| `operation_id`                        | DB trace spine for public/support views.                                                 |

### Failure classifier

The classifier must preserve ambiguity. It must not convert unknown outcomes into safe retries unless Canton deduplication and route identity make the retry safe.

| Class                              | Examples                                                                                                                                                  | Action                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Retryable before submit            | DB transient error before attempt, participant unavailable before bytes sent, auth token refresh failure before submit.                                   | Retry with same `command_id`, new `submission_id`.                          |
| Retryable after rejected transient | gRPC unavailable with no evidence of acceptance, resource exhausted, deadline before submit acceptance.                                                   | Backoff; reconcile completion cursor before retry.                          |
| Final                              | Daml interpretation error, authorization denied for resolved party, package/template/choice missing for configured profile, validation invariant failure. | Mark attempt and operation failed with stable error code.                   |
| Unknown                            | Process crash mid-submit, network loss after submit bytes may have reached participant, completion stream gap.                                            | Mark unknown; reconcile by command ID/update stream before any resubmit.    |
| Duplicate accepted                 | Participant dedup reports duplicate command for same identity.                                                                                            | Correlate to prior attempt/completion; keep operation processing/committed. |

## 6. DB Schema

Phase 04 adds no new tables. It consumes and updates the tables defined by Phase 03 and [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md).

### Tables used

| Table                     | Phase 04 role                                                                             | Source-of-truth stance                                          |
| ------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `operations`              | Stable `op_*` trace row with command/completion fields.                                   | Audit/trace; final business state comes from ledger projection. |
| `ledger_command_requests` | Durable worker queue for command submissions.                                             | Queue/audit, not economic truth.                                |
| `ledger_command_attempts` | Per-submission attempt audit with `submission_id`, status, error, timing, route metadata. | Attempt audit.                                                  |
| `party_mappings`          | Config table for account-to-party/user/participant route resolution.                      | Config.                                                         |
| `idempotency_keys`        | API replay lock that determines stable intended change.                                   | Idempotency/audit.                                              |
| `intents`                 | Public intent lifecycle row linked to operation.                                          | Requested workflow state; ledger projection finalizes.          |

### Required fields from implementation plan

```sql
create table operations (
  id text primary key,
  tenant_id text not null references tenants(id),
  intent_id text references intents(id),
  status text not null,
  command_id text unique,
  latest_submission_id text,
  update_id text,
  ledger_offset text,
  ledger_time timestamptz,
  trace_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ledger_command_requests (
  id text primary key,
  tenant_id text not null references tenants(id),
  operation_id text not null references operations(id),
  command_type text not null,
  command_payload jsonb not null,
  status text not null,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
```

`ledger_command_attempts` is required by the Phase 03 migration tree and Phase 04 acceptance even where the sketch is abbreviated. It must support at least:

| Column                                         | Purpose                                   |
| ---------------------------------------------- | ----------------------------------------- |
| `id`                                           | `cmdatt_*` attempt identifier.            |
| `tenant_id`                                    | Tenant isolation.                         |
| `operation_id`                                 | Join to operation trace.                  |
| `ledger_command_request_id`                    | Queue request being attempted.            |
| `command_id`                                   | Stable command identity submitted.        |
| `submission_id`                                | Unique submit attempt identity.           |
| `status`                                       | Attempt lifecycle/result.                 |
| `participant_id` / endpoint reference          | Route correlation.                        |
| `user_id`                                      | Participant-local ledger user.            |
| `act_as` / `read_as` metadata                  | Authorization/dedup tuple audit.          |
| `error_code` / `error_class` / `error_detail`  | Failure classifier result.                |
| `update_id` / `ledger_offset`                  | Completion/update correlation when known. |
| `created_at` / `submitted_at` / `completed_at` | Timing and timeout/retry decisions.       |

### State updates

| Event               | `ledger_command_requests` | `ledger_command_attempts`                   | `operations`                                                                   |
| ------------------- | ------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| API enqueue         | `received`                | none                                        | `created`, stable `command_id` optional but recommended.                       |
| Worker claim        | `queued`                  | none or pending attempt                     | unchanged or `queued`.                                                         |
| Submit start        | `submitted` / `in_flight` | insert `submitted` with new `submission_id` | `latest_submission_id`, `status=submitted`.                                    |
| Completion accepted | `ledger_committed`        | `accepted`, `update_id`                     | `status=committed`, `update_id`, `ledger_offset`, `ledger_time`.               |
| Final rejection     | `failed`                  | `failed` with final error                   | `status=failed`.                                                               |
| Unknown outcome     | `unknown`                 | `unknown`                                   | `status=processing` or `unknown` internally; public intent remains processing. |
| Projection applied  | no direct Phase 04 write  | no direct Phase 04 write                    | Phase 05 sets projected/succeeded status.                                      |

### Index and constraint expectations

| Requirement                                           | Reason                                        |
| ----------------------------------------------------- | --------------------------------------------- |
| `operations.command_id` unique                        | One stable command identity per operation.    |
| `ledger_command_requests.operation_id` indexed        | Worker joins and trace lookup.                |
| Queue index on `(status, available_at, created_at)`   | Efficient polling.                            |
| Attempt uniqueness on `(operation_id, submission_id)` | Attempt IDs must not collide.                 |
| Attempt lookup on `(command_id)`                      | Duplicate/completion correlation.             |
| Tenant-prefixed indexes                               | Multi-tenant isolation and query performance. |

## 7. Failure Modes

### Failure matrix

| Failure mode                                 | Detection                                                                                     | Classification                                                                        | Required behavior                                                                                  | Customer-visible result                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Participant crash before submit              | gRPC unavailable before attempt accepted; no submit evidence.                                 | Retryable                                                                             | Backoff and retry same `command_id` with new `submission_id`.                                      | Intent remains `processing`.                                   |
| Participant crash after accepting submit     | Submit call returns accepted or completion cursor later has command.                          | Unknown until completion/recovery                                                     | Do not create new command identity; reconcile completion/update stream.                            | Intent remains `processing`.                                   |
| Network loss mid-submit                      | Client deadline, connection reset, or worker crash after bytes may have left.                 | Unknown                                                                               | Mark attempt unknown; search completions/updates by `command_id` before retry.                     | Existing intent returned on retry, not a second intent.        |
| Duplicate command                            | Participant reports duplicate for same `user_id + act_as + command_id`, or completion exists. | Duplicate accepted/in-flight                                                          | Correlate to existing operation; do not mark final failure solely because duplicate was reported.  | Intent remains processing or succeeds once projected.          |
| Unknown completion                           | Submit exists but completion stream has gap or cursor loss.                                   | Unknown                                                                               | Use update stream/PQS/reconciler; if unresolved after policy window, escalate for operator action. | Intent remains processing with trace.                          |
| Daml interpretation failure                  | Completion rejection with interpretation/validation error.                                    | Final unless architecture marks code/package transient                                | Store final error, mark operation failed, no retry with changed payload.                           | Intent failed with stable error code.                          |
| Authorization denied                         | `act_as`/`read_as` permission failure or JWT scope mismatch.                                  | Final for current config; operational fix may require new operation or replay policy. | Mark failed or blocked according to error class; alert.                                            | Intent failed or requires operator action.                     |
| Package version mismatch                     | Missing/vetted package, template/choice not found, binding profile not uploaded.              | Final/config-deployment error                                                         | Fail fast or block queue before submit; Phase 09 DAR upload gate should prevent rollout.           | Mutation endpoint may return controlled degraded/failed state. |
| Completion says rejected but update observed | Inconsistent stream/order processing.                                                         | Reconciliation required                                                               | Ledger update wins for projection; audit inconsistency flagged.                                    | Final state follows projection.                                |
| Worker double claim                          | Lease bug or DB isolation bug.                                                                | Runtime bug                                                                           | DB uniqueness and row locks prevent duplicate submit; alert if attempted.                          | No duplicate economic effect if command ID stable.             |

### Retry policy

| Condition                                       | Retry?                | Identity rule                                                                     |
| ----------------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| Error before submit call begins                 | Yes                   | Same `command_id`, new `submission_id`.                                           |
| Error after submit may have reached participant | Not immediately       | Reconcile first; if retrying, same `command_id`, new `submission_id`, same route. |
| Participant duplicate response                  | No new semantic retry | Treat as evidence command identity already exists.                                |
| Final Daml rejection                            | No                    | Do not mutate payload to force success.                                           |
| Package/config mismatch                         | No automatic retry    | Fix deployment/config; then replay only if operation policy permits.              |

### Unknown outcome policy

```text
unknown outcome
  ├─ keep public intent status = processing
  ├─ keep operation trace visible to support
  ├─ pause economic duplicate attempts
  ├─ query completion/update streams by command_id/route
  ├─ if update found: mark ledger_committed and let projection finalize
  ├─ if final rejection found: mark failed
  └─ if unresolved: reconciler/operator decision, not silent duplicate submit
```

### Error codes

| Internal class               | Public code candidate                        | Retry hint                                        |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------- |
| `participant_unavailable`    | `ledger_temporarily_unavailable`             | Client should poll/fetch existing intent.         |
| `command_outcome_unknown`    | `ledger_command_processing`                  | Client should not retry with new idempotency key. |
| `duplicate_command`          | no public error by default                   | Return existing intent state.                     |
| `daml_interpretation_failed` | `ledger_command_rejected`                    | Final.                                            |
| `party_authorization_failed` | `account_not_authorized_for_asset_operation` | Final until config fixed.                         |
| `package_profile_mismatch`   | `ledger_package_unavailable`                 | Operational/deployment failure.                   |

## 8. Security / Compliance

### Participant authentication

| Environment   | Auth mode                                                   | Requirement                                                           |
| ------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Local sandbox | JWT suitable for `dpm sandbox`/local participant config.    | Developer setup can run integration tests without production secrets. |
| Staging       | JWT plus mTLS where participant endpoint requires it.       | Certificates and token issuers managed by deployment secret system.   |
| Production    | mTLS plus scoped JWT for Ledger API user/party permissions. | No broad admin token in worker runtime.                               |

### JWT `canActAs` scoping

The worker must request/use tokens scoped to the exact parties needed for the command route.

| Token claim/scope      | Rule                                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| `actAs` / `canActAs`   | Include only parties resolved from active `party_mappings` for this operation. |
| `readAs` / `canReadAs` | Include only parties required for lookup/visibility.                           |
| Admin/package rights   | Not present in normal command submission worker token.                         |
| Tenant scope           | Token acquisition/config is tenant/environment aware.                          |
| Rotation               | Worker reloads credentials without changing operation identity.                |

### Party and tenant isolation

| Control         | Requirement                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Tenant filter   | Every queue claim and route lookup includes `tenant_id`.                                               |
| Mapping status  | Suspended/revoked `party_mappings` cannot be used for new command attempts.                            |
| Route snapshot  | Attempt metadata records resolved party/user/participant for audit.                                    |
| Least privilege | Worker service account can update command/operation rows, not arbitrary projection truth.              |
| Secret handling | JWT private keys, mTLS certs, and participant credentials are not logged or stored in command payload. |

### DAR upload and package gate

Phase 04 assumes required DAR packages are uploaded, vetted, and compatible with generated bindings. Phase 09 must enforce a deploy gate before `ledger-command` accepts work:

```text
migrator-job
  -> dar-upload-job
  -> package/vetting verification
  -> ledger-command deployment starts or unpauses polling
```

If the worker detects package profile mismatch at runtime, it must classify the failure as deployment/configuration, stop consuming affected requests, and surface an operational alert rather than retrying hot.

### Audit/compliance posture

| Artifact                  | Compliance value                                                            |
| ------------------------- | --------------------------------------------------------------------------- |
| `operations`              | Trace from API operation to command/update/offset.                          |
| `ledger_command_attempts` | Evidence of every submit attempt and failure classification.                |
| Completion/update IDs     | Ledger audit correlation.                                                   |
| Route metadata            | Proof of which participant user/party authorized the command.               |
| Redacted logs             | Debuggability without leaking party credentials or command payload secrets. |

## 9. Implementation Plan

### Ticket table

| ID     | Title                                         | Path                                                                                                         | Output                                                                                                                                 | Deps                                                   | Acceptance                                                                                                                                                                                                                                                                                     | Risk                   |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| P4.E06 | Intent routes enqueue ledger commands         | `apps/api/src/routes/v1/*_intents`, `apps/api/src/routes/v1/holds`                                           | Issue/redeem/transfer/hold/release handlers create `operation` + `ledger_command_requests` rows                                        | P2.C01, P2.C02, P2.C04, P2.C05, P2.E01, P3.D03, P3.D04 | Each route creates a stable `op_*`, deterministic `command_id`, and queue row in one DB transaction                                                                                                                                                                                            | high                   |
| P4.E14 | Intent route validation extensions            | `apps/api/src/routes/v1/*_intents`, `apps/api/src/routes/v1/holds`, `packages/api-contracts/schemas`         | Per-intent-type schema validators for issue, redeem, transfer, hold create, hold release, confirm, and cancel action payloads          | P2.C02, P2.C04, P3.D03, P4.E06                         | Route tests reject missing idempotency keys, wrong decimal scale, unsupported intent status transitions, mismatched hold/account references, and Canton-internal request fields before any `operation` or `ledger_command_requests` row is created                                             | high                   |
| P4.E15 | Intent route response expansion shape         | `apps/api/src/routes/v1/*_intents`, `apps/api/src/presenters`, `packages/api-contracts/golden`               | Mutation responses include expandable `operation` and `latest_event` references with processing semantics that remain Canton-invisible | P2.C01, P2.C03, P2.C05, P4.E06                         | Golden responses for issue, redeem, transfer, hold, and hold release prove default responses hide `commandId`, `submissionId`, `updateId`, `partyId`, `participantId`, `packageId`, and `contractId`, while `expand[]=operation` and `expand[]=latest_event` return only public object grammar | high                   |
| P4.E16 | Holds release action enqueues release command | `apps/api/src/routes/v1/holds`, `apps/api/src/services/holds`                                                | `POST /v1/holds/:id/release` creates a release operation and `hold_release` command request bound to the original hold                 | P2.C04, P3.D03, P3.D04, P4.E06, P4.E14                 | Release route tests prove same idempotency key replays the same release operation, inactive or mismatched holds fail before queue mutation, and the queued payload includes hold ID, account, asset, amount, and original operation linkage without raw contract IDs                           | high                   |
| P4.F01 | Daml Java codegen                             | `packages/ledger-types`                                                                                      | Generated Java bindings for approved Daml packages                                                                                     | P1.B01, P1.B02, P1.B03, P1.B04, P1.B05                 | Gradle compiles generated bindings and exposes them to `services/ledger-command`                                                                                                                                                                                                               | med                    |
| P4.F02 | Ledger client                                 | `services/ledger-command/src/main/kotlin/ledger`                                                             | gRPC Ledger API client, JWT metadata, TLS/mTLS config, health check                                                                    | P4.F01, P3.D01, P3.D02, P3.D04                         | Worker connects to `dpm sandbox` participant and validates auth failure paths                                                                                                                                                                                                                  | high                   |
| P4.F03 | Command builder                               | `services/ledger-command/src/main/kotlin/command`                                                            | Issue/transfer/hold/release/redeem builders using generated bindings                                                                   | P4.F01, P4.F02                                         | Unit tests assert command envelopes, parties, IDs, decimal encoding, and package profile selection                                                                                                                                                                                             | high                   |
| P4.F04 | Dedup handler                                 | `services/ledger-command/src/main/kotlin/dedup`                                                              | Request claim, attempt creation, retry/backoff, duplicate/in-flight handling                                                           | P3.D03, P3.D04, P4.F02                                 | Retry tests prove same operation reuses `command_id` and each attempt gets unique `submission_id`                                                                                                                                                                                              | high                   |
| P4.F05 | Completion correlation                        | `services/ledger-command/src/main/kotlin/completion`                                                         | Completion stream/query handling and operation update writer                                                                           | P4.F02, P4.F04                                         | Operation reaches submitted/committed with `update_id` and `ledger_offset` populated against sandbox                                                                                                                                                                                           | high                   |
| P4.F06 | Failure classifier                            | `services/ledger-command/src/main/kotlin/failure`                                                            | Retryable/final/unknown error taxonomy and operation status mapping                                                                    | P4.F04, P4.F05                                         | Chaos tests cover participant crash, network loss, duplicate command, Daml rejection, package mismatch                                                                                                                                                                                         | high                   |
| P4.F07 | Ledger client JWT minting and refresh         | `services/ledger-command/src/main/kotlin/ledger`, `services/ledger-command/src/main/kotlin/config`           | Tenant/environment-aware Ledger API JWT provider with scoped `actAs`/`readAs` claims and pre-expiry refresh                            | P4.F02, P4.F09                                         | Unit tests mint sandbox tokens with exact route parties, refresh before expiry without changing `operation_id` or `command_id`, and fail closed when token material is missing or over-scoped                                                                                                  | high                   |
| P4.F08 | mTLS material loader and rotation hook        | `services/ledger-command/src/main/kotlin/ledger`, `services/ledger-command/src/main/kotlin/config`           | Certificate/key/trust-bundle loader with hot-reload hook for participant channels                                                      | P4.F02                                                 | Integration-style config tests load sandbox, staging, and production TLS profiles, rotate material without dropping in-flight attempt audit, and redact private key/certificate contents from logs and errors                                                                                  | high                   |
| P4.F09 | Per-tenant party-mapping resolver             | `services/ledger-command/src/main/kotlin/party`                                                              | Resolver that maps tenant/account/command type to participant user, `act_as`, `read_as`, endpoint, synchronizer, and route snapshot    | P3.D01, P3.D04, P4.F02                                 | Resolver tests cover issue, redeem, transfer, hold create, and hold release mappings; suspended/revoked mappings are rejected; route snapshots are stable and tenant-filtered                                                                                                                  | high                   |
| P4.F10 | Per-command package profile selector          | `services/ledger-command/src/main/kotlin/command`, `services/ledger-command/src/main/kotlin/config`          | Command-type package profile selector with P4-local lookup stub compatible with future P12 template-registry consumer                  | P4.F01, P4.F03, P4.F09                                 | Unit tests select template/interface/choice/profile per command type and asset; missing or incompatible profiles produce `package_profile_mismatch`; lookup boundary is isolated behind an interface for P12.N03/P12.N05 replacement                                                           | med                    |
| P4.F11 | Connection pool and circuit breaker           | `services/ledger-command/src/main/kotlin/ledger`                                                             | Participant-scoped Ledger API channel pool with health-aware circuit breaker                                                           | P4.F02, P4.F08                                         | Tests prove unhealthy participants stop receiving new submissions, healthy routes continue, breaker state is visible in worker health, and no command request is marked failed solely because a circuit is open                                                                                | high                   |
| P4.F12 | Command throttling per participant            | `services/ledger-command/src/main/kotlin/queue`, `services/ledger-command/src/main/kotlin/ledger`            | Per-participant concurrent submission ceiling enforced before submit attempts are started                                              | P4.F04, P4.F11                                         | Concurrency tests prove the worker never exceeds configured in-flight submissions per participant, excess requests remain queued with DB-backed availability, and retry attempts preserve stable `command_id`                                                                                  | high                   |
| P4.F13 | Command priority queue                        | `services/ledger-command/src/main/kotlin/queue`                                                              | Priority-aware poller that favors low-latency customer intents over background/reconciliation tasks without starvation                 | P4.F04, P4.F12                                         | Queue tests prove issue/redeem/transfer/hold/release intents outrank background tasks, equal-priority ordering remains FIFO by creation time, and aging prevents starvation                                                                                                                    | med                    |
| P4.F14 | Dead-command quarantine and admin tooling     | `services/ledger-command/src/main/kotlin/queue`, `apps/api/src/routes/v1/admin/ledger_commands`, `tools/cli` | Quarantine path and admin/CLI inspection for commands that require operator decision after exhausted or unsafe retries                 | P4.F06, P4.F21                                         | Tests move unreconciled unknowns and repeated final config failures into quarantine with immutable attempt evidence; admin tooling can list, inspect, and release or fail quarantined commands without exposing raw secrets                                                                    | high                   |
| P4.F15 | Stake and sequencer health gating             | `services/ledger-command/src/main/kotlin/ledger`, `services/ledger-command/src/main/kotlin/queue`            | Pre-submit health gate for participant connectivity, synchronizer/sequencer readiness, and required package vetting status             | P4.F02, P4.F11                                         | Sandbox and mocked-health tests block submissions when participant/sequencer/package health is not ready, keep operations processing rather than failed, and resume without changing command identity when health recovers                                                                     | high                   |
| P4.F16 | Multi-participant routing decision            | `services/ledger-command/src/main/kotlin/party`, `services/ledger-command/src/main/kotlin/ledger`            | Deployment-mode-aware router for hosted, customer-validator, and self-hosted participant selection with identical command semantics    | P3.D01, P4.F09, P4.F11                                 | Routing tests cover hosted, customer-validator, and self-hosted configs; public `/v1` payloads are identical across modes; route changes for an in-flight command are rejected or quarantined rather than silently changing `act_as` tuple                                                     | high                   |
| P4.F17 | ADR-0011 command_id derivation                | `services/ledger-command/src/main/kotlin/dedup`, `packages/idempotency`                                      | Dedicated command identity implementation using `SHA256(tenant_id                                                                      | operation_id                                           | command_semantic_version)` first 24 hex chars                                                                                                                                                                                                                                                  | P3.D03, P3.D04, P4.F03 | Unit tests prove same tenant/operation/semantic version yields the same `command_id`, different semantic versions produce different IDs, retries never hash request body ordering, and generated IDs satisfy Canton charset/length constraints | high |
| P4.F18 | submission_id generator and attempt audit row | `services/ledger-command/src/main/kotlin/dedup`, `services/ledger-command/src/main/kotlin/queue`             | UUIDv4 `submission_id` generator and append-only `ledger_command_attempts` writer per submit attempt                                   | P3.D04, P4.F04, P4.F17                                 | Retry tests prove every actual submit attempt inserts one audit row with a unique `submission_id`, stable `command_id`, route snapshot, timestamps, and no raw credential material                                                                                                             | high                   |
| P4.F19 | Resumable completion stream checkpoint        | `services/ledger-command/src/main/kotlin/completion`                                                         | Completion client that resumes from persisted participant/user checkpoint and correlates late completions                              | P4.F05, P4.F18                                         | Sandbox restart test submits a command, restarts the worker, resumes completion consumption from checkpoint, and updates `operations.update_id`/`ledger_offset` exactly once                                                                                                                   | high                   |
| P4.F20 | Update stream parser and decode envelope      | `services/ledger-command/src/main/kotlin/completion`, `services/ledger-command/src/main/kotlin/ledger`       | Ledger update parser that decodes update envelopes needed for command correlation while leaving projection materialization to Phase 05 | P4.F05, P4.F19                                         | Parser tests decode accepted updates, rejections, offsets, record time, command ID, submission ID, and workflow ID; unsupported templates remain opaque trace data and do not leak to public presenters                                                                                        | high                   |
| P4.F21 | Reconcile-after-unknown procedure             | `services/ledger-command/src/main/kotlin/completion`, `services/ledger-command/src/main/kotlin/dedup`        | Procedure that resolves `unknown` command outcomes to `reconciled`, `ledger_committed`, `failed`, or safely re-queued state            | P4.F06, P4.F19, P4.F20                                 | Network-loss tests place an operation in `unknown`, search completions/updates by route and `command_id`, then resolve without changing `command_id` or creating a second economic command                                                                                                     | high                   |
| P4.F22 | Per-command-type runtime tests                | `services/ledger-command/src/test/kotlin/command`, `services/ledger-command/src/test/kotlin/integration`     | Unit and sandbox integration coverage for issue, redeem, transfer, hold create, and hold release command paths                         | P4.F03, P4.F09, P4.F10, P4.F17, P4.F18, P4.F19, P4.F21 | Dedicated tests for issue, redeem, transfer, hold, and release each assert builder output, route resolution, submission attempt audit, completion correlation, and duplicate retry safety                                                                                                      | high                   |
| P4.F23 | Sandbox vs production retry policy split      | `services/ledger-command/src/main/kotlin/failure`, `services/ledger-command/src/main/kotlin/config`          | Environment-specific retry/backoff schedules and caps for sandbox/test versus staging/production participant profiles                  | P4.F06, P4.F12, P4.F21                                 | Policy tests prove sandbox uses fast bounded retries, production uses conservative backoff with unknown reconciliation first, and final/unknown classes never hot-loop or mutate command payloads                                                                                              | high                   |

### Suggested file layout

```text
services/ledger-command/
├── build.gradle.kts
├── src/main/kotlin/
│   ├── Main.kt
│   ├── config/
│   │   ├── LedgerCommandConfig.kt
│   │   └── ParticipantAuthConfig.kt
│   ├── queue/
│   │   ├── CommandRequestPoller.kt
│   │   ├── CommandRequestLease.kt
│   │   └── CommandRequestRepository.kt
│   ├── command/
│   │   ├── CommandBuilder.kt
│   │   ├── IssueCommandBuilder.kt
│   │   ├── TransferCommandBuilder.kt
│   │   ├── HoldCommandBuilder.kt
│   │   ├── HoldReleaseCommandBuilder.kt
│   │   └── RedeemCommandBuilder.kt
│   ├── party/
│   │   ├── PartyMappingResolver.kt
│   │   └── RouteSnapshot.kt
│   ├── ledger/
│   │   ├── LedgerApiClient.kt
│   │   ├── LedgerCommandSubmitter.kt
│   │   └── CompletionClient.kt
│   ├── dedup/
│   │   ├── CommandIdentity.kt
│   │   ├── SubmissionIdentity.kt
│   │   └── DedupStateMachine.kt
│   ├── completion/
│   │   ├── CompletionCorrelator.kt
│   │   └── OperationTraceWriter.kt
│   └── failure/
│       ├── FailureClassifier.kt
│       └── LedgerCommandError.kt
└── src/test/kotlin/
    ├── command/
    ├── dedup/
    ├── completion/
    └── integration/
```

### Delivery sequence

| Step | Tickets                                | Cutover note                                                                                              |
| ---- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1    | P4.F01                                 | Bindings compile before worker code depends on them.                                                      |
| 2    | P4.E06, P4.E14, P4.E15, P4.E16         | API can validate and enqueue intent/release requests but worker may remain disabled behind config.        |
| 3    | P4.F02, P4.F07, P4.F08, P4.F11, P4.F15 | Connect/readiness/auth to sandbox and guarded participants; no mutation submits until routing is stable.  |
| 4    | P4.F09, P4.F10, P4.F16                 | Resolve tenant routes and command package profiles without exposing deployment mode or Canton internals.  |
| 5    | P4.F03, P4.F17, P4.F18                 | Builders produce command plans with ADR-0011 command IDs and per-attempt submission audit rows.           |
| 6    | P4.F04, P4.F12, P4.F13, P4.F23         | Enable queue claim, throttle, priority, and safe retry without completion finalization.                   |
| 7    | P4.F05, P4.F19, P4.F20                 | Enable submit, resumable completions, and update envelope correlation in sandbox.                         |
| 8    | P4.F06, P4.F14, P4.F21, P4.F22         | Harden failures, quarantine, unknown reconciliation, and per-command integration coverage before staging. |

### Acceptance by command type

| Command type   | Required integration assertion                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `issue`        | Issue intent commits to ledger and operation has `command_id`, `submission_id`, `update_id`, `offset`.      |
| `transfer`     | Transfer intent submits with source/destination party mapping and duplicate retry does not double transfer. |
| `hold_create`  | Hold command reserves amount and duplicate retry remains idempotent.                                        |
| `hold_release` | Release command references prior hold state and reaches committed completion.                               |
| `redeem`       | Redeem command finalizes or fails with classified Daml error; no silent duplicate burn.                     |

## 10. Open Questions

command_id derivation is now bound by ADR-0011 in docs/Dev/DECISIONS.md.

| Question                             | Suggested resolution                                                                                                                                                                                                | Status                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Where is `command_id` first written? | Prefer API writes `operations.command_id` in the idempotency transaction so duplicate API replays never depend on worker timing. Ledger-command verifies/derives the same value.                                    | Open implementation detail.                                                              |
| Route snapshot persistence shape     | Store route snapshot in `ledger_command_attempts` metadata and/or command payload version field; no new table.                                                                                                      | Open implementation detail; no schema expansion unless Phase 03 already allows metadata. |
| Completion subscription storage      | Architecture requires participant completion cursor readiness; exact cursor table is likely Phase 05 checkpoint/reconciliation territory. Phase 04 can keep attempt correlation in existing operation/attempt rows. | Open; do not add Phase 04 table.                                                         |
| Unknown retry window                 | Needs operational policy per participant deduplication period and completion retention. Default should be conservative: reconcile before retry.                                                                     | Open policy value.                                                                       |
| External signing support             | Out of scope for Phase 04 hosted-party runtime; command request shape should not preclude later prepare/sign/execute flow.                                                                                          | Deferred.                                                                                |
| Package profile config source        | Architecture references asset bindings/package registry but Phase 04 should consume existing config, not create new public objects.                                                                                 | Open exact table names if Phase 03 schema differs.                                       |

Conflict resolution note: [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) is canonical. If another architecture document uses older names such as `ledger_operations` or `lop_*`, Phase 04 maps the runtime trace to the implementation-plan `operations` table and `op_*` operation object unless/until the implementation plan changes.

## 11. Agent-ready Checklist

### Build gate

- [ ] `./gradlew :packages:ledger-types:generateJavaBindings :services:ledger-command:compileKotlin` exits 0 for P4.F01, P4.F02, P4.F07, P4.F08, P4.F09, P4.F10, P4.F11, P4.F15, and P4.F16.
- [ ] `./gradlew :services:ledger-command:test` exits 0 for command builder, identity derivation, submission audit, dedup handler, throttling, priority queue, completion correlator, unknown reconciliation, retry policy, and failure classifier tests covering P4.F03 through P4.F23.
- [ ] Local `dpm sandbox` starts with the Phase 01 DAR packages available to the participant and P4.F15 health gates report ready before polling begins.
- [ ] `services/ledger-command` health check connects to sandbox Ledger API with configured JWT and TLS/mTLS profiles from P4.F07 and P4.F08.

### Verify gate

- [ ] P4.E14 route validation rejects invalid issue, redeem, transfer, hold, and hold release payloads before any queue mutation.
- [ ] P4.E15 response golden tests prove `operation` and `latest_event` expansion semantics without public Canton internals.
- [ ] P4.E16 `POST /v1/holds/:id/release` enqueues exactly one `hold_release` command request for a valid active hold and replays the same release operation under idempotency.
- [ ] `POST /v1/issue_intents` creates `operation` + `ledger_command_requests`; worker submits issue command and operation records `command_id`, `submission_id`, `update_id`, and `offset`.
- [ ] `POST /v1/transfer_intents` submits a transfer against `dpm sandbox`; duplicate retry with the same idempotency key/body does not create a second economic transfer.
- [ ] `POST /v1/holds` submits hold/reservation command and reaches committed completion.
- [ ] `POST /v1/holds/:id/release` submits release command and correlates completion to the release operation.
- [ ] `POST /v1/redeem_intents` submits redeem command and classifies Daml rejection as final when applicable.
- [ ] Duplicate retry safety test proves same external intended change keeps the same `operation_id` and `command_id` while every actual submit attempt gets a distinct `submission_id`.
- [ ] Network-loss-mid-submit test leaves operation in `unknown`/processing and reconciliation resolves it without changing `command_id`.
- [ ] Package version mismatch test blocks/fails affected command with deployment/config error and does not hot-loop retries.
- [ ] P4.F17 ADR-0011 command ID tests prove `command_id` is derived from tenant, operation, and command semantic version only.
- [ ] P4.F18 submission audit tests prove every actual submit attempt gets a unique `submission_id` and append-only attempt row.
- [ ] P4.F14 quarantine tooling can list and inspect dead commands without leaking secrets, then release or terminally fail them with audit evidence.
- [ ] P4.F19/P4.F20 restart test resumes completion/update parsing from checkpoint and correlates late completions exactly once.
- [ ] P4.F21 reconcile-after-unknown test resolves `unknown` to reconciled/committed/failed/queued without changing `command_id`.
- [ ] P4.F22 per-command-type tests pass for issue, redeem, transfer, hold create, and hold release in unit and sandbox integration suites.
- [ ] P4.F23 retry policy tests prove sandbox and production backoff schedules differ while both preserve stable command identity.

### Invariant gate

- [ ] Public API exposes no Canton contract-first fields.
- [ ] DB asset state is projection only.
- [ ] Every mutation has stable operation_id and command_id.
- [ ] P4.E14, P4.E15, P4.E16, P4.F17, P4.F18, P4.F19, P4.F20, and P4.F21 satisfy IC-04 and IC-05 for trace completeness and stable economic identity.
- [ ] P4.F07, P4.F08, P4.F09, P4.F14, P4.F15, and P4.F16 satisfy IC-03, IC-08, and §10 by hiding Canton internals, preserving deployment-mode API parity, and minimizing credential exposure.
- [ ] Projection is rebuildable.
- [ ] Deployment mode does not change /v1 grammar.
