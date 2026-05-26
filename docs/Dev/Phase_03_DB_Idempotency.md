# Phase 03 — DB Schema and Idempotency

> Build the Postgres projection/audit/config substrate and idempotency layer that make every developer-friendly API mutation replay-safe, tenant-scoped, and ledger-traceable without making the DB the source of truth.

## 1. Executive Summary

Phase 03 turns the object model and API contract into durable database structure.

Core principles embedded in this phase:

1. **Canton Ledger is the source of truth.**
2. **Pillar DB stores only Projection / Audit / Config.**
3. **External API must be developer-friendly and Canton-invisible.**
4. **Internal runtime must be Canton-native.**
5. **Operations must be ledger-traceable.**
6. **Balance/Holding-first, not contract-first.**
7. **Intent-first, not transaction-first.**
8. **Webhook-first for async workflow.**
9. **API grammar must be polished from day one.**
10. **Deployment model changes, API experience does not.**

Phase 03 implements the database foundation described in [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) and the request/idempotency/audit trace model in [11 Request Logs Ledger Trace Audit](../Architecture/11.Request%20Logs%20Ledger%20Trace%20Audit.md).

The phase result is not an application feature by itself. It is the load-bearing substrate for Phase 04 ledger command runtime, Phase 05 projections, Phase 06 webhooks, and Phase 09 Helm deployment.

| Layer             | Phase 03 deliverable                                                          | Source-of-truth stance                   |
| ----------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| Config            | tenants, accounts, party mappings, API/version/webhook config migration slots | Durable configuration                    |
| Audit             | request, idempotency, intent, operation, command-request audit records        | Evidence, not asset truth                |
| Projection        | balances, holdings, event log, checkpoints/reconciliation slots               | Rebuildable from Canton/PQS              |
| Webhook           | event log and delivery state schema                                           | Replayable async delivery                |
| Migration runtime | `migrator up`, `migrator verify`, `migrator status`                           | Controlled forward-only schema evolution |

Exit condition: an empty Postgres database migrates cleanly, verifies cleanly, and idempotency tests prove replay, conflict, and crash recovery behavior.

## 2. Goals / Non-goals

### Goals

| Goal                       | Description                                                                                             | Gate                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Forward-only schema        | Add ordered migrations from `0000_extensions` through `0070_reconciliation` plus repeatable views.      | `migrator up` exits 0 on empty DB.                     |
| Migration verification     | Every migration group has verification SQL that proves required tables, constraints, and indexes exist. | `migrator verify` exits 0.                             |
| Idempotency persistence    | Store tenant-scoped idempotency records with request fingerprint and replayable response payload.       | Same key/hash replays stored response.                 |
| Conflict protection        | Same key with different canonical request hash returns `409 Conflict`.                                  | Unit tests cover mismatch.                             |
| Intent/operation substrate | Persist `intent_id`, `operation_id`, stable `command_id`, and command request queue records.            | Operation trace query works.                           |
| Projection substrate       | Persist balance/holding/event delivery state as projection, never source-of-truth asset state.          | Projection upsert tests pass.                          |
| Tenant isolation           | Every tenant-owned table carries `tenant_id` and has tenant indexes.                                    | Schema verification checks tenant columns and indexes. |
| Traceability               | Request/idempotency/intent/operation/event/webhook rows form a durable trace spine.                     | Operation trace view returns joined trace.             |

### Non-goals

| Non-goal                                       | Reason                                                           | Later phase                 |
| ---------------------------------------------- | ---------------------------------------------------------------- | --------------------------- |
| Public API implementation                      | Phase 03 only persists the contract substrate.                   | Phase 04 / Phase 05         |
| Ledger command submission                      | Phase 03 creates command request rows, not Canton submissions.   | Phase 04                    |
| Projection workers                             | Phase 03 creates projection tables; workers populate them later. | Phase 05                    |
| Webhook dispatch runtime                       | Phase 03 creates event/delivery tables; dispatcher is later.     | Phase 06                    |
| Helm chart implementation                      | Phase 03 exposes migrator commands; chart wiring is later.       | Phase 09                    |
| Schema-per-tenant implementation               | Architecture currently uses shared tables with `tenant_id`.      | Open question in section 10 |
| Raw request/body retention policy finalization | Phase 03 creates storage primitives and metadata constraints.    | Phase 08                    |

## 3. Architecture

### Phase boundary

```text
Phase 02 API Contract
    │ object grammar, errors, idempotency headers
    ▼
Phase 03 DB + Idempotency
    │ migrations, tables, views, migrator CLI, idempotency package
    ▼
Phase 04 Ledger Command Runtime
    │ consumes ledger_command_requests, writes operation status
    ▼
Phase 05 Projection + Reconciliation
    │ populates balances/holdings/events from Canton/PQS
    ▼
Phase 06 Webhook-first Event System
    │ consumes event_log, writes webhook_deliveries
```

### Migration directory layout

Phase 03 creates the canonical migration tree from [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md):

```text
packages/db/migrations/
├── 0000_extensions/
│   ├── 0001_pgcrypto.sql
│   └── 0002_updated_at_trigger.sql
├── 0010_config/
│   ├── 0010_tenants.sql
│   ├── 0011_accounts.sql
│   ├── 0012_asset_configs.sql
│   ├── 0013_party_mappings.sql
│   └── 0014_api_versions.sql
├── 0020_audit/
│   ├── 0020_api_requests.sql
│   ├── 0021_audit_log.sql
│   └── 0022_trace_indices.sql
├── 0030_idempotency/
│   ├── 0030_idempotency_keys.sql
│   └── 0031_idempotency_gc.sql
├── 0040_intents_operations/
│   ├── 0040_intents.sql
│   ├── 0041_operations.sql
│   ├── 0042_ledger_command_requests.sql
│   └── 0043_ledger_command_attempts.sql
├── 0050_projections/
│   ├── 0050_balances.sql
│   ├── 0051_holdings.sql
│   ├── 0052_transfers.sql
│   ├── 0053_holds.sql
│   ├── 0054_projection_checkpoints.sql
│   └── 0055_projection_indices.sql
├── 0060_events_webhooks/
│   ├── 0060_event_log.sql
│   ├── 0061_webhook_endpoints.sql
│   ├── 0062_webhook_deliveries.sql
│   └── 0063_webhook_attempts.sql
├── 0070_reconciliation/
│   ├── 0070_reconciliation_runs.sql
│   └── 0071_reconciliation_diffs.sql
└── repeatable/
    ├── R__balance_summary_view.sql
    ├── R__operation_trace_view.sql
    └── R__webhook_health_view.sql
```

### Migration rules

| Rule                      | Requirement                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Forward-only              | Production migrations only move forward. `down.sql` is allowed only for local development and never used by deploy automation. |
| No asset truth rewrites   | A migration must never rewrite Canton-derived economic truth as if DB were authoritative.                                      |
| Expand-and-contract       | Audit/config table changes must be additive first, then code rollout, then cleanup in a later release.                         |
| Projection rebuildability | Projection tables may be dropped/rebuilt only by controlled reconciliation/rebuild flows.                                      |
| Verified migrations       | Every migration has a verification query proving shape, constraints, and indexes.                                              |
| Owner required            | Every migration declares owning service/package in migration metadata or adjacent comment.                                     |
| Rollback note required    | Rollback is operational, not SQL reversal: disable rollout, restore prior app version, run forward fix.                        |

### Expand-and-contract policy

| Step            | Allowed action                                                            | Forbidden action                                               |
| --------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Expand          | Add nullable column, new table, new index concurrently, new view version. | Add non-null column without default/backfill path.             |
| Dual-write/read | Application writes both old and new shapes where required.                | Switch readers before writers are deployed.                    |
| Backfill        | Backfill idempotent batches with tenant filters and resume checkpoints.   | Full-table locks on hot audit/idempotency tables.              |
| Contract        | Drop old column/table only after all readers stop using it.               | Drop columns in the same release that introduces replacements. |

### View layer

Repeatable migrations define stable read models for internal services and support tools:

| View                   | Purpose                                                                      | Consumers                                               |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `balance_summary_view` | Tenant/account/asset balance read model over projection rows.                | API reads, Workbench, reconciliation reports.           |
| `operation_trace_view` | Join request/idempotency/intent/operation/command/event/webhook identifiers. | Support, CLI logs, trace viewer, Phase 04/07 debugging. |
| `webhook_health_view`  | Endpoint delivery status and retry health.                                   | Webhook dispatcher, Workbench, alerting.                |

Views are replaceable through `repeatable/` migrations. They must not encode business truth that cannot be rebuilt from base tables and Canton/PQS.

## 4. API / Object Model

Phase 03 does not expose new public endpoints, but it fixes the persistence contract used by public mutation endpoints.

### Request/response surface tied to DB

The API layer writes request and idempotency records inside the same DB transaction that creates intent, operation, and ledger command request rows.

```text
HTTP mutation
  ├─ Request-Id: req_*
  ├─ Idempotency-Key: client key
  ├─ canonical request hash
  └─ DB transaction
       ├─ api_requests / request log row
       ├─ idempotency_keys row locked by (tenant_id, key)
       ├─ intents row
       ├─ operations row
       └─ ledger_command_requests row
```

### Idempotency replay contract

| Incoming request                                 | Stored row                                 | Result                                                                                       |
| ------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| New `Idempotency-Key`                            | No row                                     | Insert row, bind to new operation, process request.                                          |
| Same key + same `request_hash` + completed row   | `response_status`, `response_body` present | Return stored `response_body` verbatim with stored status.                                   |
| Same key + same `request_hash` + in-progress row | Operation exists but response incomplete   | Return current operation/object state or processing response according to endpoint contract. |
| Same key + different `request_hash`              | Existing row hash differs                  | Return `409 Conflict`.                                                                       |
| Same key after lock expiry                       | Existing row incomplete and lock expired   | Reacquire lock and continue/recover operation, preserving operation identity.                |

Replay is exact for completed responses:

```http
POST /v1/transfer_intents
Idempotency-Key: idem_abc
```

```text
lookup: (tenant_id, key = hash-or-stored-key)
check: request_hash == canonical_request_hash
return: response_status + response_body exactly as stored
```

Mismatch response:

```http
HTTP/1.1 409 Conflict
Request-Id: req_retry
Content-Type: application/json
```

```json
{
  "error": {
    "type": "idempotency_error",
    "code": "idempotency_key_reused",
    "message": "This idempotency key was already used with different request parameters.",
    "request_id": "req_retry"
  }
}
```

### Object model constraints

| Object             | DB anchor                          | Public visibility                                                                  |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| `request_log`      | `api_requests` / audit request row | Public-safe request ID and masked metadata.                                        |
| `idempotency_key`  | `idempotency_keys`                 | Header value never echoed in full; preview/hash only in internal/support contexts. |
| `intent`           | `intents`                          | Public business workflow anchor.                                                   |
| `operation`        | `operations`                       | Public-safe status anchor; Canton identifiers role-gated.                          |
| `balance`          | `balances`                         | Public balance object; projection only.                                            |
| `holding`          | `holdings`                         | Public holding object; projection only.                                            |
| `event`            | `event_log`                        | Public webhook/event object.                                                       |
| `webhook_delivery` | `webhook_deliveries`               | Public delivery status for endpoint owner.                                         |

No public object may expose `contractId`, `templateId`, `partyId`, `participantId`, `packageId`, or raw `command_id` as part of normal `/v1` grammar.

## 5. Internal Runtime

### Packages and commands

| Artifact            | Path                        | Responsibility                                                             |
| ------------------- | --------------------------- | -------------------------------------------------------------------------- |
| Migration SQL       | `packages/db/migrations/**` | Ordered schema changes and repeatable views.                               |
| DB package          | `packages/db`               | Connection, migration discovery, verification helpers, test fixtures.      |
| Idempotency package | `packages/idempotency`      | Key hashing, canonical request fingerprinting, lock/replay/conflict logic. |
| Migrator CLI        | `tools/migrator`            | Operational entry point for migration lifecycle.                           |

### Migrator CLI

The migrator exposes exactly these phase-gate commands:

```bash
migrator up --database-url "$DATABASE_URL"
migrator verify --database-url "$DATABASE_URL"
migrator status --database-url "$DATABASE_URL"
```

| Command           | Behavior                                                                                                             | Exit contract                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `migrator up`     | Acquires migration advisory lock, applies unapplied ordered migrations, applies repeatable views, records checksums. | `0` when DB reaches latest version; non-zero on checksum drift, lock timeout, SQL error. |
| `migrator verify` | Runs verification SQL for extensions, tables, constraints, indexes, views, and migration ledger integrity.           | `0` when schema matches expected shape; non-zero on missing/drifted object.              |
| `migrator status` | Prints current version, pending migrations, repeatable checksum status, lock holder if present.                      | `0` for readable status; non-zero only when DB cannot be inspected.                      |

### Deployment embedding

Phase 03 implements CLI semantics only. Phase 09 wires them into Helm:

```text
helm pre-upgrade/pre-install Job
  └─ migrator up
      └─ migrator verify
          └─ application Deployment rollout
```

Forward reference: Phase 09 must run the migrator as a Helm pre-upgrade Job before application pods serving new code start.

### Idempotency package behavior

```text
IdempotencyService.begin(request)
  ├─ hash Idempotency-Key
  ├─ canonicalize method + path template + body + selected headers
  ├─ begin DB tx
  ├─ SELECT ... FOR UPDATE on (tenant_id, key)
  ├─ if absent: insert status=in_progress, locked_until
  ├─ if hash mismatch: rollback and return 409
  ├─ if complete: rollback and replay stored response
  └─ else: continue/recover existing operation

IdempotencyService.complete(operation, response)
  ├─ store response_status
  ├─ store response_body verbatim for replay
  ├─ mark status=completed or failed
  └─ commit with request log completion
```

### Transaction boundaries

| Boundary                             | Must be atomic? | Notes                                                                     |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------- |
| Request log shell + idempotency lock | Yes             | No mutation proceeds without trace shell.                                 |
| Intent + operation + command request | Yes             | Prevents orphan idempotency records with no operation identity.           |
| Ledger submission                    | No              | Phase 04 submits after DB commit; DB outage before submit is recoverable. |
| Projection upsert                    | No              | Phase 05 derives from Canton/PQS and is rebuildable.                      |
| Webhook delivery                     | No              | Phase 06 delivery is retryable and independent of ledger truth.           |

## 6. DB Schema

### Schema groups

```text
config
  tenants
  accounts
  asset_configs
  party_mappings
  api_keys
  api_versions
  webhook_endpoints

audit
  api_requests
  idempotency_keys
  intents
  operations
  ledger_command_requests
  ledger_command_attempts
  audit_log

projection
  balances
  holdings
  transfers
  holds
  ledger_events
  projection_checkpoints
  operation_projection

webhook
  event_log
  webhook_deliveries
  webhook_attempts

reconciliation
  reconciliation_runs
  reconciliation_diffs
```

### Core DDL

The following DDL reproduces the Phase 03 core table sketch from [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) and adds required tenant, operation, and ledger-offset indexes.

```sql
create table tenants (
  id text primary key,
  livemode boolean not null default false,
  default_api_version text not null,
  created_at timestamptz not null default now()
);

create table accounts (
  id text primary key,
  tenant_id text not null references tenants(id),
  external_reference text,
  status text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index accounts_tenant_id_idx
  on accounts (tenant_id);

create table party_mappings (
  id text primary key,
  tenant_id text not null references tenants(id),
  account_id text references accounts(id),
  canton_party text not null,
  participant_alias text not null,
  purpose text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, account_id, purpose)
);

create index party_mappings_tenant_id_idx
  on party_mappings (tenant_id);

create table idempotency_keys (
  tenant_id text not null,
  key text not null,
  method text not null,
  path text not null,
  request_hash text not null,
  response_status int,
  response_body jsonb,
  operation_id text,
  status text not null,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

create index idempotency_keys_tenant_id_idx
  on idempotency_keys (tenant_id);

create index idempotency_keys_operation_id_idx
  on idempotency_keys (operation_id);

create table intents (
  id text primary key,
  tenant_id text not null references tenants(id),
  type text not null,
  status text not null,
  request_body jsonb not null,
  metadata jsonb not null default '{}',
  operation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index intents_tenant_id_idx
  on intents (tenant_id);

create index intents_operation_id_idx
  on intents (operation_id);

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

create index operations_tenant_id_idx
  on operations (tenant_id);

create index operations_intent_id_idx
  on operations (intent_id);

create index operations_ledger_offset_idx
  on operations (ledger_offset);

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

create index ledger_command_requests_tenant_id_idx
  on ledger_command_requests (tenant_id);

create index ledger_command_requests_operation_id_idx
  on ledger_command_requests (operation_id);

create table balances (
  id text primary key,
  tenant_id text not null references tenants(id),
  account_id text not null references accounts(id),
  asset_id text not null,
  available numeric(38, 18) not null,
  pending numeric(38, 18) not null,
  reserved numeric(38, 18) not null,
  settled numeric(38, 18) not null,
  as_of_ledger_offset text not null,
  as_of_ledger_time timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, account_id, asset_id)
);

create index balances_tenant_id_idx
  on balances (tenant_id);

create index balances_ledger_offset_idx
  on balances (as_of_ledger_offset);

create table holdings (
  id text primary key,
  tenant_id text not null references tenants(id),
  account_id text not null references accounts(id),
  asset_id text not null,
  amount numeric(38, 18) not null,
  status text not null,
  source_intent_id text,
  as_of_ledger_offset text not null,
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create index holdings_tenant_id_idx
  on holdings (tenant_id);

create index holdings_ledger_offset_idx
  on holdings (as_of_ledger_offset);

create table event_log (
  id text primary key,
  tenant_id text not null references tenants(id),
  type text not null,
  api_version text not null,
  data_object jsonb not null,
  request_id text,
  idempotency_key text,
  operation_id text references operations(id),
  ledger_offset text,
  created_at timestamptz not null default now()
);

create index event_log_tenant_id_idx
  on event_log (tenant_id);

create index event_log_operation_id_idx
  on event_log (operation_id);

create index event_log_ledger_offset_idx
  on event_log (ledger_offset);

create table webhook_deliveries (
  id text primary key,
  tenant_id text not null references tenants(id),
  event_id text not null references event_log(id),
  endpoint_id text not null,
  status text not null,
  next_attempt_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index webhook_deliveries_tenant_id_idx
  on webhook_deliveries (tenant_id);

create index webhook_deliveries_event_id_idx
  on webhook_deliveries (event_id);
```

### Table ownership

| Table                     | Group               | Owner                                      | Rebuildable?                                                    |
| ------------------------- | ------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `tenants`                 | config              | API/admin config                           | No                                                              |
| `accounts`                | config              | API/admin config                           | No                                                              |
| `party_mappings`          | config              | Ledger/runtime config                      | No                                                              |
| `idempotency_keys`        | audit/idempotency   | API idempotency package                    | No, retained for replay/audit window                            |
| `intents`                 | audit               | Intent service                             | No                                                              |
| `operations`              | audit/runtime       | Operation service / ledger command runtime | No                                                              |
| `ledger_command_requests` | audit/runtime queue | Ledger command runtime                     | No until command lifecycle terminal                             |
| `balances`                | projection          | Projection worker                          | Yes                                                             |
| `holdings`                | projection          | Projection worker                          | Yes                                                             |
| `event_log`               | webhook/projection  | Event engine                               | Rebuildable only from projection/ledger within retention policy |
| `webhook_deliveries`      | webhook             | Webhook dispatcher                         | Replayable delivery state, not ledger truth                     |

### Required verification queries

```sql
-- Tables exist.
select to_regclass('public.tenants') is not null;
select to_regclass('public.idempotency_keys') is not null;
select to_regclass('public.operations') is not null;
select to_regclass('public.balances') is not null;
select to_regclass('public.event_log') is not null;
select to_regclass('public.webhook_deliveries') is not null;

-- Tenant indexes exist.
select to_regclass('public.accounts_tenant_id_idx') is not null;
select to_regclass('public.operations_tenant_id_idx') is not null;
select to_regclass('public.event_log_tenant_id_idx') is not null;

-- Trace indexes exist.
select to_regclass('public.idempotency_keys_operation_id_idx') is not null;
select to_regclass('public.ledger_command_requests_operation_id_idx') is not null;
select to_regclass('public.event_log_operation_id_idx') is not null;

-- Ledger offset indexes exist.
select to_regclass('public.operations_ledger_offset_idx') is not null;
select to_regclass('public.balances_ledger_offset_idx') is not null;
select to_regclass('public.holdings_ledger_offset_idx') is not null;
select to_regclass('public.event_log_ledger_offset_idx') is not null;
```

### Data classification by column family

| Column family       | Examples                                      | Classification             | Rule                                                              |
| ------------------- | --------------------------------------------- | -------------------------- | ----------------------------------------------------------------- |
| Tenant/account IDs  | `tenant_id`, `account_id`                     | Confidential tenant data   | Always scoped by authz and row filter.                            |
| Canton internal IDs | `canton_party`, `command_id`, `ledger_offset` | Internal operational data  | Never exposed in normal public API.                               |
| Idempotency keys    | `key`, `idempotency_key`                      | Secret-like retry material | Store hashed/preview form in implementation; no full public echo. |
| Metadata            | `metadata jsonb`                              | Customer-controlled        | Validate no PII; size and key allowlist/denylist enforced.        |
| Response replay     | `response_body jsonb`                         | Public response cache      | Store exact response only for replay window and tenant scope.     |

## 7. Failure Modes

| Failure mode                              | Scenario                                                                                                         | Required behavior                                                                                                                                    | Test / gate                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Idempotency race                          | Two identical requests with same key arrive concurrently.                                                        | One transaction locks/inserts `(tenant_id, key)`; the other waits or observes completed/in-progress state. No duplicate operation.                   | Concurrent unit test with same key/hash.                                        |
| Idempotency hash mismatch                 | Retry reuses key with different body/path/method.                                                                | Return `409 Conflict`; do not create a second operation.                                                                                             | Conflict unit test.                                                             |
| DB outage before ledger submit            | API transaction commits intent/operation/command request, then DB or worker is unavailable before Canton submit. | On recovery, ledger-command consumes pending `ledger_command_requests`; stable `operation_id` and `command_id` preserved.                            | Command request recovery test in Phase 04; Phase 03 verifies durable row shape. |
| DB outage before transaction commit       | API starts mutation but DB fails before commit.                                                                  | No idempotency/operation record is durable; client retry can create the operation safely.                                                            | Transaction rollback unit test.                                                 |
| API crash after DB commit before response | Intent/operation exists, response not returned to client.                                                        | Retry same key/hash recovers existing operation and returns current state or stored response.                                                        | Replay-after-crash idempotency test.                                            |
| API crash after response body stored      | Response persisted but client times out.                                                                         | Retry returns stored `response_body` verbatim with stored `response_status`.                                                                         | Replay stored response test.                                                    |
| Schema upgrade contention                 | Migrator runs while app nodes are active.                                                                        | Migrator takes advisory lock; expand-only changes avoid breaking old readers; Helm pre-upgrade ordering in Phase 09 prevents new pods before schema. | `migrator status` shows lock/pending state; verify migration lock behavior.     |
| Checksum drift                            | Applied migration file changes after deployment.                                                                 | `migrator up`/`verify` fail non-zero; operator ships forward correction.                                                                             | Migrator checksum test.                                                         |
| Projection drift                          | Balance/holding rows diverge from Canton/PQS.                                                                    | Reconciliation detects diff; projection can be rebuilt without changing Canton truth.                                                                | Phase 05 reconciliation tests.                                                  |
| Webhook delivery duplication              | Dispatcher retries same event delivery.                                                                          | Delivery attempts increment; event identity stable; downstream signing/replay handled in Phase 06.                                                   | Phase 06 retry tests; Phase 03 persists state.                                  |

### Recovery invariants

```text
same external intended mutation
  => same tenant_id
  => same idempotency key hash
  => same request_hash
  => same operation_id
  => same stable command_id
  => new submission_id only when Canton submit is retried
```

A retry may create a new `request_id`; it must not create a new operation for the same idempotent mutation.

## 8. Security / Compliance

### Tenant isolation

| Control              | Phase 03 requirement                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| Row-level tenant key | Every tenant-owned table has `tenant_id text not null`.                           |
| Tenant indexes       | Hot tables have `tenant_id` indexes for scoped reads and verification.            |
| Composite uniqueness | Business uniqueness includes `tenant_id` where applicable.                        |
| Query discipline     | Application queries must include tenant predicate before returning customer data. |
| Future RLS           | Schema must remain compatible with Postgres RLS if enabled in Phase 08.           |

Phase 03 uses a shared schema with tenant-scoped rows. Section 10 tracks the shared-schema versus schema-per-tenant decision.

### Hashed API key storage

Config migrations include API key storage slots from the implementation plan's config group. API keys must be stored as hashes, never plaintext.

| Field class          | Storage rule                                                               |
| -------------------- | -------------------------------------------------------------------------- |
| API key secret       | Hash with strong one-way password/key hashing strategy; never recoverable. |
| API key preview      | Store short non-secret preview for dashboard/support display.              |
| API key ID           | Store stable identifier for audit joins.                                   |
| Authorization header | Always redacted from request logs.                                         |
| Idempotency-Key      | Hash plus preview; full value not stored by default.                       |

### No PII in metadata

`metadata jsonb` is not a dumping ground for personal data.

| Rule               | Enforcement                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| No raw PII         | Reject or redact email, phone, government ID, address, and free-form customer secrets in metadata. |
| No credentials     | Reject keys matching token/password/secret/private-key patterns.                                   |
| Bounded size       | Enforce object size and key count limits in API validation.                                        |
| Audit-safe logging | Request logs store masked snapshots and hashes, not raw sensitive payloads.                        |
| Compliance export  | Export only masked metadata unless policy explicitly allows otherwise.                             |

### Audit posture

Phase 03 DB rows support the three-log model from [11 Request Logs Ledger Trace Audit](../Architecture/11.Request%20Logs%20Ledger%20Trace%20Audit.md):

| Layer       | Phase 03 backing store                                                   | Compliance rule                                      |
| ----------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| RequestLog  | request/audit migrations plus idempotency rows                           | Store request/response hashes and masked metadata.   |
| LedgerTrace | operation trace view over idempotency/intents/operations/events/webhooks | Durable even when OTel sampling drops spans.         |
| AuditLog    | audit migration slots                                                    | Append-only action evidence; no asset truth rewrite. |

## 9. Implementation Plan

| ID     | Title                                  | Path                                                                                      | Output                                                                                                                                  | Deps                                           | Acceptance                                                                                                                           | Risk   |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| P3.D01 | Config migrations                      | `packages/db/migrations/0010_config`                                                      | `tenants`, `accounts`, `party_mappings`; slots for asset/API/webhook config                                                             | P0.A01                                         | `migrator up` on empty DB creates config tables and tenant indexes                                                                   | low    |
| P3.D02 | Audit migrations                       | `packages/db/migrations/0020_audit`                                                       | request/audit tables and trace indices                                                                                                  | P3.D01                                         | `migrator verify` proves request/audit tables and trace index are present                                                            | medium |
| P3.D03 | Idempotency migrations and package     | `packages/db/migrations/0030_idempotency`, `packages/idempotency`                         | `idempotency_keys`, canonical request hash, lock/replay/conflict helpers                                                                | P3.D02, P2.C04                                 | Same key/hash replays; same key/different hash returns `409 Conflict`                                                                | high   |
| P3.D04 | Intent and operation migrations        | `packages/db/migrations/0040_intents_operations`                                          | `intents`, `operations`, `ledger_command_requests`, operation trace indexes                                                             | P3.D03                                         | Operation trace query joins intent, operation, command request, idempotency record                                                   | high   |
| P3.D05 | Projection migrations                  | `packages/db/migrations/0050_projections`                                                 | `balances`, `holdings`, projection checkpoint/index structure                                                                           | P3.D04                                         | Projection upsert tests pass and ledger-offset indexes verify                                                                        | medium |
| P3.D06 | Event and webhook migrations           | `packages/db/migrations/0060_events_webhooks`                                             | `event_log`, `webhook_deliveries`, webhook retry state tables                                                                           | P3.D05                                         | Retry state machine persists event delivery status and attempts                                                                      | medium |
| P3.D07 | Migrator CLI                           | `tools/migrator`, `packages/db`                                                           | `migrator up`, `migrator verify`, `migrator status`; checksum ledger; advisory lock                                                     | P3.D01, P3.D02, P3.D03, P3.D04, P3.D05, P3.D06 | CI migration verify passes; empty DB up+verify exits 0                                                                               | high   |
| P3.D08 | Postgres extensions migration          | `packages/db/migrations/0000_extensions`                                                  | `pgcrypto`, `citext`, `pg_partman`, updated-at trigger helpers                                                                          | P0.A01                                         | `migrator verify` proves required extensions and helper functions exist before schema groups apply                                   | medium |
| P3.D09 | Tenants table and indexes              | `packages/db/migrations/0010_config/0010_tenants.sql`                                     | `tenants` with livemode/default API version/status timestamps and tenant lookup indexes                                                 | P3.D08                                         | Empty DB migration creates `tenants`; verify SQL proves primary key, default API version, livemode, status, and indexes              | low    |
| P3.D10 | Accounts table, tenant FK, soft-delete | `packages/db/migrations/0010_config/0011_accounts.sql`                                    | `accounts` with tenant FK, status, metadata, soft-delete/closed fields, tenant/status/external-reference indexes                        | P3.D09                                         | Insert/update tests enforce tenant FK and soft-delete retention; verify SQL proves indexes and status constraints                    | medium |
| P3.D11 | Party mappings table and uniqueness    | `packages/db/migrations/0010_config/0013_party_mappings.sql`                              | `party_mappings` with tenant/account scope, participant alias, Canton party reference, purpose uniqueness                               | P3.D10                                         | Duplicate `(tenant_id, account_id, purpose)` fails while same purpose in another tenant succeeds; tenant lookup index verifies       | medium |
| P3.D12 | API versions config table              | `packages/db/migrations/0010_config/0014_api_versions.sql`                                | `api_versions` with tenant-scoped version configuration and account default compatibility history                                       | P3.D09                                         | Verify SQL proves unique tenant/version rows and account default lookup supports `Pillar-Version` resolution                         | low    |
| P3.D13 | API requests audit table               | `packages/db/migrations/0020_audit/0020_api_requests.sql`                                 | `api_requests` with tenant, endpoint, API version, masked request/response hashes, timestamps, retention note                           | P3.D09, P2.C04                                 | Request trace lookup by tenant/request/endpoint/timestamp works and retention policy is documented beside the migration              | medium |
| P3.D14 | Sensitive audit log table              | `packages/db/migrations/0020_audit/0021_audit_log.sql`                                    | `audit_log` for sensitive security/compliance/runtime events with append-only immutability trigger                                      | P3.D13                                         | Update/delete attempts through normal service roles fail; append and trace lookup by request/resource succeed                        | high   |
| P3.D15 | Canonical request hash package         | `packages/idempotency`                                                                    | Shared Node/Kotlin request-hash spec and fixtures for method, path template, API version, body, selected headers                        | P3.D03, P2.C04                                 | Node and Kotlin fixture tests produce identical hashes; semantically equal JSON bodies hash identically                              | high   |
| P3.D16 | Idempotency state machine and GC       | `packages/idempotency`, `packages/db/migrations/0030_idempotency/0031_idempotency_gc.sql` | in-progress/completed/failed/conflict lock semantics plus GC eligibility query/job                                                      | P3.D15, P3.D13                                 | Concurrent same-key test creates one operation; conflict returns `409`; expired incomplete row recovers; GC skips active replay rows | high   |
| P3.D17 | Intents table separate from operations | `packages/db/migrations/0040_intents_operations/0040_intents.sql`                         | `intents` with tenant, type, status, request body, metadata, and FK relationship to operations                                          | P3.D16                                         | Intent insert remains distinct from operation insert and verify SQL proves tenant/status/operation indexes                           | medium |
| P3.D18 | Operations table and command identity  | `packages/db/migrations/0040_intents_operations/0041_operations.sql`                      | `operations` with stable unique `command_id`, intent FK, status, update/offset/time, trace indexes                                      | P3.D17                                         | Duplicate `command_id` fails; operation trace lookup by tenant/status/ledger offset and intent succeeds                              | high   |
| P3.D19 | Ledger command request queue table     | `packages/db/migrations/0040_intents_operations/0042_ledger_command_requests.sql`         | `ledger_command_requests` queue with operation FK, command payload, state machine, `available_at`, dequeue indexes                      | P3.D18                                         | Queue claim query returns only available pending rows in deterministic order and terminal rows are not re-claimed                    | high   |
| P3.D20 | Ledger command attempts table          | `packages/db/migrations/0040_intents_operations/0043_ledger_command_attempts.sql`         | `ledger_command_attempts` per-attempt audit with request FK, operation/request FK, unique `submission_id`, status/error timestamps      | P3.D19                                         | Retrying same operation appends attempts with distinct `submission_id`; duplicate submission ID for the same command is rejected     | high   |
| P3.D21 | Balances projection table              | `packages/db/migrations/0050_projections/0050_balances.sql`                               | `balances` with tenant/account/asset uniqueness, `numeric(38,18)` amounts, and `as_of_ledger_offset`                                    | P3.D18                                         | Upsert by `(tenant_id, account_id, asset_id)` is deterministic; verify SQL proves decimal precision and ledger-offset index          | medium |
| P3.D22 | Holdings projection table              | `packages/db/migrations/0050_projections/0051_holdings.sql`                               | `holdings` with status, restrictions/metadata, source intent, retention markers, ledger offset indexes                                  | P3.D21                                         | Closed/restricted holdings remain retained and queryable; tenant/account/asset/status indexes verify                                 | medium |
| P3.D23 | Projection checkpoints table           | `packages/db/migrations/0050_projections/0054_projection_checkpoints.sql`                 | `projection_checkpoints` with per-projector offset, watermark, checksum, lease owner, fencing token                                     | P3.D22                                         | Stale projector lease cannot advance checkpoint; latest checkpoint resumes by projector name and tenant                              | high   |
| P3.D24 | Operation projection materialization   | `packages/db/migrations/0050_projections/0055_projection_indices.sql`                     | `operation_projection` materialized table/view for public operation read model and trace joins                                          | P3.D18, P3.D23                                 | Operation public read query returns intent/status/event links without default raw Canton identifiers                                 | medium |
| P3.D25 | Event log table                        | `packages/db/migrations/0060_events_webhooks/0060_event_log.sql`                          | immutable `event_log` with tenant, type, API version, request/idempotency/operation links, type/timestamp indexes, retention partitions | P3.D24                                         | Event lookup by tenant/type/created is indexed; update/delete is blocked; retention partition plan is verified                       | medium |
| P3.D26 | Webhook endpoint and delivery tables   | `packages/db/migrations/0060_events_webhooks`                                             | `webhook_endpoints`, `webhook_deliveries`, `webhook_attempts` with endpoint config, retry state, append-only attempts                   | P3.D25, P6.H01                                 | Delivery state survives restart; attempts append with status/error; endpoint API version and retry indexes verify                    | medium |
| P3.D27 | Reconciliation run and diff tables     | `packages/db/migrations/0070_reconciliation`                                              | `reconciliation_runs` and `reconciliation_diffs` with offset range, status, diff classification, resource links                         | P3.D23, P3.D24                                 | Reconciler can record a run with diffs and no migration path silently mutates balance/holding truth                                  | medium |
| P3.D28 | Repeatable trace and health views      | `packages/db/migrations/repeatable`                                                       | `balance_summary_view`, `operation_trace_view`, `webhook_health_view` repeatable migrations                                             | P3.D21, P3.D22, P3.D24, P3.D26, P3.D27         | `migrator verify` recompiles views and sample queries expose only projection/audit/config fields                                     | medium |
| P3.D29 | Migrator CLI command extensions        | `tools/migrator`, `packages/db`                                                           | `migrator plan`, `migrator dry-run`, `migrator gc-idempotency`                                                                          | P3.D07, P3.D16, P3.D28                         | Plan output is deterministic; dry-run makes no schema changes; GC refuses unsafe cutoffs and reports eligible rows                   | medium |
| P3.D30 | Postgres service roles and grants      | `packages/db/migrations/0000_extensions/0003_roles_grants.sql`                            | least-privilege roles/grants for `api`, `ledger-command`, `projection-worker`, `webhook-dispatcher`, `reconciler`                       | P3.D08, P3.D09, P3.D13, P3.D18, P3.D25         | Negative permission tests prove each service can access only its owned tables/views and cannot bypass audit immutability             | high   |

### Dependency graph

```text
P3.D08 Extension baseline
  └─ P3.D01 Config migrations
      ├─ P3.D09 Tenants
      │   ├─ P3.D10 Accounts
      │   │   └─ P3.D11 Party mappings
      │   ├─ P3.D12 API versions
      │   └─ P3.D30 Service roles/grants
      └─ P3.D02 Audit migrations
          ├─ P3.D13 API request audit
          ├─ P3.D14 Sensitive audit log
          └─ P3.D03 Idempotency migrations/package
              ├─ P3.D15 Canonical request hash
              └─ P3.D16 Idempotency state machine
                  └─ P3.D04 Intent/operation migrations
                      ├─ P3.D17 Intents
                      ├─ P3.D18 Operations
                      ├─ P3.D19 Command request queue
                      ├─ P3.D20 Command attempts
                      ├─ P3.D05 Projection migrations
                      │   ├─ P3.D21 Balances
                      │   ├─ P3.D22 Holdings
                      │   ├─ P3.D23 Projection checkpoints
                      │   ├─ P3.D24 Operation projection
                      │   └─ P3.D27 Reconciliation tables
                      ├─ P3.D06 Event/webhook migrations
                      │   ├─ P3.D25 Event log
                      │   └─ P3.D26 Webhook tables
                      └─ P3.D07 Migrator CLI integrates all migration groups
                          ├─ P3.D28 Repeatable views
                          └─ P3.D29 Migrator command extensions
```

### Ticket acceptance detail

| Ticket | Required tests / checks                                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3.D01 | Empty DB migration creates `tenants`, `accounts`, `party_mappings`; tenant indexes exist.                                                                                                 |
| P3.D02 | Request/audit schema supports trace lookup by request, idempotency key hash, operation/transaction IDs.                                                                                   |
| P3.D03 | Unit tests cover new key, same key/same hash replay, same key/different hash conflict, lock expiry recovery.                                                                              |
| P3.D04 | Insert intent+operation+command request in one transaction; trace view returns one row by `operation_id`.                                                                                 |
| P3.D05 | Balance and holding upserts are tenant-scoped and can be deleted/rebuilt by test reconciler.                                                                                              |
| P3.D06 | Event log row creates webhook delivery rows; delivery attempts/status persist across process restart.                                                                                     |
| P3.D07 | Migration ledger records version/checksum/applied_at; checksum drift fails; advisory lock prevents concurrent up.                                                                         |
| P3.D08 | Verification proves `pgcrypto`, `citext`, `pg_partman`, advisory-lock helpers, and updated-at trigger support exist before dependent migrations run.                                      |
| P3.D09 | `tenants` has default API version, livemode, status/created timestamps, tenant lookup indexes, and seed/verify SQL for sandbox and live tenants.                                          |
| P3.D10 | `accounts` enforces tenant FK, soft-delete/closed retention fields, metadata defaults, status checks, and tenant/status/external-reference indexes.                                       |
| P3.D11 | `party_mappings` enforces tenant-scoped uniqueness, account FK, participant alias/canton party fields, and support-safe lookup indexes.                                                   |
| P3.D12 | `api_versions` stores tenant default/effective API version configuration and verifies uniqueness by tenant/version.                                                                       |
| P3.D13 | `api_requests` records request ID, tenant, endpoint, API version, masked request/response hashes, timing/status, timestamp indexes, and retention documentation.                          |
| P3.D14 | `audit_log` is append-only for sensitive operational/security events and an immutability trigger prevents updates/deletes in normal roles.                                                |
| P3.D15 | Node and Kotlin canonical request hash fixtures match for method, path template, API version, normalized body, and selected headers.                                                      |
| P3.D16 | Concurrent idempotency tests prove `SELECT ... FOR UPDATE` lock semantics, in-progress/completed/conflict states, expiry recovery, and GC eligibility.                                    |
| P3.D17 | `intents` stores tenant, type, status, request body, metadata, operation FK, and lifecycle indexes separately from `operations`.                                                          |
| P3.D18 | `operations` enforces tenant FK, intent FK, stable unique `command_id`, status/update/offset columns, and tenant/status/ledger-offset indexes.                                            |
| P3.D19 | `ledger_command_requests` queue supports pending/in-flight/terminal states, `available_at`, operation FK, tenant/status indexes, and dequeue ordering.                                    |
| P3.D20 | `ledger_command_attempts` appends per-attempt evidence with request FK, operation FK, unique submission ID per attempt, status, error, and timestamp indexes.                             |
| P3.D21 | `balances` enforces unique `(tenant_id, account_id, asset_id)`, `numeric(38,18)` amounts, `as_of_ledger_offset`, and rebuild-safe upsert verification.                                    |
| P3.D22 | `holdings` stores status, restrictions/metadata, source intent, ledger offset, tenant/account/asset indexes, and retention markers for closed holdings.                                   |
| P3.D23 | `projection_checkpoints` fences each projector with worker identity, offset, checksum/watermark, lease fields, and verifies stale-fence rejection.                                        |
| P3.D24 | `operation_projection` materializes public operation read shape from audit/projection rows without exposing raw Canton identifiers.                                                       |
| P3.D25 | `event_log` is immutable by tenant/type/API version with operation/request links, tenant/type/created indexes, and retention partition policy.                                            |
| P3.D26 | `webhook_endpoints`, `webhook_deliveries`, and `webhook_attempts` enforce endpoint config, delivery state, attempt append-only audit, retry indexes, and endpoint version pinning.        |
| P3.D27 | `reconciliation_runs` and `reconciliation_diffs` record run inputs, offset ranges, diff classification, status, and never silently correct projection rows.                               |
| P3.D28 | Repeatable views `balance_summary_view`, `operation_trace_view`, and `webhook_health_view` compile and expose only projection/audit/config read models.                                   |
| P3.D29 | `migrator plan`, `migrator dry-run`, and `migrator gc-idempotency` have deterministic output, non-mutating dry-run behavior, and safe GC cutoff checks.                                   |
| P3.D30 | Per-service Postgres roles for `api`, `ledger-command`, `projection-worker`, `webhook-dispatcher`, and `reconciler` receive least-privilege grants verified by negative permission tests. |

## 10. Open Questions

| Question                                | Current decision for Phase 03                                                                                                                                                                                                        | Resolution path                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Shared schema vs schema-per-tenant      | Use shared schema with `tenant_id` on every tenant-owned row, matching [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md).                                                                                        | Revisit in Phase 08/09 if compliance or deployment model requires schema-per-tenant.                                 |
| Raw vs hashed idempotency key column    | Architecture DB sketch names column `key`; implementation should store hash/preview semantics, not raw key by default, matching [11 Request Logs Ledger Trace Audit](../Architecture/11.Request%20Logs%20Ledger%20Trace%20Audit.md). | If exact column names remain `key`, document that value is hashed; otherwise use `key_hash` with compatibility view. |
| `response_body` retention               | Phase 03 stores response body for exact replay; retention window must follow active idempotency guarantee and compliance policy.                                                                                                     | Phase 08 finalizes retention and masking policy.                                                                     |
| `api_requests` vs `request_logs` naming | Implementation plan schema group uses `api_requests`; audit architecture uses `request_logs` object language.                                                                                                                        | Use DB naming from implementation plan; expose API object as `request_log`.                                          |
| Metadata PII enforcement location       | Phase 03 schema cannot fully enforce semantic PII constraints in JSONB.                                                                                                                                                              | API validation in Phase 04/08 must enforce; DB can add size/key constraints if architecture later specifies them.    |
| View versioning                         | Repeatable migrations replace views in place.                                                                                                                                                                                        | If breaking view consumers appear, add versioned views during expand-and-contract.                                   |

No conflict changes the Phase 03 execution plan. Where naming differs, [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) wins for DB paths and ticket scope.

## 11. Agent-ready Checklist

### Entry checklist

- [ ] Phase 02 API contract defines mutation error grammar and idempotency error shape.
- [ ] Postgres test container or local database is available through `DATABASE_URL`.
- [ ] Migration package can run SQL against an empty database.
- [ ] Architecture references are loaded: [11 Request Logs Ledger Trace Audit](../Architecture/11.Request%20Logs%20Ledger%20Trace%20Audit.md), [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md).

### Build gate

- [ ] `migrator up --database-url "$DATABASE_URL"` on an empty DB exits 0 for P3.D08 through P3.D30.
- [ ] `migrator verify --database-url "$DATABASE_URL"` proves every table, index, constraint, trigger, view, extension, and role from P3.D08 through P3.D30 exists.
- [ ] Idempotency unit tests for P3.D15 and P3.D16 are green in both Node and Kotlin fixture suites.
- [ ] Migrator CLI command tests for P3.D07 and P3.D29 are green.
- [ ] Postgres role negative-permission tests for P3.D30 are green.

### Verify gate

- [ ] SQL DDL creates config, audit, idempotency, intent/operation, projection, event/webhook, and reconciliation migration groups with dedicated ticket coverage P3.D08 through P3.D30.
- [ ] `tenants`, `accounts`, `party_mappings`, `api_versions`, `api_requests`, `audit_log`, `idempotency_keys`, `intents`, `operations`, `ledger_command_requests`, `ledger_command_attempts`, `balances`, `holdings`, `projection_checkpoints`, `operation_projection`, `event_log`, `webhook_endpoints`, `webhook_deliveries`, `webhook_attempts`, `reconciliation_runs`, and `reconciliation_diffs` all have explicit verification SQL.
- [ ] Tenant indexes exist for tenant-owned hot tables from P3.D09 through P3.D27.
- [ ] Operation trace indexes exist by `operation_id` across P3.D13, P3.D16, P3.D18, P3.D19, P3.D20, P3.D24, P3.D25, and P3.D28.
- [ ] Ledger progression indexes exist by `ledger_offset` / `as_of_ledger_offset` across P3.D18, P3.D21, P3.D22, P3.D23, P3.D25, P3.D27, and P3.D28.
- [ ] Same `Idempotency-Key` + same `request_hash` returns stored `response_body` verbatim with stored status under P3.D15 and P3.D16.
- [ ] Same `Idempotency-Key` + different `request_hash` returns `409 Conflict` and creates no new operation under P3.D16.
- [ ] Replay-after-crash preserves `operation_id` and stable `command_id` across P3.D16, P3.D18, P3.D19, and P3.D20.
- [ ] `migrator status --database-url "$DATABASE_URL"` reports current version and pending/repeatable checksum state for P3.D07 and P3.D28.
- [ ] `migrator plan`, `migrator dry-run`, and `migrator gc-idempotency` satisfy P3.D29 acceptance without mutating schema in dry-run mode.

### Invariant gate

- [ ] Public API exposes no Canton contract-first fields.
- [ ] DB asset state is projection only.
- [ ] Every mutation has stable `operation_id` and `command_id`.
- [ ] Projection is rebuildable.
- [ ] Webhook deliveries are signed and replayable.
- [ ] Deployment mode does not change `/v1` grammar.
