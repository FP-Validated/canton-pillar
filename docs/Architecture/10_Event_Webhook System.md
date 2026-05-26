# 10. Event / Webhook System — Pillar 설계안

## Executive Summary

Pillar의 Event / Webhook 시스템은 **“Canton-backed asset workflow의 Stripe-grade async integration layer”**다. 외부 고객은 Canton, Daml contract, offset, transaction tree를 몰라도 된다. 고객이 보는 것은 `holding.updated`, `transfer.succeeded`, `settlement.failed` 같은 Stripe식 이벤트와 webhook delivery lifecycle이다. 내부적으로는 Canton Ledger API의 Update Service, Completion Service, Command deduplication, participant offset, workflow ID, command ID를 사용해 모든 이벤트를 ledger-traceable하게 만든다.

공식 문서 기준으로 Stripe는 Event object에 `id`, `object`, `api_version`, `created`, `data.object`, `data.previous_attributes`, `livemode`, `pending_webhooks`, `request.id`, `request.idempotency_key`, `type` 등을 제공하고, 이벤트 타입은 `resource.event` naming convention을 사용한다. Stripe webhook은 thin event와 snapshot event를 구분하며, HTTPS endpoint, Workbench, CLI local forwarding, HMAC-SHA256 signature, timestamp tolerance, 3일 자동 retry, manual resend, duplicate event handling, ordering-not-guaranteed 정책을 명확히 문서화한다. Pillar는 이 문법을 거의 그대로 채택하되, Canton ledger trace를 내부 audit field로 추가한다. ([Stripe Docs][1])

Canton/Daml 쪽에서는 Ledger API가 command submission, completion, Update Service stream, State Service active contract bootstrap, Event Query Service를 제공한다. Ledger는 updates의 sequence이며, transaction은 create/exercise/archive event tree다. Ledger API의 offset은 participant-node-specific이고, ordering은 synchronizer 단위로 causal하지만 synchronizer 간 global ordering을 보장하지 않는다. Pillar의 “ordering not guaranteed” 정책은 webhook delivery 현실뿐 아니라 Canton runtime의 멀티-synchronizer semantics와도 정합적이다. ([Digital Asset Documentation][2])

Canton Network Token Standard는 `Holding` view를 owner, instrumentId, amount, lock, metadata 중심으로 정의하고, 각 Holding contract를 개별 UTXO로 취급한다. Pillar의 외부 API는 contract-first가 아니라 **Balance/Holding-first**로 설계한다. 내부 contract lifecycle은 projection에 반영하되, 외부 event resource는 `holding`, `balance`, `transfer`, `allocation`, `settlement`, `intent`다. ([Canton Network Docs][3])

---

## Goals / Non-goals

### Goals

1. **Stripe-grade Event object**

   * 모든 이벤트는 `evt_...` ID, `object: "event"`, `type`, `created`, `livemode`, `api_version`, `request`, `data`, `pending_webhooks`를 가진다.
   * 이벤트는 immutable이다. 생성 후 payload shape은 endpoint API version에 묶인다.

2. **Canton-native source of truth**

   * Ledger-confirmed business event는 Canton Update Service 관측 후 생성한다.
   * Pillar DB는 projection, audit, config, delivery state만 저장한다.
   * ledger-relevant state를 DB에서 “진실”로 만들지 않는다.

3. **Webhook-first async workflow**

   * `POST /v1/transfers`는 intent를 생성하고 빠르게 반환한다.
   * 최종 결과는 `transfer.succeeded`, `transfer.failed`, `settlement.succeeded` webhook으로 전달한다.

4. **Thin-by-default, snapshot-available**

   * production 기본은 thin event.
   * audit, legacy integration, debugging에는 snapshot event를 허용한다.
   * thin event는 최신 object를 API로 fetch하게 한다.

5. **At-least-once delivery**

   * webhook, EventBridge, Kafka, Pub/Sub 모두 at-least-once semantics로 정의한다.
   * duplicate handling은 customer와 Pillar 양쪽에서 event ID 기반으로 수행한다.

6. **Replay / resend / DLQ**

   * event ID 기준 manual resend.
   * event ID range 기준 replay.
   * retry exhausted delivery는 DLQ에 적재한다.

7. **Deployment-model invariant API**

   * local sandbox, customer-managed Canton, hosted Canton, Canton Network deployment 모두 동일한 external API grammar를 유지한다.

### Non-goals

1. **Exactly-once webhook delivery**

   * Webhook은 exactly-once를 보장하지 않는다. Pillar는 at-least-once + idempotent consumer pattern을 제공한다.

2. **Global ordering guarantee**

   * Webhook delivery order, destination order, cross-resource order, cross-synchronizer order를 보장하지 않는다.

3. **Public Canton contract exposure**

   * 외부 API에는 Daml template ID, contract ID, participant offset을 기본 노출하지 않는다.
   * ledger trace는 admin/debug/audit context에서만 expand 가능하다.

4. **Webhook을 synchronous confirmation channel로 사용**

   * Webhook endpoint가 느리거나 실패해도 ledger operation은 rollback하지 않는다.

5. **Event payload 영구 보관**

   * external payload retrieval은 retention window를 둔다.
   * internal audit trace는 규제/운영 정책에 따라 별도 장기 보관한다.

---

## Architecture

### Logical Architecture

```text
External Client / SDK / CLI
        |
        v
Pillar API Gateway
  - Auth
  - Idempotency
  - API version pinning
  - Intent creation
        |
        v
Intent Orchestrator
  - transfer_intent
  - settlement_intent
  - allocation_intent
        |
        v
Canton Adapter
  - Command Service / JSON Ledger API
  - workflow_id / command_id mapping
  - Completion tracking
        |
        v
Canton Ledger
  - Source of truth
  - Daml execution
  - Update stream
        |
        v
Ledger Indexer
  - Update Service consumer
  - State Service bootstrap
  - offset checkpoint
        |
        v
Projection + Event Builder
  - holdings projection
  - balances projection
  - transfers projection
  - canonical Pillar event generation
        |
        v
Event Router
  - enabled_events matching
  - endpoint API version rendering
  - thin/snapshot renderer
        |
        v
Delivery Workers
  - Webhook HTTPS
  - Amazon EventBridge
  - Kafka
  - Google Pub/Sub
  - Retry / DLQ / manual resend / replay
        |
        v
Workbench + CLI + SDK
```

Stripe의 webhook 문서는 endpoint가 2xx를 빠르게 반환하고 복잡한 처리는 비동기 큐로 넘길 것을 권장하며, Event deliveries 화면과 CLI forwarding을 제공한다. Pillar도 동일하게 “수신 즉시 2xx, 내부 idempotent queue 처리”를 receiver best practice로 SDK와 docs에 내장한다. ([Stripe Docs][4])

### Runtime Principles

| Principle                                         | Pillar Decision                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Canton Ledger is source of truth                  | ledger-confirmed resource event는 Update Service 관측 후 생성                                |
| Pillar DB stores Projection / Audit / Config only | DB event log는 external integration/audit projection이며 ledger 대체 불가                     |
| Canton-invisible external API                     | public event에는 `holding`, `balance`, `transfer`, `settlement`, `intent`만 노출            |
| Canton-native internal runtime                    | `workflow_id`, `command_id`, `update_id`, participant offset, completion을 내부 trace에 저장 |
| Balance/Holding-first                             | Token Standard `Holding` view를 public `holding` / `balance`로 projection                |
| Intent-first                                      | API request는 `*_intent`를 만들고 ledger command로 비동기 진행                                    |
| Webhook-first                                     | 최종 상태 전이는 webhook/event destination으로 통지                                               |
| Ordering not guaranteed                           | event ID dedupe + latest resource fetch + versioned object state 사용                    |

---

## API / Object Model

### 1. Event Object 표준 필드

#### Public Event Object

```json
{
  "id": "evt_live_01JZ8K4J5S6Q9X2N8VZ7M8B9C1",
  "object": "event",
  "type": "holding.updated",
  "api_version": "2026-05-26",
  "created": 1782470400,
  "livemode": true,

  "account": "acct_01JZ8JY9B2R4K9P1M2N3Q4R5S6",
  "context": "org_01JZ8JX.../account/acct_01JZ8JY...",

  "source": "ledger",
  "event_payload": "thin",

  "data": {
    "related_object": {
      "id": "hld_01JZ8K3V2X8ZJ6P4M2N1Q9A7B6",
      "object": "holding",
      "url": "/v1/holdings/hld_01JZ8K3V2X8ZJ6P4M2N1Q9A7B6"
    }
  },

  "request": {
    "id": "req_01JZ8K2T1VQZ8N6P4B3C2D1E0F",
    "idempotency_key": "transfer-2026-05-26-000123"
  },

  "ledger_trace": {
    "id": "ldgrtr_01JZ8K4J5WQ6Z8N3P2M1B7C9D0",
    "expandable": true
  },

  "pending_webhooks": 3,
  "metadata": {}
}
```

#### Field Semantics

| Field                      |     Required | Description                                                        |
| -------------------------- | -----------: | ------------------------------------------------------------------ |
| `id`                       |          Yes | Event ID. Prefix: `evt_`. Globally unique, immutable.              |
| `object`                   |          Yes | Always `"event"`.                                                  |
| `type`                     |          Yes | `resource.event` naming convention. Example: `transfer.succeeded`. |
| `api_version`              |          Yes | Payload rendering version. Endpoint-pinned.                        |
| `created`                  |          Yes | Unix seconds, event 생성 시각.                                         |
| `livemode`                 |          Yes | `true` for live, `false` for test/sandbox.                         |
| `account`                  |          Yes | Event owner account. Connect-style platform 확장 가능.                 |
| `context`                  |     Optional | Organization/account/tenant context.                               |
| `source`                   |          Yes | `ledger`, `api`, `system`, `test`.                                 |
| `event_payload`            |          Yes | `thin` or `snapshot`.                                              |
| `data.related_object`      |         Thin | Thin event에서 대상 object reference.                                  |
| `data.object`              |     Snapshot | Snapshot event에서 versioned API object.                             |
| `data.previous_attributes` |     Snapshot | 변경 field subset.                                                   |
| `request.id`               |     Optional | API request ID.                                                    |
| `request.idempotency_key`  |     Optional | 원 요청 idempotency key.                                              |
| `ledger_trace.id`          | Ledger event | Public opaque ledger trace ID. Canton details는 expand/admin-only.  |
| `pending_webhooks`         |          Yes | 아직 성공 처리되지 않은 webhook delivery 수.                                  |
| `metadata`                 |     Optional | Customer-defined key-value metadata.                               |

Stripe의 Event object는 `data.object`, `data.previous_attributes`, `request.id`, `request.idempotency_key`, `pending_webhooks`, `api_version` 등을 포함한다. Pillar는 이를 그대로 계승하되, Canton traceability를 위해 `ledger_trace.id`를 public opaque handle로 추가한다. ([Stripe Docs][1])

---

### 2. `resource.event` Naming Convention

Stripe는 `resource.event` convention을 사용하며, subresource event는 parent resource event를 자동 발생시키지 않는다. Pillar도 동일 원칙을 채택한다. 예를 들어 `settlement.allocation.created`는 `settlement.updated`를 암시하지 않는다. ([Stripe Docs][5])

#### Naming Rules

```text
<resource>[.<subresource>].<event>
```

#### Rules

1. **lowercase + dot-separated**

   * Good: `transfer.succeeded`
   * Bad: `TransferSucceeded`, `transfer_success`

2. **resource는 public API object 기준**

   * Good: `holding.updated`
   * Bad: `daml_contract.archived`

3. **event는 past-tense state transition**

   * `created`, `updated`, `succeeded`, `failed`, `canceled`, `expired`, `reversed`, `settled`

4. **intent lifecycle은 별도 resource**

   * `transfer_intent.created`
   * `transfer_intent.submitted`
   * `transfer_intent.succeeded`
   * `transfer_intent.failed`

5. **ledger mechanics는 event type에 넣지 않음**

   * Bad: `contract.archived`
   * Good: `holding.decreased`, `holding.closed`, `transfer.succeeded`

#### Canonical Event Catalog v1

| Category          | Event Type                   | Meaning                                           |
| ----------------- | ---------------------------- | ------------------------------------------------- |
| Account           | `account.updated`            | Account config changed                            |
| Asset             | `asset.created`              | Asset registered/projected                        |
| Asset             | `asset.updated`              | Asset metadata changed                            |
| Balance           | `balance.updated`            | Available/locked/settled balance changed          |
| Holding           | `holding.created`            | New holding projected from ledger                 |
| Holding           | `holding.updated`            | Amount, lock, metadata, or lifecycle changed      |
| Holding           | `holding.closed`             | Holding no longer active                          |
| Transfer Intent   | `transfer_intent.created`    | Client intent accepted                            |
| Transfer Intent   | `transfer_intent.submitted`  | Canton command submitted                          |
| Transfer Intent   | `transfer_intent.succeeded`  | Ledger-confirmed transfer success                 |
| Transfer Intent   | `transfer_intent.failed`     | Failed before or on ledger                        |
| Transfer          | `transfer.created`           | Transfer object created                           |
| Transfer          | `transfer.pending`           | Waiting for counterparty, approval, or settlement |
| Transfer          | `transfer.succeeded`         | Final ledger-confirmed success                    |
| Transfer          | `transfer.failed`            | Terminal failure                                  |
| Transfer          | `transfer.canceled`          | Canceled before completion                        |
| Allocation        | `allocation.created`         | Assets reserved/locked                            |
| Allocation        | `allocation.released`        | Reservation released                              |
| Allocation        | `allocation.expired`         | Reservation expired                               |
| Settlement        | `settlement.created`         | Settlement workflow created                       |
| Settlement        | `settlement.pending`         | Awaiting allocations/instructions                 |
| Settlement        | `settlement.succeeded`       | Atomic ledger-confirmed settlement                |
| Settlement        | `settlement.failed`          | Terminal failure                                  |
| Webhook           | `webhook_endpoint.created`   | Endpoint created                                  |
| Webhook           | `webhook_endpoint.updated`   | Endpoint updated                                  |
| Webhook           | `webhook_endpoint.disabled`  | Endpoint disabled                                 |
| Event Destination | `event_destination.created`  | Cloud destination created                         |
| Event Destination | `event_destination.disabled` | Destination disabled                              |

---

### 3. Thin Event vs Snapshot Event

Stripe distinguishes thin events from snapshot events. Thin events are lightweight notifications that require fetching the current resource; snapshot events include a versioned API object snapshot and can include previous attributes. Stripe positions thin events as preferable when up-to-date object state, simpler versioning, and typed SDK behavior matter; snapshot events are useful for point-in-time audit/debug use cases. Pillar adopts the same model. ([Stripe Docs][6])

#### Pillar Policy

| Dimension      | Thin Event                       | Snapshot Event                            |
| -------------- | -------------------------------- | ----------------------------------------- |
| Default        | Yes                              | No                                        |
| Payload size   | Small                            | Larger                                    |
| `data` shape   | `related_object` reference       | `object` + optional `previous_attributes` |
| API versioning | Minimal version sensitivity      | Endpoint API-version rendered             |
| Freshness      | Client fetches latest resource   | Point-in-time snapshot                    |
| Best for       | Production workflows, typed SDKs | Audit, legacy consumers, debugging        |
| Risk           | Extra API GET needed             | May be stale by processing time           |

#### Thin Event Example

```json
{
  "id": "evt_test_01JZ8N...",
  "object": "event",
  "type": "transfer.succeeded",
  "api_version": "2026-05-26",
  "created": 1782470400,
  "livemode": false,
  "account": "acct_test_...",
  "event_payload": "thin",
  "data": {
    "related_object": {
      "id": "trf_01JZ8N...",
      "object": "transfer",
      "url": "/v1/transfers/trf_01JZ8N..."
    }
  },
  "request": {
    "id": "req_01JZ8N...",
    "idempotency_key": "client-transfer-42"
  },
  "ledger_trace": {
    "id": "ldgrtr_01JZ8N...",
    "expandable": true
  },
  "pending_webhooks": 1
}
```

#### Snapshot Event Example

```json
{
  "id": "evt_test_01JZ8N...",
  "object": "event",
  "type": "transfer.succeeded",
  "api_version": "2026-05-26",
  "created": 1782470400,
  "livemode": false,
  "account": "acct_test_...",
  "event_payload": "snapshot",
  "data": {
    "object": {
      "id": "trf_01JZ8N...",
      "object": "transfer",
      "status": "succeeded",
      "amount": "100.00",
      "asset": "asset_usdc",
      "source_holding": "hld_...",
      "destination_holding": "hld_...",
      "created": 1782470300,
      "updated": 1782470400
    },
    "previous_attributes": {
      "status": "pending"
    }
  },
  "request": {
    "id": "req_01JZ8N...",
    "idempotency_key": "client-transfer-42"
  },
  "ledger_trace": {
    "id": "ldgrtr_01JZ8N...",
    "expandable": true
  },
  "pending_webhooks": 1
}
```

---

### 4. Webhook Endpoint API

Stripe webhook endpoints are configured with URL, enabled event types, API version, event payload type, and signing secret; Stripe also limits event destinations and returns the signing secret only at creation/rotation style moments. Pillar follows the same ergonomics. ([Stripe Docs][4])

#### Endpoint Resource

```json
{
  "id": "whend_01JZ8P...",
  "object": "webhook_endpoint",
  "url": "https://example.com/pillar/webhooks",
  "description": "Production treasury webhook",
  "enabled_events": [
    "transfer.succeeded",
    "transfer.failed",
    "balance.updated"
  ],
  "api_version": "2026-05-26",
  "event_payload": "thin",
  "status": "enabled",
  "livemode": true,
  "created": 1782470400,
  "updated": 1782470400,
  "metadata": {
    "owner": "treasury-platform"
  }
}
```

#### Create Webhook Endpoint

```http
POST /v1/webhook_endpoints
Idempotency-Key: wh-create-prod-treasury-001
Pillar-Version: 2026-05-26
```

```json
{
  "url": "https://example.com/pillar/webhooks",
  "description": "Production treasury webhook",
  "enabled_events": [
    "transfer.succeeded",
    "transfer.failed",
    "balance.updated"
  ],
  "api_version": "2026-05-26",
  "event_payload": "thin",
  "metadata": {
    "owner": "treasury-platform"
  }
}
```

Response includes `secret` only once:

```json
{
  "id": "whend_01JZ8P...",
  "object": "webhook_endpoint",
  "url": "https://example.com/pillar/webhooks",
  "enabled_events": ["transfer.succeeded", "transfer.failed", "balance.updated"],
  "api_version": "2026-05-26",
  "event_payload": "thin",
  "status": "enabled",
  "livemode": true,
  "secret": "whsec_01JZ8P_THIS_IS_ONLY_RETURNED_ONCE",
  "created": 1782470400
}
```

#### API Surface

| Method   | Path                                      | Purpose                                   |
| -------- | ----------------------------------------- | ----------------------------------------- |
| `POST`   | `/v1/webhook_endpoints`                   | Create endpoint                           |
| `GET`    | `/v1/webhook_endpoints/:id`               | Retrieve endpoint                         |
| `GET`    | `/v1/webhook_endpoints`                   | List endpoints                            |
| `POST`   | `/v1/webhook_endpoints/:id`               | Update URL, events, description, metadata |
| `DELETE` | `/v1/webhook_endpoints/:id`               | Soft-delete endpoint                      |
| `POST`   | `/v1/webhook_endpoints/:id/enable`        | Enable endpoint                           |
| `POST`   | `/v1/webhook_endpoints/:id/disable`       | Disable endpoint                          |
| `POST`   | `/v1/webhook_endpoints/:id/rotate_secret` | Create new active signing secret          |
| `POST`   | `/v1/webhook_endpoints/:id/test`          | Send synthetic test event                 |
| `GET`    | `/v1/webhook_endpoints/:id/deliveries`    | List deliveries for endpoint              |

#### Endpoint Limits

* Default: **16 event destinations per account per mode**.
* Enterprise override: configurable with risk review.
* Endpoint URL must be HTTPS in live mode.
* Test/sandbox mode may allow `http://localhost`.

Stripe’s docs describe Workbench endpoint registration, HTTPS URL configuration, endpoint API version/event type selection, and a 16 event destination limit. Pillar mirrors this because it produces predictable integration ergonomics. ([Stripe Docs][4])

---

### 5. Webhook Delivery API

#### Delivery Object

```json
{
  "id": "wdlv_01JZ8Q...",
  "object": "webhook_delivery",
  "event": "evt_01JZ8K...",
  "endpoint": "whend_01JZ8P...",
  "destination": "edst_01JZ8P...",
  "status": "retrying",
  "attempt_count": 4,
  "next_attempt_at": 1782477600,
  "last_attempt_at": 1782474000,
  "manual": false,
  "resend_of": null,
  "created": 1782470400,
  "updated": 1782474000,

  "last_attempt": {
    "id": "watt_01JZ8Q...",
    "response_status": 500,
    "duration_ms": 842,
    "error_code": "endpoint_5xx",
    "response_body": "Internal Server Error"
  }
}
```

#### API Surface

| Method | Path                                | Purpose                            |
| ------ | ----------------------------------- | ---------------------------------- |
| `GET`  | `/v1/events/:id`                    | Retrieve event                     |
| `GET`  | `/v1/events`                        | List events                        |
| `GET`  | `/v1/webhook_deliveries`            | List deliveries                    |
| `GET`  | `/v1/webhook_deliveries/:id`        | Retrieve delivery                  |
| `POST` | `/v1/webhook_deliveries/:id/resend` | Manual resend specific delivery    |
| `POST` | `/v1/events/:id/resend`             | Resend event to matching endpoints |
| `POST` | `/v1/events/replay`                 | Replay event range                 |
| `GET`  | `/v1/webhook_dlq`                   | List DLQ entries                   |
| `POST` | `/v1/webhook_dlq/:id/replay`        | Replay DLQ entry                   |
| `POST` | `/v1/webhook_dlq/:id/ignore`        | Mark DLQ entry ignored             |

#### List Undelivered Events

Stripe documents a pattern for listing undelivered events using event type filters and delivery success filters, then marking events as processing/processed in an application DB. Pillar should provide a first-class version of this pattern. ([Stripe Docs][7])

```http
GET /v1/events?delivery_success=false&types[]=transfer.succeeded&created[gte]=1782400000
```

---

### 6. HMAC Signature

Stripe signs webhook payloads using a timestamped header, HMAC-SHA256 over `{timestamp}.{raw_payload}`, and endpoint-specific signing secret; docs emphasize using the raw body and constant-time comparison. Pillar adopts the same security model with a Pillar-specific header. ([Stripe Docs][4])

#### Header

```http
Pillar-Signature: t=1782470400,v1=9af4...,v1=3bc1...
Pillar-Event-Id: evt_01JZ8K...
Pillar-Delivery-Id: wdlv_01JZ8Q...
Pillar-Event-Type: transfer.succeeded
Pillar-API-Version: 2026-05-26
```

#### Signature Algorithm

```text
signed_payload = timestamp + "." + raw_request_body
signature = HMAC_SHA256(endpoint_signing_secret, signed_payload)
```

#### Verification Rules

1. Parse `Pillar-Signature`.
2. Extract `t` and all `v1` signatures.
3. Reject if `abs(now - t) > tolerance`.
4. Recompute HMAC-SHA256 over the **raw request body**.
5. Compare with active endpoint secrets using constant-time comparison.
6. Accept if any active `v1` signature matches.
7. Ignore unknown signature versions.
8. Never verify against parsed/re-serialized JSON.

#### Timestamp Tolerance

* Default tolerance: **300 seconds**.
* SDK default: 300 seconds.
* CLI local forwarding: configurable, default 300 seconds.
* Workbench test events: same default unless explicitly disabled in local-only mode.

#### Secret Rotation

* `POST /v1/webhook_endpoints/:id/rotate_secret`
* New secret becomes active immediately.
* Old secret remains valid for **up to 24 hours** by default.
* Delivery worker signs with all active secrets during grace period.
* Endpoint can revoke old secret early.

Stripe documents secret rolling with overlapping active secrets and recommends signature verification and IP allowlisting as additional controls. Pillar should implement both. ([Stripe Docs][4])

---

### 7. Retry Schedule

Stripe retries live-mode webhook deliveries for up to three days with exponential backoff, retries sandbox events fewer times, and manual resend does not cancel automatic retries. Pillar should use the same operator expectation but define its exact schedule. ([Stripe Docs][4])

#### Delivery Success

Only HTTP `2xx` is success.

| Response  | Pillar Treatment                                        |
| --------- | ------------------------------------------------------- |
| `2xx`     | Success                                                 |
| `3xx`     | Failure; no redirect following in live mode             |
| `400–499` | Failure; retry except explicit disabled endpoint cases  |
| `401/403` | Failure + security alert                                |
| `404`     | Failure + endpoint health warning                       |
| `410`     | Failure; optionally auto-disable after policy threshold |
| `429`     | Failure; retry with backoff                             |
| `500–599` | Failure; retry                                          |
| Timeout   | Failure; retry                                          |
| TLS error | Failure; retry + endpoint security warning              |

Stripe treats redirects as delivery failures and requires modern TLS for live endpoints; Pillar should do the same for deterministic security posture. ([Stripe Docs][4])

#### Live Retry Schedule

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

Policy:

* Max retry window: **72 hours**.
* Jitter: ±20%.
* Per-endpoint concurrency cap.
* Per-account delivery rate limit.
* Retry state is per `event_id + destination_id + delivery_generation`.
* Manual resend creates a separate delivery generation.

#### Sandbox Retry Schedule

```text
Attempt 1: immediately
Attempt 2: +30s
Attempt 3: +5m
Attempt 4: +30m
```

---

### 8. Manual Resend

#### Resend Event

```http
POST /v1/events/evt_01JZ8K.../resend
```

```json
{
  "endpoint": "whend_01JZ8P..."
}
```

#### Resend Delivery

```http
POST /v1/webhook_deliveries/wdlv_01JZ8Q.../resend
```

#### Semantics

* Resend **does not create a new event**.
* Resend creates a new `webhook_delivery` row.
* Same `event.id`, new `delivery.id`.
* Receiver must dedupe by `event.id`, not `delivery.id`.
* Manual resend does not stop automatic retry.
* Manual resend is allowed for events retained in the external event store.
* Internal audit may retain trace longer than external payload.

Stripe’s docs explicitly note manual resend via Dashboard/CLI and that manual resend does not stop automatic retries. Pillar should preserve that behavior to avoid surprising operators. ([Stripe Docs][4])

---

### 9. DLQ

#### DLQ Entry

```json
{
  "id": "dlq_01JZ8R...",
  "object": "webhook_dlq_entry",
  "event": "evt_01JZ8K...",
  "delivery": "wdlv_01JZ8Q...",
  "destination": "edst_01JZ8P...",
  "endpoint": "whend_01JZ8P...",
  "reason": "retry_window_exhausted",
  "status": "open",
  "first_failed_at": 1782470400,
  "dlq_at": 1782729600,
  "last_error": {
    "code": "endpoint_5xx",
    "message": "HTTP 500 from endpoint"
  }
}
```

#### DLQ Rules

* Delivery enters DLQ after retry window exhaustion.
* DLQ does not mutate the event.
* DLQ does not imply ledger failure.
* DLQ can be replayed, ignored, or exported.
* DLQ entry remains until operator action or retention expiry.
* DLQ replay creates a new delivery generation.

#### DLQ API

| Method | Path                         | Purpose             |
| ------ | ---------------------------- | ------------------- |
| `GET`  | `/v1/webhook_dlq`            | List DLQ entries    |
| `GET`  | `/v1/webhook_dlq/:id`        | Retrieve DLQ entry  |
| `POST` | `/v1/webhook_dlq/:id/replay` | Replay failed event |
| `POST` | `/v1/webhook_dlq/:id/ignore` | Mark ignored        |
| `POST` | `/v1/webhook_dlq/replay`     | Bulk replay         |

---

### 10. Replay from Event ID

#### Replay Request

```http
POST /v1/events/replay
```

```json
{
  "from_event": "evt_01JZ8000000000000000000000",
  "to_event": "evt_01JZ8ZZZZZZZZZZZZZZZZZZZZZ",
  "types": [
    "transfer.succeeded",
    "balance.updated"
  ],
  "destination": "edst_01JZ8P...",
  "dry_run": false
}
```

#### Replay Job Object

```json
{
  "id": "replay_01JZ8S...",
  "object": "event_replay",
  "status": "running",
  "from_event": "evt_01JZ800...",
  "to_event": "evt_01JZ8ZZ...",
  "destination": "edst_01JZ8P...",
  "matched_events": 1240,
  "created_deliveries": 1240,
  "created": 1782470400
}
```

#### Replay Semantics

* Replay emits existing events again.
* Event IDs are preserved.
* New delivery IDs are created.
* Replay order is best-effort by `(created, id)`.
* For ledger-derived event replay, internal tooling may use participant offset to reconstruct a range, but public API remains event-ID-based.
* Replay never writes to Canton Ledger.
* Replay never mutates projections.
* Replay may produce duplicates by design.

---

### 11. Duplicate Handling

Stripe documents duplicate event delivery and recommends using event IDs, and in some cases `data.object` ID plus event type, to detect duplicates. Pillar adopts this as mandatory integration guidance. ([Stripe Docs][4])

#### Customer-side Deduplication

Recommended table:

```sql
CREATE TABLE processed_pillar_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  object_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed'))
);
```

Receiver algorithm:

```text
1. Verify signature.
2. Insert event_id with status='processing'.
3. If conflict, return 200 immediately.
4. Fetch related object if thin event.
5. Process business logic idempotently.
6. Mark event_id as processed.
7. Return 2xx.
```

#### Pillar-side Deduplication

Pillar dedupes internally using:

```text
event.id
account_id + type + object_id + ledger_trace_id
destination_id + event_id + delivery_generation
ledger_update_id + ledger_event_id + event_type
request_id + idempotency_key_hash
```

---

### 12. Ordering Not Guaranteed Policy

#### Public Policy Text

> Pillar does not guarantee delivery ordering for events. Your endpoint may receive events out of order, more than once, or after later events for the same resource. Always deduplicate by `event.id`. For authoritative state, retrieve the latest resource from the Pillar API using `data.related_object.url`.

This matches Stripe’s explicit webhook ordering-not-guaranteed posture. ([Stripe Docs][4])

#### Why Pillar Must Not Promise Global Ordering

1. HTTPS webhook retries can reorder deliveries.
2. Manual resend can deliver old events after new events.
3. Multiple destinations can progress independently.
4. Kafka/Pub/Sub ordering is partition/key-scoped, not global.
5. Canton participant offset is participant-specific.
6. Canton ordering is causal per synchronizer, not globally total across synchronizers. ([Digital Asset Documentation][2])

#### Object Versioning for Consumers

Every mutable resource should include:

```json
{
  "id": "trf_...",
  "object": "transfer",
  "status": "succeeded",
  "version": 7,
  "updated": 1782470400
}
```

Receiver rule:

```text
Ignore resource snapshots with version <= last_processed_version for that object.
```

---

### 13. EventBridge / Kafka / Pub/Sub Destination

Stripe supports event destinations beyond HTTPS webhooks, including Amazon EventBridge and Azure Event Grid. Pillar generalizes this into `event_destinations`, where `webhook_endpoint` is one destination subtype. ([Stripe Docs][6])

#### Event Destination Object

```json
{
  "id": "edst_01JZ8T...",
  "object": "event_destination",
  "type": "amazon_eventbridge",
  "name": "Production AWS EventBridge",
  "enabled_events": [
    "transfer.succeeded",
    "settlement.succeeded",
    "balance.updated"
  ],
  "event_payload": "thin",
  "api_version": "2026-05-26",
  "status": "enabled",
  "livemode": true,
  "created": 1782470400,
  "metadata": {}
}
```

#### API Surface

| Method   | Path                                 | Purpose              |
| -------- | ------------------------------------ | -------------------- |
| `POST`   | `/v1/event_destinations`             | Create destination   |
| `GET`    | `/v1/event_destinations/:id`         | Retrieve destination |
| `GET`    | `/v1/event_destinations`             | List destinations    |
| `POST`   | `/v1/event_destinations/:id`         | Update destination   |
| `POST`   | `/v1/event_destinations/:id/enable`  | Enable               |
| `POST`   | `/v1/event_destinations/:id/disable` | Disable              |
| `POST`   | `/v1/event_destinations/:id/test`    | Send test event      |
| `DELETE` | `/v1/event_destinations/:id`         | Soft-delete          |

#### Amazon EventBridge

AWS EventBridge uses event buses to route events from sources to targets. For SaaS partner event sources, the partner creates the event source and the customer associates it with an event bus; events published before association can be dropped. Pillar should implement a handshake state machine to prevent silent customer misconfiguration. ([AWS Documentation][8])

```json
{
  "type": "amazon_eventbridge",
  "amazon_eventbridge": {
    "aws_account_id": "123456789012",
    "region": "us-east-1",
    "event_source_name": "aws.partner/pillar.com/acct_01JZ8JY...",
    "event_bus_arn": null,
    "status": "pending_customer_association"
  }
}
```

State machine:

```text
created
  -> pending_customer_association
  -> enabled
  -> disabled
  -> deleted
```

#### Kafka

Apache Kafka’s Producer API sends streams of data to topics, Consumer API reads streams from topics, and Connect can push data from Kafka into sink systems. Pillar’s Kafka destination should publish canonical Pillar events to customer topics with configurable keys. ([Kafka][9])

```json
{
  "type": "kafka",
  "kafka": {
    "bootstrap_servers": ["broker-1.example.com:9093"],
    "topic": "pillar.events",
    "auth": {
      "type": "sasl_scram_sha_512"
    },
    "tls": {
      "enabled": true
    },
    "partition_key": "resource_id",
    "acks": "all"
  }
}
```

Kafka delivery policy:

* Message key default: `account_id + ":" + related_object.id`.
* Ordering is only best-effort per Kafka partition key.
* Public Pillar contract remains **ordering not guaranteed**.
* Delivery ID is included in message headers.
* Event ID is included in key/value for dedupe.

#### Google Pub/Sub

Google Pub/Sub supports at-least-once delivery and optional ordering keys; messages with the same ordering key can be delivered in order when ordering is enabled, while messages with different keys are not expected to be ordered. Pillar should expose ordering key configuration but still keep public event ordering non-guaranteed. ([Google Cloud Documentation][10])

```json
{
  "type": "google_pubsub",
  "google_pubsub": {
    "project_id": "customer-prod",
    "topic": "pillar-events",
    "service_account": "pillar-publisher@customer-prod.iam.gserviceaccount.com",
    "ordering_key": "resource_id"
  }
}
```

Pub/Sub delivery policy:

* Attribute `pillar_event_id`.
* Attribute `pillar_event_type`.
* Attribute `pillar_account_id`.
* Optional ordering key: `account_id`, `resource_id`, or custom expression.
* DLQ remains Pillar-managed unless customer configures cloud-native dead-letter topics.

---

### 14. CLI Local Forwarding

Stripe CLI supports local event forwarding, including snapshot forwarding and thin-event forwarding. Pillar should provide equivalent commands from day one. ([Stripe Docs][4])

#### Commands

```bash
# Forward all snapshot events to local endpoint
pillar listen --forward-to localhost:4242/webhook

# Forward all thin events to local endpoint
pillar listen --forward-thin-to localhost:4242/webhook --thin-events "*"

# Forward selected events
pillar listen \
  --forward-to localhost:4242/webhook \
  --events transfer.succeeded,balance.updated

# Trigger synthetic test event
pillar trigger transfer.succeeded

# Trigger fixture with object override
pillar trigger holding.updated \
  --fixture fixtures/holding-updated.json

# Resend existing event
pillar events resend evt_01JZ8K... --webhook-endpoint whend_01JZ8P...

# Replay event range
pillar events replay \
  --from-event evt_01JZ800... \
  --to-event evt_01JZ8ZZ... \
  --destination edst_01JZ8P...

# Verify signature locally
pillar signatures verify \
  --secret whsec_... \
  --header "t=1782470400,v1=..." \
  --payload ./payload.json
```

#### CLI Listen Output

```text
> Ready. Your webhook signing secret is whsec_test_01JZ...
> Forwarding events to localhost:4242/webhook
> 2026-05-26T09:00:00Z transfer.succeeded [evt_test_...]
> 2026-05-26T09:00:01Z balance.updated [evt_test_...]
```

---

### 15. Webhook Testing

Stripe provides Workbench event deliveries, endpoint testing, and CLI-based local workflows. Pillar should implement the same surface as “Pillar Workbench.” ([Stripe Docs][4])

#### Test Modes

| Mode                 |       Ledger Write? | Use Case                                 |
| -------------------- | ------------------: | ---------------------------------------- |
| Synthetic test event |                  No | Endpoint wiring, signature verification  |
| Fixture event        |                  No | Contract testing specific event payloads |
| Sandbox ledger event |   Yes, sandbox only | End-to-end Canton/Daml behavior          |
| Replay test          | No new ledger write | Recovery drills                          |
| DLQ replay test      | No new ledger write | Operational recovery                     |

Daml/Canton sandbox can run a Canton ledger with Daml code; the current tooling uses `dpm sandbox`, can enable JSON API, and exposes endpoints such as `/v2/commands/submit-and-wait` for command submission. Pillar sandbox mode should bind CLI test flows to this environment. ([Digital Asset Documentation][11])

#### Workbench Features

* Endpoint create/update/delete.
* API version selector.
* Thin/snapshot selector.
* Event type catalog.
* Test event builder.
* Delivery log with request/response.
* Signature inspector.
* Manual resend button.
* Replay wizard.
* DLQ browser.
* Ledger trace expansion for authorized admins.
* Sandbox Canton trace viewer.

---

## Internal Runtime

### 1. Intent-first Flow

```text
Client
  -> POST /v1/transfers
  -> Pillar validates request
  -> Idempotency record created
  -> transfer_intent.created
  -> Canton command submitted
  -> transfer_intent.submitted
  -> Completion observed
  -> Update Service emits ledger update
  -> Projection updated
  -> transfer.succeeded / transfer.failed
  -> balance.updated / holding.updated
  -> webhook/event destination delivery
```

Stripe idempotency stores the first result for a key, supports safe retries of POST requests, recommends high-entropy keys, and rejects parameter mismatch on reuse. Pillar should adopt this pattern and extend retention for financial workflows. ([Stripe Docs][12])

### 2. Canton Command Mapping

Internal command metadata:

```json
{
  "workflow_id": "wf_transfer_trf_01JZ8N...",
  "command_id": "cmd_01JZ8N...",
  "user_id": "pillar-api",
  "act_as": ["party_customer_..."],
  "read_as": ["party_customer_..."],
  "submission_id": "sub_01JZ8N...",
  "request_id": "req_01JZ8N...",
  "idempotency_key_hash": "sha256:..."
}
```

Ledger API change IDs include act-as parties, user ID, and command ID, and command deduplication is performed by change ID within a deduplication period. Pillar should map API idempotency keys to command IDs deterministically per account and operation. ([Digital Asset Documentation][2])

### 3. Ledger Indexer

The Ledger Indexer consumes Canton Ledger API Update Service from the last checkpoint. The Update Service streams committed transactions and events; State Service can bootstrap active contracts as of an offset, enabling restart without reading from the beginning. ([Digital Asset Documentation][2])

Indexer responsibilities:

1. Read `ledger_projection_checkpoints`.
2. Subscribe to Update Service with correct party/template/interface filters.
3. Convert Canton create/exercise/archive events into Pillar domain deltas.
4. Update projections transactionally.
5. Create canonical Pillar events.
6. Store ledger trace.
7. Advance checkpoint only after projection + event creation commit.

### 4. Event Builder

Input:

```text
ledger update
+ transaction tree
+ command/workflow metadata
+ projection delta
+ API request correlation
```

Output:

```text
canonical event row
+ event payload render jobs
+ delivery rows for matching destinations
```

### 5. Projection Rules

| Ledger Signal                                  | Projection                     | Event                                     |
| ---------------------------------------------- | ------------------------------ | ----------------------------------------- |
| Holding created                                | `holdings` insert              | `holding.created`, `balance.updated`      |
| Holding amount changed via archive/create pair | `holdings` update/replace      | `holding.updated`, `balance.updated`      |
| Holding locked                                 | `holdings.lock_status` update  | `holding.updated`, `balance.updated`      |
| Transfer accepted/executed                     | `transfers.status=succeeded`   | `transfer.succeeded`                      |
| Allocation created                             | `allocations` insert           | `allocation.created`                      |
| Settlement executed                            | `settlements.status=succeeded` | `settlement.succeeded`, `balance.updated` |

### 6. Public vs Internal Ledger Trace

Public event:

```json
"ledger_trace": {
  "id": "ldgrtr_01JZ8K...",
  "expandable": true
}
```

Admin-expanded trace:

```json
{
  "id": "ldgrtr_01JZ8K...",
  "object": "ledger_trace",
  "participant_id": "participant-prod-1",
  "synchronizer_id": "sync-mainnet-1",
  "offset": "000000000000042931",
  "update_id": "1220...",
  "transaction_id": "tx_...",
  "workflow_id": "wf_transfer_trf_...",
  "command_id": "cmd_...",
  "ledger_time": "2026-05-26T09:00:00Z"
}
```

---

## DB Schema

Below is PostgreSQL-style schema. This is not ledger state. It is **Projection / Audit / Config / Delivery**.

### 1. Events

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,                         -- evt_...
  account_id TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,

  type TEXT NOT NULL,                          -- transfer.succeeded
  object_type TEXT,                            -- transfer
  object_id TEXT,                              -- trf_...
  related_object_type TEXT,
  related_object_id TEXT,

  api_version TEXT NOT NULL,
  source TEXT NOT NULL CHECK (
    source IN ('ledger', 'api', 'system', 'test')
  ),

  event_payload_default TEXT NOT NULL CHECK (
    event_payload_default IN ('thin', 'snapshot')
  ),

  request_id TEXT,
  idempotency_key_hash TEXT,

  data_thin JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_snapshot JSONB,
  previous_attributes JSONB,

  ledger_trace_id TEXT,
  pending_webhooks INTEGER NOT NULL DEFAULT 0,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (account_id, type, ledger_trace_id, related_object_id)
);

CREATE INDEX idx_events_account_created
  ON events (account_id, created_at DESC, id DESC);

CREATE INDEX idx_events_type_created
  ON events (type, created_at DESC);

CREATE INDEX idx_events_object
  ON events (object_type, object_id);

CREATE INDEX idx_events_delivery
  ON events (account_id, pending_webhooks)
  WHERE pending_webhooks > 0;
```

### 2. Ledger Trace

```sql
CREATE TABLE ledger_traces (
  id TEXT PRIMARY KEY,                         -- ldgrtr_...

  account_id TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,

  participant_id TEXT NOT NULL,
  synchronizer_id TEXT,

  offset TEXT NOT NULL,
  update_id TEXT NOT NULL,
  transaction_id TEXT,
  workflow_id TEXT,
  command_id TEXT,
  submission_id TEXT,
  completion_offset TEXT,

  ledger_time TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  template_ids TEXT[] NOT NULL DEFAULT '{}',
  interface_ids TEXT[] NOT NULL DEFAULT '{}',

  -- Contract IDs are sensitive Canton internals.
  -- Store encrypted or hashed; never expose by default.
  contract_id_hashes TEXT[] NOT NULL DEFAULT '{}',
  contract_ids_encrypted BYTEA,

  raw_trace JSONB NOT NULL DEFAULT '{}'::jsonb,

  UNIQUE (participant_id, offset, update_id)
);

CREATE INDEX idx_ledger_traces_workflow
  ON ledger_traces (workflow_id);

CREATE INDEX idx_ledger_traces_command
  ON ledger_traces (command_id);

CREATE INDEX idx_ledger_traces_observed
  ON ledger_traces (observed_at DESC);
```

### 3. Ledger Projection Checkpoints

```sql
CREATE TABLE ledger_projection_checkpoints (
  id TEXT PRIMARY KEY,

  participant_id TEXT NOT NULL,
  synchronizer_id TEXT,
  account_id TEXT,
  projection_name TEXT NOT NULL,               -- holdings, balances, events

  last_offset TEXT NOT NULL,
  last_update_id TEXT,
  last_observed_at TIMESTAMPTZ,

  status TEXT NOT NULL CHECK (
    status IN ('active', 'paused', 'rebuilding', 'failed')
  ),

  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (participant_id, synchronizer_id, projection_name, account_id)
);
```

### 4. Webhook Endpoints

```sql
CREATE TABLE webhook_endpoints (
  id TEXT PRIMARY KEY,                         -- whend_...

  account_id TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,

  url TEXT NOT NULL,
  description TEXT,

  enabled_events TEXT[] NOT NULL,
  api_version TEXT NOT NULL,
  event_payload TEXT NOT NULL CHECK (
    event_payload IN ('thin', 'snapshot')
  ),

  status TEXT NOT NULL CHECK (
    status IN ('enabled', 'disabled', 'deleted')
  ),

  failure_count INTEGER NOT NULL DEFAULT 0,
  last_delivery_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_endpoints_account
  ON webhook_endpoints (account_id, livemode, status);
```

### 5. Webhook Endpoint Secrets

```sql
CREATE TABLE webhook_endpoint_secrets (
  id TEXT PRIMARY KEY,                         -- whsecid_...
  endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id),

  secret_prefix TEXT NOT NULL,                 -- whsec_abc...
  secret_ciphertext BYTEA NOT NULL,            -- KMS encrypted
  secret_hash TEXT NOT NULL,                   -- for lookup/audit, not verification

  status TEXT NOT NULL CHECK (
    status IN ('active', 'expiring', 'expired', 'revoked')
  ),

  not_before TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_secrets_endpoint_active
  ON webhook_endpoint_secrets (endpoint_id, status);
```

### 6. Event Destinations

```sql
CREATE TABLE event_destinations (
  id TEXT PRIMARY KEY,                         -- edst_...

  account_id TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,

  type TEXT NOT NULL CHECK (
    type IN ('webhook_endpoint', 'amazon_eventbridge', 'kafka', 'google_pubsub')
  ),

  name TEXT NOT NULL,
  description TEXT,

  enabled_events TEXT[] NOT NULL,
  api_version TEXT NOT NULL,
  event_payload TEXT NOT NULL CHECK (
    event_payload IN ('thin', 'snapshot')
  ),

  status TEXT NOT NULL CHECK (
    status IN ('creating', 'pending_customer_action', 'enabled', 'disabled', 'deleted', 'failed')
  ),

  webhook_endpoint_id TEXT REFERENCES webhook_endpoints(id),

  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_secret_ref TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_event_destinations_account
  ON event_destinations (account_id, livemode, status);
```

### 7. Webhook Deliveries

```sql
CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,                         -- wdlv_...

  account_id TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,

  event_id TEXT NOT NULL REFERENCES events(id),
  destination_id TEXT NOT NULL REFERENCES event_destinations(id),
  endpoint_id TEXT REFERENCES webhook_endpoints(id),

  status TEXT NOT NULL CHECK (
    status IN (
      'queued',
      'delivering',
      'succeeded',
      'retrying',
      'failed',
      'dlq',
      'canceled'
    )
  ),

  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 14,

  next_attempt_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  succeeded_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  dlq_at TIMESTAMPTZ,

  manual BOOLEAN NOT NULL DEFAULT false,
  resend_of TEXT REFERENCES webhook_deliveries(id),
  delivery_generation INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (event_id, destination_id, delivery_generation)
);

CREATE INDEX idx_webhook_deliveries_due
  ON webhook_deliveries (status, next_attempt_at)
  WHERE status IN ('queued', 'retrying');

CREATE INDEX idx_webhook_deliveries_event
  ON webhook_deliveries (event_id);

CREATE INDEX idx_webhook_deliveries_endpoint
  ON webhook_deliveries (endpoint_id, created_at DESC);
```

### 8. Delivery Attempts

```sql
CREATE TABLE webhook_delivery_attempts (
  id TEXT PRIMARY KEY,                         -- watt_...

  delivery_id TEXT NOT NULL REFERENCES webhook_deliveries(id),
  attempt_no INTEGER NOT NULL,

  request_method TEXT NOT NULL DEFAULT 'POST',
  request_url_hash TEXT NOT NULL,
  request_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_body_sha256 TEXT NOT NULL,
  signature_timestamp BIGINT NOT NULL,

  response_status INTEGER,
  response_headers JSONB,
  response_body_truncated TEXT,

  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (delivery_id, attempt_no)
);

CREATE INDEX idx_webhook_attempts_delivery
  ON webhook_delivery_attempts (delivery_id, attempt_no DESC);
```

### 9. DLQ

```sql
CREATE TABLE webhook_dlq_entries (
  id TEXT PRIMARY KEY,                         -- dlq_...

  account_id TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,

  event_id TEXT NOT NULL REFERENCES events(id),
  delivery_id TEXT NOT NULL REFERENCES webhook_deliveries(id),
  destination_id TEXT NOT NULL REFERENCES event_destinations(id),

  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('open', 'replayed', 'ignored', 'expired')
  ),

  first_failed_at TIMESTAMPTZ NOT NULL,
  dlq_at TIMESTAMPTZ NOT NULL,
  last_error JSONB NOT NULL DEFAULT '{}'::jsonb,

  replayed_delivery_id TEXT REFERENCES webhook_deliveries(id),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_dlq_account_status
  ON webhook_dlq_entries (account_id, status, dlq_at DESC);
```

### 10. Replay Jobs

```sql
CREATE TABLE event_replay_jobs (
  id TEXT PRIMARY KEY,                         -- replay_...

  account_id TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,

  from_event_id TEXT,
  to_event_id TEXT,
  destination_id TEXT NOT NULL REFERENCES event_destinations(id),

  event_types TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')
  ),

  dry_run BOOLEAN NOT NULL DEFAULT false,

  matched_events INTEGER NOT NULL DEFAULT 0,
  created_deliveries INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,

  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE event_replay_job_items (
  id TEXT PRIMARY KEY,

  replay_job_id TEXT NOT NULL REFERENCES event_replay_jobs(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  delivery_id TEXT REFERENCES webhook_deliveries(id),

  status TEXT NOT NULL CHECK (
    status IN ('queued', 'created', 'failed', 'skipped')
  ),

  error_code TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (replay_job_id, event_id)
);
```

### 11. Idempotency

```sql
CREATE TABLE api_idempotency_keys (
  id TEXT PRIMARY KEY,

  account_id TEXT NOT NULL,
  livemode BOOLEAN NOT NULL,

  key_hash TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  params_hash TEXT NOT NULL,

  request_id TEXT NOT NULL,
  response_status INTEGER,
  response_body JSONB,

  locked_until TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (account_id, livemode, key_hash)
);
```

---

## Failure Modes

| Failure Mode                                       | Impact                          | Detection                            | Mitigation                                                 |
| -------------------------------------------------- | ------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| Webhook endpoint down                              | Delivery delayed                | 5xx/timeout attempts                 | Retry, DLQ, alert                                          |
| Receiver parses body before signature verification | Signature mismatch              | SDK/Workbench diagnostic             | Raw body verification docs and SDK                         |
| Duplicate delivery                                 | Double processing risk          | Same `event.id`                      | Customer dedupe table                                      |
| Out-of-order delivery                              | Stale state update              | Object `version` lower than current  | Fetch latest object; ignore stale versions                 |
| Manual resend during auto retry                    | Extra duplicate                 | Multiple delivery IDs for same event | Dedupe by event ID                                         |
| Ledger indexer lag                                 | Delayed events/projections      | Checkpoint lag metric                | Backpressure, catch-up workers                             |
| Projection corruption                              | Wrong API reads                 | Reconciliation job                   | Rebuild from State Service + Update stream                 |
| Endpoint secret leak                               | Forged event risk               | Secret audit, anomaly detection      | Rotate secret, revoke old secret                           |
| API version mismatch                               | Consumer parsing failure        | Delivery logs                        | Endpoint-pinned version, SDK version match                 |
| EventBridge not associated                         | Events dropped by provider path | Destination handshake status         | Do not enable until association confirmed                  |
| Kafka auth failure                                 | Publish failure                 | Producer errors                      | Retry, DLQ                                                 |
| Pub/Sub topic permission failure                   | Publish failure                 | IAM error                            | Retry, DLQ, Workbench warning                              |
| Canton command rejected                            | Intent fails                    | Completion Service / command error   | Emit `*_intent.failed`, no ledger-confirmed resource event |
| Multi-synchronizer ordering assumption             | Incorrect downstream sequence   | Consumer bug                         | Public no-ordering policy                                  |

---

## Security / Compliance

### Transport Security

* Live webhook endpoints require HTTPS.
* TLS 1.2+ required.
* HTTP allowed only for `localhost` and sandbox.
* Redirects are delivery failures.
* Endpoint URL validation blocks SSRF targets:

  * private RFC1918 ranges in live mode
  * link-local addresses
  * metadata service IPs
  * localhost except sandbox
  * non-HTTP(S) schemes

Stripe documents TLS requirements and redirect failures for webhooks; Pillar should make this non-negotiable in live mode. ([Stripe Docs][4])

### Signature Security

* HMAC-SHA256.
* Raw body required.
* Timestamp tolerance default 300 seconds.
* Constant-time compare.
* Multiple active secrets during rotation.
* SDK helpers for Node, Python, Java, Go.
* Workbench signature inspector.

### Access Control

* `webhook_endpoints.write` permission to create/update/delete endpoint.
* `webhook_endpoints.rotate_secret` permission to rotate secret.
* `events.read` permission to list events.
* `events.replay` permission to replay events.
* `ledger_traces.read` permission to expand ledger trace.
* `event_destinations.write` permission to create EventBridge/Kafka/PubSub destinations.

### Data Minimization

* Thin event default.
* No PII in event metadata by default.
* No contract IDs in public payload.
* Idempotency keys are hashed before storage.
* Secrets encrypted with KMS.
* Response bodies truncated in delivery attempts.
* Headers with credentials redacted.

### Auditability

Every operator action creates an audit row:

```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  ledger_trace_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Audit events:

* endpoint created/updated/deleted
* secret rotated/revoked
* event resent
* replay job created
* DLQ entry replayed/ignored
* event destination enabled/disabled
* ledger trace expanded

---

## Implementation Plan

### Phase 0 — Event Grammar and Compatibility Contract

Deliverables:

* Event type catalog v1.
* Event object JSON schema.
* Thin/snapshot schema.
* API version policy.
* Public ordering / duplicate / retry policy.
* SDK signature verification spec.

Exit criteria:

* `event.schema.json`
* `thin_event.schema.json`
* `snapshot_event.schema.json`
* `webhook_endpoint.schema.json`
* `webhook_delivery.schema.json`

### Phase 1 — Core Event Store + Webhook Endpoint API

Build:

* `events`
* `webhook_endpoints`
* `webhook_endpoint_secrets`
* `event_destinations`
* `webhook_deliveries`
* `webhook_delivery_attempts`
* create/list/update/delete endpoint API
* HMAC signer
* delivery worker MVP

Exit criteria:

* Create endpoint.
* Send test event.
* Verify signature with SDK.
* Delivery attempts visible in Workbench.

### Phase 2 — Canton Ledger Indexer

Build:

* Canton Update Service consumer.
* State Service bootstrap.
* offset checkpointing.
* ledger trace table.
* projection transaction boundary.
* event creation after projection commit.

Exit criteria:

* Sandbox ledger transfer produces `transfer.succeeded`.
* Holding update produces `holding.updated` and `balance.updated`.
* Indexer restart resumes from checkpoint.

### Phase 3 — Retry / DLQ / Manual Resend

Build:

* retry scheduler.
* exponential backoff + jitter.
* DLQ table/API.
* manual resend API.
* Workbench resend button.
* delivery attempt detail view.

Exit criteria:

* Failed endpoint enters retry.
* Exhausted delivery enters DLQ.
* Operator can replay DLQ.
* Manual resend creates new delivery, same event.

### Phase 4 — Thin Event SDKs

Build:

* Node/Python/Java/Go SDK event parser.
* Signature verification helpers.
* Typed thin event classes.
* `event.fetchRelatedObject()` helper.
* Deduplication examples.

Exit criteria:

* SDK can process `transfer.succeeded`.
* SDK can fetch latest `transfer`.
* SDK rejects invalid signatures.

### Phase 5 — CLI and Local Forwarding

Build:

* `pillar listen`
* `pillar trigger`
* `pillar events resend`
* `pillar events replay`
* `pillar signatures verify`
* local tunnel or forwarding service.

Exit criteria:

* Local developer can receive signed events from sandbox.
* Thin and snapshot forwarding both work.

### Phase 6 — EventBridge / Kafka / Pub/Sub

Build:

* `event_destinations` subtype configs.
* EventBridge partner source handshake.
* Kafka producer delivery worker.
* Pub/Sub publisher delivery worker.
* destination-specific DLQ/retry integration.

Exit criteria:

* AWS customer can associate EventBridge source.
* Kafka topic receives signed/canonical event payload.
* Pub/Sub topic receives event with attributes and optional ordering key.

### Phase 7 — Compliance Hardening and Load Testing

Build:

* retention policies.
* audit export.
* replay safety limits.
* rate limits.
* endpoint health score.
* destination backpressure controls.
* chaos tests.

Exit criteria:

* 72h retry soak test.
* 10M event replay dry run.
* ledger projection rebuild test.
* webhook duplicate/out-of-order integration test.

---

## Open Questions

1. **API-origin events**

   * Should `transfer_intent.created` be emitted before Canton submission, or only after command acceptance?
   * Recommendation: emit API-origin intent events with `source: "api"` and no ledger trace; emit resource state events only after ledger observation.

2. **Ledger trace visibility**

   * Should customers see `ledger_trace.id` only, or expanded Canton metadata?
   * Recommendation: public opaque ID by default; expanded trace only for admins with `ledger_traces.read`.

3. **Retention**

   * Stripe retrieval windows differ between event payload, delivery logs, and Workbench views. Pillar must define regulated retention separately from external API payload retention. ([Stripe Docs][6])
   * Recommendation: external full payload 90 days, delivery metadata 13 months, internal audit configurable 7 years.

4. **Endpoint cap**

   * Stripe-style cap is 16 event destinations.
   * Recommendation: 16 default, enterprise override.

5. **Snapshot payload size**

   * What maximum snapshot payload should be allowed?
   * Recommendation: 256 KB default, 1 MB enterprise max; larger objects require thin event.

6. **Multi-synchronizer keying**

   * Should replay order use event creation time, participant offset, or ledger time?
   * Recommendation: public replay by event ID/time; internal diagnostics can filter by participant/synchronizer.

7. **Cloud destination signing**

   * Should EventBridge/Kafka/PubSub messages also include HMAC?
   * Recommendation: yes. Put signature in event attributes/headers, not only HTTPS headers.

8. **Token Standard metadata namespace**

   * Pillar needs a stable metadata prefix for Canton Token Standard-compatible metadata.
   * Recommendation: `pillar.io/...` DNS-prefix style, aligned with Token Standard metadata conventions. ([Canton Network Docs][3])

---

## Agent-ready Checklist

### Event Grammar

* [ ] Define `resource.event` naming registry.
* [ ] Ban Daml template / contract names from public event type.
* [ ] Define event ID prefix `evt_`.
* [ ] Define event object JSON schema.
* [ ] Define thin event schema.
* [ ] Define snapshot event schema.
* [ ] Define `ledger_trace.id` public handle.
* [ ] Define event immutability rule.
* [ ] Define endpoint API-version rendering behavior.

### Webhook Endpoint API

* [ ] Implement `POST /v1/webhook_endpoints`.
* [ ] Implement `GET /v1/webhook_endpoints/:id`.
* [ ] Implement `GET /v1/webhook_endpoints`.
* [ ] Implement `POST /v1/webhook_endpoints/:id`.
* [ ] Implement `DELETE /v1/webhook_endpoints/:id`.
* [ ] Implement enable/disable.
* [ ] Implement secret rotation.
* [ ] Return signing secret only on create/rotation.
* [ ] Enforce HTTPS in live mode.
* [ ] Enforce endpoint cap.

### Delivery API

* [ ] Implement `webhook_deliveries`.
* [ ] Implement `webhook_delivery_attempts`.
* [ ] Implement delivery status machine.
* [ ] Implement retry scheduler.
* [ ] Implement 72h retry window.
* [ ] Implement sandbox retry window.
* [ ] Implement manual resend.
* [ ] Implement DLQ.
* [ ] Implement replay from event ID.
* [ ] Implement delivery log truncation/redaction.

### HMAC / Security

* [ ] Define `Pillar-Signature` header.
* [ ] Sign `timestamp.raw_body`.
* [ ] Use HMAC-SHA256.
* [ ] Implement 300s default tolerance.
* [ ] Use constant-time comparison.
* [ ] Support multiple active secrets.
* [ ] Add SDK verification helpers.
* [ ] Add Workbench signature inspector.
* [ ] Add IP allowlist option.
* [ ] Add SSRF-safe URL validation.

### Canton Runtime

* [ ] Map API request ID to workflow ID.
* [ ] Map idempotency key to command ID.
* [ ] Submit commands through Canton adapter.
* [ ] Track completions.
* [ ] Consume Update Service.
* [ ] Bootstrap with State Service.
* [ ] Store participant offset checkpoint.
* [ ] Store ledger trace.
* [ ] Generate resource events only after ledger observation.
* [ ] Rebuild projections from ledger source.

### Projection

* [ ] Implement holdings projection.
* [ ] Implement balances projection.
* [ ] Implement transfers projection.
* [ ] Implement allocations projection.
* [ ] Implement settlements projection.
* [ ] Emit `holding.*` events.
* [ ] Emit `balance.updated`.
* [ ] Emit `transfer.*`.
* [ ] Emit `settlement.*`.
* [ ] Add object `version` for stale update protection.

### Event Destinations

* [ ] Generalize destination object.
* [ ] Add `webhook_endpoint` subtype.
* [ ] Add Amazon EventBridge subtype.
* [ ] Add Kafka subtype.
* [ ] Add Google Pub/Sub subtype.
* [ ] Add destination test API.
* [ ] Add destination status machine.
* [ ] Add destination DLQ support.
* [ ] Include event ID in cloud headers/attributes.
* [ ] Include optional signature in cloud headers/attributes.

### CLI / Workbench / SDK

* [ ] `pillar listen --forward-to`.
* [ ] `pillar listen --forward-thin-to`.
* [ ] `pillar trigger`.
* [ ] `pillar events resend`.
* [ ] `pillar events replay`.
* [ ] `pillar signatures verify`.
* [ ] Workbench endpoint manager.
* [ ] Workbench event builder.
* [ ] Workbench delivery logs.
* [ ] Workbench DLQ browser.
* [ ] SDK typed event parser.
* [ ] SDK related-object fetch helper.
* [ ] SDK dedupe examples.

### Testing

* [ ] Unit test HMAC verification.
* [ ] Unit test timestamp tolerance.
* [ ] Unit test secret rotation overlap.
* [ ] Integration test duplicate delivery.
* [ ] Integration test out-of-order delivery.
* [ ] Integration test manual resend.
* [ ] Integration test DLQ replay.
* [ ] Integration test EventBridge handshake.
* [ ] Integration test Kafka publish failure.
* [ ] Integration test Pub/Sub publish failure.
* [ ] Canton sandbox E2E transfer test.
* [ ] Projection rebuild test.
* [ ] Replay range test.
* [ ] Load test 10M events.
* [ ] Chaos test endpoint 5xx/timeout/TLS failure.

### Documentation

* [ ] Publish webhook quickstart.
* [ ] Publish signature verification guide.
* [ ] Publish retry/DLQ policy.
* [ ] Publish duplicate handling guide.
* [ ] Publish ordering-not-guaranteed policy.
* [ ] Publish thin vs snapshot guide.
* [ ] Publish EventBridge setup guide.
* [ ] Publish Kafka setup guide.
* [ ] Publish Pub/Sub setup guide.
* [ ] Publish CLI local forwarding guide.
* [ ] Publish sandbox testing guide.
* [ ] Publish API versioning guide.
* [ ] Publish idempotency guide.

[1]: https://docs.stripe.com/api/events/object "docs.stripe.com"
[2]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[3]: https://docs.canton.network/overview/reference/cip-0056 "https://docs.canton.network/overview/reference/cip-0056"
[4]: https://docs.stripe.com/webhooks "docs.stripe.com"
[5]: https://docs.stripe.com/api/events/types "docs.stripe.com"
[6]: https://docs.stripe.com/event-destinations "docs.stripe.com"
[7]: https://docs.stripe.com/webhooks/process-undelivered-events "docs.stripe.com"
[8]: https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html "https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html"
[9]: https://kafka.apache.org/43/apis/ "https://kafka.apache.org/43/apis/"
[10]: https://docs.cloud.google.com/pubsub/docs/ordering "https://docs.cloud.google.com/pubsub/docs/ordering"
[11]: https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html "Sandbox — Digital Asset’s platform documentation"
[12]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
