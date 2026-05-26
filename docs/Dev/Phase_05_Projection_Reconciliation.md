# Phase 05 — Projection Worker and Reconciliation

> Materialize ledger-derived balances, holdings, events, and operation state from Canton/PQS into rebuildable projections, then continuously reconcile them against ledger truth.

## 1. Executive Summary

Phase 05 implements M5: Projection + Reconciliation.

Pillar’s public read experience is developer-friendly, but the source of truth is Canton. The projection layer exists to make `/v1/balances`, `/v1/holdings`, `/v1/events`, and operation status fast and stable without exposing contracts, templates, parties, participants, synchronizers, or raw ledger offsets in the default API.

Implemented scope:

| Area            | Decision                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Source of truth | Canton Ledger only. Projection DB is rebuildable cache/audit surface.                                                 |
| Runtime         | Kotlin/JVM services under `services/projection-worker` and `services/reconciler`.                                     |
| Read path       | Canton Ledger → PQS/update stream → projection-worker → Postgres projections → `/v1` read routes.                     |
| Projectors      | Balance, holding, transfer, hold, event, operation projection.                                                        |
| Checkpointing   | Per projector/stream checkpoint; checkpoint advances only after projection row commit.                                |
| Reconciliation  | Separate worker under `services/reconciler`; detects offset gaps and balance/holding mismatches.                      |
| Rebuild         | Controlled wipe of projection rows, replay from offset 0 or ACS boundary, byte-equal comparison against ledger truth. |
| Public API      | Canton-invisible balance/holding reads, including bounded strong-read semantics for `wait_for_operation`.             |

Architecture references:

- [05 Asset Read Model](../Architecture/05_asset%20read%20model.md)
- [09 Pillar Ledger Sync Layer](../Architecture/09_Pillar%20Ledger%20Sync%20Layer.md)
- [21 Search / Data Export / Reporting](../Architecture/21_Search%20Data%20Export%20Reporting.md)
- [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)

Core principles embedded in this phase:

1. Canton Ledger is the source of truth.
2. Pillar DB stores only Projection / Audit / Config.
3. External API must be developer-friendly and Canton-invisible.
4. Internal runtime must be Canton-native.
5. Operations must be ledger-traceable.
6. Balance/Holding-first, not contract-first.
7. Intent-first, not transaction-first.
8. Webhook-first for async workflow.
9. API grammar must be polished from day one.
10. Deployment model changes, API experience does not.

## 2. Goals / Non-goals

### Goals

| Goal                            | Phase 05 implementation                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Materialize balances            | Build balance projector from PQS/update stream into `balances`.                                                                    |
| Materialize holdings            | Build holding projector from ledger-derived holding facts into `holdings`.                                                         |
| Materialize events              | Insert immutable API event objects into `event_log` for state changes.                                                             |
| Materialize operation state     | Update `operation_projection` so `/v1/operations` and strong reads can correlate ledger commit offset.                             |
| Persist checkpoints             | Persist per projector checkpoints in `projection_checkpoints`.                                                                     |
| Support at-least-once ingestion | Make projector writes idempotent by ledger/update and semantic keys.                                                               |
| Enable strong reads             | Add `/v1/balances?consistency=wait_for_operation&operation=op_...` behavior over operation commit offset and projector checkpoint. |
| Rebuild projections             | Wipe projection rows, replay from offset 0 or ACS boundary, compare byte-equal balance results.                                    |
| Detect divergence               | Reconciler emits diffs and alerts for offset gaps, ordering anomalies, and ledger/projection mismatches.                           |
| Expose lag                      | API and observability expose projection lag as `pillar_projection_lag_seconds`.                                                    |

### Non-goals

| Non-goal                               | Reason                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Public Daml contract reads             | Violates Canton-invisible API and Balance/Holding-first principle.                            |
| DB as asset ledger                     | Projection rows are derived and rebuildable, not authoritative.                               |
| New public objects                     | Phase 05 uses existing balance, holding, event, transfer, hold, and operation shapes.         |
| New DB tables beyond plan              | Use migration set `0050_projections` and reconciliation tables from the implementation plan.  |
| Webhook delivery implementation        | Event insertion is in scope; dispatcher/retry is Phase 06.                                    |
| Search/export/report implementation    | Phase 05 supplies projection freshness and ledger watermark inputs used later.                |
| Strong global cross-synchronizer order | Canton ordering is synchronizer-scoped; reconciliation must not invent a global causal order. |
| Public exposure of ledger internals    | Offsets/participants/synchronizers remain internal or privileged trace-only fields.           |

## 3. Architecture

### Read path

```text
Canton Ledger
  - authoritative Daml contract state
  - UpdateService stream
  - StateService / ACS when rebuilding
  - command/update correlation
        |
        v
Participant Query Store (PQS)
  - participant-indexed ledger facts
  - template/interface filtered views
  - query boundary for projection-worker
        |
        v
services/projection-worker (Kotlin/JVM)
  - pqs connector
  - update-stream reader
  - event decoder / normalizer
  - balance projector
  - holding projector
  - transfer / hold projector
  - event projector
  - operation projector
  - checkpoint manager
        |
        v
Postgres projection tables
  - balances
  - holdings
  - transfers
  - holds
  - event_log
  - operation_projection
  - projection_checkpoints
        |
        v
/v1 read routes
  - GET /v1/balances
  - GET /v1/balances/:id
  - GET /v1/holdings
  - GET /v1/holdings/:id
  - GET /v1/events
  - GET /v1/operations/:id
```

Public request handlers never query Daml contracts directly. They read projections with explicit internal watermarks and present Canton-invisible objects.

### Reconciler topology

```text
services/reconciler (Kotlin/JVM)
  - scheduled reconciliation jobs
  - manual rebuild command
  - ledger truth snapshot reader
  - projection snapshot reader
  - deterministic comparator
  - reconciliation_diffs writer
  - alert emitter
```

The reconciler is a separate worker. It may reuse decoder and projector libraries, but it has a different operational contract:

| Service                      | Primary loop                           | Failure policy                                                                 |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| `services/projection-worker` | Continuous tailing and materialization | Stop or quarantine on poison event depending on severity; never skip silently. |
| `services/reconciler`        | Scheduled/manual compare and rebuild   | Alert on mismatch; never mutate non-projection truth.                          |

### Component boundaries

| Component             | Path                                                                 | Responsibility                                                                           |
| --------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| PQS connector         | `services/projection-worker/src/main/kotlin/pqs`                     | Connect to PQS, execute bounded reads, page safely, surface unavailable/degraded states. |
| Update stream reader  | `services/projection-worker/src/main/kotlin/ledger`                  | Subscribe/resume by checkpoint offset, decode updates, handle at-least-once delivery.    |
| Projectors            | `services/projection-worker/src/main/kotlin/projectors`              | Materialize balances, holdings, transfers, holds, events, operation projection.          |
| Checkpoint manager    | `services/projection-worker/src/main/kotlin/ledger`                  | Lease checkpoint rows, fence stale workers, advance offsets after row commit.            |
| Rebuild command       | `services/reconciler/src/main/kotlin`                                | Wipe projection rows in controlled scope, replay, compare byte-equal output.             |
| Reconciliation alerts | `services/reconciler/src/main/kotlin`                                | Detect gaps/mismatches, persist diffs, emit metrics/alerts.                              |
| Public read routes    | `apps/api/src/routes/v1/balances`, `apps/api/src/routes/v1/holdings` | Read projection rows, enforce consistency mode, return developer-friendly objects.              |

### Checkpoint model

Checkpointing is per projector and stream, not one global row.

```text
checkpoint_key =
  tenant_id
  + environment
  + participant_id
  + stream_id
  + projector_name
  + query_hash
  + synchronizer_id nullable
  + bootstrap_epoch
```

Required projectors:

| Projector           | Source                                | Target                 | Checkpoint name       |
| ------------------- | ------------------------------------- | ---------------------- | --------------------- |
| Balance projector   | normalized ledger movement facts      | `balances`             | `balance_projector`   |
| Holding projector   | holding create/archive/exercise facts | `holdings`             | `holding_projector`   |
| Transfer projector  | transfer lifecycle facts              | `transfers`            | `transfer_projector`  |
| Hold projector      | lock/release/redeem-lock facts        | `holds`                | `hold_projector`      |
| Event projector     | semantic object transitions           | `event_log`            | `event_projector`     |
| Operation projector | command/update correlation            | `operation_projection` | `operation_projector` |

Invariant:

```text
projection_checkpoints.applied_offset advances only after:
  1. raw update was decoded,
  2. normalized event was derived,
  3. target projection rows were committed,
  4. event_log / operation_projection rows were committed when applicable,
  5. the same DB transaction committed successfully.
```

### Data flow for one transfer update

```text
1. Canton commits transfer-related update at ledger offset O.
2. Update stream reader receives update O.
3. Decoder extracts command_id, workflow_id, update_id, record_time, event nodes.
4. Normalizer converts contract-level facts into semantic facts:
   - transfer.succeeded
   - balance.available_updated
   - holding.updated
   - ledger_operation.observed
5. Balance projector upserts source and destination balance rows.
6. Holding projector upserts/ closes affected holding rows.
7. Transfer projector updates transfer row.
8. Event projector inserts evt_* rows.
9. Operation projector records operation commit offset O.
10. Checkpoint manager advances projector checkpoints to O.
11. /v1 read routes can serve the new state.
```

## 4. API / Object Model

### Public balance object

Phase 05 uses the implementation-plan balance object fields exactly for projection-backed balance reads:

```json
{
  "id": "bal_acct_merchant_001_asset_usdp",
  "object": "balance",
  "account": "acct_merchant_001",
  "asset": "asset_usdp",
  "available": "1000.000000",
  "pending": "0.000000",
  "reserved": "250.000000",
  "settled": "1250.000000",
  "as_of_ledger_offset": "000000000000123456",
  "as_of_ledger_time": "2026-05-26T03:12:00Z"
}
```

Field contract:

| Field                 | Source                        | Public meaning                                                                                |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                  | deterministic projection ID   | Stable balance ID for `account + asset`.                                                      |
| `object`              | presenter                     | Always `balance`.                                                                             |
| `account`             | config/projection             | Public account ID.                                                                            |
| `asset`               | config/projection             | Public asset ID.                                                                              |
| `available`           | projection                    | Spendable amount after ledger locks and soft reservations.                                    |
| `pending`             | projection                    | In-flight incoming/outgoing net amount not yet ledger-final.                                  |
| `reserved`            | projection                    | Ledger-backed hold/redeem/freeze reservation amount plus required soft reservation semantics. |
| `settled`             | projection                    | Ledger-final amount before subtracting reserved/pending.                                      |
| `as_of_ledger_offset` | internal projection watermark | Included only where API contract permits freshness/debug fields; never a contract ID.         |
| `as_of_ledger_time`   | ledger record time            | Ledger time associated with the projected offset when available.                              |

Balance invariant:

```text
available >= 0
pending may be positive, zero, or negative depending on net incoming/outgoing pending state
reserved >= 0
settled >= 0
available + reserved = settled - soft_reserved_out
```

### Public holding object

Phase 05 uses the read-model holding object shape from the architecture plan:

```json
{
  "id": "hld_7NF9Qm",
  "object": "holding",
  "account": "acct_merchant_001",
  "asset": "asset_usdp",
  "asset_class": "acls_tokenized_cash",
  "quantity": "1250.000000",
  "available_quantity": "1000.000000",
  "locked_quantity": "250.000000",
  "pending_quantity": "0.000000",
  "status": "partially_locked",
  "restrictions": [],
  "source": {
    "type": "transfer",
    "id": "pi_transfer_123"
  },
  "created": 1764028800,
  "updated": 1764032400,
  "livemode": true,
  "metadata": {}
}
```

Holding status values:

| Status             | Meaning                                      |
| ------------------ | -------------------------------------------- |
| `available`        | Fully spendable.                             |
| `partially_locked` | Some quantity locked/reserved.               |
| `locked`           | Fully locked.                                |
| `frozen`           | Compliance freeze blocks spending.           |
| `redeeming`        | Locked for redemption.                       |
| `pending`          | In-flight projected state, not ledger-final. |
| `closed`           | No active quantity remains.                  |

Holding rules:

- A holding is a logical position, not a Daml contract.
- A Daml split/archive/create sequence must not change the public meaning of a stable holding unless the economic position changed.
- Public holding responses do not include `contract_id`, `template_id`, `party`, `participant_id`, or raw synchronizer data.
- Metadata is copied only from allowed public metadata; no PII should be materialized.

### List/retrieve routes

```http
GET /v1/balances?account=acct_...&asset=asset_...&limit=25
GET /v1/balances/bal_...
GET /v1/holdings?account=acct_...&asset=asset_...&limit=25
GET /v1/holdings/hld_...
```

List grammar:

| Parameter        | Type      | Behavior                                                             |
| ---------------- | --------- | -------------------------------------------------------------------- |
| `account`        | ID        | Filters by public account ID.                                        |
| `asset`          | ID        | Filters by public asset ID.                                          |
| `limit`          | integer   | Cursor page size, max 100.                                           |
| `starting_after` | object ID | Forward cursor.                                                      |
| `ending_before`  | object ID | Backward cursor.                                                     |
| `consistency`    | enum      | `projection` default; `wait_for_operation` bounded strong-read mode. |
| `operation`      | `op_*`    | Required when `consistency=wait_for_operation`.                      |

### Strong read semantics

```http
GET /v1/balances?account=acct_merchant_001&asset=asset_usdp&consistency=wait_for_operation&operation=op_123
```

Behavior:

```text
1. Resolve operation op_123 in operation_projection.
2. If operation has no observed ledger commit yet:
   - return the operation's current processing/failure state according to the public operation contract.
3. If operation has commit offset O:
   - compare required projector checkpoint for balance scope against O.
4. If balance projector checkpoint >= O:
   - return current balance projection.
5. If projector lag is within strong-read SLA bound:
   - wait bounded time, polling checkpoint/notification.
6. If lag exceeds SLA:
   - return a 202-style processing response with projection_lag metadata.
```

202-style processing response:

```json
{
  "object": "processing",
  "status": "projection_pending",
  "operation": "op_123",
  "projection": {
    "required_ledger_offset": "000000000000123456",
    "indexed_through_ledger_offset": "000000000000123120",
    "lag_seconds": 4,
    "metric": "pillar_projection_lag_seconds"
  }
}
```

The response must not pretend the old projection is ledger-final for the operation. If the API cannot satisfy `wait_for_operation` inside the SLA bound, it must make lag explicit.

## 5. Internal Runtime

### Projector pipeline

```text
PQS / UpdateService page
  -> raw update envelope
  -> decoder
  -> normalized semantic events
  -> projector dispatch
  -> deterministic DB mutations
  -> event_log / operation_projection writes
  -> checkpoint advance
  -> metrics
```

Processing contract:

| Stage      | Input                             | Output                   | Idempotency key                                                    |
| ---------- | --------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| Read       | PQS row or update stream envelope | raw update envelope      | `participant_id + stream_id + offset + update_id`                  |
| Decode     | raw update                        | typed ledger facts       | `update_id + node_id`                                              |
| Normalize  | typed facts                       | semantic events          | `tenant + object_type + object_id + transition + ledger_update_id` |
| Project    | semantic events                   | projection rows          | target table natural key                                           |
| Event      | projection transition             | `evt_*` row              | `tenant + type + object_id + ledger_update_id`                     |
| Operation  | command/update correlation        | operation projection row | `operation_id` or stable `command_id`                              |
| Checkpoint | committed mutation set            | advanced offset          | checkpoint key                                                     |

### Idempotent upsert

Balance rows are keyed by `(tenant_id, account_id, asset_id)`.

```sql
insert into balances (
  id,
  tenant_id,
  account_id,
  asset_id,
  available,
  pending,
  reserved,
  settled,
  as_of_ledger_offset,
  as_of_ledger_time,
  updated_at
) values (...)
on conflict (tenant_id, account_id, asset_id)
do update set
  available = excluded.available,
  pending = excluded.pending,
  reserved = excluded.reserved,
  settled = excluded.settled,
  as_of_ledger_offset = excluded.as_of_ledger_offset,
  as_of_ledger_time = excluded.as_of_ledger_time,
  updated_at = now()
where balances.as_of_ledger_offset <= excluded.as_of_ledger_offset;
```

Rules:

- Use deterministic arithmetic; never use floating point for amounts.
- The projector must be safe under at-least-once delivery.
- Duplicate update delivery must not double-apply a delta.
- If using delta application, persist processed semantic event keys and reject duplicates before mutation.
- If using recompute-per-key, recompute from normalized facts and write the canonical aggregate.
- Offset comparisons must respect the offset encoding used by the ledger/PQS; do not compare raw strings unless the encoding is lexicographically ordered by contract.

### Transaction boundary

```text
BEGIN;
  acquire checkpoint lease / verify fencing token;
  insert or confirm raw update observation;
  insert normalized events idempotently;
  apply balance/holding/transfer/hold projections;
  insert event_log rows idempotently;
  upsert operation_projection;
  advance projection_checkpoints.applied_offset;
COMMIT;
```

Checkpoint advance only after row commit means:

- Never advance checkpoint before projection mutations are durable.
- Never advance checkpoint in a separate transaction that could commit while projection rows fail.
- Never acknowledge the update to an outer supervisor as applied until commit returns success.
- On crash after commit but before process ack, replay is expected and must be idempotent.

### Balance projector

Inputs:

- Issue/redeem ledger effects.
- Transfer settlement ledger effects.
- Hold/release/redeem-lock/freeze facts.
- Soft reservation clearance when corresponding ledger effect is observed.

Outputs:

- `balances.available`
- `balances.pending`
- `balances.reserved`
- `balances.settled`
- `balances.as_of_ledger_offset`
- `balances.as_of_ledger_time`
- `event_log` rows for balance transitions

Acceptance example:

```text
Given account A has settled=100, available=100, reserved=0
When a hold of 30 commits at offset O
Then balance becomes settled=100, reserved=30, available=70
And as_of_ledger_offset=O
And repeating O does not change the result
```

### Holding projector

Inputs:

- Holding creation/archive/exercise facts.
- Transfer split/merge effects.
- Hold/release/freeze/redeem state changes.

Outputs:

- Logical `holdings` rows, not contract fragments.
- Stable holding IDs when contract fragmentation does not change the external logical position.
- `status` derived from active quantity and lock/freeze/redeem state.
- `metadata` only from allowed public metadata.

Acceptance example:

```text
Given one external holding hld_1 represents 100 units
When Canton archives one 100-unit contract and creates 60-unit remainder + 40-unit recipient fragment
Then source holding hld_1 quantity becomes 60
And recipient holding reflects 40
And no public response exposes contract IDs
```

### Event projector

Inputs:

- Semantic projection transitions.
- Operation/request/idempotency metadata when available.

Outputs:

- `event_log` rows with `evt_*` IDs.
- `type`, `api_version`, `data_object`, `request_id`, `idempotency_key`, `operation_id`, `ledger_offset`.

Rules:

- Contract-level create/archive events do not directly become public events.
- Event data is the public object shape at the time of creation.
- Webhook dispatch is Phase 06, but events must be durable and replayable.

### Operation projector

Inputs:

- Ledger update `command_id`, `workflow_id`, update ID, offset, record time.
- Operation/command request rows from earlier phases.

Outputs:

- `operation_projection` row correlating `operation_id -> command_id -> update_id -> ledger_offset`.
- Status fields needed by strong reads and operation retrieve endpoints.

Rules:

- Same external intended change maps to same operation and same command ID.
- `submission_id` may vary by attempt and is not the projection key.
- Operation commit offset is the bound used by `wait_for_operation` reads.

### Rebuild contract

Controlled rebuild must be explicit and testable.

```text
1. Stop or fence normal projection-worker writers for the target tenant/environment/scope.
2. Record rebuild_run_id and input scope.
3. Drop or truncate projection rows in the selected projection scope only:
   - balances
   - holdings
   - transfers
   - holds
   - event_log if rebuilding event projection for the scope
   - operation_projection if rebuilding operation projection for the scope
   - projection_checkpoints for the rebuilt projector scope
4. Replay from offset 0 when full history is available.
5. If ledger pruning prevents offset 0 replay, bootstrap from ACS and replay from active_at_offset; mark the rebuild mode explicitly.
6. Materialize into a shadow projection epoch when available.
7. Compare rebuilt balances and holdings against ledger truth and/or previous canonical snapshot.
8. Assert byte-equal canonical balance JSON for deterministic fields.
9. Persist reconciliation_run and reconciliation_diffs.
10. Cut over only if required checks pass.
11. Alert and do not silently cut over when replay produces a different result.
```

Byte-equal balance comparison uses canonical serialization:

```json
{
  "tenant_id": "ten_...",
  "account_id": "acct_...",
  "asset_id": "asset_...",
  "available": "1000.000000000000000000",
  "pending": "0.000000000000000000",
  "reserved": "250.000000000000000000",
  "settled": "1250.000000000000000000",
  "as_of_ledger_offset": "000000000000123456",
  "as_of_ledger_time": "2026-05-26T03:12:00Z"
}
```

Fields excluded from byte-equal comparison:

| Field                   | Reason                              |
| ----------------------- | ----------------------------------- |
| `updated_at`            | Rebuild-time operational timestamp. |
| checkpoint lease fields | Worker coordination metadata.       |
| generated run IDs       | Rebuild execution metadata.         |

## 6. DB Schema

Phase 05 uses the implementation-plan migration set `0050_projections` plus event and reconciliation tables already defined by the architecture.

### Required projection tables

| Table                    | Migration group                                                                             | Purpose                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `balances`               | `packages/db/migrations/0050_projections/0050_balances.sql`                                 | Aggregate balance per tenant/account/asset.                |
| `holdings`               | `packages/db/migrations/0050_projections/0051_holdings.sql`                                 | Logical position rows.                                     |
| `transfers`              | `packages/db/migrations/0050_projections/0052_transfers.sql`                                | User-visible transfer lifecycle projection.                |
| `holds`                  | `packages/db/migrations/0050_projections/0053_holds.sql`                                    | Ledger-backed lock/reservation projection.                 |
| `projection_checkpoints` | `packages/db/migrations/0050_projections/0054_projection_checkpoints.sql`                   | Per stream/projector durable offsets.                      |
| `operation_projection`   | `packages/db/migrations/0050_projections/0055_projection_indices.sql` or same migration set | Operation-to-ledger projection for strong reads and trace. |
| `event_log`              | `packages/db/migrations/0060_events_webhooks/0060_event_log.sql`                            | API event projection/outbox source.                        |
| `reconciliation_runs`    | `packages/db/migrations/0070_reconciliation/0070_reconciliation_runs.sql`                   | Reconciliation/rebuild run metadata.                       |
| `reconciliation_diffs`   | `packages/db/migrations/0070_reconciliation/0071_reconciliation_diffs.sql`                  | Persisted mismatch details.                                |

### `balances`

```sql
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
```

Implementation-plan note: earlier sketch uses `reserved`/`settled` for this phase’s public balance contract. If any lower-level schema draft still says `locked`/`settled_total`, normalize at the presenter or migration boundary to the implementation-plan contract.

### `holdings`

```sql
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
```

Presenter mapping:

| DB field                       | Public field                 |
| ------------------------------ | ---------------------------- |
| `amount`                       | `quantity`                   |
| derived available amount       | `available_quantity`         |
| derived locked/reserved amount | `locked_quantity`            |
| derived pending amount         | `pending_quantity`           |
| `source_intent_id`             | `source.id` where applicable |

### `projection_checkpoints`

Minimum required columns:

```sql
create table projection_checkpoints (
  id text primary key,
  tenant_id text not null references tenants(id),
  environment text not null,
  participant_id text not null,
  stream_id text not null,
  projector_name text not null,
  query_hash text not null,
  synchronizer_id text,
  bootstrap_epoch text not null,
  applied_offset text not null,
  last_update_id text,
  last_record_time timestamptz,
  status text not null,
  lease_owner text,
  lease_fencing_token bigint not null default 0,
  heartbeat_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, environment, participant_id, stream_id, projector_name, query_hash, synchronizer_id, bootstrap_epoch)
);
```

Checkpoint rules:

- `applied_offset` is scoped by participant, stream, query hash, projector, and synchronizer when applicable.
- `record_time` is not a substitute for offset.
- `update_id` is not a substitute for checkpoint offset.
- Fencing token mismatch must reject stale worker writes.

### `operation_projection`

Minimum required columns:

```sql
create table operation_projection (
  operation_id text primary key references operations(id),
  tenant_id text not null references tenants(id),
  command_id text not null,
  workflow_id text,
  update_id text,
  ledger_offset text,
  ledger_record_time timestamptz,
  participant_id text,
  synchronizer_id text,
  status text not null,
  projected_at timestamptz not null default now(),
  unique (tenant_id, command_id)
);
```

Status examples:

| Status      | Meaning                                                 |
| ----------- | ------------------------------------------------------- |
| `pending`   | Operation exists but no ledger commit observed.         |
| `committed` | Commit offset observed and projections can wait for it. |
| `rejected`  | Ledger rejection observed.                              |
| `unknown`   | Command state needs recovery/reconciliation.            |

### `event_log`

```sql
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
```

Event log is projection/audit, not ledger truth. It must be reproducible from ledger-derived semantic transitions plus API version rules.

### `reconciliation_runs` and `reconciliation_diffs`

Run metadata:

```sql
create table reconciliation_runs (
  id text primary key,
  tenant_id text not null references tenants(id),
  environment text not null,
  mode text not null,
  scope jsonb not null,
  from_offset text,
  to_offset text,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
```

Diff metadata:

```sql
create table reconciliation_diffs (
  id text primary key,
  run_id text not null references reconciliation_runs(id),
  tenant_id text not null references tenants(id),
  object_type text not null,
  object_id text not null,
  severity text not null,
  expected jsonb,
  actual jsonb,
  diff jsonb not null,
  ledger_offset text,
  created_at timestamptz not null default now()
);
```

## 7. Failure Modes

| Failure mode                              | Detection                                                                                  | Required behavior                                                                                                        | Alert/metric                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Projection lag                            | `now - checkpoint.last_record_time` or participant ledger end minus applied offset         | Expose freshness; bounded strong read waits then returns processing response if SLA exceeded.                            | `pillar_projection_lag_seconds`                          |
| Offset gap                                | Next observed offset is not valid successor for stream or PQS page skips expected boundary | Stop affected stream or trigger gap reconciliation; never silently advance.                                              | `pillar_projection_offset_gap_total`                     |
| Ordering anomaly                          | Older offset attempts to overwrite newer projection row                                    | Reject stale write; record anomaly for reconciliation.                                                                   | `pillar_projection_ordering_anomaly_total`               |
| PQS unavailable                           | Connector cannot query/read pages                                                          | Mark projection worker degraded; API may return stale projection with freshness or processing response for strong reads. | `pillar_pqs_unavailable_total`                           |
| Update stream unavailable                 | Ledger API stream disconnects                                                              | Resume from last committed checkpoint with at-least-once semantics.                                                      | `pillar_update_stream_disconnect_total`                  |
| Duplicate update delivery                 | Unique key conflict or processed event key exists                                          | Treat as replay; do not double-apply.                                                                                    | `pillar_projection_duplicate_update_total`               |
| Poison event                              | Decode/normalize/project failure for a specific update                                     | Stop-line for correctness-critical events; quarantine only when explicitly safe.                                         | `pillar_projection_poison_event_total`                   |
| Checkpoint write before projection commit | Integration test or invariant violation                                                    | Bug; fail build. Checkpoint must be same transaction after mutations.                                                    | `pillar_projection_checkpoint_invariant_violation_total` |
| Stale worker lease                        | Fencing token mismatch                                                                     | Reject write, worker exits/reacquires.                                                                                   | `pillar_projection_fencing_reject_total`                 |
| Replay produces different result          | Rebuild comparator finds byte mismatch                                                     | Persist diff, alert, do not cut over silently.                                                                           | `pillar_reconciliation_diff_total`                       |
| Balance mismatch                          | Reconciler ledger truth != projection                                                      | Persist `reconciliation_diffs`; emit critical alert.                                                                     | `pillar_balance_reconciliation_mismatch_total`           |
| Holding mismatch                          | Reconciler ledger truth != projection                                                      | Persist diff; alert based on severity.                                                                                   | `pillar_holding_reconciliation_mismatch_total`           |
| Operation projection missing commit       | Operation exists with command committed but no operation projection                        | Reconcile command/update correlation; strong read returns processing/unknown until fixed.                                | `pillar_operation_projection_missing_total`              |

### Projection lag definition

Canonical metric name:

```text
pillar_projection_lag_seconds
```

Metric dimensions:

| Label             | Meaning                                        |
| ----------------- | ---------------------------------------------- |
| `tenant_id`       | Tenant scope, if cardinality policy allows.    |
| `environment`     | `test` or `live`.                              |
| `participant_id`  | Participant being indexed.                     |
| `stream_id`       | Ledger/PQS stream identity.                    |
| `projector_name`  | `balance_projector`, `holding_projector`, etc. |
| `synchronizer_id` | Present when synchronizer-scoped.              |

### Rebuild mismatch policy

```text
If replay produces a different deterministic result:
  - persist reconciliation_run status = failed
  - write reconciliation_diffs rows
  - emit alert
  - leave existing serving projection untouched unless operator explicitly chooses a recovery path
  - never overwrite the serving projection with mismatched rebuilt state as an automatic fallback
```

## 8. Security / Compliance

### Ledger client rights

Projection-worker and reconciler use read-only ledger clients.

| Service                      | Ledger rights                                              | Prohibited rights              |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `services/projection-worker` | `canReadAs` for configured Pillar observer/service parties | `canActAs`, command submission |
| `services/reconciler`        | `canReadAs` for configured reconciliation scope            | `canActAs`, command submission |

Rules:

- Projection workers must not submit commands.
- Reconciler must not mutate ledger state.
- Tenant/party mappings must scope reads to authorized parties only.
- Multi-tenant workers must enforce tenant boundary before writing projection rows.

### Data minimization

Projection tables must not materialize PII.

| Data                         | Policy                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account IDs                  | Public object IDs only.                                                                                                                          |
| Asset IDs                    | Public object IDs only.                                                                                                                          |
| Amounts/statuses             | Allowed; core projection data.                                                                                                                   |
| Metadata                     | Allowed only after existing metadata validation; no sensitive data.                                                                              |
| Contract IDs                 | Not public; avoid storing in serving projection rows. If needed for internal audit, store hashed/restricted trace outside public presenter path. |
| Party IDs                    | Internal only; not returned by `/v1` read routes.                                                                                                |
| Participant/synchronizer IDs | Internal/privileged trace only.                                                                                                                  |
| Raw Daml payloads            | Do not copy to public projection tables.                                                                                                         |

### Audit and traceability

- Every projected state change must be traceable to ledger update ID and offset internally.
- Public API remains Canton-invisible by default.
- Privileged Workbench/admin trace may show ledger references under separate authorization, not in ordinary `/v1` object grammar.
- Reconciliation diffs are operational/security-sensitive and must be access controlled.

### Compliance posture

| Requirement            | Phase 05 behavior                                                           |
| ---------------------- | --------------------------------------------------------------------------- |
| Ledger-source-of-truth | Rebuild and reconciler prove projection is derivative.                      |
| Data minimization      | No PII or raw Daml payloads in public projections.                          |
| Access control         | Read-only ledger clients and tenant-scoped DB writes.                       |
| Incident response      | Diff rows and alert metrics provide evidence for projection divergence.     |
| Customer transparency  | Strong reads return explicit processing/freshness instead of stale success. |

## 9. Implementation Plan

| ID     | Title                                           | Path                                                                 | Output                                                                                                          | Deps                           | Acceptance                                                                                                                                                                                                 | Risk |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| P5.G01 | PQS connector                                   | `services/projection-worker/src/main/kotlin/pqs`                     | SQL/PQS client with paging, health, tenant/party scoped queries                                                 | P4.F01, P4.F02, P3.D05         | Integration connects to PQS and returns filtered ledger facts without exposing contract fields to API                                                                                                      | med  |
| P5.G02 | Update stream reader                            | `services/projection-worker/src/main/kotlin/ledger`                  | Offset reader, decoder envelope, checkpoint lease/fencing                                                       | P5.G01, P3.D05                 | Checkpoint persists per projector and resume uses last committed `applied_offset`                                                                                                                          | high |
| P5.G03 | Balance projector                               | `services/projection-worker/src/main/kotlin/projectors`              | `balances` materialization and balance events                                                                   | P5.G02                         | Issue/transfer/hold changes update `available`, `pending`, `reserved`, `settled`; duplicate update is idempotent                                                                                           | high |
| P5.G04 | Holding projector                               | `services/projection-worker/src/main/kotlin/projectors`              | `holdings` materialization over logical holdings                                                                | P5.G02                         | Hold/release/transfer split updates holding status/quantity without exposing contract IDs                                                                                                                  | high |
| P5.G05 | Event projector                                 | `services/projection-worker/src/main/kotlin/projectors`              | `event_log` creation for projection transitions                                                                 | P5.G03, P5.G04                 | `evt_*` rows are created on balance/holding/operation state changes with immutable `data_object`                                                                                                           | med  |
| P5.G06 | Rebuild command                                 | `services/reconciler/src/main/kotlin`                                | Projection rebuild runner with wipe/replay/compare                                                              | P5.G03, P5.G04, P5.G05         | Wipe projection tables, replay from offset 0 or ACS boundary, assert byte-equal balances                                                                                                                   | high |
| P5.G07 | Reconciliation alerts                           | `services/reconciler/src/main/kotlin`                                | Diff detector, `reconciliation_runs`, `reconciliation_diffs`, metrics                                           | P5.G06                         | Injected balance mismatch writes diff and emits `pillar_reconciliation_diff_total` alert path                                                                                                              | high |
| P5.G08 | PQS schema bootstrap and tenant filter          | `services/projection-worker/src/main/kotlin/pqs`                     | PQS metadata probe, supported-schema detector, query hash builder, tenant/party filter verifier                 | P5.G01, P3.D05                 | Worker startup records PQS schema version, rejects unsupported schemas, and integration proves all pages are filtered to the configured tenant/party scope                                                 | high |
| P5.G09 | Per-projector lease and fencing                 | `services/projection-worker/src/main/kotlin/ledger`                  | Lease acquisition/renewal/takeover module keyed by projector checkpoint row                                     | P5.G02                         | Two workers racing for `balance_projector` cannot both commit; stale fencing token write is rejected and emits `pillar_projection_fencing_reject_total`                                                    | high |
| P5.G10 | Projection backpressure controller              | `services/projection-worker/src/main/kotlin/runtime`                 | Lag-aware throttling policy and API read-SLA signal shared with read routes                                     | P5.G02, P5.E07                 | Simulated slow projector preserves API read SLA by returning bounded `projection_pending` responses instead of blocking route threads                                                                      | med  |
| P5.G11 | Catch-up and steady-state modes                 | `services/projection-worker/src/main/kotlin/runtime`                 | Projector mode state machine for ACS/full replay catch-up versus tailing steady state                           | P5.G08, P5.G09                 | Rebuild/cold-start run stays in catch-up until checkpoint reaches ledger end, then switches to steady-state without emitting bootstrap webhooks                                                            | high |
| P5.G12 | Projector hot reload without offset loss        | `services/projection-worker/src/main/kotlin/runtime`                 | Drain, fence, restart, and resume protocol for projector code/config reload                                     | P5.G09, P5.G13                 | Hot reload of `holding_projector` during replay resumes from last committed checkpoint and neither skips nor double-applies the in-flight update                                                           | high |
| P5.G13 | Per-projector checkpoint persistence            | `services/projection-worker/src/main/kotlin/ledger`                  | Checkpoint repository and transaction helper for each projector/stream/query hash                               | P5.G02, P5.G09                 | `balance_projector`, `holding_projector`, `transfer_projector`, `hold_projector`, `event_projector`, and `operation_projector` each persist independent offsets in the same transaction as their mutations | high |
| P5.G14 | Operation projector                             | `services/projection-worker/src/main/kotlin/projectors/operation`    | Dedicated operation projector from command/update correlation to `operation_projection`                         | P5.G02, P4.F05, P3.D04         | Committed command update writes `operation_projection.ledger_offset` and `status=committed`; `/v1` strong reads can resolve required offset by `op_*`                                                      | high |
| P5.G15 | Transfers projection history view               | `services/projection-worker/src/main/kotlin/projectors/transfer`     | Transfer projector and `transfers` history rows derived from ledger execution facts                             | P5.G02, P5.G13                 | Transfer create/succeed/fail/cancel facts materialize `tr_*` history with cursor-stable ordering and no contract identifiers                                                                               | med  |
| P5.G16 | Holds projection status timeline                | `services/projection-worker/src/main/kotlin/projectors/hold`         | Hold projector for `holds` current status and status timeline fields                                            | P5.G02, P5.G13                 | Hold create/release/consume/expire ledger facts update hold status timeline and corresponding balance reserved amount idempotently                                                                         | high |
| P5.G17 | Multi-region projection consistency note        | `services/projection-worker/src/main/kotlin/runtime`                 | Runtime note/config guard documenting synchronizer-scoped watermarks and P10 chaos deferral                     | P5.G13, P10.L01                | Code/config docs state no global cross-region or cross-synchronizer total order is assumed; chaos validation is explicitly deferred to `P10.L01`                                                           | med  |
| P5.G18 | Tenant projection partitioning                  | `services/projection-worker/src/main/kotlin/runtime`                 | Tenant-partition assignment and hot-tenant isolation hooks for projector workers                                | P5.G08, P5.G13                 | Synthetic hot tenant lag does not block unrelated tenant checkpoint advancement or projection reads                                                                                                        | high |
| P5.G19 | Reconciler scheduled rebuild cadence            | `services/reconciler/src/main/kotlin/scheduler`                      | Per-projector rebuild/reconciliation schedule config and runner dispatch                                        | P5.G06, P5.G13                 | Config schedules independent balance, holding, transfer, hold, event, and operation reconciliation cadences and records `reconciliation_runs.scope.projector_name`                                         | med  |
| P5.G20 | Reconciler diff reporter modes                  | `services/reconciler/src/main/kotlin/diff`                           | Sample-based and full diff reporter with severity classification                                                | P5.G07, P5.G19                 | Full mode reports every mismatch; sample mode records bounded examples plus aggregate counts without mutating serving projection rows                                                                      | high |
| P5.G21 | PQS failover and read replica handling          | `services/projection-worker/src/main/kotlin/pqs`                     | Connector failover policy for primary/replica PQS endpoints with freshness checks                               | P5.G08, P5.G13                 | Primary PQS outage switches to eligible replica only when replica watermark is compatible with checkpoint; stale replica is rejected and worker marks degraded                                             | high |
| P5.G22 | Projection lag metric emitter                   | `services/projection-worker/src/main/kotlin/observability`           | `pillar_projection_lag_seconds` gauge with projector, stream, participant, environment, and synchronizer labels | P5.G13                         | Metric emits per projector using checkpoint record time/ledger end and appears as exactly `pillar_projection_lag_seconds` in metrics scrape                                                                | med  |
| P5.E07 | Balance/holding read routes hitting projections | `apps/api/src/routes/v1/balances`, `apps/api/src/routes/v1/holdings` | Projection-backed list/retrieve and `wait_for_operation` consistency mode                                       | P5.G03, P5.G04, P5.G02         | Cursor pagination works; `wait_for_operation` waits until checkpoint >= operation commit offset or returns processing with projection lag                                                                  | med  |
| P5.E17 | `/v1/balances` list filters                     | `apps/api/src/routes/v1/balances`                                    | Balance list endpoint with cursor pagination, `account`, `asset`, and consistency filters                       | P5.E07, P5.G03, P5.G14, P5.G22 | `GET /v1/balances?account=acct_...&asset=asst_...&limit=25` returns a stable list object, enforces `balances:read`, includes projection freshness, and never exposes Canton internals                      | med  |
| P5.E18 | `/v1/holdings` list filters                     | `apps/api/src/routes/v1/holdings`                                    | Holding list endpoint with cursor pagination, `account`, `asset`, and `status` filters                          | P5.E07, P5.G04, P5.G16         | `GET /v1/holdings?account=acct_...&asset=asst_...&status=available` returns stable `hld_*` objects with no contract IDs and correct `has_more` cursor behavior                                             | med  |
| P5.E19 | Operation ledger trace expansion                | `apps/api/src/routes/v1/operations`                                  | Admin-scoped `expand=ledger_trace` support backed by operation projection                                       | P5.G14, P4.F05, P8.K03         | Ordinary `operations:read` omits ledger internals; admin-scoped trace expansion can correlate request, operation, command, update, projection checkpoint, and event evidence                               | high |

### Build sequence

```text
1. Apply/verify `0050_projections` migration set.
2. Implement PQS connector with schema bootstrap, tenant filter verification, failover policy, and narrow integration fixture.
3. Implement per-projector checkpoint persistence, lease/fencing, and hot-reload drain/resume before projector business logic.
4. Implement update reader resume loop with catch-up/steady-state modes and backpressure signals.
5. Implement balance projector idempotent upsert and lag metric emission.
6. Implement holding projector idempotent upsert.
7. Implement transfer, hold, event, and operation projectors as separate modules.
8. Wire balance, holding, and operation read routes to projection tables, filters, pagination, consistency mode, and admin trace expansion.
9. Implement reconciler rebuild scheduler, diff reporter modes, and injected-diff alerts.
10. Add rebuild, failover, fencing, lag, and injected-diff tests.
```

### Ticket dependency graph

```text
P5.G01 -> P5.G08 -> P5.G21
P5.G01 -> P5.G02 -> P5.G09 -> P5.G13 -> P5.G11 -> P5.G12
                         \          \-> P5.G18
                          \          \-> P5.G22
P5.G13 -> P5.G03 -> P5.G05 -> P5.G06 -> P5.G19 -> P5.G20 -> P5.G07
P5.G13 -> P5.G04 ----/
P5.G13 -> P5.G15 ----/
P5.G13 -> P5.G16 ----/
P4.F05 + P3.D04 + P5.G02 -> P5.G14
P5.G03 + P5.G04 + P5.G02 -> P5.E07
P5.E07 + P5.G03 + P5.G14 + P5.G22 -> P5.E17
P5.E07 + P5.G04 + P5.G16 -> P5.E18
P5.G14 + P4.F05 + P8.K03 -> P5.E19
P5.G13 + P10.L01 -> P5.G17
```

## 10. Open Questions

| Question                                                              | Current resolution                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is the strong-read SLA bound for `wait_for_operation`?           | Open. Section 4 requires bounded wait and 202-style processing response after the bound. Product/SRE must set the numeric value per environment.                                                                                            |
| When should the API emit a 202-style processing response?             | Emit when operation commit offset is known but required projector checkpoint cannot catch up inside the strong-read SLA, or when operation is still processing and the route cannot truthfully return operation-final balance.              |
| Is full replay from offset 0 always possible?                         | Not always. Implementation plan says rebuild from empty projection tables; Ledger Sync architecture allows ACS bootstrap when pruning prevents offset 0 replay. Rebuild mode must state `full_replay` or `acs_bootstrap_replay`.            |
| Should `as_of_ledger_offset` appear in every public balance response? | Implementation plan names the field on projection rows and Phase 05 object contract. If product later hides it by default, presenter must still retain equivalent freshness metadata and privileged access.                                 |
| How are cross-synchronizer projections ordered?                       | Do not assume total order. Store synchronizer-scoped checkpoints and use explicit reconciliation barriers where required.                                                                                                                   |
| Is `event_log` in `0050_projections` or `0060_events_webhooks`?       | Architecture schema groups list `event_log` under webhook, while Phase 5 deliverables include event projection. Resolution: Phase 05 writes `event_log`; migration ownership remains as defined by implementation plan migration structure. |
| `reserved` vs `locked` naming                                         | Phase 05 uses `reserved` in balance object per assignment and implementation-plan phase contract. Older read-model prose may say `locked`; presenter and schema should normalize to `reserved` for this phase.                              |

## 11. Agent-ready Checklist

### Build gate

- [ ] `services/projection-worker` compiles with PQS connector, schema bootstrap, failover handling, update reader, checkpoint manager, lease/fencing, backpressure controller, and balance/holding/transfer/hold/event/operation projectors wired.
- [ ] `services/reconciler` compiles with rebuild command, per-projector schedule config, sample/full diff reporter, and reconciliation diff/alert path wired.
- [ ] Migration set `packages/db/migrations/0050_projections` creates `balances`, `holdings`, `transfers`, `holds`, `projection_checkpoints`, and `operation_projection` with verify scripts.
- [ ] Rebuild test: wipe projection tables, replay from ledger offset 0 or declared ACS boundary, assert byte-equal canonical balances.
- [ ] Reconciliation test: inject a projection diff and assert `reconciliation_diffs` row plus alert metric emission.
- [ ] API routes compile for `P5.E17`, `P5.E18`, and `P5.E19` without changing `/v1` grammar outside balances, holdings, and operations trace expansion.

### Verify gate

- [ ] `P5.G01` PQS integration connects and reads only configured tenant/party scope.
- [ ] `P5.G02` checkpoint persists only after projection row commit; crash/replay does not double-apply updates.
- [ ] `P5.G03` issue, transfer, hold, release, and redeem effects update `available`, `pending`, `reserved`, `settled`, `as_of_ledger_offset`, and `as_of_ledger_time` correctly.
- [ ] `P5.G04` contract fragmentation changes logical holdings without exposing contract IDs.
- [ ] `P5.G05` `evt_*` rows are created for state changes with immutable public `data_object`.
- [ ] `P5.G06` rebuild from empty projection rows yields the same canonical balances as ledger truth.
- [ ] `P5.G07` offset gap and balance mismatch detection persist diffs and emit alerts.
- [ ] `P5.G08` PQS startup detects schema version and rejects unsupported/unscoped tenant filters.
- [ ] `P5.G09` stale worker fencing rejects writes for every projector lease.
- [ ] `P5.G10` slow projector scenarios return bounded processing responses instead of violating API read SLA.
- [ ] `P5.G11` catch-up mode switches to steady-state only after required watermarks are reached.
- [ ] `P5.G12` projector hot reload resumes from last committed offset without loss.
- [ ] `P5.G13` every required projector has its own durable checkpoint row and transaction-bound offset advance.
- [ ] `P5.G14` operation projector records committed offsets for strong reads and operation retrieve.
- [ ] `P5.G15` transfer history projection is cursor-stable and contract-invisible.
- [ ] `P5.G16` hold status timeline projection updates balances and hold state idempotently.
- [ ] `P5.G17` multi-region/cross-synchronizer consistency assumptions are documented and deferred to `P10.L01` chaos checks.
- [ ] `P5.G18` hot-tenant isolation prevents one tenant's lag from blocking unrelated tenant projections.
- [ ] `P5.G19` reconciler schedule config supports per-projector cadence.
- [ ] `P5.G20` diff reporter supports sample-based and full comparison modes.
- [ ] `P5.G21` PQS failover rejects stale replicas and marks degraded when no compatible source exists.
- [ ] `P5.G22` Projection lag metric is named `pillar_projection_lag_seconds` and is exposed with projector/stream dimensions.
- [ ] `P5.E07` `/v1/balances?consistency=wait_for_operation&operation=op_...` returns current projection only after checkpoint reaches operation commit offset; otherwise bounded wait then 202-style processing response.
- [ ] `P5.E17` `/v1/balances` list supports cursor pagination plus `account` and `asset` filters.
- [ ] `P5.E18` `/v1/holdings` list supports cursor pagination plus `account`, `asset`, and `status` filters.
- [ ] `P5.E19` `/v1/operations/:id?expand=ledger_trace` is admin-scoped and ordinary callers never receive Canton internals.

### Invariant gate

- [ ] Public API exposes no Canton contract-first fields.
- [ ] DB asset state is projection only.
- [ ] Projection is rebuildable.
