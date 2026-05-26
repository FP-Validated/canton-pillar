# Executive Summary

Pillar의 **Canton Adapter / Intent Compiler**는 다음 경계로 설계한다.

> **외부는 Stripe-like Intent API, 내부는 Canton-native Command Runtime.**
> 고객은 `account`, `asset`, `holding`, `balance`, `intent`, `event`만 본다.
> Pillar 내부만 `party`, `template`, `contract_id`, `choice`, `command_id`, `workflow_id`, `submission_id`, `update_id`를 다룬다.

핵심 결정은 다음과 같다.

1. **Canton Ledger가 단일 진실 원천이다.** Pillar DB는 projection, audit, config, idempotency, webhook delivery 상태만 저장한다.
2. **Intent Compiler**는 외부 객체와 의도를 Daml command plan으로 컴파일한다.
3. **Canton Adapter**는 party mapping, active contract lookup, participant routing, command submission, completion tracking, update indexing을 담당한다.
4. **Balance/Holding-first API**를 유지한다. 외부 고객은 contract를 선택하지 않고 “이 account의 이 asset holding에서 transfer/redeem/freeze” 같은 의도만 제출한다.
5. **Webhook-first async workflow**를 기본값으로 둔다. 동기 응답은 “accepted / processing / requires_action” 중심이고, 최종성은 webhook과 `GET /v1/intents/{id}`로 확인한다.
6. **gRPC Ledger API를 production runtime의 기본 경로**로 사용한다. JSON Ledger API는 dev tooling, Workbench, raw escape hatch, 간단한 HTTP integration에 사용하되 public internet에 직접 노출하지 않는다.
7. **Idempotency와 command deduplication은 분리한다.** 외부 API idempotency는 Stripe-like로, 내부 ledger deduplication은 `(user_id, act_as, command_id)` change identity와 `submission_id` attempt identity로 관리한다.

## 공식 문서 리서치 요약

| 영역                               | 공식 문서에서 확인한 사실                                                                                                                                                                                                             | Pillar 설계 반영                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Canton Ledger API                | Ledger API는 command가 ledger를 변경하는 유일한 경로이고, update/event stream이 ledger 변경을 읽는 경로다. 또한 API는 비동기이며 command outcome과 state change를 별도 처리해야 한다. ([Digital Asset Documentation][1])                                            | API 요청은 즉시 ledger 상태라고 간주하지 않는다. `CommandCompletionTracker`와 `UpdateIndexer`를 별도 런타임으로 둔다.                                  |
| Daml command model               | Command는 create, exercise, exercise-by-key, create-and-exercise로 구성된다. `workflow_id`, `command_id`, `submission_id`, `act_as`, `read_as`, deduplication period가 command envelope의 핵심이다. ([Digital Asset Documentation][2]) | Intent Compiler의 출력은 하나 이상의 Daml command가 아니라 **command envelope + routing + trace metadata**를 포함한 `CompiledCommandPlan`이다. |
| Completion tracking              | Completion은 submitted command의 성공/실패 상태를 나타내며, 성공 시 `update_id`가 포함된다. Client는 submit 전에 completion stream을 subscribe해야 race를 줄일 수 있다. ([Digital Asset Documentation][2])                                                  | Pillar는 participant별 completion cursor를 저장하고, submit 전에 stream readiness를 확인한다.                                             |
| Parties / Users                  | Party는 Canton network에서 식별되는 ledger actor이고, user는 participant-local 개념이다. Party ID는 Daml code에서 사용되며, user는 `actAs/readAs` 권한과 연결된다. ([Digital Asset Documentation][3])                                                   | `Account → PartyMapping`을 핵심 config로 둔다. 외부 `account_id`는 절대 party ID와 동일시하지 않는다.                                           |
| Contract key / active lookup     | Contract key는 안정적 식별자로 사용할 수 있지만, lookup/fetch visibility와 concurrent contention 제약이 있다. ([Digital Asset Documentation][4])                                                                                                | Holding lookup은 projection-first, ledger-confirmed 방식으로 설계한다. Contract key는 보조 최적화이지 유일한 진실 원천이 아니다.                        |
| JSON Ledger API                  | JSON Ledger API는 Canton 3.x에서 HTTP/JSON으로 gRPC Ledger API 기능 대부분을 제공하지만, 직접 internet에 노출하면 안 되고 reverse proxy 뒤에 둬야 한다. ([Digital Asset Documentation][5])                                                                 | JSON API는 Pillar 내부/관리/개발 도구용이다. 고객-facing API는 항상 Pillar API Gateway다.                                                     |
| gRPC vs JSON                     | JSON API v2는 gRPC API의 mirror에 가까우며 `/v2/commands/submit-and-wait` 등 command endpoint를 제공한다. ([Digital Asset Documentation][6])                                                                                            | Production ingestion, completions, updates는 gRPC 우선. Workbench, CLI, raw escape는 JSON도 허용한다.                                |
| State / Update / Event Query     | Update Service와 State Service는 party-specific active contracts와 updates를 제공하고, offset은 participant-local이다. ([Digital Asset Documentation][1])                                                                             | Projection cursor는 반드시 participant별로 저장한다. Multi-participant에서 global offset을 만들지 않는다.                                      |
| Sandbox / CLI                    | Canton sandbox는 단일 participant/synchronizer topology로 Daml ledger를 실행하는 개발 환경이며 JSON API port도 활성화할 수 있다. ([Digital Asset Documentation][7])                                                                               | Pillar Sandbox는 local Canton sandbox + seeded parties/assets + Pillar API + webhook listener로 구성한다.                         |
| Stripe idempotency               | Stripe는 idempotency key로 retry를 안전하게 만들고, 첫 요청의 status/body를 저장하며, client-generated random key를 권장한다. ([Stripe Docs][8])                                                                                                   | Pillar도 모든 mutating request에 `Idempotency-Key`를 요구 또는 강력 권장하고, 동일 body hash에 대해 동일 결과를 반환한다.                                |
| Stripe API versioning            | Stripe는 major API version에서 breaking change를 허용하고, webhook endpoint도 API version에 묶을 수 있다. 현재 문서상 current version은 `2026-04-22.dahlia`다. ([Stripe Docs][9])                                                                | Pillar는 `Pillar-Version`과 webhook endpoint version pinning을 제공한다.                                                           |
| Stripe webhooks                  | Stripe webhook은 빠르게 2xx를 반환하고 비동기 처리해야 하며, raw body와 signature header로 서명을 검증한다. 중복 event 가능성을 고려해야 한다. ([Stripe Docs][10])                                                                                                | Pillar webhook은 thin event + fetch API를 기본으로 하고, duplicate event/delivery를 정상 케이스로 처리한다.                                    |
| Stripe Workbench / CLI / Sandbox | Stripe Workbench는 API logs, event destinations, errors 등을 보여주며, CLI는 sandbox resource 관리와 webhook testing에 사용된다. Stripe Sandbox는 live data/money movement 없이 테스트하는 격리 환경이다. ([Stripe Docs][11])                            | Pillar Workbench / CLI / Sandbox를 1급 product surface로 설계한다. Ledger traceability는 dashboard에서 직접 확인 가능해야 한다.                 |

---

# Goals / Non-goals

## Goals

### G1. Stripe-grade external API

Pillar 고객은 다음과 같은 문법으로 ledger-backed asset operation을 수행한다.

```http
POST /v1/intents/transfers
Idempotency-Key: 7d4c...
Pillar-Version: 2026-05-26
```

```json
{
  "from_account": "acct_issuer_123",
  "to_account": "acct_client_456",
  "asset": "asset_usdc_001",
  "amount": "100.00",
  "currency": "USD",
  "metadata": {
    "customer_order_id": "ord_789"
  }
}
```

응답은 Canton을 숨긴다.

```json
{
  "id": "int_01JZTRANSFER9...",
  "object": "intent",
  "type": "transfer",
  "status": "processing",
  "amount": "100.00",
  "asset": "asset_usdc_001",
  "from_account": "acct_issuer_123",
  "to_account": "acct_client_456",
  "created": 1779792000
}
```

### G2. Canton-native runtime

내부 런타임은 반드시 다음 ledger-native 개념을 사용한다.

* Daml party
* template ID
* contract ID / contract key
* choice
* command envelope
* `act_as`, `read_as`
* `command_id`
* `workflow_id`
* `submission_id`
* participant route
* synchronizer/domain route
* completion offset
* update ID

### G3. Balance/Holding-first

고객은 contract를 모른다. 고객은 다음을 조회한다.

```http
GET /v1/balances?account=acct_123
GET /v1/holdings?account=acct_123&asset=asset_usdc_001
```

Pillar는 내부에서 active contract set을 찾아 Daml command에 contract ID 또는 contract key를 넣는다.

### G4. Intent-first

외부 API의 기본 mutating object는 transaction이 아니라 **Intent**다.

* `transfer_intent`
* `issuance_intent`
* `redemption_intent`
* `settlement_intent`
* `freeze_intent`
* `allocation_intent`
* `attestation_intent`

Intent는 ledger command 하나일 수도 있고, 여러 ledger command와 external approval을 포함한 workflow일 수도 있다.

### G5. Ledger-traceable operations

모든 external operation은 다음 trace chain을 가진다.

```text
request_id
  → idempotency_record
  → intent_id
  → workflow_id
  → command_id
  → submission_id
  → completion
  → update_id
  → ledger events
  → projection changes
  → webhook events
```

## Non-goals

1. **Pillar DB를 ledger replica로 만들지 않는다.** DB는 rebuild 가능한 projection과 audit/config만 저장한다.
2. **고객에게 Canton object model을 노출하지 않는다.** Raw ledger escape hatch를 제외하면 `party_id`, `contract_id`, `template_id`, `choice`는 public API grammar에 포함하지 않는다.
3. **모든 workflow를 단일 atomic transaction으로 강제하지 않는다.** Daml model이 atomic하게 표현할 수 있는 경우만 atomic command로 처리한다.
4. **participant topology를 API grammar에 묶지 않는다.** deployment model이 바뀌어도 `/v1/intents/*`는 바뀌지 않는다.
5. **JSON Ledger API를 public API로 재포장하지 않는다.** Pillar API와 raw ledger escape hatch는 별개다.

---

# Architecture

## High-level Architecture

```text
External Client / SDK / CLI
        |
        v
+-------------------------+
| Pillar API Gateway      |
| - auth                  |
| - API version           |
| - idempotency           |
| - request validation    |
+-----------+-------------+
            |
            v
+-------------------------+
| Intent Service          |
| - creates intent        |
| - validates state       |
| - owns API object       |
+-----------+-------------+
            |
            v
+-------------------------+
| Intent Compiler         |
| - object binding        |
| - Account→PartyMapping  |
| - Asset/Holding lookup  |
| - Intent→Daml command   |
| - ID generation         |
+-----------+-------------+
            |
            v
+-------------------------+
| Canton Adapter          |
| - participant routing   |
| - gRPC / JSON client    |
| - command submission    |
| - raw ledger ops        |
+-----------+-------------+
            |
            v
+-------------------------+
| Canton Participant(s)   |
| - Ledger API            |
| - parties/users         |
| - packages/DARs         |
| - synchronizers         |
+-----------+-------------+
            |
            v
+-------------------------+
| Completion Tracker      |
| - command completions   |
| - async failures        |
| - update IDs            |
+-----------+-------------+
            |
            v
+-------------------------+
| Update Indexer          |
| - ledger updates        |
| - active contracts      |
| - balances/holdings     |
+-----------+-------------+
            |
            v
+-------------------------+
| Webhook Dispatcher      |
| - thin events           |
| - retries               |
| - signatures            |
+-------------------------+
```

## Component responsibilities

| Component                | Responsibility                                          | Stored data                                             |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------- |
| API Gateway              | API key auth, versioning, idempotency, request logging  | request audit, idempotency records                      |
| Intent Service           | External intent lifecycle                               | intent audit/control rows                               |
| Intent Compiler          | External object → Daml command plan                     | command plan audit                                      |
| Party Resolver           | Account → party/user/participant/synchronizer           | party mapping config                                    |
| Active Contract Resolver | Holding/balance projection → eligible active contracts  | active contract projection                              |
| Canton Adapter           | gRPC/JSON Ledger API connection, submit, raw ledger ops | no truth state                                          |
| Completion Tracker       | Command completion stream consumption                   | command attempt audit, completion cursor                |
| Update Indexer           | Update/State/Event stream consumption                   | projection cursor, active contracts, balances, holdings |
| Webhook Dispatcher       | Event normalization, delivery, retry, signature         | webhook endpoints/events/deliveries                     |
| Workbench                | Operator/customer observability                         | reads audit/projection/config                           |
| CLI                      | Sandbox, webhook listener, inspect, trigger             | no independent state                                    |

---

# API / Object Model

## Public object grammar

Pillar external objects are stable, Stripe-like resources.

| Object               | ID prefix | Public?        | Description                                                     |
| -------------------- | --------: | -------------- | --------------------------------------------------------------- |
| Account              |   `acct_` | Yes            | Customer, issuer, custodian, wallet, treasury, platform account |
| Asset                |  `asset_` | Yes            | Ledger-backed instrument or token class                         |
| Balance              |    `bal_` | Yes            | Aggregated account balance by asset/status                      |
| Holding              |    `hld_` | Yes            | Position projection over one or more active contracts           |
| Intent               |    `int_` | Yes            | Requested operation that may compile to ledger command(s)       |
| Event                |    `evt_` | Yes            | Webhook/event object                                            |
| Webhook Endpoint     |     `we_` | Yes            | Event destination                                               |
| Party Mapping        |     `pm_` | Admin/internal | Account-to-party config                                         |
| Ledger Operation     |    `lop_` | Internal/admin | Ledger command/update trace                                     |
| Command Attempt      | `cmdatt_` | Internal/admin | Single submit attempt                                           |
| Raw Ledger Operation |  `rawop_` | Restricted     | Escape hatch audit record                                       |

## External object → Canton object conversion

The key abstraction is `DamlBinding`.

```text
external object + operation + API version + ledger profile
    → Daml template/interface/choice/package binding
```

### Conversion table

| External concept | Internal Canton concept                                                 | Resolution rule                                                              |
| ---------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `account`        | `party_id`, `user_id`, `act_as`, `read_as`, participant endpoint        | `party_mappings` by account, environment, capability                         |
| `asset`          | Daml asset template/interface, package name/version, issuer/admin party | `asset_bindings` + ledger package registry                                   |
| `holding`        | active contract ID or contract key                                      | `active_contract_projection`, optionally confirmed through State/Event Query |
| `balance`        | aggregate of active contracts                                           | projection only; never submitted directly                                    |
| `intent.type`    | Daml choice or create/exercise flow                                     | `daml_bindings.intent_type`                                                  |
| `intent.amount`  | Daml decimal/numeric argument                                           | encoder validates precision and scale                                        |
| `metadata`       | Daml metadata field or audit-only metadata                              | binding decides what is ledger-visible                                       |
| `api_version`    | encoder/decoder version                                                 | `Pillar-Version` pinned behavior                                             |
| `ledger_profile` | package/template/choice set                                             | environment/tenant-specific binding profile                                  |

## Account → PartyMapping

An external account is not a Canton party. It resolves to one or more party mappings.

```sql
party_mappings
--------------
id                      pm_...
environment             live | test | sandbox
tenant_id               ten_...
account_id              acct_...
participant_id          par_...
participant_alias       "issuer-mainnet-a"
ledger_api_endpoint_id  lep_...
party_id                "Issuer::1220abcd..."
user_id                 "pillar-api-issuer"
primary_mapping         boolean
capabilities            ["act_as", "read_as", "external_sign"]
act_as_allowed          boolean
read_as_allowed         boolean
external_signer_id      signer_... nullable
synchronizer_ids        text[]
namespace               text
status                  active | suspended | revoked
valid_from              timestamptz
valid_to                timestamptz nullable
metadata                jsonb
```

### Mapping modes

| Mode                  | Use case                                                                          | Submission path                                          |
| --------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Hosted party          | Pillar controls party through participant IAM                                     | Standard Command Submission/Command Service              |
| Customer-hosted party | Customer participant hosts party                                                  | Route to configured customer participant                 |
| External party        | Party signs externally                                                            | Interactive prepare → sign → execute flow                |
| Custodial omnibus     | Many accounts mapped to one operational party plus ledger sub-accounting contract | Compiler encodes account reference in contract arguments |
| Segregated party      | One account maps to one or more dedicated parties                                 | Compiler chooses party by asset/synchronizer/capability  |

Party IDs are Canton/Daml identities, while users are local to a participant and connected to `actAs/readAs` rights; therefore Pillar must not treat `user_id` as a global ledger identity. ([Digital Asset Documentation][3])

## Asset / Holding → active contract lookup

Pillar is **holding-first** externally but **contract-native** internally.

### Holding object

```json
{
  "id": "hld_01JZ...",
  "object": "holding",
  "account": "acct_123",
  "asset": "asset_usdc_001",
  "balance": "2500.00",
  "available": "2400.00",
  "locked": "100.00",
  "status": "active",
  "livemode": true,
  "created": 1779792000,
  "updated": 1779792300
}
```

### Lookup algorithm

```text
Input:
  account_id, asset_id, amount, operation, intent_type

1. Resolve account → candidate party mappings.
2. Resolve asset → allowed Daml templates/interfaces and package profile.
3. Query active_contract_projection by:
   - owner_party
   - asset_id / asset key
   - template/interface
   - active = true
   - status = usable
   - participant route
4. Select eligible contracts:
   - enough available quantity
   - not already reserved by another pending intent
   - visible to submitting party
   - matches synchronizer/domain constraints
5. Optionally confirm freshness:
   - projection offset >= route ledger end watermark, or
   - State Service active contract lookup, or
   - contract key lookup where supported.
6. Build command using:
   - contract_id for exact contract exercise, or
   - contract key for key-based exercise, or
   - create-and-exercise for instruction-style workflows.
7. If ledger rejects as stale/archived:
   - refresh projection
   - release soft reservation
   - normalize error as `stale_holding` or retry if safe.
```

Contract keys are useful for stable semantic identifiers, but they have visibility and contention limitations; a failed `fetchByKey`/`lookupByKey` is not sufficient proof of global nonexistence, and concurrent commands may contend. ([Digital Asset Documentation][4])

## Intent object

```json
{
  "id": "int_01JZ...",
  "object": "intent",
  "type": "transfer",
  "status": "processing",
  "from_account": "acct_123",
  "to_account": "acct_456",
  "asset": "asset_usdc_001",
  "amount": "100.00",
  "livemode": true,
  "created": 1779792000,
  "updated": 1779792003,
  "metadata": {
    "customer_order_id": "ord_789"
  },
  "latest_attempt": {
    "id": "cmdatt_01JZ...",
    "status": "submitted"
  }
}
```

### Intent statuses

| Status                  | Meaning                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `requires_confirmation` | Created but not submitted                                                          |
| `requires_action`       | External signature, approval, KYC/compliance action, or counterparty action needed |
| `compiling`             | Compiler resolving parties/contracts/bindings                                      |
| `submitted`             | Command submitted to participant                                                   |
| `processing`            | Accepted or waiting for completion/update                                          |
| `succeeded`             | Completion and ledger update confirmed                                             |
| `failed`                | Terminal ledger/API/rule failure                                                   |
| `canceled`              | Canceled before ledger submission or via compensating workflow                     |
| `expired`               | Timed out before required action or confirmation                                   |

## API endpoints

### Intent endpoints

```http
POST /v1/intents/transfers
POST /v1/intents/issuances
POST /v1/intents/redemptions
POST /v1/intents/settlements
POST /v1/intents/freezes
POST /v1/intents/{id}/confirm
POST /v1/intents/{id}/cancel
GET  /v1/intents/{id}
GET  /v1/intents
```

### Balance / Holding endpoints

```http
GET /v1/balances?account=acct_123
GET /v1/holdings?account=acct_123
GET /v1/holdings/{id}
```

### Asset endpoints

```http
POST /v1/assets
GET  /v1/assets/{id}
GET  /v1/assets
```

### Webhook endpoints

```http
POST /v1/webhook_endpoints
GET  /v1/webhook_endpoints
POST /v1/webhook_endpoints/{id}/rotate_secret
GET  /v1/events
GET  /v1/events/{id}
```

### Raw ledger escape hatch

```http
POST /v1/ledger/raw/commands
GET  /v1/ledger/raw/active_contracts
GET  /v1/ledger/raw/updates
GET  /v1/ledger/raw/packages
```

Raw endpoints require separate privileged scopes and are never used by standard SDK flows.

## API versioning

Pillar follows Stripe-style version pinning.

```http
Pillar-Version: 2026-05-26
```

Webhook endpoints also pin a response/event schema version.

```json
{
  "id": "we_123",
  "object": "webhook_endpoint",
  "url": "https://example.com/pillar/webhook",
  "enabled_events": [
    "intent.succeeded",
    "intent.failed",
    "holding.updated"
  ],
  "api_version": "2026-05-26"
}
```

Backward-compatible changes may add fields, enum values, or event types. SDKs and webhook handlers must tolerate unknown fields and unknown event types, mirroring Stripe’s versioning discipline. Stripe’s own docs explicitly warn integrations to handle unknown event types and document webhook/API behavior as versioned. ([Stripe Docs][12])

---

# Internal Runtime

## Runtime pipeline

```text
1. Receive API request.
2. Authenticate API key / account / environment.
3. Apply API version.
4. Apply external idempotency.
5. Create or reuse Intent.
6. Compile Intent → CompiledCommandPlan.
7. Resolve participant route.
8. Ensure completion stream is ready.
9. Submit command.
10. Persist command attempt.
11. Return Intent as processing.
12. Completion Tracker observes completion.
13. Update Indexer observes ledger update.
14. Projection updates holdings/balances.
15. Webhook Dispatcher emits events.
```

## Intent → Daml command

Daml command forms are:

* `CreateCommand`
* `ExerciseCommand`
* `ExerciseByKeyCommand`
* `CreateAndExerciseCommand`

The official command model supports create, exercise, exercise-by-key, and create-and-exercise as command types. ([Digital Asset Documentation][2])

### Example: transfer intent

External request:

```json
{
  "from_account": "acct_A",
  "to_account": "acct_B",
  "asset": "asset_USD",
  "amount": "100.00"
}
```

Compiled command plan:

```json
{
  "intent_id": "int_01JZ...",
  "operation": "transfer",
  "participant_route": {
    "participant_id": "par_issuer_main",
    "ledger_api_endpoint": "lep_issuer_main"
  },
  "user_id": "pillar-api-issuer",
  "act_as": ["Issuer::1220abcd..."],
  "read_as": ["Issuer::1220abcd..."],
  "workflow_id": "wf_01JZTRANSFER...",
  "command_id": "cmd_int_01JZ_step1_9f2a6d",
  "submission_id": "sub_int_01JZ_attempt1_01JZ...",
  "deduplication_period": "PT24H",
  "commands": [
    {
      "type": "ExerciseCommand",
      "template_id": "Pillar.Asset.Holding:Holding",
      "contract_id": "00d4...",
      "choice": "Transfer",
      "choice_argument": {
        "to": "Client::1220efgh...",
        "amount": "100.00",
        "externalIntentId": "int_01JZ..."
      }
    }
  ]
}
```

## ID design

| ID                | Scope                                         | Stability                       | Purpose                                          |
| ----------------- | --------------------------------------------- | ------------------------------- | ------------------------------------------------ |
| `request_id`      | Pillar API request                            | New per HTTP request            | Logs, support, trace                             |
| `idempotency_key` | Client + account + route + method + body hash | Client-provided                 | External retry safety                            |
| `intent_id`       | Pillar public object                          | Stable                          | Customer-facing operation                        |
| `workflow_id`     | Ledger workflow                               | Stable across workflow          | Groups ledger operations for one business intent |
| `command_id`      | Ledger change ID component                    | Stable for same logical command | Ledger deduplication and completion matching     |
| `submission_id`   | Submit attempt                                | New per retry attempt           | Distinguishes retries using same command ID      |
| `update_id`       | Participant ledger update                     | Assigned on success             | Links completion to actual ledger update         |

### ID rules

```text
workflow_id   = ledgerSafe("pillar/{env}/{tenant}/{intent_type}/{intent_id}")
command_id    = ledgerSafe("cmd/{intent_id}/{step}/{canonical_command_hash}")
submission_id = ledgerSafe("sub/{intent_id}/{attempt_ulid}")
```

Rules:

1. **Same logical ledger change → same `command_id`.**
2. **Every submit attempt → new `submission_id`.**
3. **Same business workflow → same `workflow_id`.**
4. **Every command plan stores canonical command hash.**
5. **Every public API request stores `request_id`.**
6. **Every external retry uses Stripe-like idempotency before reaching ledger deduplication.**

The Ledger API defines the intended change identity around `command_id` together with `user_id` and `act_as`, while `submission_id` distinguishes completions for retries with the same change identity. ([Digital Asset Documentation][2])

## Command completion tracking

Completion tracking is a first-class runtime, not an implementation detail.

### Completion tracker responsibilities

```text
For each participant route:
  - subscribe to completion stream
  - resume from stored completion offset
  - match completion by user_id + act_as + command_id + submission_id
  - store status, update_id, offset, trace_context
  - normalize ledger errors
  - transition intent state
  - notify Update Indexer / Webhook Dispatcher
```

### Completion state machine

```text
created
  → submit_started
  → submit_accepted
  → completion_success
  → update_indexed
  → intent_succeeded

created
  → submit_started
  → submit_rejected_sync
  → retryable_failure | terminal_failure

created
  → submit_started
  → submit_accepted
  → completion_failure
  → intent_failed

created
  → submit_started
  → no_completion_yet
  → processing
```

A missing completion is not automatically failure. It is `processing` until retry policy, ledger SLA, or operator workflow determines otherwise.

### Completion race control

Pillar follows this sequence:

```text
1. Ensure completion stream subscription is active.
2. Persist command_attempt with status = prepared.
3. Submit command.
4. Mark command_attempt = submitted only after submit call returns accepted.
5. Completion stream updates attempt to success/failure.
```

Canton’s command completion documentation explicitly notes that clients should subscribe before submitting to avoid races and that without a successful completion clients must not assume command success. ([Digital Asset Documentation][2])

## Canton Ledger API connection 방식

## gRPC Ledger API: production default

Use gRPC for:

* command submission
* command service `submit-and-wait` where appropriate
* completion streams
* update streams
* state service active contract bootstrap
* event query
* party/user management
* version/capability checks

```text
CantonAdapterGrpc
  - CommandSubmissionService
  - CommandService
  - CommandCompletionService
  - UpdateService
  - StateService
  - EventQueryService
  - PartyManagementService
  - UserManagementService
  - VersionService
```

The Ledger API service set includes command submission, command completion, command service, update, state, event query, party management, user management, and version services. ([Digital Asset Documentation][1])

## JSON Ledger API: controlled internal HTTP surface

Use JSON Ledger API for:

* Workbench inspection
* local development
* CLI experiments
* sandbox demos
* raw ledger escape hatch for simple command submission
* OpenAPI-generated admin clients
* customer support tooling behind Pillar auth

The JSON Ledger API provides HTTP/JSON access to most gRPC functionality and exposes OpenAPI/AsyncAPI descriptions, but it should not be exposed directly to the internet. ([Digital Asset Documentation][5])

## JSON vs gRPC selection 기준

| Use case                           | Preferred API                      | Reason                                                                           |
| ---------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| Production command submission      | gRPC                               | Lower-level control, streaming integration, typed proto, operational consistency |
| Completion tracking                | gRPC                               | Long-running stream and offset-based resume                                      |
| Update indexing                    | gRPC                               | High-volume ledger update stream                                                 |
| Active contract bootstrap          | gRPC State Service                 | Runtime-native projection bootstrap                                              |
| Workbench inspect                  | JSON                               | Easy HTTP/OpenAPI tooling                                                        |
| CLI sandbox demo                   | JSON or gRPC                       | JSON simpler; gRPC closer to production                                          |
| Raw command escape hatch           | JSON for simple, gRPC for advanced | JSON easier to validate/log; gRPC needed for full fidelity                       |
| Browser/frontend                   | Neither directly                   | Frontend calls Pillar API only                                                   |
| External customer integration      | Pillar API only                    | Canton-invisible external contract                                               |
| Interactive/external party signing | gRPC preferred                     | Better runtime control; JSON acceptable for tooling wrappers                     |

## Participant routing

Participant routing is resolved by the compiler, not by the customer.

### Routing inputs

```text
tenant_id
environment
account_id
asset_id
intent_type
party_mapping.capabilities
participant health
package vetting/deployment status
synchronizer availability
contract visibility
external signer mode
```

### Routing algorithm

```text
1. Resolve submitting account → candidate party mappings.
2. Filter mappings with required capability:
   - act_as
   - read_as
   - external_sign
3. Resolve asset binding and required Daml packages.
4. Filter participants that:
   - host the acting party or can execute external-party flow
   - have required DAR/packages
   - are connected to required synchronizer
   - have current health = healthy
5. Resolve contract visibility:
   - selected active contract must be visible to submitting party
   - if not visible, require Daml workflow, disclosure, observer, or counterparty action
6. Choose route by priority:
   - explicit tenant route override
   - asset-specific route
   - primary party mapping
   - least-lagging healthy participant
7. Store route on command_attempt.
```

Offsets are participant-local, so route-specific cursors are mandatory in multi-participant deployments. ([Digital Asset Documentation][1])

## Command deduplication

Pillar has three dedup layers.

### Layer 1 — External API idempotency

Scope:

```text
environment + account_id + method + path + idempotency_key
```

Stored fields:

```text
body_hash
response_status
response_body
request_id
intent_id
created_at
expires_at
```

Rules:

1. Same key + same body hash → return first result.
2. Same key + different body hash → `idempotency_error`.
3. Key TTL is at least 24 hours.
4. Keys must not contain PII.
5. Mutating endpoints require or strongly recommend `Idempotency-Key`.

Stripe stores the first result for an idempotency key, including error responses, and recommends high-entropy client-generated keys such as UUIDs. ([Stripe Docs][8])

### Layer 2 — Ledger command deduplication

Scope:

```text
user_id + act_as set + command_id
```

Rules:

1. Retry of the same logical command keeps the same `command_id`.
2. Each retry gets a new `submission_id`.
3. `deduplication_period` is configured per participant and capped by participant capability.
4. If ledger returns duplicate completion with success, Pillar maps it to the existing intent result.
5. If command body changed, compiler must produce a different `command_id`.

### Layer 3 — Projection and webhook deduplication

Projection dedup key:

```text
participant_id + update_id + event_id
```

Webhook event dedup key:

```text
event_type + object_id + ledger_update_id + semantic_version
```

Webhook delivery dedup key:

```text
webhook_event_id + endpoint_id + attempt_number
```

Webhooks must tolerate duplicate event delivery, and event processing should be asynchronous and deduplicated. Stripe’s webhook docs explicitly call out duplicate events and recommend asynchronous processing. ([Stripe Docs][10])

## Ledger error normalization

Pillar exposes Stripe-like errors while preserving ledger trace metadata internally.

### Error envelope

```json
{
  "error": {
    "type": "ledger_error",
    "code": "stale_holding",
    "message": "The holding changed before the transfer could be committed.",
    "param": "from_account",
    "request_id": "req_01JZ...",
    "intent": "int_01JZ...",
    "ledger": {
      "workflow_id": "wf_01JZ...",
      "command_id": "cmd_int_01JZ_step1_9f2a6d",
      "submission_id": "sub_int_01JZ_attempt1_...",
      "participant_id": "par_issuer_main",
      "grpc_code": "ABORTED",
      "completion_offset": "000000..."
    }
  }
}
```

### Normalization table

| Ledger/runtime condition                | Pillar error type       |                       Code |                HTTP |
| --------------------------------------- | ----------------------- | -------------------------: | ------------------: |
| Invalid request schema                  | `invalid_request_error` |          `invalid_request` |                 400 |
| Unknown asset/account                   | `invalid_request_error` |         `resource_missing` |                 404 |
| No party mapping                        | `configuration_error`   |    `party_mapping_missing` |                 424 |
| Missing package/template/choice binding | `configuration_error`   |     `daml_binding_missing` |                 424 |
| Not authorized to `actAs/readAs`        | `permission_error`      | `ledger_permission_denied` |                 403 |
| Contract archived/stale                 | `ledger_error`          |            `stale_holding` |                 409 |
| Contract key duplicate                  | `ledger_error`          |   `duplicate_contract_key` |                 409 |
| Command duplicate with same result      | no error                |     return original result |             200/202 |
| Command duplicate with mismatch         | `idempotency_error`     |    `ledger_dedup_conflict` |                 409 |
| Daml rule violation                     | `ledger_error`          |    `ledger_rule_violation` |                 422 |
| Participant unavailable                 | `api_error`             |  `participant_unavailable` |                 503 |
| Completion timeout                      | no terminal error       |               `processing` |                 202 |
| Update stream lag                       | no terminal error       |       `projection_lagging` |                 202 |
| Synchronizer unavailable                | `ledger_error`          | `synchronizer_unavailable` |             424/503 |
| External signature required             | no error                |          `requires_action` |                 202 |
| Raw ledger command rejected             | `ledger_error`          |        raw normalized code | 400/403/409/422/503 |

## Raw ledger escape hatch

Raw ledger access is a controlled escape hatch, not a product default.

### Allowed capabilities

```http
POST /v1/ledger/raw/commands
GET  /v1/ledger/raw/active_contracts
GET  /v1/ledger/raw/updates
GET  /v1/ledger/raw/packages
```

### Required controls

* Separate API scope: `ledger.raw.read`, `ledger.raw.write`
* Environment allowlist; sandbox/test by default
* Template/choice allowlist
* Party allowlist
* Participant allowlist
* mTLS or private network for live use
* Mandatory `reason` and `ticket_id`
* Full request/response audit
* Sensitive payload redaction
* No bypass of Canton authorization
* No bypass of Pillar idempotency
* Operator approval for live write operations

### Example raw command request

```json
{
  "participant": "par_issuer_main",
  "user_id": "pillar-api-issuer",
  "act_as": ["Issuer::1220abcd..."],
  "read_as": [],
  "workflow_id": "wf_raw_01JZ...",
  "command_id": "cmd_raw_01JZ...",
  "submission_id": "sub_raw_01JZ...",
  "commands": [
    {
      "type": "ExerciseCommand",
      "template_id": "Pillar.Asset.Holding:Holding",
      "contract_id": "00d4...",
      "choice": "Freeze",
      "choice_argument": {
        "reason": "compliance_review"
      }
    }
  ],
  "reason": "Support ticket escalation",
  "ticket_id": "SUP-1234"
}
```

---

# Adapter Interface Pseudo-code

## Core types

```ts
type PillarId = string;
type PartyId = string;
type ParticipantId = string;
type LedgerOffset = string;
type ContractId = string;

type Environment = "sandbox" | "test" | "live";

interface CompileContext {
  env: Environment;
  tenantId: string;
  apiVersion: string;
  requestId: string;
  idempotencyKey?: string;
  traceContext: TraceContext;
}

interface ParticipantRoute {
  participantId: ParticipantId;
  endpointId: string;
  apiKind: "grpc" | "json";
  ledgerApiUrl: string;
  userId: string;
  synchronizerId?: string;
  authContext: LedgerAuthContext;
}

interface PartyMapping {
  accountId: PillarId;
  partyId: PartyId;
  userId: string;
  participantId: ParticipantId;
  capabilities: Array<"act_as" | "read_as" | "external_sign">;
  synchronizerIds: string[];
  externalSignerId?: string;
}

interface DamlBinding {
  operation: string;
  templateId: string;
  interfaceId?: string;
  choiceName?: string;
  packageName: string;
  packageVersionConstraint?: string;
  encoder: ChoiceArgumentEncoder;
}

interface ActiveContractRef {
  contractId: ContractId;
  templateId: string;
  key?: unknown;
  payloadHash: string;
  ownerParty: PartyId;
  assetId: PillarId;
  holdingId: PillarId;
  participantId: ParticipantId;
  observedAtOffset: LedgerOffset;
}

interface CompiledCommandPlan {
  intentId: PillarId;
  operation: string;

  route: ParticipantRoute;

  userId: string;
  actAs: PartyId[];
  readAs: PartyId[];

  workflowId: string;
  commandId: string;
  submissionId: string;
  deduplicationPeriod?: string;

  commands: DamlCommand[];

  disclosedContracts?: DisclosedContract[];
  packageIdSelectionPreference?: string[];
  prefetchContractKeys?: PrefetchContractKey[];

  traceContext: TraceContext;

  externalObjectRefs: {
    accountIds: PillarId[];
    assetIds: PillarId[];
    holdingIds: PillarId[];
  };

  canonicalCommandHash: string;
}
```

## Intent Compiler interface

```ts
interface IntentCompiler {
  compile(ctx: CompileContext, intent: Intent): Promise<CompiledCommandPlan>;
}

class DefaultIntentCompiler implements IntentCompiler {
  constructor(
    private bindings: DamlBindingRegistry,
    private parties: AccountPartyResolver,
    private assets: AssetBindingResolver,
    private holdings: ActiveContractResolver,
    private ids: LedgerIdFactory
  ) {}

  async compile(ctx: CompileContext, intent: Intent): Promise<CompiledCommandPlan> {
    switch (intent.type) {
      case "transfer":
        return this.compileTransfer(ctx, intent as TransferIntent);
      case "issuance":
        return this.compileIssuance(ctx, intent as IssuanceIntent);
      case "redemption":
        return this.compileRedemption(ctx, intent as RedemptionIntent);
      default:
        throw new PillarError("invalid_request_error", "unsupported_intent_type");
    }
  }

  private async compileTransfer(
    ctx: CompileContext,
    intent: TransferIntent
  ): Promise<CompiledCommandPlan> {
    const binding = await this.bindings.resolve({
      apiVersion: ctx.apiVersion,
      operation: "transfer",
      assetId: intent.asset
    });

    const from = await this.parties.resolveActAs({
      accountId: intent.fromAccount,
      capability: "act_as",
      assetId: intent.asset
    });

    const to = await this.parties.resolveParty({
      accountId: intent.toAccount,
      capability: "read_as",
      assetId: intent.asset
    });

    const asset = await this.assets.resolve(intent.asset);

    const holding = await this.holdings.selectForDebit({
      accountId: intent.fromAccount,
      partyId: from.partyId,
      assetId: intent.asset,
      amount: intent.amount,
      operation: "transfer",
      requireFreshAtLeast: "route_ledger_end_or_newer"
    });

    const route = await this.parties.route({
      accountId: intent.fromAccount,
      partyId: from.partyId,
      participantId: from.participantId,
      assetId: intent.asset,
      operation: "transfer"
    });

    const choiceArgument = binding.encoder.encode({
      from: from.partyId,
      to: to.partyId,
      asset: asset.ledgerAssetKey,
      amount: intent.amount,
      externalIntentId: intent.id,
      metadataHash: hashMetadata(intent.metadata)
    });

    const command: DamlCommand = {
      kind: "ExerciseCommand",
      templateId: binding.templateId,
      contractId: holding.contractId,
      choice: binding.choiceName ?? "Transfer",
      choiceArgument
    };

    const canonicalCommandHash = canonicalHash({
      route: route.participantId,
      userId: from.userId,
      actAs: [from.partyId],
      readAs: [],
      command
    });

    return {
      intentId: intent.id,
      operation: "transfer",
      route,
      userId: from.userId,
      actAs: [from.partyId],
      readAs: [],
      workflowId: this.ids.workflowId(ctx, intent),
      commandId: this.ids.commandId(ctx, intent, "step1", canonicalCommandHash),
      submissionId: this.ids.submissionId(ctx, intent),
      deduplicationPeriod: "PT24H",
      commands: [command],
      traceContext: ctx.traceContext,
      externalObjectRefs: {
        accountIds: [intent.fromAccount, intent.toAccount],
        assetIds: [intent.asset],
        holdingIds: [holding.holdingId]
      },
      canonicalCommandHash
    };
  }
}
```

## Canton Adapter interface

```ts
interface CantonAdapter {
  submit(
    plan: CompiledCommandPlan,
    mode: "async" | "submit_and_wait"
  ): Promise<SubmissionReceipt>;

  streamCompletions(
    route: ParticipantRoute,
    cursor: CompletionCursor,
    handler: (completion: LedgerCompletion) => Promise<void>
  ): Promise<StreamHandle>;

  streamUpdates(
    route: ParticipantRoute,
    cursor: UpdateCursor,
    filter: UpdateFilter,
    handler: (update: LedgerUpdate) => Promise<void>
  ): Promise<StreamHandle>;

  getActiveContracts(
    route: ParticipantRoute,
    query: ActiveContractQuery
  ): Promise<ActiveContractRef[]>;

  lookupContract(
    route: ParticipantRoute,
    ref: { contractId?: ContractId; key?: unknown; templateId: string }
  ): Promise<ActiveContractRef | null>;

  raw<TReq, TRes>(
    route: ParticipantRoute,
    operation: RawLedgerOperation<TReq>
  ): Promise<TRes>;
}
```

## gRPC adapter sketch

```ts
class GrpcCantonAdapter implements CantonAdapter {
  constructor(
    private connections: LedgerConnectionPool,
    private normalizer: LedgerErrorNormalizer
  ) {}

  async submit(
    plan: CompiledCommandPlan,
    mode: "async" | "submit_and_wait"
  ): Promise<SubmissionReceipt> {
    const conn = await this.connections.grpc(plan.route);

    const request = toGrpcCommandsRequest({
      userId: plan.userId,
      actAs: plan.actAs,
      readAs: plan.readAs,
      workflowId: plan.workflowId,
      commandId: plan.commandId,
      submissionId: plan.submissionId,
      deduplicationPeriod: plan.deduplicationPeriod,
      commands: plan.commands,
      synchronizerId: plan.route.synchronizerId,
      disclosedContracts: plan.disclosedContracts,
      packageIdSelectionPreference: plan.packageIdSelectionPreference,
      prefetchContractKeys: plan.prefetchContractKeys,
      traceContext: plan.traceContext
    });

    try {
      if (mode === "submit_and_wait") {
        const response = await conn.commandService.submitAndWait(request);
        return {
          accepted: true,
          mode,
          commandId: plan.commandId,
          submissionId: plan.submissionId,
          updateId: response.updateId
        };
      }

      await conn.commandSubmissionService.submit(request);
      return {
        accepted: true,
        mode,
        commandId: plan.commandId,
        submissionId: plan.submissionId
      };
    } catch (e) {
      throw this.normalizer.normalizeSyncSubmitError(e, plan);
    }
  }

  async streamCompletions(
    route: ParticipantRoute,
    cursor: CompletionCursor,
    handler: (completion: LedgerCompletion) => Promise<void>
  ): Promise<StreamHandle> {
    const conn = await this.connections.grpc(route);

    const stream = conn.commandCompletionService.completionStream({
      userId: route.userId,
      parties: cursor.parties,
      beginExclusive: cursor.offset
    });

    stream.on("data", async (grpcCompletion) => {
      const completion = fromGrpcCompletion(grpcCompletion, route);
      await handler(completion);
    });

    stream.on("error", (err) => {
      // reconnect policy owns retry and cursor resume
      throw this.normalizer.normalizeStreamError(err, route);
    });

    return { close: () => stream.cancel() };
  }

  async streamUpdates(
    route: ParticipantRoute,
    cursor: UpdateCursor,
    filter: UpdateFilter,
    handler: (update: LedgerUpdate) => Promise<void>
  ): Promise<StreamHandle> {
    const conn = await this.connections.grpc(route);

    const stream = conn.updateService.updates({
      beginExclusive: cursor.offset,
      filter: toGrpcUpdateFilter(filter)
    });

    stream.on("data", async (grpcUpdate) => {
      await handler(fromGrpcUpdate(grpcUpdate, route));
    });

    return { close: () => stream.cancel() };
  }

  async getActiveContracts(
    route: ParticipantRoute,
    query: ActiveContractQuery
  ): Promise<ActiveContractRef[]> {
    const conn = await this.connections.grpc(route);

    const response = await conn.stateService.activeContracts(
      toGrpcActiveContractsRequest(query)
    );

    return response.contracts.map(fromGrpcActiveContract);
  }

  async lookupContract(
    route: ParticipantRoute,
    ref: { contractId?: ContractId; key?: unknown; templateId: string }
  ): Promise<ActiveContractRef | null> {
    const contracts = await this.getActiveContracts(route, {
      templateId: ref.templateId,
      contractId: ref.contractId,
      key: ref.key
    });

    return contracts[0] ?? null;
  }

  async raw<TReq, TRes>(
    route: ParticipantRoute,
    operation: RawLedgerOperation<TReq>
  ): Promise<TRes> {
    const conn = await this.connections.grpc(route);
    return executeRawGrpcOperation(conn, operation) as Promise<TRes>;
  }
}
```

## Completion tracker sketch

```ts
class CommandCompletionTracker {
  constructor(
    private adapter: CantonAdapter,
    private attempts: CommandAttemptRepository,
    private intents: IntentRepository,
    private cursors: CompletionCursorRepository,
    private errors: LedgerErrorNormalizer
  ) {}

  async run(route: ParticipantRoute, parties: PartyId[]): Promise<void> {
    const cursor = await this.cursors.load(route.participantId, route.userId, parties);

    await this.adapter.streamCompletions(route, cursor, async (completion) => {
      const attempt = await this.attempts.findByLedgerIdentity({
        participantId: route.participantId,
        userId: completion.userId,
        actAs: completion.actAs,
        commandId: completion.commandId,
        submissionId: completion.submissionId
      });

      if (!attempt) {
        await this.attempts.recordUnmatchedCompletion(completion);
        await this.cursors.save(route, parties, completion.offset);
        return;
      }

      if (completion.status === "OK") {
        await this.attempts.markCompleted({
          attemptId: attempt.id,
          updateId: completion.updateId!,
          completionOffset: completion.offset,
          traceContext: completion.traceContext
        });

        await this.intents.markProcessing(attempt.intentId, {
          reason: "completion_success_waiting_for_update",
          updateId: completion.updateId!
        });
      } else {
        const normalized = this.errors.normalizeCompletionError(completion, attempt);

        await this.attempts.markFailed(attempt.id, normalized);
        await this.intents.markFailed(attempt.intentId, normalized);
      }

      await this.cursors.save(route, parties, completion.offset);
    });
  }
}
```

## ID factory sketch

```ts
class LedgerIdFactory {
  workflowId(ctx: CompileContext, intent: Intent): string {
    return ledgerSafe(
      `pillar/${ctx.env}/${ctx.tenantId}/${intent.type}/${intent.id}`
    );
  }

  commandId(
    ctx: CompileContext,
    intent: Intent,
    step: string,
    canonicalCommandHash: string
  ): string {
    return ledgerSafe(
      `cmd/${intent.id}/${step}/${canonicalCommandHash.slice(0, 16)}`
    );
  }

  submissionId(ctx: CompileContext, intent: Intent): string {
    return ledgerSafe(
      `sub/${intent.id}/${ulid()}`
    );
  }
}
```

---

# DB Schema

Pillar DB는 ledger truth를 대체하지 않는다. 모든 projection은 rebuild 가능해야 한다.

## Config tables

```sql
create table participant_endpoints (
  id text primary key,                         -- lep_...
  environment text not null,
  tenant_id text not null,
  participant_id text not null,                -- par_...
  alias text not null,
  api_kind text not null,                      -- grpc | json
  ledger_api_url text not null,
  tls_profile_id text,
  auth_profile_id text,
  health_status text not null default 'unknown',
  version_info jsonb,
  synchronizer_ids text[] not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table party_mappings (
  id text primary key,                         -- pm_...
  environment text not null,
  tenant_id text not null,
  account_id text not null,                    -- acct_...
  participant_endpoint_id text not null references participant_endpoints(id),
  participant_id text not null,
  party_id text not null,
  user_id text not null,
  capabilities text[] not null,
  act_as_allowed boolean not null default false,
  read_as_allowed boolean not null default false,
  external_signer_id text,
  synchronizer_ids text[] not null default '{}',
  primary_mapping boolean not null default false,
  status text not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table daml_bindings (
  id text primary key,
  environment text not null,
  tenant_id text not null,
  api_version text not null,
  ledger_profile text not null,
  operation text not null,                     -- transfer, issuance, redemption...
  asset_type text,
  template_id text not null,
  interface_id text,
  choice_name text,
  package_name text not null,
  package_version_constraint text,
  encoder_version text not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table webhook_endpoints (
  id text primary key,                         -- we_...
  environment text not null,
  tenant_id text not null,
  account_id text,
  url text not null,
  enabled_events text[] not null,
  api_version text not null,
  signing_secret_ref text not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

## Projection tables

```sql
create table ledger_offsets (
  id text primary key,
  environment text not null,
  participant_id text not null,
  route_key text not null,
  stream_type text not null,                   -- completions | updates | state_bootstrap
  user_id text,
  party_set_hash text,
  offset text not null,
  updated_at timestamptz not null,
  unique (environment, participant_id, route_key, stream_type, user_id, party_set_hash)
);

create table active_contract_projection (
  id text primary key,
  environment text not null,
  tenant_id text not null,
  participant_id text not null,
  contract_id text not null,
  template_id text not null,
  package_id text,
  contract_key_hash text,
  payload_hash text not null,
  payload_redacted jsonb,
  signatories text[] not null,
  observers text[] not null,
  witnesses text[] not null,
  owner_party text,
  account_id text,
  asset_id text,
  holding_id text,
  status text not null,                        -- active | archived
  created_update_id text,
  archived_update_id text,
  created_event_id text,
  archived_event_id text,
  created_at_ledger timestamptz,
  archived_at_ledger timestamptz,
  last_seen_offset text not null,
  updated_at timestamptz not null,
  unique (environment, participant_id, contract_id)
);

create table holdings_projection (
  id text primary key,                         -- hld_...
  environment text not null,
  tenant_id text not null,
  account_id text not null,
  asset_id text not null,
  party_id text not null,
  participant_id text not null,
  balance numeric not null,
  available numeric not null,
  locked numeric not null,
  status text not null,
  source_contract_ids text[] not null,
  last_update_id text not null,
  last_offset text not null,
  updated_at timestamptz not null
);

create table balances_projection (
  id text primary key,                         -- bal_...
  environment text not null,
  tenant_id text not null,
  account_id text not null,
  asset_id text not null,
  balance numeric not null,
  available numeric not null,
  locked numeric not null,
  pending numeric not null,
  last_update_id text not null,
  last_offset text not null,
  updated_at timestamptz not null,
  unique (environment, tenant_id, account_id, asset_id)
);
```

## Audit/control tables

```sql
create table idempotency_records (
  id text primary key,
  environment text not null,
  tenant_id text not null,
  account_id text not null,
  method text not null,
  path text not null,
  idempotency_key_hash text not null,
  request_body_hash text not null,
  response_status integer,
  response_body jsonb,
  intent_id text,
  request_id text not null,
  status text not null,                        -- in_progress | completed | failed
  expires_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (environment, tenant_id, account_id, method, path, idempotency_key_hash)
);

create table intents (
  id text primary key,                         -- int_...
  environment text not null,
  tenant_id text not null,
  account_id text,
  type text not null,
  status text not null,
  api_version text not null,
  request_id text not null,
  idempotency_record_id text references idempotency_records(id),
  amount numeric,
  asset_id text,
  from_account_id text,
  to_account_id text,
  metadata jsonb not null default '{}',
  normalized_request jsonb not null,
  latest_command_attempt_id text,
  failure jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table command_plans (
  id text primary key,
  environment text not null,
  tenant_id text not null,
  intent_id text not null references intents(id),
  participant_id text not null,
  user_id text not null,
  act_as text[] not null,
  read_as text[] not null,
  workflow_id text not null,
  command_id text not null,
  canonical_command_hash text not null,
  plan_redacted jsonb not null,
  status text not null,                        -- compiled | submitted | superseded
  created_at timestamptz not null
);

create table command_attempts (
  id text primary key,                         -- cmdatt_...
  environment text not null,
  tenant_id text not null,
  intent_id text not null references intents(id),
  command_plan_id text not null references command_plans(id),
  participant_id text not null,
  user_id text not null,
  act_as text[] not null,
  workflow_id text not null,
  command_id text not null,
  submission_id text not null,
  status text not null,                        -- prepared | submitted | completed | failed
  submit_started_at timestamptz,
  submit_accepted_at timestamptz,
  completion_offset text,
  update_id text,
  ledger_status jsonb,
  normalized_error jsonb,
  trace_context jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (environment, participant_id, user_id, command_id, submission_id)
);

create table ledger_events_audit (
  id text primary key,
  environment text not null,
  participant_id text not null,
  update_id text not null,
  event_id text not null,
  workflow_id text,
  command_id text,
  contract_id text,
  template_id text,
  event_kind text not null,                    -- created | exercised | archived
  event_redacted jsonb not null,
  offset text not null,
  observed_at timestamptz not null,
  unique (environment, participant_id, update_id, event_id)
);

create table webhook_events (
  id text primary key,                         -- evt_...
  environment text not null,
  tenant_id text not null,
  type text not null,
  object_id text not null,
  api_version text not null,
  ledger_update_id text,
  payload jsonb not null,
  status text not null,                        -- pending | delivered | failed
  created_at timestamptz not null,
  unique (environment, tenant_id, type, object_id, ledger_update_id, api_version)
);

create table webhook_deliveries (
  id text primary key,
  webhook_event_id text not null references webhook_events(id),
  webhook_endpoint_id text not null references webhook_endpoints(id),
  attempt_number integer not null,
  status text not null,                        -- pending | succeeded | failed
  request_headers jsonb,
  response_status integer,
  response_body_redacted text,
  error text,
  next_retry_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (webhook_event_id, webhook_endpoint_id, attempt_number)
);

create table raw_ledger_audit (
  id text primary key,                         -- rawop_...
  environment text not null,
  tenant_id text not null,
  actor_account_id text,
  participant_id text not null,
  user_id text not null,
  act_as text[] not null,
  operation text not null,
  workflow_id text,
  command_id text,
  submission_id text,
  request_redacted jsonb not null,
  response_redacted jsonb,
  reason text not null,
  ticket_id text,
  status text not null,
  created_at timestamptz not null
);
```

---

# Failure Modes

## Compile-time failures

| Failure               | Example                              | Handling                                                                           |
| --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| Missing account       | `acct_` not found                    | `resource_missing`, 404                                                            |
| Missing party mapping | Account has no live party            | `party_mapping_missing`, 424                                                       |
| Suspended mapping     | Account party disabled               | `account_unavailable`, 403/423                                                     |
| Missing asset binding | Asset has no Daml template binding   | `asset_binding_missing`, 424                                                       |
| No active holding     | Insufficient available position      | `insufficient_holding`, 402/409                                                    |
| Stale projection      | Projection lag above threshold       | Return `processing` or `projection_lagging`; optionally force ledger state refresh |
| Unsupported operation | Asset cannot be redeemed/transferred | `unsupported_operation`, 400/422                                                   |

## Submission failures

| Failure                    | Handling                                                           |
| -------------------------- | ------------------------------------------------------------------ |
| gRPC auth denied           | Normalize to `ledger_permission_denied`; do not retry blindly      |
| Participant unavailable    | Retry with backoff if route allows; else `participant_unavailable` |
| Package/template not found | `daml_binding_missing` or `package_not_available`; operator alert  |
| Invalid command payload    | Compiler bug or incompatible API version; fail terminal and alert  |
| Synchronizer unavailable   | Retry if transient; otherwise `synchronizer_unavailable`           |
| External signature missing | Transition intent to `requires_action`                             |

## Completion failures

| Failure               | Handling                                                                                |
| --------------------- | --------------------------------------------------------------------------------------- |
| Contract archived     | Refresh projection; retry only if operation semantics allow reselection                 |
| Daml assertion failed | Terminal `ledger_rule_violation`                                                        |
| Duplicate command     | Return original result if same command hash; otherwise conflict                         |
| Command timed out     | Keep `processing`; query completions/updates before retry                               |
| Completion stream gap | Reconnect from last offset; if impossible, rebuild projection from State/Update Service |
| Unmatched completion  | Store audit row; reconcile by command ID/submission ID later                            |

## Projection failures

| Failure                     | Handling                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Update stream lag           | Surface `projection_lagging` in Workbench; webhooks delayed                         |
| Offset mismatch             | Treat per participant; never compare offsets globally                               |
| Payload decoder failure     | Store raw/redacted event, mark projection degraded, alert                           |
| Duplicate event             | Idempotent insert by `(participant_id, update_id, event_id)`                        |
| Contract visibility missing | Do not infer global absence; request additional party visibility or workflow change |

## Webhook failures

| Failure                                    | Handling                                                     |
| ------------------------------------------ | ------------------------------------------------------------ |
| Endpoint timeout                           | Retry with exponential backoff                               |
| 4xx response                               | Retry selected codes; otherwise mark failed depending policy |
| 5xx response                               | Retry                                                        |
| Duplicate delivery                         | Normal; customer should dedup by `evt_`                      |
| Signature verification failure by customer | Customer-side issue; expose delivery logs                    |
| Event schema version mismatch              | Endpoint pinned version; do not silently upgrade             |

---

# Security / Compliance

## Ledger API exposure

* Canton Ledger API is never directly customer-facing.
* JSON Ledger API is not exposed to public internet; it sits behind Pillar auth, reverse proxy, network controls, and audit. This aligns with official JSON Ledger API guidance. ([Digital Asset Documentation][5])
* gRPC endpoints are private service-to-service connections with mTLS where possible.

## AuthZ model

Pillar uses layered authorization.

```text
External API key
  → tenant/account permissions
  → operation permissions
  → party mapping capability
  → participant user actAs/readAs authorization
  → Daml authorization/rules
```

No Pillar authorization decision can override Canton/Daml authorization. If ledger rejects, ledger wins.

## Secret handling

* API keys are hashed.
* Webhook secrets are KMS-backed.
* Ledger JWT signing keys are KMS/HSM-backed.
* External party signing keys are never stored as raw private keys in Pillar.
* Idempotency keys are hashed and must not contain PII.
* Raw ledger payloads are redacted or encrypted at rest.

## Compliance hooks

Before compilation, Pillar can run compliance policies:

```text
intent.created
  → sanctions / KYC / account status check
  → asset policy check
  → jurisdiction policy check
  → transfer limit check
  → compile or requires_action / failed
```

These checks are pre-ledger controls. Ledger remains the final source for state transitions.

## Auditability

Every ledger-affecting operation stores:

* external account
* request ID
* idempotency key hash
* API version
* intent ID
* command plan hash
* workflow ID
* command ID
* submission ID
* participant ID
* user ID
* actAs/readAs
* completion offset
* update ID
* webhook event IDs

## Webhook security

Pillar webhook delivery uses:

* endpoint-specific signing secret
* timestamped signature header
* raw body signature
* replay tolerance window
* delivery attempt logging
* retry policy
* event dedup by `evt_`

Stripe’s webhook docs emphasize verifying raw body signatures and returning 2xx quickly before complex processing. ([Stripe Docs][10])

---

# Implementation Plan

## Phase 0 — Reference architecture and binding registry

Deliverables:

* `DamlBindingRegistry`
* `PartyMapping` model
* `ParticipantEndpoint` model
* `LedgerIdFactory`
* API versioning framework
* error normalization taxonomy
* first Workbench trace view mock

Exit criteria:

* Given an external transfer intent, system can produce a redacted `CompiledCommandPlan` without submitting.

## Phase 1 — gRPC Canton Adapter MVP

Deliverables:

* gRPC connection pool
* command submission client
* completion stream client
* update stream client
* state active contract bootstrap
* version/capability check
* participant health check

Exit criteria:

* Local Canton sandbox can submit a test command.
* Completion tracker records success/failure.
* Update indexer records active contract changes.

## Phase 2 — Projection layer

Deliverables:

* `active_contract_projection`
* `holdings_projection`
* `balances_projection`
* projection rebuild command
* offset cursor handling
* payload decoder/encoder registry

Exit criteria:

* `GET /v1/holdings` and `GET /v1/balances` are served only from projection.
* Projection can be dropped and rebuilt from ledger-visible state.

## Phase 3 — Intent Compiler for core asset flows

Implement in this order:

1. `transfer_intent`
2. `issuance_intent`
3. `redemption_intent`
4. `freeze_intent`
5. `settlement_intent`

Exit criteria:

* Each intent compiles to command plan.
* Each intent transitions through `processing → succeeded/failed`.
* Ledger trace is visible in Workbench.

## Phase 4 — External API idempotency and SDK grammar

Deliverables:

* `Idempotency-Key` middleware
* canonical body hash
* idempotency conflict handling
* TypeScript SDK
* Python SDK
* CLI command wrappers
* API changelog and version pinning

Exit criteria:

* Same mutating request with same idempotency key returns identical response.
* Same key with different body returns `idempotency_error`.
* SDK hides Canton entirely.

## Phase 5 — Webhook-first workflow

Deliverables:

* `webhook_endpoints`
* `webhook_events`
* `webhook_deliveries`
* signature generation
* retry engine
* thin event payloads
* `pillar listen` CLI
* Workbench delivery logs

Exit criteria:

* `intent.succeeded`, `intent.failed`, `holding.updated`, `balance.updated` events are delivered.
* Duplicate delivery is safe.
* Customer can replay event from Workbench/CLI.

## Phase 6 — JSON Ledger API and raw escape hatch

Deliverables:

* JSON Ledger API client
* raw command endpoint
* active contract inspect endpoint
* package inspect endpoint
* strict permission model
* redaction/audit
* live-environment approval policy

Exit criteria:

* Privileged operator can submit raw command in sandbox.
* Live raw writes require explicit elevated scope and full audit.

## Phase 7 — Workbench / CLI / Sandbox

Deliverables:

* Workbench request log
* Intent trace view
* Ledger command/update trace view
* Projection lag dashboard
* Webhook delivery dashboard
* `pillar sandbox up`
* `pillar trigger`
* `pillar ledger inspect`
* local Canton sandbox integration

Exit criteria:

* Developer can run local end-to-end flow with sandbox Canton, Pillar API, and webhook listener.
* Operator can trace `intent_id → update_id → webhook event`.

## Phase 8 — Multi-participant and external party routing

Deliverables:

* participant routing policy engine
* external-party signing workflow
* synchronizer-aware routing
* package vetting checks
* per-participant offset isolation
* failover policy

Exit criteria:

* Same external API works across local sandbox, testnet, mainnet-style deployment, and customer-hosted participant topology.

---

# Open Questions

1. **Asset Daml model**
   Will Pillar use a proprietary asset model, a token standard, Splice/Canton Network token abstractions, or adapters for multiple models?

2. **Holding granularity**
   Is one `Holding` one contract, an aggregation over many contracts, or policy-dependent? Recommended: public `Holding` is aggregate; internal resolver may select many contracts.

3. **Contract key strategy**
   Should every holding-bearing contract have a semantic key? Recommended: yes for idempotent issuance/account asset positions, but not as the only lookup mechanism.

4. **Custody model**
   Will accounts be segregated ledger parties, omnibus sub-accounts inside contracts, or both? Recommended: support both via `PartyMapping.mode`.

5. **External party support**
   Is external signing required in v1? If yes, the compiler must support `requires_action` and prepare/sign/execute.

6. **Webhook event payload style**
   Thin events are operationally safer and version-stable; snapshot events are easier for customers. Recommended: thin by default, `expand[]` or endpoint config for snapshots.

7. **API version cadence**
   Should Pillar use date-based versions only, or date + named major versions? Recommended: date-based public versions, internal semantic versions for compiler/binding.

8. **Deduplication TTL**
   Stripe-like external idempotency should be at least 24h. Ledger dedup duration depends on participant configuration. Pillar must discover and cap per route.

9. **Projection freshness SLA**
   What maximum projection lag is acceptable before mutating intents require direct ledger confirmation?

10. **Raw ledger availability**
    Should customers get raw ledger escape hatch or only operators? Recommended: operators and enterprise customers only, disabled by default.

11. **Compliance finality**
    Which compliance checks are pre-ledger only, and which must be encoded as Daml authorization/rules?

12. **Deployment profiles**
    Need explicit profiles: local sandbox, Pillar-hosted participant, customer-hosted participant, Canton Network validator, hybrid.

---

# Agent-ready Checklist

## Research / docs

* [ ] Confirm target Canton/Daml version and Ledger API version.
* [ ] Confirm JSON Ledger API v2 endpoint compatibility in target deployment.
* [ ] Confirm participant max deduplication duration.
* [ ] Confirm party/user management permissions.
* [ ] Confirm sandbox startup command and DAR loading path.
* [ ] Confirm Stripe-like API versioning policy and public changelog process.
* [ ] Confirm webhook signature format and retry policy.

## API grammar

* [ ] Define public ID prefixes.
* [ ] Define `/v1/intents/*` endpoints.
* [ ] Define `/v1/balances` and `/v1/holdings`.
* [ ] Define idempotency behavior for all mutating endpoints.
* [ ] Define `Pillar-Version` behavior.
* [ ] Define webhook event types.
* [ ] Define thin vs snapshot event payload.
* [ ] Define error object schema.

## Compiler

* [ ] Implement `DamlBindingRegistry`.
* [ ] Implement `AccountPartyResolver`.
* [ ] Implement `AssetBindingResolver`.
* [ ] Implement `ActiveContractResolver`.
* [ ] Implement `LedgerIdFactory`.
* [ ] Implement transfer compiler.
* [ ] Implement issuance compiler.
* [ ] Implement redemption compiler.
* [ ] Implement freeze compiler.
* [ ] Implement canonical command hashing.
* [ ] Implement redacted command plan audit.

## Canton Adapter

* [ ] Implement gRPC connection pool.
* [ ] Implement command submission.
* [ ] Implement submit-and-wait wrapper.
* [ ] Implement completion stream.
* [ ] Implement update stream.
* [ ] Implement state active contract bootstrap.
* [ ] Implement version service check.
* [ ] Implement JSON API client for Workbench/raw use.
* [ ] Implement participant health checks.
* [ ] Implement synchronizer-aware routing.

## Deduplication / tracking

* [ ] Implement external idempotency table.
* [ ] Implement command attempt table.
* [ ] Implement completion cursor table.
* [ ] Implement update cursor table.
* [ ] Implement duplicate command handling.
* [ ] Implement unmatched completion reconciliation.
* [ ] Implement projection event dedup.
* [ ] Implement webhook delivery dedup.

## Projection

* [ ] Implement active contract projection.
* [ ] Implement holdings projection.
* [ ] Implement balances projection.
* [ ] Implement projection rebuild.
* [ ] Implement payload decoder registry.
* [ ] Implement projection lag metrics.
* [ ] Implement stale holding refresh.

## Errors

* [ ] Implement synchronous submit error normalization.
* [ ] Implement async completion error normalization.
* [ ] Implement Daml rule violation mapping.
* [ ] Implement stale/archived contract mapping.
* [ ] Implement participant routing error mapping.
* [ ] Implement idempotency conflict mapping.
* [ ] Implement raw ledger error mapping.

## Webhooks

* [ ] Implement webhook endpoint CRUD.
* [ ] Implement event generation from intent/projection changes.
* [ ] Implement signature generation.
* [ ] Implement retry queue.
* [ ] Implement replay endpoint.
* [ ] Implement CLI listener.
* [ ] Implement Workbench delivery logs.

## Security / compliance

* [ ] Implement scoped API keys.
* [ ] Implement separate raw ledger scopes.
* [ ] Implement KMS-backed webhook secrets.
* [ ] Implement ledger JWT/token provider.
* [ ] Implement party mapping access controls.
* [ ] Implement audit log redaction.
* [ ] Implement external signer abstraction.
* [ ] Implement compliance pre-check hooks.
* [ ] Implement live raw-write approval workflow.

## Workbench / CLI / Sandbox

* [ ] Implement `pillar sandbox up`.
* [ ] Implement seeded parties/assets.
* [ ] Implement local webhook listener.
* [ ] Implement `pillar trigger`.
* [ ] Implement `pillar ledger inspect --intent`.
* [ ] Implement request log view.
* [ ] Implement intent trace view.
* [ ] Implement ledger update view.
* [ ] Implement projection lag dashboard.

---

## Final architecture decision

Pillar의 v1 production baseline은 다음으로 고정한다.

```text
External API:
  Stripe-like, intent-first, balance/holding-first, webhook-first

Internal runtime:
  Canton-native, gRPC-first, completion/update-stream driven

Persistence:
  DB = projection + audit + config
  Ledger = source of truth

Compilation boundary:
  account/asset/holding/intent
    → party/template/contract/choice/command

Operational trace:
  request_id
    → intent_id
    → workflow_id
    → command_id
    → submission_id
    → completion
    → update_id
    → projection
    → webhook event
```

이 설계가 Pillar를 **“Stripe for Canton-backed assets”**로 만든다. 고객은 Canton을 몰라도 되고, 운영자는 모든 것을 Canton까지 추적할 수 있으며, 내부 런타임은 ledger-native correctness를 유지한다.

[1]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[2]: https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html "gRPC Ledger API Reference — Digital Asset’s platform documentation"
[3]: https://docs.digitalasset.com/build/3.5/explanations/parties-users.html "Parties and users on a Canton ledger — Digital Asset’s platform documentation"
[4]: https://docs.digitalasset.com/build/3.5/reference/daml/contract-keys.html "Reference: Contract Keys — Digital Asset’s platform documentation"
[5]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html "JSON Ledger API Service V2 — Digital Asset’s platform documentation"
[6]: https://docs.digitalasset.com/build/3.5/explanations/json-api/migration_v2.html "JSON Ledger API Migration to V2 guide — Digital Asset’s platform documentation"
[7]: https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html "Sandbox — Digital Asset’s platform documentation"
[8]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[9]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[10]: https://docs.stripe.com/webhooks "docs.stripe.com"
[11]: https://docs.stripe.com/workbench "docs.stripe.com"
[12]: https://docs.stripe.com/upgrades "docs.stripe.com"
