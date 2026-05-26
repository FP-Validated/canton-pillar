# Phase 06 — Webhook-first Event System

> Build Pillar's Stripe-grade asynchronous event layer: projected ledger changes become immutable `evt_*` records, signed webhook deliveries, retry/DLQ state, and replayable integration history.

## 1. Executive Summary

Phase 06 implements M6: Webhook-first Workflow. It connects the Phase 05 projection output to customer integrations without exposing Canton internals.

Core references:

- [10 Event / Webhook System](../Architecture/10_Event_Webhook%20System.md)
- [22 Pillar Observability / SRE / Runbooks](../Architecture/22_Pillar%20Observability.md)
- [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)

The runtime path is intentionally narrow:

```text
projection-worker writes event_log
  -> webhook-dispatcher polls due deliveries
  -> dispatcher renders endpoint-pinned Event object
  -> dispatcher signs raw JSON payload
  -> customer endpoint receives HTTPS POST
  -> dispatcher records webhook_attempts
  -> dispatcher marks success, retry, or DLQ
  -> operator/API/CLI can replay retained events
```

The phase preserves the ten Pillar invariants:

| Principle                                             | Phase 06 interpretation                                                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Canton Ledger is the source of truth                  | Events are generated only from ledger-confirmed projection changes or explicit API/system events; webhook success never changes ledger state. |
| Pillar DB stores only Projection / Audit / Config     | `event_log`, `webhook_endpoints`, `webhook_deliveries`, and `webhook_attempts` are integration/audit/config state, not asset truth.           |
| External API must be Stripe-like and Canton-invisible | Customers see `/v1/events`, `/v1/webhook_endpoints`, `evt_*`, `we_*`, `wdlv_*`, not contract IDs or offsets.                                  |
| Internal runtime must be Canton-native                | Event creation keeps `operation_id`, `request_id`, idempotency key, and ledger trace links internally.                                        |
| Operations must be ledger-traceable                   | `request_id -> idempotency_key -> operation_id -> ledger update -> event_id -> delivery_id -> attempt_id` is queryable.                       |
| Balance/Holding-first, not contract-first             | Event types and payloads describe balances, holdings, transfers, allocations, settlements, and intents.                                       |
| Intent-first, not transaction-first                   | Mutation completion is surfaced through intent/resource lifecycle events rather than synchronous ledger transaction exposure.                 |
| Webhook-first for async workflow                      | Final async workflow outcomes are events first, then API/CLI/Workbench inspection.                                                            |
| API grammar must be Stripe-grade from day one         | Cursor pagination, object IDs, endpoint version pinning, signature verification, retry, DLQ, and replay are first-class.                      |
| Deployment model changes, API experience does not     | Local sandbox, hosted Canton, customer validator, and multi-validator deployments emit the same `/v1` event grammar.                          |

Exit condition: a real e2e flow creates an intent, observes projection, writes an event, sends a signed webhook to a mock receiver, retries a failing receiver into DLQ, and manually replays without minting a new event.

## 2. Goals / Non-goals

### Goals

| Goal                   | Required outcome                                                                                                   | Architecture source                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Immutable Event object | Persist `evt_*` events with `type`, `api_version`, `created`, `data.object`, request metadata, and livemode.       | [10 Event / Webhook System](../Architecture/10_Event_Webhook%20System.md)                |
| Event API              | Implement `/v1/events` list/retrieve with cursor pagination and delivery filters.                                  | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) E08                |
| Webhook endpoint API   | Implement `/v1/webhook_endpoints` CRUD, enable/disable/delete, `rotate_secret`, and endpoint API version pinning.  | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) H01                |
| HMAC signer/verifier   | Implement `packages/security/src/webhook` test-vectored signing and verification.                                  | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) H02                |
| Dispatcher             | Implement `services/webhook-dispatcher` polling, signing, delivery, retry, DLQ, and replay queueing.               | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) H03-H05            |
| Observability          | Emit delivery latency, retry depth, DLQ, endpoint failure, and signature metadata without leaking payload secrets. | [22 Pillar Observability / SRE / Runbooks](../Architecture/22_Pillar%20Observability.md) |
| Replay semantics       | Manual replay creates a new delivery identity/generation for the same `event_id`; receivers dedupe by `event.id`.  | [10 Event / Webhook System](../Architecture/10_Event_Webhook%20System.md)                |

### Non-goals

| Non-goal                                    | Reason                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Exactly-once webhook delivery               | The architecture explicitly requires at-least-once delivery; customers must dedupe by `event.id`.   |
| Global ordering guarantee                   | Canton multi-synchronizer ordering and HTTPS delivery both make global ordering unsafe to promise.  |
| Public Canton fields                        | No default exposure of contract ID, template ID, participant ID, synchronizer ID, or ledger offset. |
| Webhook as rollback/commit channel          | Customer endpoint failure never rolls back a ledger-confirmed operation.                            |
| Event payload indefinite retention          | External event retrieval has a retention window; internal audit trace can be retained separately.   |
| EventBridge/Kafka/Pub/Sub delivery          | Architecture reserves destination abstraction, but Phase 06 scope is HTTPS webhook delivery.        |
| Workbench implementation beyond H06 handoff | Section 9 includes H06 inspector scope, but this file focuses on event/webhook backend contracts.   |

## 3. Architecture

### System flow

```text
services/projection-worker
  - consumes Canton Update Service / PQS changes
  - updates balance/holding/intent projections
  - creates immutable event_log rows after projection commit
        |
        v
packages/db:migrations/0060_events_webhooks
  - event_log
  - webhook_endpoints
  - webhook_deliveries
  - webhook_attempts
        |
        v
apps/api routes
  - /v1/events list/retrieve/replay
  - /v1/webhook_endpoints CRUD/rotate_secret/test
        |
        v
services/webhook-dispatcher
  - polls queued/retrying webhook_deliveries
  - locks due rows with skip-locked semantics
  - loads endpoint + active secrets
  - renders endpoint-pinned payload
  - signs raw body
  - POSTs JSON to endpoint URL
  - records webhook_attempts
  - updates delivery state
  - promotes exhausted deliveries to DLQ
        |
        v
customer receiver
  - verifies Pillar-Signature using raw body
  - checks timestamp tolerance
  - dedupes by event.id
  - returns 2xx quickly
```

### Event production rule

`event_log` is produced by `projection-worker`, not by `webhook-dispatcher`.

| Component            |                                                         May create `event_log`? | Reason                                                                                      |
| -------------------- | ------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------- |
| `projection-worker`  |                                                                             Yes | It observes ledger-confirmed projection changes and owns rebuildable event materialization. |
| `apps/api`           | Yes, only for explicit API/system events such as endpoint test or config events | Non-ledger events still require request/audit context.                                      |
| `webhook-dispatcher` |                                                                              No | Dispatcher sends persisted events only; it cannot become event creation authority.          |
| Customer endpoint    |                                                                              No | Receiver response affects delivery state only.                                              |

### Delivery lifecycle

| State        | Meaning                                              | Next state                                                            |
| ------------ | ---------------------------------------------------- | --------------------------------------------------------------------- |
| `queued`     | Delivery exists and has not been attempted.          | `delivering`, `canceled`                                              |
| `delivering` | Worker owns attempt lock.                            | `succeeded`, `retrying`, `dlq`, `failed`                              |
| `succeeded`  | Endpoint returned HTTP 2xx.                          | terminal                                                              |
| `retrying`   | Attempt failed and retry window remains.             | `delivering`, `dlq`, `canceled`                                       |
| `dlq`        | Retry window or max attempts exhausted.              | terminal for this delivery generation; replay creates a new delivery. |
| `failed`     | Non-retryable platform/config failure.               | terminal unless operator replays.                                     |
| `canceled`   | Endpoint deleted/disabled before delivery completed. | terminal                                                              |

### Cross-service boundaries

| Boundary            | Contract                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Projection -> Event | Projection commits resource state and `event_log` in the same DB transaction where possible; event data references versioned public objects. |
| Event -> Delivery   | A delivery is created for each enabled endpoint whose `enabled_events` matches event type and livemode/account.                              |
| Delivery -> Attempt | Every HTTP POST attempt creates one immutable attempt record, including status/error/duration and signature timestamp.                       |
| Attempt -> Retry    | Retry policy is deterministic from attempt number, delivery creation time, livemode, and configured jitter seed.                             |
| DLQ -> Replay       | DLQ replay does not mutate `event_log`; it creates a new delivery generation and links to the failed delivery.                               |

## 4. API / Object Model

### Event object

Canonical public shape:

```json
{
  "id": "evt_01JZ8K4J5S6Q9X2N8VZ7M8B9C1",
  "object": "event",
  "type": "transfer.succeeded",
  "api_version": "2026-05-26",
  "created": 1782470400,
  "livemode": true,
  "data": {
    "object": {
      "id": "tr_01JZ8K3V2X8ZJ6P4M2N1Q9A7B6",
      "object": "transfer",
      "status": "succeeded"
    }
  },
  "request": {
    "id": "req_01JZ8K2T1VQZ8N6P4B3C2D1E0F",
    "idempotency_key": "transfer-2026-05-26-000123"
  },
  "request_id": "req_01JZ8K2T1VQZ8N6P4B3C2D1E0F"
}
```

Required fields for Phase 06:

| Field                     |                                                      Required | Semantics                                                                                                  |
| ------------------------- | ------------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------- |
| `id`                      |                                                           Yes | Immutable `evt_*` identifier.                                                                              |
| `object`                  |                                                           Yes | Always `event`.                                                                                            |
| `type`                    |                                                           Yes | Dot-separated resource event, e.g. `holding.updated`, `transfer.succeeded`.                                |
| `api_version`             |                                                           Yes | Payload rendering version; endpoint-pinned for webhook delivery, request/account-pinned for API retrieval. |
| `data.object`             |                                                           Yes | Versioned public resource snapshot or thin object reference according to endpoint payload mode.            |
| `request.idempotency_key` | Required when event is caused by a state-changing API request | Original customer idempotency key.                                                                         |
| `request.id`              |                                                      Optional | API request ID that accepted the intent or config mutation.                                                |
| `request_id`              |                                                Yes when known | Top-level convenience alias for trace correlation; must match `request.id` when both exist.                |
| `livemode`                |                                                           Yes | Live/test mode partition.                                                                                  |
| `created`                 |                                                           Yes | Unix seconds for event creation time.                                                                      |

Internal-only fields may be stored but not exposed by default:

| Internal field                | Public exposure                                          |
| ----------------------------- | -------------------------------------------------------- |
| `operation_id`                | Expand/admin trace only.                                 |
| `ledger_offset`               | Never in default `/v1/events`; admin/support trace only. |
| `command_id`                  | Expand/admin trace only.                                 |
| `participant_id`              | Admin trace only.                                        |
| `contract_id` / `template_id` | Not exposed.                                             |

### Event API

```http
GET /v1/events?limit=25&starting_after=evt_...
GET /v1/events/:id
POST /v1/events/:id/resend
POST /v1/events/replay
```

List response uses Stripe-style cursor pagination:

```json
{
  "object": "list",
  "url": "/v1/events",
  "has_more": true,
  "data": [
    {
      "id": "evt_01JZ8K4J5S6Q9X2N8VZ7M8B9C1",
      "object": "event",
      "type": "transfer.succeeded",
      "api_version": "2026-05-26",
      "created": 1782470400,
      "livemode": true,
      "data": { "object": { "id": "tr_01JZ8K3...", "object": "transfer" } },
      "request": { "id": "req_01JZ8K2...", "idempotency_key": "transfer-001" },
      "request_id": "req_01JZ8K2..."
    }
  ]
}
```

Supported filters:

| Query                          | Meaning                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `limit`                        | 1-100, default 10 or API standard.                                               |
| `starting_after`               | Cursor after object ID.                                                          |
| `ending_before`                | Reverse cursor before object ID.                                                 |
| `types[]`                      | Event type filter.                                                               |
| `created[gte]`, `created[lte]` | Unix seconds creation window.                                                    |
| `delivery_success=false`       | Events with at least one non-successful/currently undelivered endpoint delivery. |
| `livemode`                     | Optional mode filter for admin/workbench contexts; API key normally scopes mode. |

### Webhook endpoint object

```json
{
  "id": "we_01JZ8P9E8D7C6B5A4F3E2D1C0B",
  "object": "webhook_endpoint",
  "url": "https://example.com/pillar/webhooks",
  "description": "Production treasury webhook",
  "enabled_events": ["transfer.succeeded", "transfer.failed", "balance.updated"],
  "api_version": "2026-05-26",
  "event_payload": "thin",
  "status": "enabled",
  "livemode": true,
  "created": 1782470400,
  "updated": 1782470400,
  "metadata": { "owner": "treasury-platform" }
}
```

Phase 06 endpoint API:

| Method   | Path                                      | Behavior                                                                       |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `POST`   | `/v1/webhook_endpoints`                   | Create endpoint, pin API version, return signing secret exactly once.          |
| `GET`    | `/v1/webhook_endpoints`                   | List endpoints with cursor pagination.                                         |
| `GET`    | `/v1/webhook_endpoints/:id`               | Retrieve endpoint without secret.                                              |
| `POST`   | `/v1/webhook_endpoints/:id`               | Update URL, description, enabled events, metadata, payload mode where allowed. |
| `DELETE` | `/v1/webhook_endpoints/:id`               | Soft-delete; queued deliveries may be canceled by policy.                      |
| `POST`   | `/v1/webhook_endpoints/:id/enable`        | Enable endpoint.                                                               |
| `POST`   | `/v1/webhook_endpoints/:id/disable`       | Disable endpoint; no new deliveries are created while disabled.                |
| `POST`   | `/v1/webhook_endpoints/:id/rotate_secret` | Create new active secret; old secret remains valid during grace period.        |
| `POST`   | `/v1/webhook_endpoints/:id/test`          | Create/send a synthetic test event in the same grammar, marked test/system.    |
| `GET`    | `/v1/webhook_endpoints/:id/deliveries`    | List delivery history for inspector/API consumers.                             |

### Version pinning

| Version source                  | Applies to                                      | Rule                                                                    |
| ------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Account default API version     | API requests without explicit `Pillar-Version`. | Determines response shape at request time.                              |
| `Pillar-Version` request header | Direct API request/response.                    | Does not override existing endpoint-pinned delivery rendering.          |
| Webhook endpoint `api_version`  | Webhook payloads sent to that endpoint.         | Each endpoint receives the same event rendered for its pinned version.  |
| SDK pinned version              | Client library generated types.                 | Must remain compatible with `/v1/events` and endpoint payload versions. |

## 5. Internal Runtime

### Dispatcher loop

```text
loop every poll_interval:
  begin transaction
    select due webhook_deliveries
      where status in ('queued', 'retrying')
        and next_attempt_at <= now()
      order by next_attempt_at asc, created_at asc
      limit batch_size
      for update skip locked
    mark selected deliveries 'delivering'
  commit

  for each delivery concurrently within endpoint/account caps:
    load event_log, endpoint, active secrets
    render payload for endpoint.api_version + endpoint.event_payload
    serialize JSON once to raw bytes
    sign raw bytes with all active secrets
    POST with timeout and no live-mode redirect following
    insert webhook_attempts row
    update delivery status and endpoint health counters
```

### Signature header

Exact header format:

```http
Pillar-Signature: t=1782470400,v1=9af4...,v1=3bc1...
```

Additional delivery headers:

```http
Pillar-Event-Id: evt_01JZ8K4J5S6Q9X2N8VZ7M8B9C1
Pillar-Delivery-Id: wdlv_01JZ8Q00000000000000000001
Pillar-Event-Type: transfer.succeeded
Pillar-API-Version: 2026-05-26
Content-Type: application/json
User-Agent: Pillar-Webhooks/1.0
```

Signing algorithm:

```text
signed_payload = timestamp + "." + raw_request_body
signature = hmac_sha256(endpoint_signing_secret, signed_payload)
header = "t=" + timestamp + ",v1=" + signature
```

When multiple secrets are active during rotation:

```text
header = "t=" + timestamp + ",v1=" + hmac(secret_new, signed_payload) + ",v1=" + hmac(secret_old, signed_payload)
```

Verification rules for SDK/server helpers:

| Step | Rule                                                                           |
| ---- | ------------------------------------------------------------------------------ |
| 1    | Parse `Pillar-Signature` into one `t` and one-or-more `v1` values.             |
| 2    | Reject if `abs(now - t) > tolerance`; default tolerance is 300 seconds.        |
| 3    | Recompute HMAC-SHA256 over `timestamp + "." + raw_request_body`.               |
| 4    | Compare with active endpoint secrets using constant-time comparison.           |
| 5    | Accept if any `v1` matches any active secret.                                  |
| 6    | Ignore unknown signature versions; reject missing `t` or missing `v1`.         |
| 7    | Never verify against parsed/re-serialized JSON. Raw-body signing is mandatory. |

### Secret rotation

| Moment          | Behavior                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Create endpoint | Generate `whsec_*`, return plaintext once, store encrypted/hashed as defined in Section 8.             |
| Rotate secret   | Generate new active secret immediately.                                                                |
| Grace window    | Old secret remains accepted and deliveries are signed with both secrets for up to 24 hours by default. |
| Early revoke    | Endpoint may revoke old secret before grace expiry.                                                    |
| Expiry          | Expired/revoked secret is not used for signing or verification.                                        |

### Retry/backoff

Live retry schedule:

```text
Attempt 1: immediately
Attempt 2: +10s
Attempt 3: +30s
Attempt 4: +2m
Attempt 5: +5m
Attempt 6: +15m
Attempt 7: +30m
Attempt 8: +1h
Attempt 9: +2h
Attempt 10: +4h
Attempt 11: +8h
Attempt 12: +12h
Attempt 13: +24h
Attempt 14: +24h
```

Sandbox retry schedule:

```text
Attempt 1: immediately
Attempt 2: +30s
Attempt 3: +5m
Attempt 4: +30m
```

Retry policy:

| Condition             | Treatment                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| HTTP `2xx`            | Success; terminal.                                                                                                    |
| HTTP `3xx`            | Failure; do not follow redirects in live mode.                                                                        |
| HTTP `400-499`        | Failure; retry except explicit disabled/deleted endpoint policy.                                                      |
| `401` / `403`         | Failure; retry and emit security warning.                                                                             |
| `404` / `410`         | Failure; retry and mark endpoint health warning; optional auto-disable is outside Phase 06 unless already configured. |
| `429`                 | Failure; retry with backoff.                                                                                          |
| HTTP `500-599`        | Failure; retry.                                                                                                       |
| Timeout               | Failure; retry.                                                                                                       |
| DNS/TLS/connect error | Failure; retry and classify error.                                                                                    |
| Signing failure       | Platform failure; do not send; alert and mark delivery failed/retry depending on recoverability.                      |

Backoff details:

| Parameter            | Value                                                    |
| -------------------- | -------------------------------------------------------- |
| Live max attempts    | 14                                                       |
| Live retry window    | 72 hours                                                 |
| Sandbox max attempts | 4                                                        |
| Jitter               | +/-20% deterministic per delivery attempt where feasible |
| Concurrency          | Per-endpoint and per-account caps                        |
| Delivery key         | `event_id + endpoint_id + delivery_generation`           |

### DLQ promotion criteria

A delivery enters DLQ when any of these is true:

| Criterion                        | Meaning                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Max attempts exhausted           | Attempt number would exceed configured max attempts.                                     |
| Retry window exhausted           | Next retry would be outside live 72-hour window or sandbox configured window.            |
| Endpoint deleted/canceled policy | If endpoint deletion policy chooses DLQ instead of cancel for in-flight retained events. |
| Operator action                  | Explicit operator marks delivery as DLQ after investigation.                             |

DLQ does not mutate the event, does not imply ledger failure, and does not stop other endpoint deliveries for the same event.

### Manual replay semantics

Replay is explicit and must be safe for at-least-once receivers:

| Operation                    | Event ID         | Delivery ID                                  | Attempt IDs                | Automatic retry impact                  |
| ---------------------------- | ---------------- | -------------------------------------------- | -------------------------- | --------------------------------------- |
| Original delivery            | Original `evt_*` | Original `wdlv_*`                            | Original `watt_*` sequence | N/A                                     |
| Manual replay by event ID    | Same `event_id`  | New `delivery_id`                            | New attempt sequence       | Does not stop existing automatic retry. |
| Manual replay by delivery ID | Same `event_id`  | New `delivery_id`, `resend_of` old delivery  | New attempt sequence       | Does not stop existing automatic retry. |
| DLQ replay                   | Same `event_id`  | New `delivery_id`, new `delivery_generation` | New attempt sequence       | DLQ entry links to replayed delivery.   |

Receiver guidance: dedupe by `event.id`, not by `Pillar-Delivery-Id`. `Pillar-Delivery-Id` is attempt lineage/diagnostics only.

## 6. DB Schema

Migration set: `packages/db/migrations/0060_events_webhooks`.

Required files from [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md):

```text
packages/db/migrations/0060_events_webhooks/
  0060_event_log.sql
  0061_webhook_endpoints.sql
  0062_webhook_deliveries.sql
  0063_webhook_attempts.sql
```

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

Implementation requirements:

| Column            | Requirement                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `id`              | `evt_*`; immutable.                                                                                            |
| `tenant_id`       | Tenant/account scoping must prevent cross-tenant event access.                                                 |
| `type`            | Canonical event type; indexed with created time.                                                               |
| `api_version`     | Version used for stored canonical data or render source.                                                       |
| `data_object`     | Public object payload/reference only; no raw contract payloads.                                                |
| `request_id`      | Link to API request audit where present.                                                                       |
| `idempotency_key` | Store as architecture requires; if plaintext is not required for customer display, hash/redact in audit views. |
| `operation_id`    | Trace link to mutation/ledger workflow.                                                                        |
| `ledger_offset`   | Internal trace only; not default public API output.                                                            |
| `created_at`      | Cursor ordering source.                                                                                        |

Recommended indexes:

```sql
create index idx_event_log_tenant_created
  on event_log (tenant_id, created_at desc, id desc);

create index idx_event_log_tenant_type_created
  on event_log (tenant_id, type, created_at desc);

create index idx_event_log_operation
  on event_log (operation_id)
  where operation_id is not null;
```

### `webhook_endpoints`

Architecture fields required in Phase 06:

```sql
create table webhook_endpoints (
  id text primary key,
  tenant_id text not null references tenants(id),
  account_id text not null,
  livemode boolean not null,
  url text not null,
  description text,
  enabled_events text[] not null,
  api_version text not null,
  event_payload text not null check (event_payload in ('thin', 'snapshot')),
  status text not null check (status in ('enabled', 'disabled', 'deleted')),
  failure_count integer not null default 0,
  last_delivery_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

Secret storage may be in the same migration set as a dedicated table even though the high-level Phase 06 list names four objects:

```sql
create table webhook_endpoint_secrets (
  id text primary key,
  endpoint_id text not null references webhook_endpoints(id),
  secret_prefix text not null,
  secret_ciphertext bytea not null,
  secret_hash text not null,
  status text not null check (status in ('active', 'expiring', 'expired', 'revoked')),
  not_before timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
```

If implementation chooses an alternative secret storage shape, it must still support multi-secret active verification/signing during rotation.

### `webhook_deliveries`

```sql
create table webhook_deliveries (
  id text primary key,
  tenant_id text not null references tenants(id),
  event_id text not null references event_log(id),
  endpoint_id text not null references webhook_endpoints(id),
  status text not null,
  next_attempt_at timestamptz,
  attempts int not null default 0,
  manual boolean not null default false,
  resend_of text references webhook_deliveries(id),
  delivery_generation int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, endpoint_id, delivery_generation)
);
```

Required statuses:

```text
queued | delivering | succeeded | retrying | failed | dlq | canceled
```

Recommended indexes:

```sql
create index idx_webhook_deliveries_due
  on webhook_deliveries (status, next_attempt_at)
  where status in ('queued', 'retrying');

create index idx_webhook_deliveries_event
  on webhook_deliveries (event_id);

create index idx_webhook_deliveries_endpoint_created
  on webhook_deliveries (endpoint_id, created_at desc);
```

### `webhook_attempts`

The architecture doc names the table `webhook_delivery_attempts`; the implementation-plan migration list names `0063_webhook_attempts.sql`. Use `webhook_attempts` only if the repo's migration naming convention requires it; otherwise prefer the architecture table name and expose API object `webhook_attempt`.

```sql
create table webhook_attempts (
  id text primary key,
  delivery_id text not null references webhook_deliveries(id),
  attempt_no integer not null,
  request_method text not null default 'POST',
  request_url_hash text not null,
  request_headers jsonb not null default '{}'::jsonb,
  request_body_sha256 text not null,
  signature_timestamp bigint not null,
  response_status integer,
  response_headers jsonb,
  response_body_truncated text,
  duration_ms integer,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (delivery_id, attempt_no)
);
```

Storage rules:

| Data             |               Store? | Rule                                                                                               |
| ---------------- | -------------------: | -------------------------------------------------------------------------------------------------- |
| Raw request body |                   No | Store SHA-256 only unless a secured debug retention feature is explicitly added.                   |
| Signing secret   | No plaintext at rest | Store encrypted secret material and hash/prefix for audit.                                         |
| Response body    |            Truncated | Limit size and redact likely secrets.                                                              |
| Request headers  |             Redacted | Include Pillar metadata headers, not Authorization-bearing customer values.                        |
| URL              |    Hashed in attempt | Endpoint table stores URL; attempts use `request_url_hash` to avoid duplicative sensitive storage. |

## 7. Failure Modes

| Failure mode                                | Detection                                                           | Required behavior                                                                                     | Customer/operator surface                                                     |
| ------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Endpoint down                               | Connect timeout, DNS failure, TLS error, HTTP 5xx.                  | Record attempt, classify error, retry with backoff, eventually DLQ.                                   | `/v1/webhook_deliveries`, Workbench inspector, metrics.                       |
| Receiver returns 500                        | HTTP status.                                                        | Retry until success or DLQ; original event remains immutable.                                         | Delivery status `retrying` then `dlq`.                                        |
| Receiver returns slow response              | Per-attempt timeout.                                                | Abort attempt, record timeout duration/error, retry.                                                  | Attempt error `timeout`; SLO impact attributed by endpoint/platform class.    |
| Replay attack                               | Signature timestamp outside tolerance or reused old signed body.    | Verifier rejects if `abs(now - t) > 300s`; receiver dedupes by `event.id`.                            | SDK verification error.                                                       |
| Clock skew                                  | Signature rejected due to timestamp tolerance.                      | Include clear verifier error; allow configurable tolerance for local tests only.                      | Customer integration guidance and Workbench diagnostics.                      |
| Signature mismatch                          | HMAC compare fails for all active secrets.                          | Reject in verifier; dispatcher records only outbound signature metadata, not secret.                  | Receiver returns 4xx; delivery retries; security warning on repeated 401/403. |
| Endpoint secret rotation race               | Receiver only has old or new secret.                                | Dispatcher signs with all active secrets during grace window.                                         | Header contains multiple `v1=` values.                                        |
| Endpoint disabled                           | Endpoint status changes while deliveries queued.                    | Stop creating new deliveries; queued delivery policy is cancel or leave retryable per product config. | Endpoint status and delivery status explain action.                           |
| Event explosion                             | Projection emits excessive events from one ledger update or replay. | Rate limit delivery creation/dispatch per account and endpoint; preserve event log; alert on backlog. | Webhook backlog metrics and event list.                                       |
| Dispatcher crash mid-attempt                | Worker dies after POST before DB update.                            | Lease/timeout recovers delivery; at-least-once may produce duplicate POST.                            | Duplicate possible; receiver dedupe by `event.id`.                            |
| DB write fails after customer received POST | Attempt status not recorded.                                        | Delivery is retried after lease timeout; duplicate possible.                                          | At-least-once semantics.                                                      |
| DLQ backlog grows                           | DLQ count/error budget.                                             | Alert, expose replay/ignore/export; no hidden deletion.                                               | `/v1/webhook_dlq` when implemented; Workbench inspector.                      |

## 8. Security / Compliance

### HMAC-SHA256

Required implementation in `packages/security/src/webhook`:

| Function                                                                  | Behavior                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `signWebhookPayload(secret, timestamp, rawBody)`                          | Returns lowercase hex HMAC-SHA256 over `timestamp + "." + rawBody`.                                                       |
| `buildSignatureHeader(signatures)`                                        | Emits exact `Pillar-Signature: t=...,v1=...` value without spaces.                                                        |
| `verifyWebhookSignature(rawBody, header, secrets, toleranceSeconds, now)` | Parses header, enforces timestamp tolerance, constant-time compares all active `v1` values.                               |
| Test vectors                                                              | Cover one secret, multiple secrets, stale timestamp, malformed header, parsed JSON mismatch, constant-time mismatch path. |

### Secret handling

| Secret                           | Storage rule                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Webhook signing secret plaintext | Returned only once at endpoint create/rotate.                                                                                    |
| Webhook signing secret at rest   | Encrypted using KMS or equivalent envelope encryption where signing requires plaintext recovery.                                 |
| Secret hash                      | Store hash/prefix for audit/lookup where possible; hash alone cannot sign.                                                       |
| Old rotated secret               | Mark `expiring`, valid up to 24h by default, then `expired` or `revoked`.                                                        |
| Signing KMS key                  | Rotate through KMS key/version policy; dispatcher must reload usable active key material without process restart where feasible. |

### PII and payload minimization

| Rule                            | Requirement                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| No PII in event payloads        | Event payloads must not include raw personal identity, bank details, credentials, private keys, or raw legal documents. |
| No raw contract payload in logs | Logs/attempts store hashes, IDs, durations, status, and redacted snippets only.                                         |
| Metadata limits                 | Customer metadata follows global API metadata policy; redact in logs.                                                   |
| Response body truncation        | Store bounded, redacted response body for debugging only.                                                               |
| Tenant isolation                | All event, endpoint, delivery, and attempt queries are tenant/account scoped.                                           |
| Replay authorization            | Replay requires `events.replay` or equivalent privileged permission and audit logging.                                  |
| Endpoint URL validation         | Live mode requires HTTPS; localhost HTTP allowed only in sandbox/test mode.                                             |

### Compliance trace

Every replay, endpoint mutation, and secret rotation writes an audit record containing:

```text
actor_id
account_id / tenant_id
request_id
idempotency_key hash when present
endpoint_id or event_id
action
old/new non-secret config diff
created_at
```

## 9. Implementation Plan

`services/workflow-orchestrator` MVP is delivered here so that P9 packaging has a real artifact and so time/state-triggered automation (architecture/23 §Automation Runtime) has an owner before security/compliance workflows depend on it in P8.K04.

| ID     | Title                                        | Path                                                                                                                                     | Output                                                                                                                                                                     | Deps                                             | Acceptance                                                                                                                                                                                                     | Risk |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| P6.H01 | Webhook endpoint API                         | `apps/api/src/routes/v1/webhook_endpoints`                                                                                               | CRUD, enable/disable/delete, rotate_secret, test endpoint, endpoint version pinning                                                                                        | P2 API grammar, P3 DB base, P6 DB migrations     | Endpoint create returns secret once; retrieve/list omit secret; rotate signs with old+new during grace; endpoint version pinned                                                                                | med  |
| P6.H02 | Webhook signer/verifier                      | `packages/security/src/webhook`                                                                                                          | HMAC-SHA256 signer, header builder, verifier, test vectors                                                                                                                 | P6.H01 secret model                              | `Pillar-Signature: t=...,v1=hmac_sha256(...)` equivalent output is exact; stale timestamp and raw-body mismatch fail                                                                                           | high |
| P6.H03 | Dispatcher delivery loop                     | `services/webhook-dispatcher`                                                                                                            | Polling worker, row locking, render payload, signed POST, attempt recording                                                                                                | P6.H01, P6.H02, P6.E08                           | Mock receiver gets signed event from projected `event_log`; attempts persisted with status/duration/body hash                                                                                                  | high |
| P6.H04 | Retry policy and DLQ                         | `services/webhook-dispatcher/src/retry`                                                                                                  | Live/sandbox backoff schedules, jitter, max attempts/window, DLQ promotion                                                                                                 | P6.H03                                           | Receiver returning 500 is retried on schedule and promoted to DLQ after exhaustion                                                                                                                             | high |
| P6.H05 | Manual replay                                | `apps/api/src/routes/v1/events`, `services/webhook-dispatcher/src/replay`, `tools/cli` handoff                                           | Replay by event/delivery/DLQ entry creates new delivery generation with same event ID                                                                                      | P6.H03, P6.H04                                   | Manual replay creates new `delivery_id` and attempts while preserving original `event_id`; automatic retry is not canceled                                                                                     | med  |
| P6.H06 | Webhook inspector feed                       | `apps/workbench` backend feed or API support                                                                                             | Delivery/attempt query shape for Workbench inspector                                                                                                                       | P6.H03, P6.H04                                   | Inspector can show delivery status, timing, response status, error code, and signature timestamp without secrets                                                                                               | med  |
| P6.E08 | Event routes                                 | `apps/api/src/routes/v1/events`                                                                                                          | `/v1/events` list/retrieve and replay entrypoints with cursor pagination                                                                                                   | P5 projection event production, P6 DB migrations | Event list/retrieve returns versioned `evt_*` object; pagination and event versioning tests pass                                                                                                               | med  |
| P6.H07 | Workflow orchestrator MVP                    | `services/workflow-orchestrator/src/main/kotlin`                                                                                         | Outbox dispatcher claim/release, time-triggered tasks (`expire_hold`, `retry_unknown_command`), state-triggered task `settle_transfer` shell; no business policy hardcoded | P3.D04, P3.D06, P4.F04, P4.F05, P5.G02           | Worker leases tasks via DB row lock; `expire_hold` advances Daml choice via ledger-command on time trigger; chaos restart preserves task lease semantics                                                       | high |
| P6.H08 | Event type registry                          | `packages/api-contracts/schemas/events`, `services/projection-worker/src/events/registry`, `apps/api/src/events/registry`                | Single source of truth for every `evt_*` type from `EVENT_CATALOG.md`, including family, owner, shape, version, and emitter authority                                      | P2.C02, P5.G05, P6.E08                           | Registry enumerates catalog event families and rejects unknown event type creation in projector/API tests; event type strings are never duplicated as ad hoc literals in dispatcher routing                    | high |
| P6.H09 | Event payload mode renderer                  | `apps/api/src/events/rendering`, `services/webhook-dispatcher/src/rendering`                                                             | Shared thin vs snapshot event renderer for API retrieval and webhook delivery                                                                                              | P6.H08, P6.E08                                   | Thin mode emits stable `id`, `object`, `url`, safe status fields; snapshot mode emits API-versioned object without secrets or Canton fields; parity tests cover both modes for representative catalog families | high |
| P6.H10 | Webhook endpoint health monitor              | `services/webhook-dispatcher/src/health`, `apps/api/src/routes/v1/webhook_endpoints`                                                     | Endpoint probe state, `last_success_at`, failure class counters, and health metric export                                                                                  | P6.H03, P6.H04                                   | Successful delivery/probe updates `last_success_at`; failing probe records class without changing ledger/event state; metrics expose endpoint health and dispatcher backlog by tenant/endpoint                 | med  |
| P6.H11 | Webhook endpoint test ping                   | `apps/api/src/routes/v1/webhook_endpoints/:id/test_ping`, `services/webhook-dispatcher/src/test-events`                                  | Synthetic signed sample event delivery that does not require ledger state and is marked `source=test`                                                                      | P6.H02, P6.H09, P6.H10                           | `POST /v1/webhook_endpoints/:id/test_ping` returns a sample `evt_*` and delivery result; receiver gets a valid `Pillar-Signature`; no business event or projection row is forged                               | med  |
| P6.H12 | Customer endpoint firewall test              | `apps/api/src/routes/v1/webhook_endpoints/:id/diagnostics`, `services/webhook-dispatcher/src/diagnostics`                                | Synthetic delivery diagnostic for DNS, TLS, redirects, HTTP status, timeout, and blocked/firewalled endpoint classification                                                | P6.H10, P6.H11                                   | Diagnostic classifies network/TLS/HTTP failures with redacted evidence; live mode refuses insecure redirects; result is visible on endpoint inspector without exposing secrets                                 | med  |
| P6.H13 | Per-event subscription filter                | `apps/api/src/routes/v1/webhook_endpoints`, `services/webhook-dispatcher/src/routing`                                                    | Per-customer per-event-type `enabled_events` matching against registry families and explicit event names                                                                   | P6.H08, P6.H01, P6.H03                           | Endpoint receives only subscribed event types; unknown or deprecated event types are rejected at create/update; wildcard groups expand through the registry deterministically                                  | high |
| P6.H14 | Manual replay rate limiting                  | `apps/api/src/routes/v1/events/replay`, `services/webhook-dispatcher/src/replay`                                                         | Replay quota, range bounds, endpoint fan-out caps, and abuse-safe idempotency for manual replay                                                                            | P6.H05, P6.H13                                   | Replay requests over quota or unbounded ranges fail with structured errors; same idempotency key returns same replay plan; existing automatic retry is not canceled                                            | high |
| P6.H15 | Signed payload test vectors                  | `packages/security/src/webhook/test-vectors`, `packages/api-contracts/examples/webhooks`                                                 | Published HMAC test vectors for one secret, multiple active secrets, stale timestamp, malformed header, and raw-body mismatch                                              | P6.H02                                           | Customers can verify HMAC implementation from fixed raw payload/secret/header examples; vectors are consumed by signer/verifier tests and docs examples without re-serializing JSON                            | med  |
| P6.H16 | Endpoint and event-type version pins         | `apps/api/src/routes/v1/webhook_endpoints`, `services/webhook-dispatcher/src/rendering/versioning`                                       | Endpoint `api_version` plus optional per-event-type version pin validation and rendering lookup                                                                            | P6.H08, P6.H09, P6.H13                           | Endpoint-pinned payloads stay stable across server default version changes; per-event-type pin rejects unsupported versions; replay renders according to destination endpoint/version rules                    | high |
| P6.H17 | Multi-active-secret rotation enforcement     | `apps/api/src/routes/v1/webhook_endpoints/:id/rotate_secret`, `services/webhook-dispatcher/src/signing`, `packages/security/src/webhook` | Rotation window lifecycle enforcing active/expiring/expired/revoked secret states and multi-signature output                                                               | P6.H01, P6.H02, P6.H15                           | During overlap dispatcher signs with all active/expiring secrets; expired/revoked secrets are not used; early revoke and grace expiry are audited and tested                                                   | high |
| P6.H18 | Workflow orchestrator outbox claim semantics | `services/workflow-orchestrator/src/main/kotlin/outbox`                                                                                  | Deepened P6.H07 claim/release contract for skip-locked leases, heartbeats, expiry, idempotent completion, and crash recovery                                               | P6.H07, P4.F04, P4.F05                           | Competing workers cannot execute the same outbox task concurrently; crashed lease is reclaimed once; completion preserves operation/command identity and emits no optimistic business event                    | high |
| P6.H19 | DLQ admin operations                         | `apps/api/src/routes/v1/webhook_dlq`, `services/webhook-dispatcher/src/dlq`, `tools/cli/src/webhooks`                                    | Inspect, requeue, drop/ignore, and replay DLQ entries with audit records and tenant-scoped authorization                                                                   | P6.H04, P6.H05, P6.H14                           | Operator can inspect redacted DLQ details, requeue or drop one delivery, and replay without changing `event_id`; every DLQ mutation writes audit evidence                                                      | high |
| P6.H20 | Webhook delivery audit retention             | `packages/db/migrations/0060_events_webhooks`, `services/webhook-dispatcher/src/retention`                                               | Retention policy for events, deliveries, attempts, response snippets, hashes, and internal audit trace separation                                                          | P6.H03, P6.H04, P6.H19                           | External event payload retrieval honors configured retention; delivery attempts retain redacted audit evidence; cleanup never deletes ledger trace required for compliance/replay audit                        | med  |
| P6.E20 | Event search filters                         | `apps/api/src/routes/v1/events`                                                                                                          | `/v1/events` `types[]`, `created[gte]`, `created[lte]`, `delivery_success`, and livemode filter implementation                                                             | P6.E08, P6.H08                                   | Filtered event search is tenant scoped, cursor-stable, and uses indexed `(tenant_id,type,created_at)` paths; invalid event types fail with structured `invalid_request_error`                                  | med  |
| P6.E21 | Event retrieve payload-mode resolution       | `apps/api/src/routes/v1/events/:id`, `apps/api/src/events/rendering`                                                                     | `/v1/events/:id` renderer selecting thin/snapshot expansion from request/API version context without endpoint delivery side effects                                        | P6.E08, P6.H09, P6.H16                           | Retrieve returns the immutable `evt_*` envelope, resolves `data.object` consistently with requested expansion/version, and never exposes Canton identifiers or secrets                                         | high |
| P6.E22 | Webhook endpoint list/test/disable API       | `apps/api/src/routes/v1/webhook_endpoints`                                                                                               | List endpoints, test delivery action, and disable action with cursor pagination, idempotency, and event emission                                                           | P6.H01, P6.H10, P6.H13                           | `GET /v1/webhook_endpoints` paginates; disable stops new deliveries; test action creates only synthetic delivery/event evidence and returns no signing secret                                                  | med  |
| P6.E23 | Webhook endpoint test ping route             | `apps/api/src/routes/v1/webhook_endpoints/:id/test_ping`                                                                                 | Public route contract for endpoint ping distinct from business-event test delivery                                                                                         | P6.H11, P6.E22                                   | `POST /v1/webhook_endpoints/:id/test_ping` requires idempotency, returns sample signed event and diagnostic delivery ID, and is rate limited per endpoint/customer                                             | med  |

### Ticket execution notes

| Ticket | Notes                                                                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P6.H01 | Validate HTTPS in live mode. Enforce endpoint limit from architecture unless global quota config overrides. Store endpoint `api_version` explicitly. |
| P6.H02 | Use raw bytes, not stringified parsed JSON. Constant-time comparison is mandatory.                                                                   |
| P6.H03 | Use DB row locks/leases so multiple dispatcher replicas can run safely. No customer-specific branching in signer.                                    |
| P6.H04 | Implement schedules as data tables with tests; do not bury retry math in ad hoc conditionals.                                                        |
| P6.H05 | Replay is an audited mutation and should be idempotent where request has an idempotency key.                                                         |
| P6.H06 | Do not expose secret values or full raw payloads through inspector APIs.                                                                             |
| P6.E08 | Keep API response Canton-invisible; ledger trace expansion is admin/support scope, not default event response.                                       |
| P6.H08 | Treat `docs/Dev/EVENT_CATALOG.md` as the source of truth; registry additions require catalog ownership and version metadata.                         |
| P6.H09 | Share the renderer between API and dispatcher; do not create separate thin/snapshot payload code paths.                                              |
| P6.H10 | Health metrics are delivery diagnostics only; they must never auto-rollback or mutate ledger-derived event state.                                    |
| P6.H11 | Test ping events must be clearly synthetic and safe to deliver to production endpoints without business side effects.                                |
| P6.H12 | Diagnostics may store status/error classes and hashes, never customer secrets or full response bodies.                                               |
| P6.H13 | Subscription matching must be tenant/account/livemode scoped and backed by registry validation.                                                      |
| P6.H14 | Replay bounds are mandatory because one event can fan out to many endpoints and attempts.                                                            |
| P6.H15 | Publish exact raw payload bytes and expected headers; parsed JSON examples are insufficient for HMAC verification.                                   |
| P6.H16 | Replay rendering follows destination endpoint pins unless an explicit historical-render mode is separately authorized.                               |
| P6.H17 | Multiple active secrets are temporary; enforce expiry/revoke state rather than leaving indefinite overlap.                                           |
| P6.H18 | Workflow orchestrator outbox ownership is a lease protocol, not an in-memory mutex.                                                                  |
| P6.H19 | DLQ drop means "operator will not deliver this generation"; it does not delete the immutable event.                                                  |
| P6.H20 | Retention cleanup must preserve audit/compliance trace required by REGRESSION_CONTRACT IC-06 and IC-07.                                              |
| P6.E20 | Search filters must remain cursor-stable when multiple events share the same timestamp.                                                              |
| P6.E21 | Event retrieval is read-only; it must not enqueue webhook deliveries or recompute event authority.                                                   |
| P6.E22 | Disable/list/test behavior must match API_MATRIX endpoint grammar and idempotency requirements.                                                      |
| P6.E23 | Keep `test_ping` semantically separate from `/test` if `/test` creates a synthetic event delivery flow.                                              |

## 10. Open Questions

| Question                                                                     | Current resolution for Phase 06                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event retention window: 30 days like Stripe vs longer for regulated assets?  | Implement external event payload retrieval with a 30-day default retention compatible with Stripe/idempotency expectations. Keep internal audit/ledger trace retention separately configurable for regulated assets. This is a policy decision to finalize before production GA; Phase 06 must not hard-code irreversible deletion of audit trace. |
| Table naming conflict: `webhook_attempts` vs `webhook_delivery_attempts`     | The assignment requires `webhook_attempts`; Architecture 10 uses `webhook_delivery_attempts`. Follow the repo migration convention chosen by `0063_webhook_attempts.sql`, but keep API/object semantics as delivery attempts.                                                                                                                      |
| `packages/security/src/webhook` vs `packages/security/src/webhook-signature` | Assignment scope names `packages/security/src/webhook`; Implementation Plan line names `webhook-signature`. Use `packages/security/src/webhook` and expose a stable module path; avoid duplicate signer packages.                                                                                                                                  |
| DLQ table in migration set                                                   | Assignment names four tables; Architecture 10 defines `webhook_dlq_entries`. If no separate DLQ table is created in Phase 06, represent DLQ via `webhook_deliveries.status='dlq'` and add a view/API shape. If a table is added, keep it in `0060_events_webhooks` and document it as an implementation extension.                                 |
| Manual replay range API                                                      | Architecture includes `/v1/events/replay` for event ranges. Phase 06 must at least support replay by event ID; range replay can be bounded by retention and permissions.                                                                                                                                                                           |

## 11. Agent-ready Checklist

### Build scope checklist

- [ ] `packages/db/migrations/0060_events_webhooks/0060_event_log.sql` creates event log with tenant/account-safe indexes.
- [ ] `packages/db/migrations/0060_events_webhooks/0061_webhook_endpoints.sql` creates endpoints and active/rotating secret storage.
- [ ] `packages/db/migrations/0060_events_webhooks/0062_webhook_deliveries.sql` creates delivery state machine persistence.
- [ ] `packages/db/migrations/0060_events_webhooks/0063_webhook_attempts.sql` creates immutable attempt records.
- [ ] `apps/api/src/routes/v1/events` implements list/retrieve with cursor pagination and replay entrypoint.
- [ ] `apps/api/src/routes/v1/webhook_endpoints` implements CRUD, enable/disable/delete, rotate secret, test event, and delivery listing.
- [ ] `packages/security/src/webhook` implements HMAC-SHA256 signer/verifier using raw body bytes.
- [ ] `services/webhook-dispatcher` implements polling, locking, endpoint matching, payload rendering, signed POST, attempt recording, retry, DLQ, and replay.
- [ ] Dispatcher and API share the same event/version rendering contract; no parallel Event object shapes.
- [ ] Metrics/logs include first-attempt latency, success rate, retry depth, DLQ count, endpoint failure class, and dispatcher backlog.

- [ ] `packages/api-contracts/schemas/events` and shared runtime registry enumerate every `evt_*` type from `EVENT_CATALOG.md` with owner, shape, emitter, and version metadata.
- [ ] Event payload rendering supports thin and snapshot modes through one shared contract used by `/v1/events` and webhook delivery.
- [ ] Webhook endpoint subscription filters validate explicit event types and wildcard groups against the registry.
- [ ] Endpoint health, test ping, firewall diagnostics, and last-success metrics are exposed without leaking secrets.
- [ ] Manual replay is bounded by rate limits, range caps, tenant/endpoint fan-out limits, and idempotency.
- [ ] DLQ admin operations support inspect, requeue, drop, and replay with audit records.
- [ ] Endpoint API version and per-event-type version pins are enforced during delivery and replay rendering.
- [ ] Webhook delivery/event/attempt retention policy preserves audit evidence while honoring public payload retention.

### E2E checklist

- [ ] Issue an intent through the public API.
- [ ] Observe ledger command completion and projection update.
- [ ] Confirm projection-worker writes `event_log` after projection commit.
- [ ] Configure mock webhook receiver endpoint.
- [ ] Confirm mock receiver gets signed payload with exact `Pillar-Signature: t=...,v1=...` header.
- [ ] Verify receiver can validate signature using raw request body and 300-second timestamp tolerance.
- [ ] Configure receiver to return HTTP 500.
- [ ] Confirm dispatcher records attempt, retries with schedule, then promotes delivery to DLQ after configured exhaustion.
- [ ] Manually replay the event.
- [ ] Confirm replay uses the same `event_id`, creates a new `delivery_id`, and records a new attempt sequence.

### Build gate

- [ ] E2E: issue -> projection -> event -> mock receiver gets signed payload.
- [ ] E2E: receiver returns 500 -> delivery is retried then DLQ.
- [ ] E2E: manual replay creates a new delivery/attempt for the same event.
- [ ] Signer/verifier test vectors pass for one secret, multiple active secrets, stale timestamp, malformed header, and raw-body mismatch.

- [ ] Registry tests reject unknown event types and cover ledger-derived, config, operational, and delivery event families from `EVENT_CATALOG.md`.
- [ ] Payload-mode tests prove thin and snapshot rendering for `/v1/events/:id`, webhook delivery, replay, and endpoint `test_ping`.
- [ ] Subscription filter tests prove endpoints receive only selected event types and livemode/account scope.
- [ ] Replay abuse tests prove bounded range replay, per-customer rate limiting, and no unbounded endpoint fan-out.
- [ ] DLQ admin tests prove inspect/requeue/drop/replay preserve original `event_id` and write audit records.

### Verify gate

- [ ] `GET /v1/events` and `GET /v1/events/:id` return Canton-invisible `evt_*` objects with cursor pagination.
- [ ] `/v1/webhook_endpoints` create/list/retrieve/update/delete/enable/disable/rotate_secret behaves consistently with endpoint API version pinning.
- [ ] Dispatcher sends only persisted `event_log` events; it never creates ledger/resource events itself.
- [ ] `Pillar-Signature` header format is exact: `t=...,v1=hmac_sha256(...)` with no spaces and one `v1` per active signing secret.
- [ ] Manual replay semantics are explicit in code/tests/API docs: same event, new delivery, new attempts, automatic retry unaffected.
- [ ] `services/workflow-orchestrator` MVP leases outbox/time/state tasks and advances Daml choices via ledger-command without bypassing the operation/command identity rules.

- [ ] `P6.H08`, `P6.H09`, `P6.H13`, `P6.H16`, `P6.E20`, and `P6.E21` prove event type registry, search filters, version pins, and payload mode resolution match `EVENT_CATALOG.md`.
- [ ] `P6.H10`, `P6.H11`, `P6.H12`, `P6.E22`, and `P6.E23` prove endpoint health, diagnostics, disablement, list, test, and ping APIs match `API_MATRIX.md`.
- [ ] `P6.H14`, `P6.H19`, and `P6.H20` prove replay/DLQ/retention operations are bounded, audited, and do not mutate immutable events.

### Invariant gate

- [ ] Public API exposes no Canton contract-first fields.
- [ ] DB asset state is projection only.
- [ ] Projection is rebuildable.
- [ ] Webhook deliveries are signed and replayable.
- [ ] Deployment mode does not change `/v1` grammar.
- [ ] IC-06 is enforced by `P6.H08`, `P6.H09`, `P6.H18`, `P6.E20`, and `P6.E21`: event authority and rendering remain projected-state/config-event based, never dispatcher-invented business state.
- [ ] IC-07 is enforced by `P6.H15`, `P6.H16`, `P6.H17`, `P6.H19`, and `P6.H20`: signatures, versioning, rotation, retry/DLQ, replay, and retention stay durable and customer-verifiable.
