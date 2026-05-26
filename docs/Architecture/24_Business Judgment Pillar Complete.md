# Executive Summary

## 냉정한 판정

**Pillar는 가능하다. 그러나 “Stripe for Canton-backed assets”라는 문장은 그대로 두면 위험하다.**
기술적으로는 **CIP-0056 token standard 기반의 Holding / Transfer / Allocation API façade**로 시작하면 실현 가능성이 있다. 사업적으로는 **Stripe처럼 광범위한 self-serve 개발자 시장을 전제로 하면 실패 확률이 높다.** Canton은 결제 카드망처럼 이미 대중화된 rails가 아니라, **기관 금융·토큰화·프라이버시·검증 가능한 워크플로우**에 특화된 비교적 초기 생태계다.

**최종 포지셔닝은 다음이어야 한다.**

> **Pillar = Canton-native assets를 위해 Stripe 수준의 API grammar, idempotency, webhook, SDK, sandbox, audit trace를 제공하는 비수탁형 intent/projection platform.**

핵심은 “Canton을 감춘다”가 아니라 **Canton의 복잡성을 API 사용자의 1차 경험에서 제거하되, ledger trace·party authorization·validator topology·package versioning은 내부적으로 절대 무시하지 않는 것**이다.

## 공식 문서 기반 리서치 요약

| 영역                                    | 확인 내용                                                                                                                                                                                                   | Pillar에 주는 의미                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Stripe API grammar**                | Stripe는 REST, predictable resource URL, JSON response, 표준 HTTP status/auth/verbs, sandbox와 live mode 분리를 API 경험의 기본값으로 둔다. ([Stripe 문서][1])                                                             | Pillar API도 `/v1/transfer_intents`, `/v1/holdings`, `/v1/events` 같은 resource grammar를 처음부터 고정해야 한다.                                        |
| **Stripe idempotency**                | Stripe는 `Idempotency-Key`로 POST 재시도를 안전하게 처리하며, 같은 key의 첫 결과를 저장한다. v1은 24시간 이후 pruning 가능, v2는 더 긴 replay 모델과 API/account/sandbox scope를 제공한다. ([Stripe 문서][2])                                        | Pillar는 `Idempotency-Key → deterministic command_id / workflow_id / intent_id`로 연결해야 한다. 단순 HTTP retry 방지가 아니라 ledger command 중복 방지가 핵심이다. |
| **Stripe webhook**                    | Stripe는 webhook ordering을 보장하지 않으며, duplicate event 처리를 event ID 기반으로 권장한다. 이벤트 객체는 생성 시점의 API version에 묶인다. ([Stripe 문서][3])                                                                           | Pillar webhooks도 **out-of-order / duplicate를 정상 조건**으로 설계해야 한다. Client는 object fetch로 최종 상태를 읽어야 한다.                                       |
| **Stripe API versioning / Workbench** | Stripe는 Workbench에서 API version upgrade를 테스트하고, request별 `Stripe-Version` override와 rollback window를 제공한다. ([Stripe 문서][4])                                                                             | Pillar도 account-level API version, request override, webhook endpoint version lock, breaking-change simulator가 필요하다.                       |
| **Stripe SDK / CLI**                  | Stripe는 공식 server SDK, mobile/web SDK, CLI의 `listen`, `trigger`, sandbox webhook 테스트, request log tailing을 제공한다. ([Stripe 문서][5])                                                                       | Pillar가 Stripe-grade를 주장하려면 API 문서만으로는 부족하다. **SDK + CLI + sandbox event trigger + Workbench**가 제품의 일부여야 한다.                               |
| **Canton architecture**               | Canton은 validators가 hosted parties의 데이터만 저장하고, synchronizer는 ordering을 조정하지만 transaction content/state를 저장하지 않는다. Canton에는 Ethereum식 global state가 없고, query는 party-scoped다. ([Canton Network Docs][6]) | Pillar는 “global balance API”를 약속하면 안 된다. Pillar가 볼 수 있는 party·observer 권한 범위 안의 balances만 제공 가능하다.                                         |
| **Ledger API**                        | gRPC Ledger API는 command submission, completion, update, state service를 제공한다. command submission은 실행 완료가 아니라 접수/거절만 의미하며, completion과 update stream을 별도로 처리해야 한다. ([Digital Asset][7])                  | Pillar runtime은 무조건 async state machine이어야 한다. “POST transfer = 즉시 완료” 모델은 틀렸다.                                                            |
| **Command deduplication**             | Ledger API command deduplication은 change ID, 즉 `act_as`, `user_id`, `command_id` 기반이며, 같은 Participant Node에 제출될 때 보장된다. ([Digital Asset][7])                                                            | Pillar idempotency는 HTTP 계층뿐 아니라 participant-specific command deduplication까지 설계해야 한다.                                                     |
| **Offsets / projection**              | Update stream은 offset 기반으로 resume되지만, offset은 원래 participant에서만 의미가 있고, synchronizer 간 ordering은 단순 global order로 볼 수 없다. ([Digital Asset][7])                                                          | Pillar DB projection은 participant-scoped offset과 object-level reducer를 써야 한다. Cross-participant offset 비교는 금지다.                            |
| **JSON Ledger API**                   | Canton 3.x JSON Ledger API는 HTTP/JSON 대안이지만 production에서 Internet에 직접 노출하지 말고 reverse proxy 뒤에 둬야 하며, 각 request는 JWT를 요구한다. ([Digital Asset][8])                                                        | Pillar는 Digital Asset JSON Ledger API를 그대로 외부 API로 노출하면 안 된다. Pillar API가 façade 역할을 해야 한다.                                                |
| **CIP-0056 Token Standard**           | CIP-0056은 Token Metadata, Holding, Transfer Instruction, Allocation 등을 표준화한다. Holding은 UTXO형 단일 보유 단위이고, Transfer/Allocation은 pending/completed/failed workflow를 가진다. ([Canton Network Docs][9])        | Pillar MVP는 임의 Daml template이 아니라 **CIP-0056 Holding / Transfer / Allocation first**여야 한다.                                                 |
| **Daml packages / upgrades**          | DAR는 package code와 dependencies를 담고, package version co-existence, package selection, vetting, explicit upgrade가 중요하다. Ledger는 기존 contract를 자동 migration하지 않는다. ([Digital Asset][10])                   | Pillar가 자체 Daml template을 많이 만들수록 장기 유지보수 리스크가 폭증한다.                                                                                       |
| **DPM / Sandbox / tooling**           | DPM은 SDK components 실행용 CLI이고 Daml Assistant 대체로 이동 중이다. Sandbox는 단일 Participant + Synchronizer의 Canton ledger를 실행한다. ([Digital Asset][11])                                                             | Pillar dev experience는 `pillar sandbox`, `pillar trigger`, `pillar listen`, `pillar replay` 수준으로 만들어야 한다.                                  |
| **PQS**                               | PQS는 participant ledger data를 PostgreSQL로 export해 query/debug/reporting에 쓰는 long-running process다. ([Digital Asset][12])                                                                                | Pillar projection engine은 PQS를 활용할 수 있지만, Pillar의 canonical business state는 여전히 Canton Ledger에서 재구성 가능해야 한다.                               |
| **Canton ecosystem / demand**         | Canton 생태계는 DTCC U.S. Treasury tokenization, JPMD on Canton, USDC xReserve, Broadridge DLR, 여러 금융기관 참여를 내세운다. ([Digital Asset][13])                                                                     | 수요는 있다. 그러나 self-serve SaaS 수요라기보다 기관 integration 수요다. Go-to-market은 Stripe보다 enterprise infra에 가깝다.                                       |
| **Grant / fund**                      | Canton Foundation Protocol Development Fund는 developer tools, SDKs, security, audits, reference implementations, critical infrastructure 등을 지원 대상으로 명시한다. ([Canton Foundation][14])                     | Pillar는 open-source projection/webhook/idempotency reference implementation을 grant 후보로 만들 수 있다. 단, grant는 사업모델이 아니다.                       |

## Feasibility Scorecard

| 항목                     |                                                                                              냉정한 평가 | 판정                       |
| ---------------------- | --------------------------------------------------------------------------------------------------: | ------------------------ |
| Canton 생태계 수요          |                                    기관 토큰화·결제·담보·repo 쪽 신호는 강하다. 하지만 developer self-serve 시장은 아직 작다. | **Medium+**              |
| Stripe analogy         |                             API grammar, idempotency, webhooks, SDK/CLI는 유효. Business analogy는 약하다. | **Useful but dangerous** |
| 기관 도입 가능성              |                                  self-host / BYO validator / 비수탁 / audit-first이면 가능. SaaS-only면 낮다. | **Conditional**          |
| 개발 난이도                 |                                API façade가 아니라 ledger-runtime + projection + compliance-grade ops다. | **High**                 |
| 보안/규제 리스크              |                                                  signing/custody를 잡는 순간 급상승. non-custodial이면 통제 가능. | **High**                 |
| Daml template 유지보수     |                                              자체 template을 많이 만들수록 죽는다. CIP-0056 interface 중심이어야 한다. | **High if custom**       |
| Projection consistency |                                                                    Pillar의 핵심 난제. 실패하면 제품 전체 신뢰 상실. | **Critical**             |
| Canton dependency      |                                                     ecosystem/API/package/version/topology 의존도가 크다. | **High**                 |
| 경쟁 가능성                 | Digital Asset tooling, wallets, NaaS/custody, Noves, explorer/data providers가 경쟁축이다. ([Canton][15]) | **Real**                 |
| 수익 모델                  |                   enterprise license + support + usage + self-host가 현실적. Pure transaction fee는 약하다. | **Viable if enterprise** |
| grant 가능성              |                                developer tools / reference implementation / SDK / security면 가능성 있다. | **Medium**               |

---

# Goals / Non-goals

## Goals

1. **Canton Ledger를 source of truth로 유지한다.**
   Pillar DB는 balance의 원장도, transfer의 원장도 아니다. DB는 projection, audit, config, delivery state만 저장한다.

2. **External API는 Canton-invisible이어야 한다.**
   사용자는 contract ID, template ID, command submission, completion stream, participant offset을 몰라도 `transfer_intent`와 `holding`을 다룰 수 있어야 한다.

3. **Internal runtime은 Canton-native여야 한다.**
   Ledger API의 command submission, completion, update stream, ACS snapshot, party/user authorization, package versioning을 정면으로 처리한다.

4. **Balance/Holding-first로 설계한다.**
   Canton/Daml은 contract-first지만, 제품 경험은 `balance`, `holding`, `transfer_intent`, `allocation_intent` 중심이어야 한다. CIP-0056의 Holding/Transfer/Allocation model과 정렬한다. ([Canton Network Docs][9])

5. **Intent-first로 설계한다.**
   API caller는 “이 자산을 이 party에게 보내라”는 의도를 만든다. Pillar는 그 intent를 Canton command, pending instruction, completion, projection update, webhook event로 전개한다.

6. **Webhook-first async workflow를 기본값으로 둔다.**
   Canton Ledger API 자체가 asynchronous이고, Stripe webhook도 ordering을 보장하지 않는다. Pillar도 “submit 후 poll/webhook” 모델을 정직하게 채택해야 한다. ([Digital Asset][7])

7. **API grammar는 day one부터 Stripe-grade로 고정한다.**
   작은 MVP라도 object naming, error shape, idempotency behavior, API versioning, webhook signing, sandbox/live mode 분리는 처음부터 필요하다.

8. **Deployment model은 바뀌어도 API 경험은 같아야 한다.**
   SaaS, customer-hosted, validator-adjacent, NaaS/custody-provider-integrated 모델 모두 같은 API grammar를 써야 한다.

## Non-goals

1. **Pillar는 ledger가 아니다.**
   DB에 “진짜 balance”를 저장하지 않는다. Balance는 rebuildable projection이다.

2. **Pillar는 기본적으로 custody provider가 아니다.**
   Pillar가 private key, signing authority, hosted party control을 잡으면 규제 리스크가 제품의 중심이 된다.

3. **Pillar는 모든 Daml template의 universal adapter가 아니다.**
   초기 범위는 CIP-0056-compatible assets로 제한한다. 임의 Daml workflow 지원은 나중 문제다.

4. **Pillar는 Canton의 privacy model을 우회하지 않는다.**
   Party가 볼 수 없는 balance, transaction history, total supply를 Pillar가 보여줄 수 없다. Canton은 party-scoped query 모델이며, observer/data-sharing이 설계되지 않으면 analytics도 제한된다. ([Canton Network Docs][16])

5. **Pillar는 Stripe와 같은 merchant acquiring business가 아니다.**
   Stripe는 결제망, risk, dispute, payout까지 포함한다. Pillar는 Canton-backed asset operations의 API/ops layer다.

---

# Architecture

## 냉정한 핵심 비판

Pillar의 가장 큰 착각 가능성은 **“Canton을 감추면 Stripe가 된다”**는 것이다.
아니다. Canton은 다음 때문에 완전히 감출 수 없다.

* Party authorization
* Validator hosting
* Synchronizer routing
* Daml package version
* Asset registry / issuer policy
* Ledger visibility
* Asynchronous completion
* Regulatory/custody boundary

따라서 올바른 설계는 **Canton을 사용자에게 노출하지 않는 것**이 아니라, **Canton-specific concerns를 API object의 lifecycle과 audit trace 안에 격리하는 것**이다.

## Recommended High-level Architecture

```text
External Client
   |
   |  HTTPS / API Key / OAuth / Idempotency-Key / Pillar-Version
   v
Pillar API Edge
   |
   |-- AuthN/AuthZ
   |-- API version resolver
   |-- Idempotency guard
   |-- Request log
   |-- Rate limit
   |
   v
Intent Service
   |
   |-- TransferIntent FSM
   |-- AllocationIntent FSM
   |-- SettlementIntent FSM
   |-- Validation / policy checks
   |
   v
Canton Runtime Adapter
   |
   |-- Ledger API gRPC client
   |-- Command Submission Service
   |-- Command Completion Service
   |-- Update Service
   |-- State Service / ACS bootstrap
   |-- Package / Party / User management
   |
   v
Canton Participant / Validator
   |
   v
Canton Ledger / Synchronizer

Parallel services:
   - Projection Engine
   - Webhook/Event Engine
   - Reconciliation Engine
   - Audit/Trace Store
   - SDK/CLI/Sandbox/Workbench
```

## Architectural Layers

### 1. API Edge

Responsibilities:

* API key / OAuth / tenant resolution
* `Idempotency-Key` enforcement
* `Pillar-Version` resolution
* Request parameter hash
* Standard error object
* Request log and audit correlation
* Live/sandbox mode separation

Stripe’s API style is valuable here: predictable URLs, standard HTTP verbs, JSON response, sandbox/live split, request logs, SDK/CLI support. ([Stripe 문서][1])

### 2. Intent Service

This is Pillar’s product core.

Objects:

* `transfer_intent`
* `allocation_intent`
* `settlement_intent`
* `operation`
* `ledger_trace`

Intent states must reflect Canton reality:

```text
requires_action
pending_submission
submitted
processing
requires_receiver_acceptance
succeeded
failed
canceled
expired
```

CIP-0056 supports one-step transfer with preapproval and two-step transfer where receiver acceptance may be required. Pillar must model both explicitly. ([Canton Network Docs][9])

### 3. Canton Runtime Adapter

This must be gRPC-first for production.

Use:

* Command Submission Service for command submit
* Completion Service for command result
* Update Service for committed state changes
* State Service for ACS bootstrap
* Package Management / Package Service for DAR/package introspection
* User/Party management where needed

Command submission only confirms syntactic/acceptance status; the on-ledger effect comes later through completion and update streams. ([Digital Asset][7])

JSON Ledger API can support developer tooling or controlled internal use, but must not become Pillar’s public API. Official docs explicitly warn against exposing JSON Ledger API directly to the Internet in production. ([Digital Asset][8])

### 4. Projection Engine

Projection is the hardest technical subsystem.

It must:

* Bootstrap ACS from State Service at a known offset.
* Resume Update Service from that offset.
* Store participant-scoped offsets.
* Apply idempotent reducers.
* Maintain `holdings_projection`.
* Derive `balance_projection`.
* Emit object-level events only after durable projection.
* Reconcile periodically by re-reading ACS.

Critical rule:

> **Never compare offsets across participants as if they were global ledger height.**

Canton offsets are participant-local; different participants can assign different offsets to the same change, and ordering across synchronizers must be handled carefully. ([Digital Asset][7])

### 5. Webhook/Event Engine

Pillar events should be thin by default:

```json
{
  "id": "evt_...",
  "object": "event",
  "type": "transfer_intent.succeeded",
  "api_version": "2026-05-26",
  "created": 1779800000,
  "data": {
    "object": {
      "id": "trint_...",
      "object": "transfer_intent"
    }
  },
  "request": {
    "id": "req_...",
    "idempotency_key": "..."
  }
}
```

Rationale:

* Webhook ordering is not guaranteed.
* Duplicate delivery is normal.
* Clients should retrieve canonical object state.
* Event payload version should be frozen at event creation time.

This follows Stripe’s webhook and event-versioning lessons. ([Stripe 문서][3])

### 6. Audit / Ledger Trace

Every external operation must be traceable:

```text
request_id
  -> idempotency_key
  -> intent_id
  -> command_id
  -> submission_id
  -> workflow_id
  -> completion
  -> update_id
  -> contract_ids
  -> projection_version
  -> webhook_event_ids
  -> webhook_delivery_ids
```

Canton app development docs identify `application_id`, `workflow_id`, `command_id`, `submission_id`, `transaction/update identifiers`, `ledger offset`, and `contract_id` as useful correlation identifiers. ([Digital Asset][17])

### 7. Workbench / CLI / Sandbox

Pillar cannot call itself Stripe-grade without tooling.

Minimum tools:

```bash
pillar login
pillar sandbox start
pillar assets list
pillar transfer-intents create
pillar events listen
pillar events trigger transfer_intent.succeeded
pillar webhooks forward localhost:3000/webhook
pillar ledger-trace trint_...
pillar projection diff --party party_...
pillar packages inspect registry_asset.dar
```

DPM and Sandbox provide the baseline Canton/Daml dev flow; Pillar should wrap this into a developer-friendly asset API workflow. ([Digital Asset][11])

---

# API / Object Model

## API Design Principle

Pillar API must not expose Canton contract mechanics by default. However, every object must have an expandable `ledger_trace`.

### Object Naming

| Object                  | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `account`               | Pillar tenant/customer account                               |
| `party`                 | Pillar alias for Canton party                                |
| `asset`                 | Registered Canton-backed asset/instrument                    |
| `holding`               | Projected active holding, usually mapped to CIP-0056 Holding |
| `balance`               | Derived aggregate over holdings                              |
| `transfer_intent`       | User intent to transfer asset                                |
| `allocation_intent`     | User intent to reserve/allocate assets, especially DvP       |
| `settlement_intent`     | Multi-leg settlement orchestration                           |
| `operation`             | Internal business operation linked to ledger command(s)      |
| `ledger_trace`          | Canton trace metadata                                        |
| `event`                 | Pillar event object                                          |
| `webhook_endpoint`      | Event delivery endpoint                                      |
| `package`               | Daml package/DAR metadata                                    |
| `projection_checkpoint` | Internal projection state                                    |

## Example APIs

### Holdings and balances

```http
GET /v1/holdings?owner=party_123&asset=asset_usdcx
GET /v1/balances?owner=party_123
GET /v1/assets/asset_usdcx
```

### Transfer intents

```http
POST /v1/transfer_intents
Idempotency-Key: 76c2b0e1-...
Pillar-Version: 2026-05-26
```

```json
{
  "amount": "100.00",
  "asset": "asset_usdcx",
  "source": "party_sender",
  "destination": "party_receiver",
  "execution_mode": "auto",
  "metadata": {
    "client_order_id": "ORD-123"
  }
}
```

Response:

```json
{
  "id": "trint_01H...",
  "object": "transfer_intent",
  "status": "processing",
  "amount": "100.00",
  "asset": "asset_usdcx",
  "source": "party_sender",
  "destination": "party_receiver",
  "created": 1779800000,
  "livemode": false,
  "ledger_trace": null
}
```

### Retrieve with trace

```http
GET /v1/transfer_intents/trint_01H...?expand[]=ledger_trace
```

```json
{
  "id": "trint_01H...",
  "object": "transfer_intent",
  "status": "succeeded",
  "ledger_trace": {
    "workflow_id": "wf_trint_01H...",
    "command_id": "cmd_...",
    "submission_id": "sub_...",
    "update_id": "upd_...",
    "participant_id": "participant_customer_a",
    "synchronizer_id": "global",
    "contract_ids": [
      "..."
    ]
  }
}
```

## Required API Semantics

### Idempotency

Pillar idempotency must be stricter than generic SaaS idempotency.

Recommended behavior:

* Header: `Idempotency-Key`
* Scope: `tenant_id + livemode + endpoint + idempotency_key`
* Store:

  * request method/path
  * request body hash
  * API version
  * resolved account/party
  * generated intent ID
  * generated command ID / workflow ID
  * first durable outcome
* Mismatched replay body: return `idempotency_key_reused_with_different_params`
* Unknown command outcome: return existing intent with `status=processing`, not duplicate submit
* Retention: **minimum 30 days** for asset operations, preferably configurable

Stripe’s idempotency docs are useful, but Pillar must go deeper because duplicate ledger commands can create duplicate economic effects. ([Stripe 문서][2])

### API Versioning

Recommended:

* Account default API version.
* Request override: `Pillar-Version`.
* Webhook endpoint pinned version.
* Events immutable after creation.
* Breaking change only via dated versions: `2026-05-26`.
* Workbench diff:

  * old response shape
  * new response shape
  * webhook payload diff
  * SDK compatibility warnings

Stripe’s Workbench/versioning model is the right reference, especially endpoint-level webhook version locking and upgrade testing. ([Stripe 문서][4])

### Webhook Events

Minimum event types:

```text
transfer_intent.created
transfer_intent.submitted
transfer_intent.processing
transfer_intent.requires_receiver_acceptance
transfer_intent.succeeded
transfer_intent.failed
transfer_intent.canceled

holding.created
holding.archived
holding.locked
holding.unlocked

balance.updated

allocation_intent.created
allocation_intent.locked
allocation_intent.executed
allocation_intent.canceled
allocation_intent.failed

projection.reconciled
projection.lagging
package.version_detected
package.compatibility_warning
```

Webhook delivery requirements:

* HMAC signature
* timestamped signature header
* replay window
* exponential retry
* manual replay
* per-endpoint event filter
* event deduplication by `event.id`
* client guidance: **do not rely on event order**

---

# Internal Runtime

## Runtime State Machine

A `transfer_intent` should flow like this:

```text
API request
  -> idempotency lock
  -> create intent row
  -> policy validation
  -> resolve asset / parties / registry / transfer factory
  -> prepare Canton command
  -> submit command
  -> wait for completion
  -> consume update stream
  -> update projection
  -> mark intent succeeded/failed
  -> emit event
  -> deliver webhook
```

## Canton-specific Runtime Rules

### Rule 1: Submit is not execute

Command Submission Service returning successfully does **not** mean ledger execution completed. It means the server accepted the command format/content for processing. Completion and Update Service must be consumed separately. ([Digital Asset][7])

### Rule 2: Idempotency maps to Canton change ID

Ledger API deduplication uses change ID:

```text
act_as + user_id + command_id
```

Therefore Pillar should deterministically derive:

```text
command_id = hash(tenant_id, endpoint, idempotency_key, request_hash)
workflow_id = intent_id or business operation id
submission_id = unique per actual submit attempt
```

Command deduplication is only guaranteed when submissions go to the same Participant Node, so multi-validator deployment must not assume global command deduplication. ([Digital Asset][7])

### Rule 3: Projection finalizes product state

Pillar should not mark a transfer `succeeded` merely because completion says success. It should mark final product state after the expected ledger update is observed and the relevant projection has been applied.

Recommended separation:

| State                          | Source                                              |
| ------------------------------ | --------------------------------------------------- |
| `submitted`                    | command submission accepted                         |
| `completed` internal flag      | completion received                                 |
| `succeeded` public status      | projection observed expected effect                 |
| `failed`                       | completion failure or ledger-observed failure state |
| `requires_receiver_acceptance` | CIP-0056 pending instruction observed               |

### Rule 4: ACS bootstrap is mandatory

On projector start:

1. Call State Service / active contract set for parties and interfaces.
2. Store bootstrap offset.
3. Start Update Service from that offset.
4. Apply ACS contracts as current state.
5. Apply deltas idempotently.

Update Service subscriptions can read from an arbitrary offset and should be used with State Service for startup/restart consistency. ([Digital Asset][7])

### Rule 5: Package versioning is runtime risk, not build risk

Daml package upgrades can leave v1 and v2 contracts co-existing. Existing contracts are not automatically migrated. Package selection, symbolic references, vetting, and explicit upgrades matter. ([Canton Network Docs][18])

Pillar must maintain:

* `package_registry`
* supported package IDs
* interface IDs
* template IDs
* semantic version mapping
* compatibility tests
* package deprecation policy
* per-asset package constraints

## Daml Template Strategy

**Strong recommendation: avoid Pillar-specific asset templates.**

Use:

* CIP-0056 Holding
* CIP-0056 Transfer Instruction
* CIP-0056 Allocation
* registry-provided factories
* optional minimal `PillarOperationMarker` only when ledger-visible operation trace is legally/business required

Reason: Daml templates are not “schema files.” They are business logic. Every template introduces upgrade, vetting, migration, stakeholder visibility, and package compatibility cost.

---

# DB Schema

## Design Rule

Pillar DB contains only:

1. **Projection**
2. **Audit**
3. **Config**
4. **Delivery state**
5. **Runtime coordination**

It must be possible to rebuild economic state from Canton Ledger plus config.

## Core Tables

### `accounts`

```sql
id                      text primary key,
livemode_enabled         boolean not null,
default_api_version      text not null,
status                  text not null,
created_at              timestamptz not null
```

### `api_keys`

```sql
id                      text primary key,
account_id              text not null references accounts(id),
key_hash                text not null,
mode                    text not null check (mode in ('live','sandbox')),
scopes                  jsonb not null,
created_at              timestamptz not null,
revoked_at              timestamptz
```

### `parties`

```sql
id                      text primary key, -- party_...
account_id              text not null references accounts(id),
canton_party_id          text not null,
participant_id           text not null,
hosting_mode             text not null, -- hosted, external, multi_hosted
display_name             text,
metadata                 jsonb not null default '{}',
created_at              timestamptz not null,
unique(account_id, canton_party_id)
```

Canton party IDs are not stable human-readable names; hints are not globally unique, and sandbox party suffixes can change across restarts. Pillar must store opaque party IDs and avoid hardcoding assumptions. ([Digital Asset][19])

### `assets`

```sql
id                      text primary key, -- asset_...
account_id              text not null references accounts(id),
standard                text not null, -- cip0056, custom
instrument_id            text not null,
registry_party_id        text,
symbol                  text,
decimals                int,
package_ref             jsonb not null,
status                  text not null,
metadata                jsonb not null default '{}',
created_at              timestamptz not null
```

### `holdings_projection`

```sql
id                      text primary key, -- holding_...
account_id              text not null references accounts(id),
owner_party_id           text not null references parties(id),
asset_id                text not null references assets(id),
amount                  numeric(38, 18) not null,
lock_state              jsonb not null default '{}',
contract_id              text not null,
participant_id           text not null,
synchronizer_id          text,
package_id              text not null,
created_update_id        text,
archived_update_id       text,
created_offset           text,
archived_offset          text,
active                  boolean not null,
raw_payload              jsonb not null,
projection_version       bigint not null,
created_at              timestamptz not null,
updated_at              timestamptz not null,
unique(participant_id, contract_id)
```

### `balances_projection`

```sql
id                      text primary key,
account_id              text not null references accounts(id),
owner_party_id           text not null references parties(id),
asset_id                text not null references assets(id),
total_amount             numeric(38, 18) not null,
available_amount         numeric(38, 18) not null,
locked_amount            numeric(38, 18) not null,
pending_in_amount        numeric(38, 18) not null,
pending_out_amount       numeric(38, 18) not null,
as_of_participant_id     text not null,
as_of_offset             text not null,
projection_version       bigint not null,
recomputed_at            timestamptz not null,
unique(account_id, owner_party_id, asset_id)
```

### `intents`

```sql
id                      text primary key,
account_id              text not null references accounts(id),
type                    text not null, -- transfer, allocation, settlement
status                  text not null,
source_party_id          text references parties(id),
destination_party_id     text references parties(id),
asset_id                text references assets(id),
amount                  numeric(38, 18),
request_hash             text not null,
idempotency_key          text,
api_version              text not null,
workflow_id              text,
error_code               text,
error_message            text,
metadata                 jsonb not null default '{}',
created_at              timestamptz not null,
updated_at              timestamptz not null
```

### `idempotency_keys`

```sql
account_id              text not null,
mode                    text not null,
endpoint                text not null,
idempotency_key          text not null,
request_hash             text not null,
intent_id                text,
response_status          int,
response_body            jsonb,
locked_until             timestamptz,
created_at              timestamptz not null,
expires_at              timestamptz not null,
primary key(account_id, mode, endpoint, idempotency_key)
```

### `ledger_commands`

```sql
id                      text primary key,
account_id              text not null references accounts(id),
intent_id               text references intents(id),
participant_id           text not null,
act_as                  jsonb not null,
read_as                 jsonb not null default '[]',
user_id                 text not null,
command_id              text not null,
submission_id            text not null,
workflow_id              text not null,
deduplication_period     interval,
status                  text not null,
completion_status        jsonb,
submitted_at             timestamptz,
completed_at             timestamptz,
created_at              timestamptz not null,
unique(participant_id, user_id, command_id)
```

### `ledger_updates`

```sql
id                      text primary key,
participant_id           text not null,
offset                  text not null,
update_id               text not null,
workflow_id              text,
command_id              text,
record_time              timestamptz,
event_count              int not null,
raw_summary              jsonb not null,
processed_at             timestamptz not null,
unique(participant_id, offset),
unique(participant_id, update_id)
```

### `projection_offsets`

```sql
participant_id           text not null,
filter_hash              text not null,
last_offset              text not null,
last_update_id           text,
last_seen_at             timestamptz not null,
primary key(participant_id, filter_hash)
```

### `events`

```sql
id                      text primary key, -- evt_...
account_id              text not null references accounts(id),
type                    text not null,
api_version              text not null,
object_type              text not null,
object_id                text not null,
request_id               text,
idempotency_key          text,
ledger_trace             jsonb,
payload                  jsonb not null,
created_at              timestamptz not null
```

### `webhook_endpoints`

```sql
id                      text primary key,
account_id              text not null references accounts(id),
url                     text not null,
api_version              text not null,
enabled_events           jsonb not null,
secret_hash              text not null,
status                  text not null,
created_at              timestamptz not null
```

### `webhook_deliveries`

```sql
id                      text primary key,
endpoint_id              text not null references webhook_endpoints(id),
event_id                text not null references events(id),
attempt_count            int not null,
status                  text not null,
last_status_code         int,
last_error               text,
next_attempt_at          timestamptz,
created_at              timestamptz not null,
updated_at              timestamptz not null,
unique(endpoint_id, event_id)
```

### `package_registry`

```sql
id                      text primary key,
package_id              text not null,
package_name             text,
package_version          text,
dar_hash                text,
standard                text,
status                  text not null, -- supported, deprecated, blocked
interface_ids            jsonb not null,
template_ids             jsonb not null,
uploaded_at              timestamptz,
vetted_at                timestamptz,
unique(package_id)
```

---

# Failure Modes

## Top Technical Failure Modes

| Failure mode                                      | How Pillar dies                                                            | Required mitigation                                                                                                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Duplicate transfer on retry**                | HTTP timeout causes client retry, Pillar submits second command.           | Idempotency key maps to deterministic intent/command ID; Ledger API dedup used where applicable.                                                                                           |
| **2. Completion received, projection missing**    | User sees stale balance or wrong status.                                   | Separate completion state from public success; mark success only after projection observes expected effect.                                                                                |
| **3. Projection offset corruption**               | Balances become unrecoverable or silently wrong.                           | Participant-scoped offsets, append-only update log, rebuild tools, reconciliation jobs.                                                                                                    |
| **4. Cross-participant offset assumption**        | Multi-validator deployment produces inconsistent event order.              | Never compare offsets across participants; use object-level state transitions.                                                                                                             |
| **5. Webhook out-of-order**                       | Client processes `succeeded` then `processing`, corrupting its state.      | Thin events, event IDs, object retrieval, monotonic object status rules.                                                                                                                   |
| **6. Package upgrade breaks reducer**             | New Holding payload shape or interface version causes projection failure.  | Package registry, compatibility tests, supported package allowlist, unknown-package quarantine.                                                                                            |
| **7. Party authorization mismatch**               | Command fails because `act_as`/`read_as` insufficient.                     | Preflight rights check; explicit external signing flow; clear `requires_action` status.                                                                                                    |
| **8. Canton JSON API exposed**                    | Security incident.                                                         | Never expose underlying JSON Ledger API directly; use Pillar API façade and private network boundary.                                                                                      |
| **9. Custody ambiguity**                          | Customer/regulator treats Pillar as wallet/custodian.                      | Non-custodial architecture by default; external signing; clear legal boundary.                                                                                                             |
| **10. Asset-specific policy hidden**              | Transfer works for one asset registry but fails for another.               | Asset adapter registry; per-asset capabilities; no universal promises.                                                                                                                     |
| **11. Traffic / Canton Coin constraints ignored** | Transactions fail or become economically unattractive.                     | Traffic budget monitoring, fail-fast checks, operator alerts, fee visibility. Canton Coin docs describe traffic credits and holding fees as active mechanisms. ([Canton Network Docs][20]) |
| **12. UTXO fragmentation**                        | Balance looks fine but transfers fail due to fragmented holdings or locks. | Holding selection engine, sweep/merge policy where supported, lock-aware availability.                                                                                                     |
| **13. ACS resync gap**                            | Projector restarts from pruned/unavailable offset.                         | Retention policy, PQS/ledger history monitoring, full ACS rebuild procedure.                                                                                                               |
| **14. Ledger visibility gap**                     | Pillar promises analytics it cannot see.                                   | Observer/data-sharing requirements stated upfront.                                                                                                                                         |
| **15. Workbench absent**                          | Developers cannot debug async ledger behavior.                             | Ledger trace explorer, event replay, command/completion/update timeline.                                                                                                                   |

## 죽을 수 있는 이유 10가지

1. **Canton ecosystem demand가 충분히 넓지 않다.**
   기관 POCs는 많지만 Pillar 같은 API layer를 구매할 독립 developer/customer pool이 작을 수 있다.

2. **Stripe analogy에 취해 go-to-market을 잘못 잡는다.**
   Canton buyers는 Stripe의 internet merchants가 아니라 banks, asset issuers, infrastructure teams, regulated fintechs다.

3. **Pillar가 custody를 잡는다.**
   Signing authority를 대신 잡는 순간 제품은 infra SaaS가 아니라 regulated custody/wallet business가 된다.

4. **Projection consistency를 가볍게 본다.**
   한번 balance가 틀리면 “source of truth는 ledger”라는 설명은 고객에게 변명이 된다.

5. **Daml template을 너무 많이 만든다.**
   자체 templates가 늘어나면 package upgrade, migration, vetting, compatibility가 제품 속도를 죽인다.

6. **CIP-0056 밖의 custom workflows를 너무 빨리 지원한다.**
   범용 Daml adapter가 되려다 모든 registry의 예외를 떠안는다.

7. **기관 도입 요구를 과소평가한다.**
   SOC2, ISO, KMS/HSM, mTLS, audit logs, data residency, legal review, self-host, change management가 없으면 pilot에서 멈춘다.

8. **Canton dependency가 제품 로드맵을 지배한다.**
   SDK, package, Global Synchronizer, access model, network policy 변화가 Pillar를 계속 흔들 수 있다.

9. **Digital Asset/native tooling과 정면충돌한다.**
   단순 projection, explorer, SDK wrapper만 만들면 platform owner와 ecosystem tools에 밀린다.

10. **Revenue model이 불명확하다.**
    “per transaction fee”만으로는 초기 volume이 부족하고, grant/reward에 의존하면 사업이 아니다.

## 살아남는 조건 10가지

1. **CIP-0056 Holding/Transfer/Allocation에 집중한다.**
2. **비수탁형 deployment를 기본값으로 둔다.**
3. **Projection correctness를 제품의 1순위로 둔다.**
4. **API versioning, idempotency, webhook grammar를 day one에 고정한다.**
5. **Workbench/CLI/Sandbox를 API와 같은 수준의 제품으로 만든다.**
6. **Self-host / validator-adjacent / BYO validator를 지원한다.**
7. **Ledger trace를 모든 operation에 연결한다.**
8. **Package compatibility와 Daml upgrade strategy를 자동화한다.**
9. **기관용 compliance/audit evidence pack을 제공한다.**
10. **초기 고객을 “Canton asset app builder”가 아니라 “Canton asset operator/integrator”로 잡는다.**

---

# Security / Compliance

## Security Baseline

Pillar must implement:

* API key hashing and rotation
* OAuth/OIDC for dashboard and enterprise environments
* mTLS to Canton participant / validator
* short-lived JWT for Ledger API access
* KMS/HSM integration for any signing material
* per-tenant encryption keys
* strict party-level authorization
* network allowlists
* webhook HMAC signatures
* replay protection
* audit log immutability
* admin action approval workflow
* data residency controls
* production separation of live/sandbox

Canton JSON Ledger API requires JWT per request and should not be Internet-exposed in production. ([Digital Asset][8])

## Compliance Boundary

The single most important business decision:

> **Does Pillar ever control signing authority for customer assets?**

If yes:

* custody/wallet regulation risk rises
* AML/KYC/sanctions obligations rise
* insurance and capital requirements may appear
* institutional procurement becomes harder
* incident blast radius grows

If no:

* Pillar is closer to API/projection/workflow infrastructure
* customer validator or external signer remains control point
* regulatory burden is lower but not zero
* auditability remains essential

## Compliance Features Needed for Institutions

Minimum enterprise checklist:

* full request-to-ledger trace
* immutable audit export
* role-based admin access
* four-eyes approval for critical config
* package allowlist and vetting log
* signer/party rights inventory
* webhook delivery audit
* reconciliation reports
* incident timeline generator
* evidence bundle for SOC2/ISO review
* data retention policy
* PII minimization

## Privacy Reality

Canton’s privacy model is a strength, but it constrains product claims. Validators only store and query data for hosted parties; other balances or total supply are visible only if the application design exposes them through observer/data-sharing mechanisms. ([Canton Network Docs][16])

Therefore Pillar must never say:

> “Query any Canton-backed asset balance globally.”

It may say:

> “Query balances and holdings visible to the parties and observers configured for your Pillar deployment.”

---

# Implementation Plan

## Phase 0 — Kill-or-Continue Validation

Before building the full platform, validate these 10 things.

### 가장 먼저 검증해야 할 10가지

1. **Who pays?**
   App builder, asset issuer, bank, custodian, validator operator, or fintech integrator?

2. **Which first asset?**
   USDC xReserve, Canton Coin, tokenized Treasury, internal test asset, or issuer-specific CIP-0056 asset?

3. **Can Pillar access the required network?**
   LocalNet/Sandbox is easy; DevNet/MainNet access and validator sponsorship are separate issues. Canton Network onboarding can be approval/sponsorship-based depending on role. ([Canton][21])

4. **Is CIP-0056 enough for the MVP?**
   If the first customer requires custom templates, MVP complexity increases sharply.

5. **Can Pillar operate non-custodially?**
   External signing / customer validator / hosted party model must be chosen.

6. **Can projection be proven correct under restart, duplicate update, lag, and package upgrade?**

7. **Can idempotency prevent duplicate economic effects, not just duplicate HTTP responses?**

8. **Can institutions accept the deployment model?**
   SaaS-only, self-hosted, or validator-adjacent?

9. **Can Pillar produce audit evidence strong enough for regulated users?**

10. **Can Pillar differentiate from Digital Asset tooling, wallets, Noves data APIs, and explorers?**
    Noves offers Canton data APIs, and Proof Group has launched a Canton block explorer; Pillar must avoid becoming only “another data viewer.” ([Canton][15])

## Phase 1 — Technical MVP

Build only:

* `assets`
* `parties`
* `holdings`
* `balances`
* `transfer_intents`
* `events`
* `webhook_endpoints`
* `ledger_traces`

Runtime:

* gRPC Ledger API adapter
* sandbox Canton environment
* ACS bootstrap
* Update Service projector
* command submission/completion tracker
* idempotency store
* webhook delivery engine
* basic CLI:

  * `pillar sandbox start`
  * `pillar listen`
  * `pillar trigger`
  * `pillar transfer create`
  * `pillar trace`

Success criterion:

> Create a transfer intent, submit Canton command, observe ledger update, update holding/balance projection, emit webhook, replay trace end-to-end.

## Phase 2 — Projection Hardening

Add:

* projector restart tests
* duplicate event tests
* offset gap detection
* ACS rebuild
* reconciliation jobs
* package unknown quarantine
* projection lag API
* balance proof report

Pillar should expose:

```http
GET /v1/projection_status
GET /v1/reconciliation_runs
GET /v1/balances/:id/proof
```

## Phase 3 — API Grade Hardening

Add:

* account-level API version
* request-level version override
* webhook endpoint version pinning
* error taxonomy
* SDK generation
* OpenAPI spec
* TypeScript SDK
* Python SDK
* CLI fixtures
* webhook local forwarding
* Workbench request/event logs

## Phase 4 — Allocation / DvP

Add:

* `allocation_intent`
* `settlement_intent`
* lock-aware balances
* DvP orchestration
* multi-party pending action workflow
* receiver acceptance UI/API

CIP-0056 explicitly models allocations as reservations backed by locked holdings and supports DvP-style settlement workflows. ([Canton Network Docs][9])

## Phase 5 — Enterprise Deployment

Add:

* self-host Helm chart
* BYO participant/validator config
* KMS/HSM
* mTLS
* OIDC/SAML
* audit export
* data residency
* admin approval workflows
* SOC2 evidence pack
* disaster recovery runbooks

## Phase 6 — Grant / Ecosystem Strategy

Best grant candidates:

* open-source projection correctness toolkit
* CIP-0056 webhook reference implementation
* command idempotency reference implementation
* sandbox fixtures for Canton-backed assets
* package compatibility checker
* ledger trace Workbench
* security hardening/audit work

The Canton Protocol Development Fund explicitly lists developer tools, SDKs, security enhancements, audits, reference implementations, and critical infrastructure as eligible areas. ([Canton Foundation][14])

## Revenue Model

Recommended:

| Model                   | Judgment                                                   |
| ----------------------- | ---------------------------------------------------------- |
| Enterprise subscription | Best primary model                                         |
| Self-host license       | Strong for institutions                                    |
| Usage-based API fee     | Good secondary model                                       |
| Support/SLA package     | Necessary                                                  |
| Compliance/audit module | High-value add-on                                          |
| Per-transaction spread  | Avoid initially                                            |
| Custody fee             | Avoid unless Pillar deliberately becomes regulated custody |
| Grant funding           | Useful bootstrap, not core revenue                         |
| Canton Coin app rewards | Opportunistic, not underwriting model                      |

---

# Open Questions

## Product Questions

1. Which customer segment is first: issuer, wallet, custodian, bank, validator operator, or app developer?
2. Is the initial wedge **payments**, **collateral movement**, **repo/Treasury**, **stablecoin transfer**, or **settlement workflow**?
3. Does Pillar need a dashboard for business users, or only API/SDK/CLI?
4. Should Pillar expose `contract_id` by default, only via `expand`, or never?
5. What is the public consistency guarantee?

   * `eventual_projection`
   * `read_your_writes_after_projection`
   * `ledger_confirmed_but_projection_pending`
6. What is the support matrix for Canton/Daml SDK versions?
7. What is the support matrix for CIP-0056 package versions?
8. What is the explicit policy for unsupported templates?
9. What webhook event payload style: snapshot events or thin events?
10. How long must idempotency keys be retained for regulated asset workflows?

## Architecture Questions

1. Does Pillar run adjacent to a customer participant node?
2. Does Pillar ever submit as `act_as`, or only prepare commands for external signing?
3. How does Pillar handle multi-hosted parties?
4. Does Pillar use PQS as an input, or maintain its own Ledger API projector?
5. What is the fallback when PQS lags or prunes history?
6. Are observers configured for compliance users?
7. How are Daml package upgrades detected and approved?
8. Can Pillar rebuild all projections from available ledger history?
9. What is the disaster recovery plan if projection DB is lost?
10. What is the exact blast radius of a leaked API key?

## Business Questions

1. Will institutions accept a third-party API layer over their validator?
2. Will Digital Asset or ecosystem incumbents build the same layer?
3. Is there enough transaction volume to support usage pricing?
4. Can Pillar become a standard integration layer before native tooling catches up?
5. Can grant funding accelerate but not distort the roadmap?
6. What partnerships are required: validator operator, custody provider, issuer, data provider?
7. Is Pillar’s defensibility API grammar, compliance, projection correctness, or distribution?
8. Which features are must-have for a paid pilot?
9. What proof convinces a bank: demo, SOC2, reference customer, code audit, or network certification?
10. What is the minimum viable regulated deployment?

---

# Agent-ready Checklist

## Research Agent

* [ ] Produce `research/stripe-api-patterns.md`

  * [ ] idempotency behavior
  * [ ] webhook duplicate/out-of-order handling
  * [ ] API versioning and Workbench
  * [ ] SDK/CLI/sandbox practices
* [ ] Produce `research/canton-runtime.md`

  * [ ] Ledger API command/completion/update/state services
  * [ ] command deduplication
  * [ ] offsets and participant-local ordering
  * [ ] JSON Ledger API security constraints
* [ ] Produce `research/cip0056.md`

  * [ ] Holding
  * [ ] Transfer Instruction
  * [ ] Allocation
  * [ ] preapproval / two-step transfer
* [ ] Produce `research/canton-business-demand.md`

  * [ ] DTCC
  * [ ] JPMD
  * [ ] USDC xReserve
  * [ ] Broadridge DLR
  * [ ] Canton Foundation fund
  * [ ] competitors

## API Agent

* [ ] Draft `openapi/pillar-v1.yaml`
* [ ] Define object schemas:

  * [ ] `asset`
  * [ ] `party`
  * [ ] `holding`
  * [ ] `balance`
  * [ ] `transfer_intent`
  * [ ] `allocation_intent`
  * [ ] `event`
  * [ ] `ledger_trace`
* [ ] Define error schema:

  * [ ] `idempotency_key_reused`
  * [ ] `ledger_command_failed`
  * [ ] `projection_lagging`
  * [ ] `insufficient_authorization`
  * [ ] `unsupported_package`
  * [ ] `unsupported_asset_capability`
* [ ] Define webhook event catalog.
* [ ] Define API versioning policy.
* [ ] Define idempotency retention policy.

## Runtime Agent

* [ ] Implement Canton gRPC adapter.
* [ ] Implement deterministic `command_id` derivation.
* [ ] Implement command submission tracker.
* [ ] Implement completion consumer.
* [ ] Implement update stream consumer.
* [ ] Implement ACS bootstrap.
* [ ] Implement participant-scoped offset store.
* [ ] Implement command retry rules.
* [ ] Implement external signing mode spike.
* [ ] Implement ledger trace builder.

## Projection Agent

* [ ] Implement `Holding` reducer.
* [ ] Implement `TransferInstruction` reducer.
* [ ] Implement `Allocation` reducer.
* [ ] Implement balance aggregation.
* [ ] Implement projection lag metric.
* [ ] Implement ACS rebuild.
* [ ] Implement reconciliation run.
* [ ] Implement package compatibility quarantine.
* [ ] Implement reducer idempotency tests.
* [ ] Implement offset gap detection.

## Webhook Agent

* [ ] Implement event table.
* [ ] Implement HMAC signing.
* [ ] Implement retry scheduler.
* [ ] Implement duplicate delivery protection.
* [ ] Implement manual replay.
* [ ] Implement local forwarding CLI.
* [ ] Implement thin event payloads.
* [ ] Implement endpoint API version pinning.
* [ ] Implement webhook fixture generator.

## Tooling Agent

* [ ] Implement `pillar sandbox start`.
* [ ] Implement `pillar listen`.
* [ ] Implement `pillar trigger`.
* [ ] Implement `pillar transfer-intents create`.
* [ ] Implement `pillar ledger-trace`.
* [ ] Implement `pillar projection diff`.
* [ ] Implement `pillar packages inspect`.
* [ ] Implement Workbench request log.
* [ ] Implement Workbench event log.
* [ ] Implement Workbench API version diff.

## Security Agent

* [ ] Define non-custodial reference architecture.
* [ ] Define hosted-signing risk memo.
* [ ] Implement API key hashing and rotation.
* [ ] Implement tenant isolation tests.
* [ ] Implement mTLS participant connection.
* [ ] Implement OIDC/SAML enterprise auth.
* [ ] Implement webhook replay protection.
* [ ] Implement audit log integrity.
* [ ] Draft SOC2 evidence map.
* [ ] Draft incident response runbook.

## Business Agent

* [ ] Interview 10 Canton ecosystem participants.
* [ ] Validate first paid use case.
* [ ] Validate self-host requirement.
* [ ] Validate grant eligibility.
* [ ] Map competitors:

  * [ ] Digital Asset native tooling
  * [ ] Canton wallets
  * [ ] NaaS providers
  * [ ] custody providers
  * [ ] Noves/data APIs
  * [ ] explorers
* [ ] Define pricing:

  * [ ] enterprise base fee
  * [ ] usage fee
  * [ ] self-host license
  * [ ] support/SLA
* [ ] Define pilot success criteria.

---

## Final Judgment

**Build Pillar, but narrow it.**

Do **not** build “Stripe for every Canton thing.”
Build:

> **Stripe-grade API + webhook + idempotency + projection + ledger trace for CIP-0056 Canton-backed holdings, transfers, and allocations.**

The first proof is not a flashy transfer demo. The first proof is this:

> A transfer intent can be retried, completed, projected, reconciled, audited, webhooked, replayed, and explained to an institutional risk team without lying about Canton’s underlying model.

That is the bar.

[1]: https://docs.stripe.com/api?utm_source=chatgpt.com "Stripe API Reference"
[2]: https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com "Idempotent requests | Stripe API Reference"
[3]: https://docs.stripe.com/webhooks?utm_source=chatgpt.com "Receive Stripe events in your webhook endpoint"
[4]: https://docs.stripe.com/api/versioning?utm_source=chatgpt.com "Versioning | Stripe API Reference"
[5]: https://docs.stripe.com/sdks?utm_source=chatgpt.com "Stripe SDKs"
[6]: https://docs.canton.network/overview/learn/architecture "Architecture Overview - Canton Network Docs"
[7]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[8]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html?utm_source=chatgpt.com "JSON Ledger API Service V2"
[9]: https://docs.canton.network/overview/reference/cip-0056 "CIP-0056: Canton Network Token Standard - Canton Network Docs"
[10]: https://docs.digitalasset.com/build/3.5/explanations/daml-packages-and-archive-files.html "Daml packages and archive (.dar) files — Digital Asset’s platform documentation"
[11]: https://docs.digitalasset.com/build/3.4/dpm/dpm.html?utm_source=chatgpt.com "Digital Asset Package Manager (Dpm)"
[12]: https://docs.digitalasset.com/build/3.5/component-howtos/pqs/operate.html?utm_source=chatgpt.com "Operate — Digital Asset's platform documentation"
[13]: https://www.digitalasset.com/?utm_source=chatgpt.com "Digital Asset Holdings"
[14]: https://canton.foundation/canton-foundation-launches-protocol-development-fund/?utm_source=chatgpt.com "Canton Foundation Launches Protocol Development Fund"
[15]: https://www.canton.network/developer-resources?utm_source=chatgpt.com "Developer Resources"
[16]: https://docs.canton.network/appdev/modules/m2-network-architecture "Network Architecture Comparison - Canton Network Docs"
[17]: https://docs.digitalasset.com/build/3.5/quickstart/observe/observability-troubleshooting-overview.html?utm_source=chatgpt.com "Canton Network Quickstart observability & troubleshooting ..."
[18]: https://docs.canton.network/appdev/modules/m6-package-selection?utm_source=chatgpt.com "Package Selection - Canton Network Docs"
[19]: https://docs.digitalasset.com/build/3.5/explanations/parties-users.html?utm_source=chatgpt.com "Parties and users on a Canton ledger"
[20]: https://docs.canton.network/overview/reference/canton-coin-tokenomics "Canton Coin Tokenomics - Canton Network Docs"
[21]: https://www.canton.network/blog/how-to-get-started-with-a-validator-on-canton?utm_source=chatgpt.com "How to get started with a validator on Canton"
