# 9. Ledger Sync / Indexer / Projection — Pillar Ledger Sync Layer

## Executive Summary

**Pillar Ledger Sync Layer**는 Canton Participant의 Ledger API를 구독해 **Canton ledger truth → Pillar projection → API event/webhook**으로 변환하는 핵심 런타임이다. Pillar DB는 원장을 대체하지 않는다. DB에는 **Projection / Audit / Config**만 저장하고, 경제적 진실은 항상 Canton ledger의 update stream과 ACS로부터 재구성 가능해야 한다.

공식 문서 리서치 기준으로, Stripe는 리소스 지향 REST API, 표준 HTTP semantics, JSON 응답, sandbox/live key 분리, idempotency key, API versioning, webhook retry·signature·event object를 API 운영의 기본 문법으로 삼는다. Pillar도 동일한 외부 경험을 제공하되, 내부는 Canton Ledger API의 `UpdateService`, `StateService`, command deduplication, Daml value decoding, participant/synchronizer boundary를 그대로 존중한다. Stripe 문서는 API가 resource-oriented REST이고, sandbox는 live data에 영향을 주지 않으며 API key가 sandbox/live mode를 결정한다고 설명한다. ([Stripe Docs][1])

Canton 쪽에서 가장 중요한 설계 제약은 다음이다. `UpdateService.GetUpdates`는 transaction, reassignment, topology event를 포함하는 update stream을 제공하고, stream은 strictly increasing ledger offset으로 인덱싱된다. 다만 virtual ledger가 여러 synchronizer를 걸칠 수 있고, strong causal guarantees는 단일 synchronizer 안에서만 제공된다. 따라서 Pillar는 **participant별·synchronizer별 watermarks**를 관리해야 하며, cross-synchronizer global ordering을 무리하게 가정하면 안 된다. ([Digital Asset Documentation][2])

ACS bootstrap은 `StateService.GetActiveContracts` 또는 paged variant로 현재 active contract snapshot을 받고, 반환된 `active_at_offset` 이후부터 update stream을 tailing하는 방식이 안전하다. Canton 문서도 ACS stream 완료 후 `active_at_offset`부터 updates를 stream하라고 명시하며, ACS가 ledger end를 반영한다고 가정하지 말라고 경고한다. ([Digital Asset Documentation][2])

Pillar의 최종 목표는 다음 한 줄로 정리된다.

> **External API는 Stripe처럼 보이고, internal runtime은 Canton-native이며, 모든 operation은 ledger-traceable한 asset/holding/balance projection으로 귀결된다.**

---

## Goals / Non-goals

### Goals

1. **Ledger truth 보존**

   * Canton ledger가 source of truth다.
   * Pillar DB의 balance, holding, transfer, intent, event는 전부 ledger update에서 파생된 projection이다.

2. **Stripe-grade external API**

   * `/v1/assets`, `/v1/wallets`, `/v1/holdings`, `/v1/balances`, `/v1/transfers`, `/v1/intents`, `/v1/events`, `/v1/webhook_endpoints`.
   * `Idempotency-Key`, version header, test/live mode, request log, event log, webhook retries, SDK, CLI, Workbench-style console을 기본 포함한다.
   * Stripe는 모든 `POST` 요청에 idempotency key를 지원하고, 같은 key에 대해 첫 요청의 status code와 body를 저장해 재시도 시 동일 결과를 반환한다. Pillar도 같은 문법을 채택한다. ([Stripe Docs][3])

3. **Balance/Holding-first projection**

   * 외부 고객에게 contract 중심이 아니라 `asset`, `wallet`, `holding`, `balance`, `transfer`, `intent` 중심으로 노출한다.
   * contract ID, template ID, synchronizer ID는 기본 API 응답에서 숨기고, audit/ops endpoint에서만 제한적으로 노출한다.

4. **Intent-first workflow**

   * API request는 “ledger transaction”이 아니라 `intent`를 만든다.
   * Intent는 Canton command submission으로 실행되고, 최종 상태는 ledger update observation으로 확정된다.

5. **Webhook-first async workflow**

   * `transfer.succeeded`, `holding.balance_updated`, `intent.requires_action`, `settlement.completed` 같은 event를 outbox에 기록하고 webhook으로 전달한다.
   * Stripe는 webhook event delivery가 비동기이고 event order를 보장하지 않는다고 문서화한다. Pillar도 webhook ordering guarantee를 전역으로 제공하지 않고, object-level sequence와 fetch-after-event 패턴을 제공한다. ([Stripe Docs][4])

6. **Replay/rebuild 가능한 projection**

   * ACS bootstrap과 update replay로 projection을 재구성할 수 있어야 한다.
   * pruning으로 과거 replay가 불가능하면 ACS 기반 rebuild를 수행한다.

7. **Multi-participant indexing**

   * participant별로 독립 checkpoint를 유지한다.
   * 동일 economic event가 여러 participant에서 관측될 수 있으므로 observation은 모두 보존하되, projection은 semantic deduplication으로 단일화한다.

8. **Failure-isolated transactional outbox**

   * projection commit과 API event/outbox insert는 동일 DB transaction에서 처리한다.
   * webhook 전송 실패는 ledger indexing을 막지 않는다.

### Non-goals

1. **Pillar DB를 ledger로 만들지 않는다**

   * DB balance는 authoritative balance가 아니라 ledger-derived cache다.

2. **Canton contract model을 외부 API 문법으로 노출하지 않는다**

   * 외부 API는 Canton-invisible하다.
   * 계약 구조는 internal runtime, audit, operator tooling에서만 사용한다.

3. **Webhook delivery를 exactly-once로 보장하지 않는다**

   * webhook은 at-least-once delivery다.
   * event idempotency는 소비자 책임이며, Pillar는 event ID, signature, retry metadata를 제공한다.

4. **Cross-synchronizer total order를 만들지 않는다**

   * Canton 문서상 causal guarantee는 synchronizer boundary를 가진다. Pillar는 global order가 필요한 projection에 대해 explicit barrier/watermark를 사용한다. ([Digital Asset Documentation][2])

---

## Architecture

### High-level topology

```text
                   ┌──────────────────────────────┐
                   │ Canton Participant(s)         │
                   │ - Ledger API gRPC             │
                   │ - StateService / UpdateService│
                   └──────────────┬───────────────┘
                                  │
                                  │ ACS + Updates
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ Pillar Ledger Sync Layer                                          │
│                                                                  │
│  1. ACS Bootstrapper                                              │
│  2. Canton Update Stream Consumer                                 │
│  3. Checkpoint Manager                                            │
│  4. Transaction Decoder                                           │
│  5. Event Normalizer                                              │
│  6. Projection Builder                                            │
│  7. Transactional Outbox                                          │
│  8. Replay / Rebuild Engine                                       │
│  9. Gap Detection                                                 │
│ 10. Poison Event Handler                                          │
│ 11. Projection Consistency Monitor                                │
│ 12. Multi-participant Index Coordinator                           │
└──────────────┬────────────────────────────┬─────────────────────┘
               │                            │
               ▼                            ▼
     ┌──────────────────┐          ┌────────────────────┐
     │ Pillar DB         │          │ Webhook Dispatcher │
     │ Projection/Audit/ │          │ retries/signature/ │
     │ Config only       │          │ endpoint state     │
     └─────────┬────────┘          └──────────┬─────────┘
               │                              │
               ▼                              ▼
      Stripe-like API                  Customer endpoints
```

---

### 1. Canton update stream consumer

**Responsibility:** participant별로 `UpdateService.GetUpdates` 또는 paged ingestion을 사용해 ledger updates를 수신한다.

Canton Ledger API의 `UpdateService`는 transactions, reassignments, topology events를 읽기 위한 서비스이고, `GetUpdates`는 virtual shared ledger의 comprehensive stream을 제공한다. update stream은 offset으로 인덱싱되며, 각 update는 하나의 synchronizer에 속한다. ([Digital Asset Documentation][2])

**Design:**

* Stream identity:

  * `environment`: `test` / `live`
  * `participant_id`
  * `party_scope`
  * `stream_kind`: `acs_delta`, `ledger_effects`, `topology`
  * `query_hash`: party/template/interface filter의 canonical hash
* Filter strategy:

  * Pillar-controlled parties만 구독한다.
  * Token/asset/holding 관련 template 또는 interface filter를 사용한다.
  * interface view가 필요한 경우 `include_interface_view`를 켠다.
* Event type handling:

  * `Transaction`
  * `Reassignment`
  * `TopologyTransaction`
  * `OffsetCheckpoint`
* Delivery model:

  * Ledger API stream은 network failure, participant restart, DB crash에 대비해 **at-least-once ingestion**으로 취급한다.
  * Exactly-once projection은 DB unique key와 checkpoint atomicity로 구현한다.

---

### 2. ACS bootstrap

**Responsibility:** indexer 최초 시작, checkpoint loss, pruning 이후 rebuild, disaster recovery 시 active contract snapshot에서 projection seed를 만든다.

Canton `StateService.GetActiveContracts`는 특정 ledger offset 기준 active contracts와 incomplete assignment state의 snapshot을 stream으로 반환한다. 문서상 ACS stream 완료 후에는 반환된 `active_at_offset`부터 updates를 stream해야 하며, ACS snapshot을 ledger end로 가정하면 안 된다. ([Digital Asset Documentation][2])

**Algorithm:**

```text
1. Create bootstrap_run with epoch_id.
2. Call GetActiveContracts / GetActiveContractsPage.
3. Use returned active_at_offset as bootstrap boundary.
4. Decode active contracts as synthetic normalized events:
   - source = ACS_BOOTSTRAP
   - event_kind = CONTRACT_ACTIVE_SEEN
   - emit_external_webhook = false
5. Build shadow projections for epoch_id.
6. Mark checkpoint.applied_offset = active_at_offset.
7. Start GetUpdates(begin_exclusive = active_at_offset).
8. Flip epoch to active after consistency check.
```

**Important rule:** ACS bootstrap must not emit customer webhooks by default. It is reconstruction, not new business activity.

---

### 3. Checkpoint manager

**Responsibility:** projection이 어느 offset까지 durably 반영되었는지 participant/stream별로 저장한다.

**Invariant:**

> `checkpoint.applied_offset`는 raw update, normalized event, projection mutation, API event, outbox insert가 모두 commit된 뒤에만 advance된다.

**Checkpoint dimensions:**

```text
tenant_id
environment
participant_id
stream_id
query_hash
synchronizer_id nullable
bootstrap_epoch
applied_offset
last_update_id
last_record_time
last_page_token
status
lease_owner
lease_fencing_token
heartbeat_at
```

**Locking:**

* indexer instance는 checkpoint row에 lease를 잡는다.
* lease에는 fencing token을 둔다.
* stale lease takeover는 가능하지만, old worker의 write는 fencing token mismatch로 거부한다.

---

### 4. Transaction decoder

**Responsibility:** Ledger API protobuf/Daml values를 Pillar internal typed event로 변환한다.

Canton transaction에는 `update_id`, `command_id`, `workflow_id`, events, offset, `synchronizer_id`, trace context, record time 등이 포함된다. 이 필드들은 Pillar의 ledger trace와 audit chain의 핵심이다. ([Digital Asset Documentation][2])

**Decoder inputs:**

* Ledger API transaction/update protobuf
* DAR package metadata
* generated bindings: Java/TypeScript/Scala as needed
* template ID / interface ID registry
* decoder version
* Pillar asset schema registry

**Decoder output:**

```json
{
  "participant_id": "ptp_live_...",
  "offset": "000000000000123456",
  "update_id": "upd_...",
  "synchronizer_id": "sync_...",
  "command_id": "cmd_...",
  "workflow_id": "wf_...",
  "record_time": "2026-05-26T03:12:00Z",
  "events": [
    {
      "node_id": 12,
      "kind": "created",
      "template_id": "Pillar.Asset:Holding",
      "contract_id_hash": "cth_...",
      "payload": {},
      "witness_parties": ["party::..."]
    }
  ]
}
```

**Numeric rule:** Daml `Value` encodes contract arguments and emitted values; Daml numeric values have fixed precision/scale constraints in the Ledger API reference, so Pillar must not decode asset amounts as floating point. Amounts should be stored as decimal strings plus asset-scale-normalized integer atoms where possible. ([Digital Asset Documentation][2])

---

### 5. Event normalizer

**Responsibility:** Canton-native events를 Pillar business events로 변환한다.

Raw Canton event:

```text
Created(Pillar.Asset.Holding)
Archived(Pillar.Asset.Holding)
Exercised(Pillar.Asset.Transfer_Accept)
Reassignment.Assigned
TopologyTransaction
```

Normalized Pillar event:

```text
asset.created
asset.updated
wallet.created
holding.opened
holding.closed
holding.balance_updated
balance.available_updated
transfer.created
transfer.pending
transfer.succeeded
transfer.failed
settlement.completed
ledger_operation.observed
participant_authorization.updated
```

**Dedup keys:**

```text
raw_event_key =
  participant_id + offset + update_id + node_id + event_kind

semantic_event_key =
  environment + object_type + object_id + transition + ledger_update_id

projection_key =
  environment + account_id + wallet_id + asset_id + balance_type
```

**Normalizer rule:** contract-level create/archive는 그대로 외부 event가 되지 않는다. 반드시 business semantic으로 승격되어야 한다.

---

### 6. Projection builder

**Responsibility:** normalized event를 API object state로 materialize한다.

Core projections:

| Projection          |                           Meaning | Source                          |
| ------------------- | --------------------------------: | ------------------------------- |
| `assets`            |        tokenized asset definition | asset template/interface        |
| `wallets`           | customer-facing holding container | wallet/account contracts        |
| `holdings`          |          asset ownership position | holding/movement contracts      |
| `balances`          |  available/pending/locked amounts | movement normalization          |
| `transfers`         |   user-visible transfer lifecycle | intent + ledger observation     |
| `intents`           |         requested operation state | API request + command lifecycle |
| `ledger_operations` |        traceable operation record | command/update/audit            |
| `api_events`        |          Stripe-like event object | projection transitions          |
| `outbox_deliveries` |            webhook delivery state | API event                       |

**Projection invariant examples:**

```text
holding.available >= 0
holding.pending >= 0
holding.locked >= 0
balance.total = available + pending + locked
transfer.status ∈ created|pending|processing|succeeded|failed|canceled
intent.status ∈ requires_confirmation|processing|succeeded|failed|expired
api_event.data.object reflects committed projection version
```

**Transaction model:**

```text
BEGIN;

insert raw_ledger_update ...
insert raw_ledger_event ...
insert normalized_ledger_event ...

apply projection mutations:
  upsert assets / wallets / holdings / balances / transfers / intents
  insert projection_entries
  insert ledger_operations

insert api_events
insert outbox_deliveries

update indexer_checkpoint.applied_offset = current_update.offset

COMMIT;
```

---

### 7. Transactional outbox

**Responsibility:** projection state transition을 webhook delivery와 분리하되, event creation은 projection commit과 원자적으로 묶는다.

Stripe webhook 문서는 endpoint가 JSON event object를 받으며, production public endpoint는 HTTPS를 요구하고, 복잡한 로직을 지연시키고 즉시 성공 응답을 반환할 것을 권장한다. 또한 live mode에서는 retry가 최대 3일 동안 수행되고 sandbox에서는 제한된 retry가 수행된다. ([Stripe Docs][4])

**Pillar design:**

* `api_events` row는 projection commit transaction 안에서 생성된다.
* `outbox_deliveries` row도 같은 transaction 안에서 생성된다.
* dispatcher는 committed outbox만 읽는다.
* delivery failure는 projection/checkpoint를 rollback하지 않는다.
* endpoint별 retry schedule:

  * immediate
  * 30s
  * 2m
  * 10m
  * 1h
  * 6h
  * 24h
  * up to configured max, default 3 days live-like
* signature:

  * `Pillar-Signature: t=<unix>,v1=<hmac>`
  * signing payload: `timestamp + "." + raw_body`
* event consumer contract:

  * at-least-once
  * unordered
  * fetch latest object state via API when needed

---

### 8. Replay / rebuild

**Modes:**

| Mode                     | Use case                                        | Source                          |
| ------------------------ | ----------------------------------------------- | ------------------------------- |
| `resume_from_checkpoint` | normal restart                                  | checkpoint offset               |
| `replay_range`           | bug fix / decoder reprocess                     | raw updates or Ledger API range |
| `full_replay`            | projection rebuild when unpruned history exists | Ledger API from earlier offset  |
| `acs_rebuild`            | pruning or checkpoint corruption                | ACS snapshot + updates          |
| `shadow_rebuild`         | safe production rebuild                         | new projection epoch            |
| `backfill_events`        | internal audit only                             | replayed normalized events      |

**Shadow rebuild protocol:**

```text
1. Create projection_epoch = new UUID.
2. Bootstrap ACS into shadow epoch.
3. Tail updates until shadow checkpoint catches active checkpoint.
4. Run consistency checks.
5. Pause active writer briefly or use compare-and-swap epoch switch.
6. Mark new epoch active.
7. Keep old epoch for rollback window.
```

**External event rule:** replay/rebuild does not emit external webhooks unless explicitly configured as `replay_delivery_mode=customer_backfill`, and that mode must tag events as replayed.

---

### 9. Gap detection

**Important nuance:** Canton offsets are strictly increasing, but the design must not assume numeric contiguity. Gap detection should detect **unexpected stream discontinuity**, not “offset + 1 missing.”

Detection mechanisms:

1. **Checkpoint continuity**

   * next stream request must use `begin_exclusive = checkpoint.applied_offset`.
   * if participant rejects the offset because of pruning, trigger ACS rebuild.

2. **Paged update token integrity**

   * `GetUpdatesPage` next page token must be used with same participant, same Canton version, same begin/end/update_format/descending parameters. Canton docs require subsequent page requests to preserve these properties. ([Digital Asset Documentation][2])

3. **Ledger end lag**

   * periodically call `GetLedgerEnd`.
   * compare `ledger_end - applied_offset` as lag metric, not as proof of missing events.

4. **Filtered stream caveat**

   * absence of an event at a given offset may be due to filter visibility.
   * only an unfiltered/admin stream or direct `GetUpdateByOffset` under the same visibility scope can support stronger diagnosis.

5. **Per-synchronizer watermarks**

   * maintain `last_offset`, `last_record_time`, `last_update_id` by `(participant_id, synchronizer_id)`.

---

### 10. Poison event handling

**Poison event definition:** an update that is valid on Canton but cannot be decoded, normalized, or projected by current Pillar code/config.

Examples:

* unknown template/interface after DAR upgrade
* decoder version mismatch
* invalid asset scale
* invariant violation such as negative balance
* unsupported reassignment state
* duplicate semantic event with conflicting payload
* corrupt raw payload in DB

**Default policy: stop-the-line for economic events.**

```text
if poison impacts assets/holdings/balances/transfers:
    rollback DB transaction
    insert poison_event using separate operator transaction
    mark checkpoint status = POISONED
    stop stream
else if poison is non-economic optional metadata:
    quarantine event
    continue only if policy allows
```

**Remediation:**

1. Load missing package metadata / generated bindings.
2. Deploy decoder fix.
3. Replay from poison offset.
4. If manual skip is unavoidable:

   * require signed operator waiver
   * record reason
   * record ledger trace
   * create compliance incident
   * never advance silently

---

### 11. Projection consistency monitor

**Responsibility:** Pillar projection이 Canton-visible state와 계속 일치하는지 검증한다.

Canton development tooling includes PQS, which maintains a PostgreSQL database synchronized with a validator’s ledger state and projects ledger events into SQL tables. PQS respects the same privacy boundaries as Ledger API. Pillar can use PQS as an independent consistency oracle, not as source of truth. ([Canton Network Docs][5])

**Checks:**

| Check                                |                    Frequency | Action                       |
| ------------------------------------ | ---------------------------: | ---------------------------- |
| ACS sample vs active contract index  |               every 5–15 min | mismatch → rebuild candidate |
| holding balance invariant            | every projection transaction | rollback on violation        |
| transfer lifecycle monotonicity      | every projection transaction | poison on invalid transition |
| outbox lag                           |                   continuous | alert                        |
| checkpoint heartbeat                 |                   continuous | failover                     |
| participant lag                      |                   continuous | autoscale / incident         |
| multi-participant duplicate conflict |                   continuous | semantic dedup audit         |
| webhook delivery failure rate        |                   continuous | endpoint quarantine          |
| raw payload hash chain               |                        daily | audit alarm                  |

---

### 12. Multi-participant indexing

**Problem:** Pillar may observe related ledger facts through multiple participants. Each participant has its own visibility, completion stream, pruning horizon, party hosting, and failure domain.

Canton command deduplication also has participant-local implications: the docs state that for deduplication to work as intended, submissions for the same ledger change must go through the same participant because duplicate determination depends on completion events visible to that participant. ([Canton Network Docs][6])

**Design:**

* One checkpoint stream per participant:

  * `participant_id = ptp_live_us_1`
  * `participant_id = ptp_live_eu_1`
  * `participant_id = ptp_sandbox_1`
* One observation table:

  * preserves every participant’s observed update.
* One semantic projection:

  * dedups by Pillar object identity and ledger trace.
* Command submission affinity:

  * each intent records `submission_participant_id`.
  * retries for the same intent use same participant unless operator failover protocol says otherwise.
* Multi-hosted party:

  * define authoritative participant policy per party:

    * `primary`
    * `active_standby`
    * `read_all_write_primary`
    * `sharded_by_asset`
* Cross-synchronizer:

  * no global causal assumption.
  * projection that depends on multiple synchronizers requires explicit reconciliation barrier.

---

### 13. Offset management

**Rules:**

1. `applied_offset` advances only after commit.
2. Resume uses `begin_exclusive = applied_offset`.
3. Bootstrap uses returned `active_at_offset`.
4. Pruning check runs before resume.
5. Paged ingestion stores `next_page_token`.
6. Offset is scoped by participant and stream filter.
7. `record_time` is not a substitute for offset.
8. `update_id` is not a substitute for checkpoint offset.
9. For multi-synchronizer projections, store both offset and synchronizer ID.
10. For replay, persist `replay_job_id`, `from_offset`, `to_offset`, `projection_epoch`.

Canton `GetUpdatesRequest` supports `begin_exclusive` and `end_inclusive`, and if no end is provided the stream does not terminate. Responses can contain transaction, reassignment, offset checkpoint, or topology transaction. ([Digital Asset Documentation][2])

---

## API / Object Model

### API grammar

Pillar external API should mirror Stripe’s operational grammar:

```http
POST /v1/transfers
Authorization: Bearer sk_test_...
Idempotency-Key: 8b5a6e3e-4c9d-4a90-bc4b-...
Pillar-Version: 2026-05-26.basil
Content-Type: application/json
```

Stripe’s current versioning docs describe monthly releases, version headers, and webhook endpoint version behavior. Pillar should adopt the same high-level pattern: request version is explicit, webhook endpoint version is pinned, and historical events keep their creation-time API version. ([Stripe Docs][7])

### Core API resources

| Object             | External ID | Purpose                                             |
| ------------------ | ----------- | --------------------------------------------------- |
| `asset`            | `ast_...`   | Canton-backed asset exposed in Stripe-like grammar  |
| `customer`         | `cus_...`   | API customer / account owner                        |
| `wallet`           | `wlt_...`   | holding container                                   |
| `holding`          | `hld_...`   | asset position in wallet                            |
| `balance`          | `bal_...`   | available / pending / locked amount                 |
| `transfer`         | `tr_...`    | movement lifecycle                                  |
| `intent`           | `int_...`   | requested operation before final ledger observation |
| `ledger_operation` | `lop_...`   | command/update trace                                |
| `event`            | `evt_...`   | immutable API event                                 |
| `webhook_endpoint` | `we_...`    | event destination                                   |
| `participant`      | `ptp_...`   | internal/ops participant config                     |

### Example: Balance object

```json
{
  "id": "bal_live_01HY...",
  "object": "balance",
  "asset": "ast_live_usdc_...",
  "wallet": "wlt_live_...",
  "available": "1250.00",
  "pending": "50.00",
  "locked": "0.00",
  "currency_exponent": 2,
  "livemode": true,
  "created": 1779753600,
  "updated": 1779753660,
  "ledger_operation": "lop_live_...",
  "metadata": {}
}
```

### Example: Event object

Stripe’s Event object includes fields such as `id`, `object`, `api_version`, `data`, and request/idempotency metadata where available. Pillar should use the same shape while adding a restricted `ledger` trace block. ([Stripe Docs][8])

```json
{
  "id": "evt_live_01HY...",
  "object": "event",
  "api_version": "2026-05-26.basil",
  "created": 1779753660,
  "livemode": true,
  "type": "holding.balance_updated",
  "data": {
    "object": {
      "id": "bal_live_01HY...",
      "object": "balance",
      "asset": "ast_live_usdc_...",
      "wallet": "wlt_live_...",
      "available": "1250.00",
      "pending": "50.00",
      "locked": "0.00"
    }
  },
  "request": {
    "id": "req_live_...",
    "idempotency_key": "8b5a6e3e-4c9d-4a90-bc4b-..."
  },
  "ledger": {
    "operation": "lop_live_...",
    "participant": "ptp_live_us_1",
    "synchronizer": "sync_...",
    "offset": "000000000000123456",
    "update": "upd_...",
    "workflow_id": "wf_..."
  }
}
```

### API endpoints

```text
/v1/assets
/v1/customers
/v1/wallets
/v1/holdings
/v1/balances
/v1/transfers
/v1/intents
/v1/events
/v1/ledger_operations
/v1/webhook_endpoints
/v1/sandbox/*
```

### SDK / CLI / Workbench / Sandbox

Stripe publishes official SDKs, follows SDK semantic versioning, and distinguishes API release-date versioning from SDK package versions. Pillar should do the same: SDK version controls client library compatibility; `Pillar-Version` controls API response semantics. ([Stripe Docs][9])

Stripe CLI supports sandbox work, API calls, webhook testing, and local forwarding. Pillar CLI should provide the same core primitives: `pillar login`, `pillar listen`, `pillar trigger`, `pillar events tail`, `pillar ledger trace`, `pillar sandbox reset`. ([Stripe Docs][10])

Stripe Workbench exposes request logs, events, webhook deliveries, event destinations, API explorer, and API version upgrade tooling. Pillar Workbench should include request logs, ledger operation trace, projection diff, poison queue, replay jobs, webhook deliveries, and version upgrade simulation. ([Stripe Docs][11])

Stripe sandboxes are isolated test environments that do not affect live activity. Pillar sandbox should be isolated at API key, DB, participant, ledger environment, webhook endpoint, and projection epoch levels. ([Stripe Docs][12])

---

## Internal Runtime

### Main ingestion loop

```pseudo
while service_is_healthy:
  stream = acquire_checkpoint_lease(participant_id, stream_id)

  if stream.needs_bootstrap:
      run_acs_bootstrap(stream)

  updates = canton.get_updates(
      begin_exclusive = stream.applied_offset,
      update_format = stream.update_format
  )

  for update in updates:
      process_update_transactionally(stream, update)
```

### Transactional processing

```pseudo
function process_update_transactionally(stream, update):
  begin db transaction

  assert stream lease fencing token is valid

  raw_id = insert_raw_ledger_update_if_absent(update)

  if already_projected(participant_id, update.offset):
      update_checkpoint_if_needed()
      commit
      return

  decoded = transaction_decoder.decode(update)
  normalized_events = event_normalizer.normalize(decoded)

  for event in normalized_events:
      projection_mutations = projection_builder.apply(event)
      api_events = api_event_builder.from_projection_transition(event)
      outbox_rows = outbox_builder.from_api_events(api_events)

      insert projection_entries
      upsert projections
      insert api_events
      insert outbox_deliveries

  update checkpoint.applied_offset = update.offset
  update checkpoint.last_update_id = update.update_id
  update checkpoint.last_record_time = update.record_time

  commit
```

### Idempotency bridge: API request → Canton command

Stripe idempotency stores the first result for a key and returns the same result on retries, while rejecting mismatched parameters for reused keys. Pillar should implement the same external behavior. Internally, an idempotent API request maps to a stable `intent_id` and stable Canton `command_id` for command retries. ([Stripe Docs][3])

```text
API Idempotency-Key
        ↓
Pillar request hash + intent_id
        ↓
Canton command_id / workflow_id
        ↓
Ledger update observation
        ↓
ledger_operation + projection + event
```

### Command submission lifecycle

```text
intent.created
intent.processing
ledger_operation.submitted
ledger_operation.accepted | ledger_operation.rejected | ledger_operation.unknown
update.observed
projection.applied
intent.succeeded | intent.failed
webhook emitted
```

Command deduplication must use the same participant for the same intended ledger change. The official command deduplication guide says change identity includes submitting parties, user ID, and command ID, and duplicate outcomes include `ALREADY_EXISTS` / `DUPLICATE_COMMAND` and `ABORTED` / `SUBMISSION_ALREADY_IN_FLIGHT`. ([Canton Network Docs][6])

---

## DB Schema

Below is the production-oriented logical schema. PostgreSQL is assumed. Amount columns use text or scale-normalized atoms to avoid floating point loss.

### 1. Indexer config and checkpoints

```sql
create table indexer_participants (
  id text primary key,                         -- ptp_live_us_1
  environment text not null,                  -- test | live
  canton_participant_uid text not null,
  ledger_api_endpoint text not null,
  auth_profile_id text not null,
  status text not null,                       -- active | disabled | draining
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table indexer_streams (
  id text primary key,
  participant_id text not null references indexer_participants(id),
  stream_kind text not null,                  -- acs_delta | ledger_effects | topology
  party_scope jsonb not null,
  update_format jsonb not null,
  query_hash text not null,
  status text not null,                       -- bootstrapping | active | paused | poisoned
  created_at timestamptz not null default now(),
  unique (participant_id, stream_kind, query_hash)
);

create table indexer_checkpoints (
  participant_id text not null,
  stream_id text not null references indexer_streams(id),
  projection_epoch uuid not null,
  applied_offset text,
  last_update_id text,
  last_synchronizer_id text,
  last_record_time timestamptz,
  page_token text,
  status text not null,                       -- active | paused | poisoned | rebuilding
  lease_owner text,
  lease_fencing_token bigint not null default 0,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (participant_id, stream_id)
);
```

### 2. Bootstrap / replay jobs

```sql
create table projection_epochs (
  id uuid primary key,
  environment text not null,
  status text not null,                       -- building | active | retired | failed
  source text not null,                       -- normal | acs_bootstrap | replay | restore
  started_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz
);

create table acs_bootstrap_runs (
  id uuid primary key,
  participant_id text not null,
  stream_id text not null,
  projection_epoch uuid not null references projection_epochs(id),
  active_at_offset text,
  status text not null,                       -- running | completed | failed
  contract_count bigint not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table replay_jobs (
  id uuid primary key,
  participant_id text not null,
  stream_id text not null,
  from_offset text,
  to_offset text,
  projection_epoch uuid not null,
  mode text not null,                         -- range | full | acs_rebuild | shadow
  emit_external_webhooks boolean not null default false,
  status text not null,                       -- queued | running | completed | failed
  created_by text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
```

### 3. Raw ledger audit

```sql
create table raw_ledger_updates (
  id bigserial primary key,
  environment text not null,
  participant_id text not null,
  stream_id text not null,
  offset text not null,
  update_id text,
  update_kind text not null,                  -- transaction | reassignment | topology | checkpoint
  synchronizer_id text,
  command_id text,
  workflow_id text,
  record_time timestamptz,
  effective_at timestamptz,
  trace_context jsonb,
  payload_hash text not null,
  payload_json jsonb not null,
  decoder_version text,
  received_at timestamptz not null default now(),
  unique (participant_id, stream_id, offset),
  unique (participant_id, update_id)
);

create table raw_ledger_events (
  id bigserial primary key,
  raw_update_id bigint not null references raw_ledger_updates(id),
  participant_id text not null,
  offset text not null,
  update_id text,
  node_id text,
  event_kind text not null,                   -- created | archived | exercised | assigned | unassigned
  template_id text,
  interface_id text,
  contract_id_hash text,
  witness_parties_hash text,
  payload_json jsonb,
  payload_hash text,
  created_at timestamptz not null default now(),
  unique (participant_id, offset, node_id, event_kind)
);
```

### 4. Normalized events and projection audit

```sql
create table normalized_ledger_events (
  id text primary key,                         -- nle_...
  raw_event_id bigint references raw_ledger_events(id),
  projection_epoch uuid not null,
  participant_id text not null,
  offset text not null,
  update_id text,
  synchronizer_id text,
  type text not null,                         -- holding.balance_updated
  object_type text not null,
  object_id text not null,
  semantic_key text not null,
  amount_decimal text,
  asset_id text,
  wallet_id text,
  account_id text,
  ledger_trace jsonb not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (projection_epoch, semantic_key)
);

create table projection_entries (
  id bigserial primary key,
  projection_epoch uuid not null,
  normalized_event_id text not null references normalized_ledger_events(id),
  object_type text not null,
  object_id text not null,
  mutation_type text not null,                -- insert | update | delete | no_op
  previous_version bigint,
  next_version bigint,
  diff jsonb not null,
  created_at timestamptz not null default now()
);
```

### 5. API projections

```sql
create table assets (
  id text primary key,                         -- ast_...
  projection_epoch uuid not null,
  livemode boolean not null,
  status text not null,                       -- active | paused | retired
  symbol text not null,
  name text not null,
  scale integer not null,
  metadata jsonb not null default '{}',
  ledger_trace jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table wallets (
  id text primary key,                         -- wlt_...
  projection_epoch uuid not null,
  livemode boolean not null,
  customer_id text not null,
  status text not null,                       -- active | frozen | closed
  metadata jsonb not null default '{}',
  ledger_trace jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table holdings (
  id text primary key,                         -- hld_...
  projection_epoch uuid not null,
  livemode boolean not null,
  wallet_id text not null,
  asset_id text not null,
  available_decimal text not null,
  pending_decimal text not null,
  locked_decimal text not null,
  available_atoms numeric(78,0),
  pending_atoms numeric(78,0),
  locked_atoms numeric(78,0),
  status text not null,                       -- active | closed
  ledger_trace jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (projection_epoch, wallet_id, asset_id)
);

create table balances (
  id text primary key,                         -- bal_...
  projection_epoch uuid not null,
  livemode boolean not null,
  wallet_id text not null,
  asset_id text not null,
  available_decimal text not null,
  pending_decimal text not null,
  locked_decimal text not null,
  total_decimal text not null,
  ledger_trace jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null,
  unique (projection_epoch, wallet_id, asset_id)
);

create table transfers (
  id text primary key,                         -- tr_...
  projection_epoch uuid not null,
  livemode boolean not null,
  source_wallet_id text not null,
  destination_wallet_id text not null,
  asset_id text not null,
  amount_decimal text not null,
  status text not null,
  intent_id text,
  ledger_operation_id text,
  failure_code text,
  failure_message text,
  ledger_trace jsonb,
  metadata jsonb not null default '{}',
  version bigint not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table intents (
  id text primary key,                         -- int_...
  livemode boolean not null,
  type text not null,                         -- transfer | issue | redeem | freeze | settle
  status text not null,
  request_id text,
  idempotency_key_hash text,
  command_id text,
  workflow_id text,
  submission_participant_id text,
  ledger_operation_id text,
  params_hash text not null,
  params jsonb not null,
  result_object_type text,
  result_object_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 6. Ledger operations and idempotency

```sql
create table ledger_operations (
  id text primary key,                         -- lop_...
  livemode boolean not null,
  intent_id text,
  operation_type text not null,
  status text not null,                       -- pending | submitted | observed | failed | unknown
  participant_id text,
  synchronizer_id text,
  command_id text,
  workflow_id text,
  update_id text,
  offset text,
  trace_context jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table idempotency_keys (
  id bigserial primary key,
  livemode boolean not null,
  account_id text not null,
  key_hash text not null,
  method text not null,
  path text not null,
  params_hash text not null,
  response_status integer,
  response_body jsonb,
  intent_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (livemode, account_id, key_hash)
);
```

### 7. API events and outbox

```sql
create table api_events (
  id text primary key,                         -- evt_...
  livemode boolean not null,
  api_version text not null,
  type text not null,
  object_type text not null,
  object_id text not null,
  object_version bigint,
  data jsonb not null,
  request_id text,
  idempotency_key_hash text,
  ledger_operation_id text,
  ledger_trace jsonb,
  created_at timestamptz not null default now()
);

create table webhook_endpoints (
  id text primary key,                         -- we_...
  livemode boolean not null,
  account_id text not null,
  url text not null,
  status text not null,                       -- enabled | disabled | quarantined
  api_version text not null,
  enabled_events text[] not null,
  secret_ciphertext bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table outbox_deliveries (
  id bigserial primary key,
  event_id text not null references api_events(id),
  endpoint_id text not null references webhook_endpoints(id),
  status text not null,                       -- pending | delivering | succeeded | failed | retrying
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_status_code integer,
  last_error text,
  response_body_hash text,
  created_at timestamptz not null default now(),
  unique (event_id, endpoint_id)
);
```

### 8. Poison events and consistency checks

```sql
create table poison_events (
  id bigserial primary key,
  environment text not null,
  participant_id text not null,
  stream_id text not null,
  offset text not null,
  update_id text,
  raw_update_id bigint references raw_ledger_updates(id),
  stage text not null,                        -- decode | normalize | project | outbox
  severity text not null,                     -- stop_line | quarantine | ignored
  reason_code text not null,
  reason_message text not null,
  decoder_version text,
  package_ref text,
  payload_hash text,
  status text not null,                       -- open | fixed | skipped | replayed
  operator_waiver_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table projection_consistency_checks (
  id bigserial primary key,
  projection_epoch uuid not null,
  check_type text not null,
  scope jsonb not null,
  status text not null,                       -- pass | fail | warning
  expected jsonb,
  actual jsonb,
  diff jsonb,
  created_at timestamptz not null default now()
);

create table participant_observations (
  id bigserial primary key,
  semantic_event_key text not null,
  participant_id text not null,
  stream_id text not null,
  offset text not null,
  update_id text,
  synchronizer_id text,
  observed_at timestamptz not null default now(),
  unique (semantic_event_key, participant_id, offset)
);
```

---

## Failure Modes

| Failure mode                                 | Detection                                        | Handling                                                                       |
| -------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Ledger API disconnect                        | stream error / heartbeat stale                   | reconnect with `begin_exclusive = checkpoint.applied_offset`                   |
| Participant restart                          | stream drops, health check failure               | same as disconnect; no checkpoint advance without commit                       |
| DB transaction failure                       | rollback                                         | retry bounded; no checkpoint advance                                           |
| Checkpoint advanced too early                | invariant/audit mismatch                         | impossible by design; if corruption found, rebuild from previous epoch         |
| ACS bootstrap interrupted                    | `acs_bootstrap_runs.status=running` stale        | discard partial epoch or resume with same epoch if safe                        |
| Pruned offset                                | participant rejects historical offset            | ACS rebuild; mark replay impossible from pruned range                          |
| Unknown Daml template                        | decoder failure                                  | poison event; load package/codegen; replay                                     |
| Contract payload schema drift                | decoder/version mismatch                         | poison event; deploy decoder migration                                         |
| Negative balance invariant                   | projection check fails                           | rollback; poison; stop stream                                                  |
| Duplicate event                              | unique key conflict                              | no-op if same hash; poison if conflicting payload                              |
| Multi-participant duplicate                  | semantic event already projected                 | insert observation; skip duplicate projection                                  |
| Cross-synchronizer ordering bug              | consistency monitor detects impossible lifecycle | rebuild with synchronizer-aware barrier                                        |
| Webhook endpoint down                        | delivery attempts fail                           | retry; endpoint quarantine after policy threshold                              |
| Webhook sent but customer missed it          | customer reports missing event                   | event replay/resend by event ID                                                |
| Outbox backlog                               | outbox lag SLO breach                            | scale dispatchers; prioritize live critical events                             |
| Idempotency key reused with different params | params hash mismatch                             | return conflict; do not submit ledger command                                  |
| Command submission unknown outcome           | timeout/no completion                            | retry with same command ID and same participant                                |
| Poison skip abuse                            | manual skip requested                            | require signed waiver and compliance incident                                  |
| Projection drift                             | ACS/PQS mismatch                                 | shadow rebuild and root cause analysis                                         |
| Clock skew                                   | timestamps inconsistent                          | use ledger offset/order for progression; system clock only for retries/receipt |
| Package upgrade mid-stream                   | decoder can no longer parse                      | package registry version pin; poison until upgraded                            |
| Webhook unordered delivery                   | customer observes later event first              | document unordered semantics; provide object fetch and per-object sequence     |

---

## Security / Compliance

### Ledger access security

The Canton application docs describe Ledger API as the primary interface for submitting commands and reading transactions, available through participant nodes, with TLS and token-based authentication used in production. Pillar indexers and command submitters must use scoped credentials, least-privilege party visibility, mTLS where available, and separate credentials for read/indexing vs command submission. ([Canton Network Docs][13])

### API security

* Secret API keys:

  * `sk_live_...`
  * `sk_test_...`
* Restricted keys:

  * read-only
  * webhook-admin
  * transfer-create-only
* Request signing for internal service calls.
* Strong request log retention.
* All idempotency keys are hashed at rest.
* Stripe advises idempotency keys should not include sensitive data; Pillar should enforce the same convention. ([Stripe Docs][3])

### Webhook security

Stripe documentation instructs webhook consumers to verify that events originate from Stripe. Pillar must provide equivalent signature verification and secret rotation. ([Stripe Docs][4])

Required controls:

```text
Pillar-Signature header
timestamp tolerance
HMAC SHA-256
endpoint secret rotation
replay protection
delivery attempt log
manual resend audit
endpoint quarantine
```

### Compliance posture

* Append-only raw ledger audit.
* Raw payload hash and projection diff hash.
* Ledger trace on every customer-visible object transition.
* Operator action audit for:

  * replay
  * rebuild
  * poison skip
  * webhook resend
  * endpoint secret rotation
  * participant failover
* PII separation:

  * customer metadata separated from ledger trace.
  * no raw contract payload in public API.
* Data minimization:

  * external API never returns contract ID by default.
  * contract ID hash can be used for internal correlation.

---

## Implementation Plan

### Phase 0 — Research validation and local harness

* Stand up Canton local dev environment.
* Use DPM for build/test/codegen/sandbox.
* Canton tooling docs state DPM is the primary CLI for initialization, dependency management, compilation, code generation, testing, and sandbox startup; Sandbox is lightweight single-node local testing, while LocalNet is for multi-validator integration testing. ([Canton Network Docs][5])
* Define Pillar Daml interfaces:

  * `Asset`
  * `Wallet`
  * `Holding`
  * `Movement`
  * `TransferIntent`
  * `Settlement`
* Generate Java/TypeScript bindings.
* Build minimal Ledger API client.

### Phase 1 — Single-participant indexer

* Implement `CantonUpdateClient`.
* Implement ACS bootstrap.
* Implement checkpoint manager with DB lease.
* Store raw updates and raw events.
* Decode known templates.
* Add stop-the-line poison handling.
* Test restart/resume semantics.

### Phase 2 — Projection builder

* Implement normalized event grammar.
* Build `assets`, `wallets`, `holdings`, `balances`, `transfers`, `intents`.
* Add projection entries.
* Add invariant checks.
* Add object versioning.

### Phase 3 — Transactional outbox and API events

* Implement `api_events`.
* Implement webhook endpoints.
* Implement delivery retries and HMAC signatures.
* Add event resend.
* Add webhook endpoint version pinning.
* Add dashboard delivery logs.

### Phase 4 — Stripe-grade API surface

* Add `Idempotency-Key`.
* Add `Pillar-Version`.
* Add test/live mode.
* Add request logs.
* Add SDKs:

  * TypeScript
  * Python
  * Java
  * Go
* Add CLI:

  * `pillar listen`
  * `pillar trigger`
  * `pillar events tail`
  * `pillar ledger trace`
  * `pillar replay`
* Add Workbench:

  * API logs
  * events
  * webhook deliveries
  * ledger operation trace
  * poison queue
  * projection diff

### Phase 5 — Replay/rebuild

* Implement replay jobs.
* Implement shadow projection epoch.
* Implement ACS rebuild.
* Implement no-webhook rebuild mode.
* Implement consistency monitor.
* Add pruning-aware recovery.

### Phase 6 — Multi-participant and multi-synchronizer

* Add participant registry.
* Add per-participant checkpoints.
* Add semantic dedup.
* Add participant observations.
* Add party hosting policy.
* Add synchronizer watermarks.
* Add duplicate/conflict alerting.

### Phase 7 — Production hardening

* SLOs:

  * indexer lag
  * projection latency
  * webhook delivery latency
  * poison event MTTR
  * rebuild duration
* Chaos tests:

  * participant restart
  * DB failover
  * network partition
  * webhook endpoint failure
  * package upgrade
  * pruning boundary
* Security review.
* Compliance audit report generation.
* Disaster recovery runbooks.

---

## Open Questions

1. **Canonical Daml model**

   * Which token/asset standard will Pillar adopt as canonical: Canton Network token standard, custom Pillar asset interfaces, or both?

2. **Asset scale**

   * Will every asset have fixed scale?
   * Are fractional holdings allowed for all assets?

3. **Participant authority**

   * For multi-hosted parties, which participant is authoritative for command submission and deduplication?

4. **Projection conflict policy**

   * If two participants observe semantically equivalent but payload-conflicting events, should Pillar stop all projections or quarantine only the duplicate source?

5. **Webhook ordering**

   * Do we offer per-object monotonic sequence?
   * Do we expose `object_version` as client replay cursor?

6. **Pruning policy**

   * What is the minimum retention needed to support customer replay, compliance audit, and projection rebuild?

7. **PQS role**

   * Is PQS an optional consistency oracle, an operator query tool, or part of mandatory production topology?

8. **Contract disclosure**

   * Do any customer flows require explicit contract disclosure, or can all user-facing flows remain fully Canton-invisible?

9. **Versioning cadence**

   * Should Pillar API versions be monthly like Stripe, or only when breaking changes occur?

10. **Sandbox fidelity**

* Should Pillar sandbox use Canton Sandbox for fast local tests and LocalNet for integration tests, or should every sandbox tenant map to a dedicated participant-backed environment?

---

## Agent-ready Checklist

### Ledger client

* [ ] Implement `CantonUpdateClient`.
* [ ] Implement `StateService.GetActiveContracts` bootstrap.
* [ ] Implement `UpdateService.GetUpdates` tailing.
* [ ] Implement paged ingestion mode.
* [ ] Persist participant ID, stream ID, update ID, offset, synchronizer ID.
* [ ] Support transaction, reassignment, topology transaction, offset checkpoint.

### Checkpointing

* [ ] Create `indexer_checkpoints`.
* [ ] Add lease and fencing token.
* [ ] Advance checkpoint only inside projection transaction.
* [ ] Resume with `begin_exclusive = applied_offset`.
* [ ] Add pruning detection.
* [ ] Add checkpoint corruption detector.

### Decoding

* [ ] Build package/template/interface registry.
* [ ] Add generated Daml binding integration.
* [ ] Decode created/archive/exercise events.
* [ ] Preserve trace context, command ID, workflow ID, record time.
* [ ] Hash contract IDs before storage.
* [ ] Add decoder versioning.

### Normalization

* [ ] Define Pillar event grammar.
* [ ] Map asset/wallet/holding/transfer templates to normalized events.
* [ ] Define semantic event key.
* [ ] Add duplicate detection.
* [ ] Add unknown template handling.

### Projection

* [ ] Implement assets projection.
* [ ] Implement wallets projection.
* [ ] Implement holdings projection.
* [ ] Implement balances projection.
* [ ] Implement transfers projection.
* [ ] Implement intents projection.
* [ ] Implement ledger operations.
* [ ] Add invariant checks.
* [ ] Add projection entries.

### Outbox / webhook

* [ ] Create `api_events`.
* [ ] Create `webhook_endpoints`.
* [ ] Create `outbox_deliveries`.
* [ ] Add webhook signature.
* [ ] Add retry schedule.
* [ ] Add delivery logs.
* [ ] Add event resend.
* [ ] Add endpoint quarantine.

### Replay / rebuild

* [ ] Create `projection_epochs`.
* [ ] Create `replay_jobs`.
* [ ] Implement shadow rebuild.
* [ ] Implement ACS rebuild.
* [ ] Disable customer webhooks during rebuild by default.
* [ ] Add replay from offset range.
* [ ] Add consistency check before epoch activation.

### Poison handling

* [ ] Create `poison_events`.
* [ ] Stop stream on economic poison event.
* [ ] Quarantine non-economic poison event by policy.
* [ ] Add operator remediation workflow.
* [ ] Add replay-from-poison-offset command.
* [ ] Require waiver for manual skip.

### Multi-participant

* [ ] Create participant registry.
* [ ] Run per-participant indexers.
* [ ] Store participant observations.
* [ ] Add semantic projection dedup.
* [ ] Add party-to-participant routing policy.
* [ ] Add synchronizer watermarks.
* [ ] Add conflict detector.

### API surface

* [ ] Implement `Idempotency-Key`.
* [ ] Implement `Pillar-Version`.
* [ ] Implement test/live mode.
* [ ] Implement `/v1/events`.
* [ ] Implement `/v1/ledger_operations`.
* [ ] Hide contract details by default.
* [ ] Add object expansion grammar.
* [ ] Add request logs.

### Developer platform

* [ ] TypeScript SDK.
* [ ] Python SDK.
* [ ] Java SDK.
* [ ] Go SDK.
* [ ] CLI: `listen`, `trigger`, `events tail`, `ledger trace`, `replay`.
* [ ] Workbench: logs, events, webhooks, poison queue, replay jobs.
* [ ] Sandbox environment isolation.
* [ ] Local Canton Sandbox and LocalNet test harness.

### Production readiness

* [ ] Indexer lag metrics.
* [ ] Outbox lag metrics.
* [ ] Poison event alerts.
* [ ] Projection drift alerts.
* [ ] Participant health checks.
* [ ] DB transaction retry policy.
* [ ] Disaster recovery runbook.
* [ ] Compliance audit export.
* [ ] Security review for API keys, Ledger API credentials, webhook secrets.
* [ ] Chaos test suite.

[1]: https://docs.stripe.com/api "docs.stripe.com"
[2]: https://docs.digitalasset.com/build/3.5/reference/lapi-proto-docs.html "gRPC Ledger API Reference — Digital Asset’s platform documentation"
[3]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[4]: https://docs.stripe.com/webhooks "docs.stripe.com"
[5]: https://docs.canton.network/appdev/tooling/development-tools-overview "Development Tools Overview - Canton Network Docs"
[6]: https://docs.canton.network/appdev/deep-dives/command-deduplication "Command Deduplication - Canton Network Docs"
[7]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[8]: https://docs.stripe.com/api/events/object "docs.stripe.com"
[9]: https://docs.stripe.com/sdks "docs.stripe.com"
[10]: https://docs.stripe.com/stripe-cli "docs.stripe.com"
[11]: https://docs.stripe.com/workbench/overview?locale=en-GB "docs.stripe.com"
[12]: https://docs.stripe.com/sandboxes "docs.stripe.com"
[13]: https://docs.canton.network/appdev/modules/m4-sdks-apis "SDKs and APIs - Canton Network Docs"
