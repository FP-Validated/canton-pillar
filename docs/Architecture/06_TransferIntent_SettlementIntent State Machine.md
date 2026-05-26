# Executive Summary

Pillar의 Intent 모델은 **“Stripe-like public API + Canton-native internal runtime”**로 설계한다. 외부 고객은 `TransferIntent`, `SettlementIntent`, `client_secret`, `next_action`, hosted approval link, webhook만 본다. 내부 런타임은 Canton Ledger API command, completion stream, transaction stream, Daml choice, Token Standard Holding/UTXO, external-party signing을 사용한다.

핵심 결정은 다음과 같다.

1. **모든 Intent의 canonical state는 Canton ledger contract로 표현한다.** Pillar DB의 `transfer_intent_projection`, `settlement_intent_projection`은 ledger transaction stream을 따라 재구축 가능한 projection이다.
2. **API는 Intent-first다.** 사용자는 transaction/contract를 만들지 않고 `TransferIntent` 또는 `SettlementIntent`를 만들고 `confirm/cancel/reverse`한다.
3. **Balance/Holding-first다.** API는 `balance`, `holding`, `asset`, `account` 중심이며 contract id, package id, party id는 기본 응답에 노출하지 않는다.
4. **비동기 workflow는 webhook-first다.** API 응답은 “현재 관측된 상태”를 반환하고, 최종 상태 변화는 webhook event로 전달한다.
5. **Canton command compile/prepare는 confirm 시점 이후로 늦춘다.** approval, counterparty acceptance, funding, signature 조건이 충족되기 전에는 asset-moving command를 만들지 않는다.
6. **reversal은 rollback이 아니라 compensating ledger transaction이다.** 원장상 과거 transaction은 되돌리지 않고, 반대 방향 transfer/settlement를 새 Intent로 수행한다.

## 공식 문서 리서치 요약

Stripe 쪽에서 Pillar가 가져와야 할 핵심 문법은 PaymentIntent lifecycle, idempotency, `client_secret`, webhook delivery, API versioning, Workbench, CLI, sandbox다. Stripe PaymentIntent는 결제 흐름을 상태로 추적하고, 실패 시 재시도 가능한 상태로 돌아가거나 최종 canceled/succeeded 상태가 된다. `client_secret`은 frontend completion 용도이며 고객 외에는 노출하거나 URL/log에 넣지 말아야 한다. Stripe idempotency는 첫 요청의 status code/body를 저장해 같은 key의 retry에 같은 결과를 반환하는 모델이다. Webhook은 live mode에서 최대 3일 재시도되고, 이벤트 ordering은 보장되지 않으므로 수신자는 idempotent하게 처리해야 한다. Stripe의 현재 API version 문서는 `2026-04-22.dahlia`를 current version으로 제시하며, versioning은 API 응답과 webhook object shape에 영향을 준다. ([Stripe Docs][1])

Stripe Workbench는 API keys, API versions, request logs, events, webhooks를 운영자가 조사하는 콘솔 패턴을 제공한다. Stripe CLI는 sandbox에서 API 호출, webhook testing, event triggering을 지원하고, Stripe sandbox는 live integration에 영향 없이 테스트하는 격리 환경이다. Pillar도 이를 따라 **Pillar Workbench / Pillar CLI / Pillar Sandbox**를 제품 표면으로 둬야 한다. ([Stripe Docs][2])

Canton/Daml 쪽에서 중요한 사실은 Ledger API가 본질적으로 비동기라는 점이다. 공식 문서는 Ledger API를 “commands to the ledger”와 “updates/events from the ledger”의 두 stream으로 설명하며, command 결과는 submission 후 별도로 completion과 transaction events로 관측해야 한다고 설명한다. Completion stream은 `user_id`, `act_as` party, offset 기준으로 재개할 수 있다. ([Digital Asset Documentation][3])

Canton JSON Ledger API는 HTTP/JSON으로 ledger와 상호작용하는 방법을 제공하지만, production에서는 인터넷에 직접 노출하지 말고 reverse proxy 뒤에 둬야 한다. Pillar의 public API는 JSON Ledger API가 아니라 자체 Stripe-grade REST API여야 한다. Daml/DAR는 build/deploy artifact이며, Canton sandbox는 단일 participant와 synchronizer topology로 로컬 ledger를 실행하는 개발 환경이다. ([Digital Asset Documentation][4])

Token Standard / Wallet SDK 문서에서 Pillar의 Balance/Holding-first 설계 근거가 나온다. Canton Network transfer는 holding/UTXO selection, locked UTXO, 2-step transfer, transfer pre-approval을 고려해야 한다. External-party signing의 경우 command를 Daml transaction으로 prepare하고, 외부 party가 transaction hash를 sign한 뒤 execute하는 단계로 나뉜다. 준비 단계에서 contract id가 pin되므로 prepare와 execute 사이에 해당 contract가 archived되면 실행이 실패할 수 있다. ([Digital Asset Documentation][5])

---

# Goals / Non-goals

## Goals

### Product goals

Pillar는 Canton-backed asset movement를 다음처럼 추상화한다.

```text
Stripe PaymentIntent : fiat/card payment lifecycle
Pillar TransferIntent : Canton-backed asset transfer lifecycle
Pillar SettlementIntent : Canton-backed multi-leg settlement lifecycle
```

목표는 다음이다.

| Goal                     | 설계 결정                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Canton-invisible API     | public REST/SDK는 account, balance, holding, asset, intent만 노출                                          |
| Canton-native runtime    | 내부는 Ledger API command/completion/transaction stream, Daml choice, external signing 사용                 |
| Ledger source of truth   | Intent status는 ledger contract/event에서 derive                                                          |
| Projection-only DB       | DB는 API serving, audit, webhook delivery, config, offset checkpoint용                                   |
| Stripe-grade API grammar | id prefix, `object`, `status`, `client_secret`, `next_action`, idempotency, webhook event, API version |
| Async-first              | confirm 후 최종 결과는 webhook으로 통지                                                                          |
| Holding-first            | public API는 contract id 대신 available/locked balance와 holding abstraction 제공                            |
| Deployment invariant API | LocalNet, DevNet, TestNet, MainNet, private Canton deployment 모두 같은 API grammar 유지                     |

## Non-goals

| Non-goal                               | 설명                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| Canton contract id 노출                  | 기본 API 응답에서 contract id, package id, party id, synchronizer id를 숨긴다. 운영자 debug view에서만 노출한다. |
| Ledger state를 DB로 대체                   | DB balance/intents는 projection이다. ledger replay로 재구축 가능해야 한다.                                |
| Synchronous finality illusion          | `confirm` 응답에서 최종 성공을 보장하지 않는다. 최종 상태는 ledger event 관측 후 webhook으로 확정한다.                     |
| 모든 reversal을 자동 보장                     | reversal은 새 compensating workflow이므로 별도 approval/funding/signature가 필요할 수 있다.                |
| Canton JSON Ledger API를 public API로 사용 | JSON Ledger API는 내부 개발/통합용이며 public Stripe-like API와 분리한다.                                   |
| Contract-first SDK                     | SDK는 `contractId`를 받지 않는다. `account`, `asset`, `holding_filter`, `amount`를 받는다.              |

---

# Architecture

## 1. High-level architecture

```text
Client / Merchant / Wallet
        |
        |  REST / SDK / Hosted Approval / Webhooks
        v
+-----------------------------+
| Pillar Public API Gateway   |
| - auth / API version        |
| - idempotency               |
| - request logs              |
+-------------+---------------+
              |
              v
+-----------------------------+
| Intent Orchestrator         |
| - TransferIntent FSM        |
| - SettlementIntent FSM      |
| - next_action resolver      |
| - policy gates              |
+-------------+---------------+
              |
              v
+-----------------------------+
| Canton Command Compiler     |
| - holding selection         |
| - Token Standard commands   |
| - Daml choice planning      |
| - external-party prepare    |
| - command metadata          |
+-------------+---------------+
              |
              v
+-----------------------------+
| Canton Adapter              |
| - gRPC Ledger API           |
| - completion stream         |
| - transaction stream        |
| - participant routing       |
+-------------+---------------+
              |
              v
+-----------------------------+
| Canton Ledger               |
| Source of Truth             |
+-------------+---------------+
              |
              v
+-----------------------------+
| Projection + Webhook Engine |
| - intent projections        |
| - balance projections       |
| - event generation          |
| - webhook delivery          |
| - replay/reconciliation     |
+-----------------------------+
```

## 2. Core architectural rule

**Pillar DB never decides state.** It serves cached state derived from ledger offsets.

```text
Ledger transaction stream
  -> Projection worker
  -> transfer_intent_projection / settlement_intent_projection
  -> API GET response
  -> webhook event
```

If projection and ledger conflict, ledger wins. If projection is missing, rebuild from ledger offset / ACS / transaction history.

## 3. Ledger model

Pillar should publish a Daml package containing at least:

```daml
template TransferIntent
  with
    intentId: Text
    tenant: Party
    platform: Party
    sourceAccountRef: Text
    destinationAccountRef: Text
    assetRef: Text
    amount: Decimal
    status: IntentStatus
    operationId: Optional Text
    idempotencyKeyHash: Optional Text
    expiresAt: Time
    metadataHash: Optional Text
    commandPlanHash: Optional Text
    transferInstructionRef: Optional Text
  where
    signatory tenant, platform
    observer ...

template SettlementIntent
  with
    settlementIntentId: Text
    tenant: Party
    platform: Party
    settlementType: SettlementType
    legs: [SettlementLeg]
    status: SettlementStatus
    operationId: Optional Text
    idempotencyKeyHash: Optional Text
    expiresAt: Time
    settlementWindow: Optional SettlementWindow
    commandPlanHash: Optional Text
  where
    signatory tenant, platform
    observer ...

template IntentOperationMarker
  with
    operationId: Text
    intentId: Text
    requestId: Text
    idempotencyKeyHash: Optional Text
    actorRef: Text
    action: Text
    previousStatus: Text
    nextStatus: Text
    createdAt: Time
  where
    signatory platform
    observer tenant
```

`IntentOperationMarker`는 모든 API action을 ledger-traceable하게 만든다. 민감 데이터는 ledger에 원문으로 넣지 않고 hash/reference로 넣는다.

## 4. Public API는 Canton-invisible

외부 응답은 다음을 노출하지 않는다.

```text
contract_id
package_id
ledger_party_id
participant_id
synchronizer_id
command_id
submission_id
```

대신 다음을 노출한다.

```text
id: ti_...
object: transfer_intent
status: requires_signature
next_action: {...}
client_secret: ti_..._secret_...
asset: asset_...
source: acct_...
destination: acct_...
amount: "100.00"
```

운영자용 Workbench에는 internal trace를 노출할 수 있다.

```text
Workbench-only:
- ledger_offset
- command_id
- submission_id
- participant route
- active contract id hash
- Daml package version
- completion status
```

---

# API / Object Model

## 1. API grammar

Pillar API는 Stripe-style 문법을 고정한다.

| Pattern       | Pillar 적용                                                            |
| ------------- | -------------------------------------------------------------------- |
| Object prefix | `ti_`, `sti_`, `evt_`, `wh_`, `aps_`, `cs_`, `req_`                  |
| Object type   | every object has `object`                                            |
| Versioning    | `Pillar-Version` header + account default + webhook endpoint version |
| Idempotency   | `Idempotency-Key` on mutating requests                               |
| Metadata      | `metadata: {}` string map                                            |
| Pagination    | `limit`, `starting_after`, `ending_before`, `has_more`               |
| Expand        | `expand[]=source`, `expand[]=latest_attempt`                         |
| Livemode      | `livemode: true/false`                                               |
| Thin webhook  | webhook carries id/status; client fetches object for latest state    |

## 2. TransferIntent object

```json
{
  "id": "ti_01JZ7Y9H4MJ0T3EVJQK8RK3E4R",
  "object": "transfer_intent",
  "livemode": false,
  "amount": "100.00",
  "asset": "asset_usdc",
  "source": "acct_sender",
  "destination": "acct_receiver",
  "status": "requires_signature",
  "flow": "direct",
  "confirmation_method": "automatic",
  "approval_method": "hosted",
  "client_secret": "ti_01JZ7Y..._secret_4b7...",
  "next_action": {
    "type": "collect_signature",
    "collect_signature": {
      "signature_session": "sig_01JZ...",
      "expires_at": "2026-05-26T14:00:00Z"
    }
  },
  "last_error": null,
  "created": "2026-05-26T10:00:00Z",
  "expires_at": "2026-05-26T14:00:00Z",
  "metadata": {
    "order_id": "ord_123"
  }
}
```

### TransferIntent status enum

Required states:

```text
requires_approval
requires_counterparty_acceptance
requires_signature
requires_funding
submitted
processing
succeeded
failed
canceled
expired
reversed
```

### TransferIntent state semantics

| Status                             | Meaning                                                                                       | Allowed next states                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `requires_approval`                | Tenant policy, compliance, risk, operator, or hosted approval required                        | `requires_counterparty_acceptance`, `requires_signature`, `requires_funding`, `submitted`, `canceled`, `expired`, `failed` |
| `requires_counterparty_acceptance` | Receiver/counterparty must accept offer or settlement terms                                   | `requires_signature`, `requires_funding`, `submitted`, `canceled`, `expired`, `failed`                                     |
| `requires_signature`               | External party or delegated signer must sign prepared transaction                             | `requires_funding`, `submitted`, `canceled`, `expired`, `failed`                                                           |
| `requires_funding`                 | Source has insufficient available holdings, UTXOs are locked elsewhere, or reservation failed | `requires_signature`, `submitted`, `canceled`, `expired`, `failed`                                                         |
| `submitted`                        | Intent has been ledger-transitioned into submission path and a command attempt exists         | `processing`, `succeeded`, `failed`                                                                                        |
| `processing`                       | Ledger has accepted an intermediate operation; final asset movement or acceptance is pending  | `succeeded`, `failed`, `canceled`, `expired`                                                                               |
| `succeeded`                        | Final ledger transaction for transfer observed and projected                                  | `reversed`                                                                                                                 |
| `failed`                           | Terminal unrecoverable failure for this Intent                                                | terminal                                                                                                                   |
| `canceled`                         | User/platform canceled before final transfer                                                  | terminal                                                                                                                   |
| `expired`                          | Deadline passed and ledger expire transition committed                                        | terminal                                                                                                                   |
| `reversed`                         | A compensating reversal transaction succeeded                                                 | terminal for original                                                                                                      |

`failed`는 “이 Intent 자체가 닫힘”이다. Recoverable failure는 `failed`가 아니라 `requires_funding`, `requires_signature`, 또는 `requires_counterparty_acceptance`로 되돌리고 `last_error`를 채운다.

## 3. SettlementIntent object

SettlementIntent는 multi-leg workflow다. DvP, PvP, multi-asset delivery, batch/netting settlement를 같은 grammar로 표현한다.

```json
{
  "id": "sti_01JZ7YBGF4G2P9XK9BPV1P9FHQ",
  "object": "settlement_intent",
  "livemode": false,
  "settlement_type": "atomic_dvp",
  "status": "requires_counterparty_acceptance",
  "legs": [
    {
      "id": "leg_delivery",
      "type": "delivery",
      "asset": "asset_bond_2029",
      "amount": "1000000",
      "from": "acct_seller",
      "to": "acct_buyer"
    },
    {
      "id": "leg_payment",
      "type": "payment",
      "asset": "asset_usdc",
      "amount": "998500.00",
      "from": "acct_buyer",
      "to": "acct_seller"
    }
  ],
  "atomicity": "all_or_none",
  "settlement_window": {
    "opens_at": "2026-05-26T12:00:00Z",
    "closes_at": "2026-05-26T18:00:00Z"
  },
  "client_secret": "sti_01JZ..._secret_8df...",
  "next_action": {
    "type": "hosted_approval",
    "hosted_approval": {
      "url": "https://approve.pillar.example/s/aps_01JZ...",
      "expires_at": "2026-05-26T18:00:00Z"
    }
  },
  "created": "2026-05-26T10:05:00Z",
  "expires_at": "2026-05-26T18:00:00Z",
  "metadata": {
    "trade_id": "TRD-2026-0001"
  }
}
```

### SettlementIntent status enum

SettlementIntent는 TransferIntent enum을 공유하되, settlement-specific precondition을 위해 `requires_matching`을 추가한다.

```text
requires_matching
requires_approval
requires_counterparty_acceptance
requires_signature
requires_funding
submitted
processing
succeeded
failed
canceled
expired
reversed
```

| Status                             | Meaning                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `requires_matching`                | legs, economics, parties, settlement date, asset identifiers, netting group이 아직 match되지 않음 |
| `requires_approval`                | policy/compliance/operator approval 필요                                                     |
| `requires_counterparty_acceptance` | 모든 settlement party가 동일 terms를 accept해야 함                                                  |
| `requires_signature`               | one or more external parties must sign prepared settlement transaction                     |
| `requires_funding`                 | one or more legs lack available holdings or reservation                                    |
| `submitted`                        | settlement execution command attempt created                                               |
| `processing`                       | settlement instruction, hold, reservation, or batch execution in progress                  |
| `succeeded`                        | all required settlement legs completed according to `atomicity`                            |
| `failed`                           | settlement cannot complete under current terms                                             |
| `canceled`                         | canceled before finality                                                                   |
| `expired`                          | settlement window/deadline passed                                                          |
| `reversed`                         | compensating settlement/reversal succeeded                                                 |

## 4. `next_action` model

`next_action`은 public API의 유일한 UX routing primitive다.

```ts
type NextAction =
  | { type: "none" }
  | { type: "hosted_approval"; hosted_approval: HostedApprovalAction }
  | { type: "counterparty_acceptance"; counterparty_acceptance: CounterpartyAcceptanceAction }
  | { type: "collect_signature"; collect_signature: CollectSignatureAction }
  | { type: "funding_instruction"; funding_instruction: FundingInstructionAction }
  | { type: "wait_for_webhook"; wait_for_webhook: WaitForWebhookAction };
```

### Examples

```json
{
  "type": "hosted_approval",
  "hosted_approval": {
    "approval_session": "aps_01JZ...",
    "url": "https://approve.pillar.example/s/aps_01JZ...",
    "expires_at": "2026-05-26T14:00:00Z"
  }
}
```

```json
{
  "type": "collect_signature",
  "collect_signature": {
    "signature_session": "sig_01JZ...",
    "method": "external_party_transaction_hash",
    "expires_at": "2026-05-26T14:00:00Z"
  }
}
```

```json
{
  "type": "funding_instruction",
  "funding_instruction": {
    "required": [
      {
        "account": "acct_sender",
        "asset": "asset_usdc",
        "amount": "100.00"
      }
    ],
    "available": [
      {
        "account": "acct_sender",
        "asset": "asset_usdc",
        "amount": "75.00"
      }
    ],
    "shortfall": [
      {
        "account": "acct_sender",
        "asset": "asset_usdc",
        "amount": "25.00"
      }
    ]
  }
}
```

## 5. Hosted approval link

Hosted approval link는 Stripe Payment Link / hosted Checkout와 유사한 Pillar-hosted UX다. Stripe Payment Link는 hosted payment page로 고객을 보내는 shareable URL 패턴을 제공한다. Pillar의 hosted approval link는 결제가 아니라 **approval / acceptance / signature collection**에 사용한다. ([Stripe Docs][6])

### Hosted approval session

```json
{
  "id": "aps_01JZ7Y...",
  "object": "approval_session",
  "intent": "ti_01JZ7Y...",
  "intent_object": "transfer_intent",
  "url": "https://approve.pillar.example/s/aps_01JZ7Y...",
  "status": "open",
  "purpose": "transfer_approval",
  "expires_at": "2026-05-26T14:00:00Z",
  "return_url": "https://merchant.example/return",
  "cancel_url": "https://merchant.example/cancel"
}
```

### Security rules

* Hosted URL token은 opaque, short-lived, single-purpose다.
* URL token은 `client_secret`과 다르다.
* Hosted page에서 terms hash, actor identity, approval result를 ledger transition으로 기록한다.
* Approval session은 DB config/audit object일 수 있지만, 최종 approval/cancel/accept action은 반드시 ledger state transition으로 남긴다.
* Hosted link는 cancel/expire/reverse 후 즉시 invalidated된다.

## 6. `client_secret` model

`client_secret`은 browser/mobile SDK가 제한된 action을 수행하기 위한 short-lived scoped secret이다. Stripe 문서는 PaymentIntent `client_secret`을 frontend completion 용도로 사용하되 고객 외에는 노출하지 말고 URL/log에 넣지 말라고 안내한다. Pillar도 같은 원칙을 적용한다. ([Stripe Docs][7])

### Format

```text
ti_01JZ7Y9H4MJ0T3EVJQK8RK3E4R_secret_4b7f5c...
sti_01JZ7YBGF4G2P9XK9BPV1P9FHQ_secret_8df21...
```

### Stored representation

DB에는 원문을 저장하지 않는다.

```sql
client_secret_hash = sha256(account_id || intent_id || random_secret)
```

### Scope

| Scope             | 설명                                        |
| ----------------- | ----------------------------------------- |
| `intent_id`       | 하나의 Intent에만 유효                           |
| `allowed_actions` | approve, accept, sign, retrieve_limited 등 |
| `expires_at`      | intent expiry 또는 더 짧은 TTL                 |
| `api_version`     | client-side object shape 고정               |
| `environment`     | sandbox/live binding                      |
| `account_id`      | tenant binding                            |

`client_secret`은 Canton submit 권한이 아니다. Pillar backend가 actor identity, hosted session, policy, ledger state를 검증한 뒤 command를 submit한다.

---

# TransferIntent State Machine

## 1. State diagram

```text
                         +----------------+
                         | requires_      |
                         | approval       |
                         +-------+--------+
                                 |
                                 v
+---------------------+   +------+------------------+
| requires_funding    |<--| requires_counterparty_  |
+----------+----------+   | acceptance              |
           |              +------+------------------+
           |                     |
           v                     v
+----------+----------+   +------+------------------+
| requires_signature  |<--| policy/funding/signing |
+----------+----------+   | re-evaluation          |
           |              +------------------------+
           v
+----------+----------+
| submitted           |
+----------+----------+
           |
           v
+----------+----------+
| processing          |
+----+-----------+----+
     |           |
     v           v
 succeeded     failed
     |
     v
 reversed

From any non-terminal pre-final state:
  -> canceled
  -> expired

Terminal:
  failed, canceled, expired, reversed
```

## 2. Create flow

```http
POST /v1/transfer_intents
Idempotency-Key: 84f5f5c0-...
Pillar-Version: 2026-05-26
```

```json
{
  "amount": "100.00",
  "asset": "asset_usdc",
  "source": "acct_sender",
  "destination": "acct_receiver",
  "approval_method": "hosted",
  "confirmation_method": "manual",
  "expires_at": "2026-05-26T14:00:00Z",
  "metadata": {
    "order_id": "ord_123"
  }
}
```

Runtime:

1. Validate API version, auth, idempotency.
2. Resolve opaque `acct_` and `asset_` into internal ledger references.
3. Submit Canton command to create `TransferIntent` ledger contract.
4. Wait briefly for completion/transaction projection.
5. Return projected object.
6. Emit `transfer_intent.created` after ledger transaction is projected.

Initial status decision:

| Condition                                                    | Initial status                     |
| ------------------------------------------------------------ | ---------------------------------- |
| policy approval required                                     | `requires_approval`                |
| receiver must explicitly accept                              | `requires_counterparty_acceptance` |
| external party signing required and can prepare now          | `requires_signature`               |
| insufficient available holdings                              | `requires_funding`                 |
| `confirm=true` and all prerequisites met                     | `submitted` or `processing`        |
| direct/preapproved transfer completes in same ledger command | `succeeded`                        |

## 3. Confirm flow

```http
POST /v1/transfer_intents/ti_.../confirm
Idempotency-Key: confirm-ord-123
```

Confirm는 “가능하면 실행하고, 불가능하면 다음 action을 반환”한다.

### Confirm algorithm

```text
1. Load latest TransferIntent projection.
2. Re-read canonical ledger state if projection is stale.
3. If terminal -> return terminal object.
4. If requires_approval -> return next_action.hosted_approval.
5. If requires_counterparty_acceptance -> return next_action.counterparty_acceptance.
6. If requires_funding -> re-evaluate holdings.
7. If external-party signing required:
      compile command plan
      prepare unsigned transaction
      create signature session
      ledger-transition status to requires_signature
      return next_action.collect_signature
8. If all prerequisites clear:
      ledger-transition to submitted
      submit asset-moving command
      await completion briefly
      return current projected status
9. Final status arrives through webhook.
```

Canton Ledger API는 command submission과 completion/event observation이 분리되어 있으므로, `confirm`은 HTTP request-response만으로 final success를 보장하지 않는다. ([Digital Asset Documentation][3])

## 4. Cancel flow

```http
POST /v1/transfer_intents/ti_.../cancel
Idempotency-Key: cancel-ord-123
```

Allowed:

```text
requires_approval
requires_counterparty_acceptance
requires_signature
requires_funding
submitted       only if not irreversibly executing
processing      only if underlying transfer offer/hold can still be withdrawn
```

Not allowed:

```text
succeeded
failed
expired
reversed
```

For `succeeded`, use `reverse`.

Cancel runtime:

1. Validate current ledger status.
2. If holding/UTXO lock exists, exercise withdraw/release choice.
3. Archive old `TransferIntent`; create new `TransferIntent(status=canceled)`.
4. Emit `transfer_intent.canceled`.

## 5. Expire flow

Expiration is not “automatic magic.” A scheduler submits an explicit ledger command.

```text
expiry_worker:
  scan projections where expires_at < now and status is non-terminal
  submit ExpireTransferIntent choice
  release holds / withdraw offers
  projection emits transfer_intent.expired
```

Expiration sources:

| Source                         | Description                                         |
| ------------------------------ | --------------------------------------------------- |
| `expires_at`                   | API-level intent deadline                           |
| `approval_session.expires_at`  | hosted approval deadline                            |
| `execute_before`               | Canton Token Standard transfer instruction deadline |
| `signature_session.expires_at` | prepared transaction stale deadline                 |
| `settlement_window.closes_at`  | SettlementIntent deadline                           |

## 6. Reverse flow

```http
POST /v1/transfer_intents/ti_.../reverse
Idempotency-Key: reverse-ord-123
```

```json
{
  "amount": "100.00",
  "reason": "customer_request",
  "metadata": {
    "support_ticket": "SUP-123"
  }
}
```

Rules:

* Only `succeeded` TransferIntent can be reversed.
* Reversal creates a new `TransferIntent` with opposite direction or a dedicated `Reversal` object.
* Original Intent becomes `reversed` only after compensating ledger transaction succeeds.
* Partial reversal is represented by `reversal_summary.amount_reversed`; original status remains `succeeded` until fully reversed unless product decides to add `partially_reversed`.

---

# SettlementIntent State Machine

## 1. State diagram

```text
requires_matching
        |
        v
requires_approval
        |
        v
requires_counterparty_acceptance
        |
        +----> requires_funding
        |              |
        |              v
        +----> requires_signature
                       |
                       v
                    submitted
                       |
                       v
                    processing
                 +-----+------+
                 v            v
             succeeded      failed
                 |
                 v
              reversed

Any non-terminal pre-final state:
  -> canceled
  -> expired
```

## 2. Matching

SettlementIntent는 TransferIntent보다 matching 단계가 중요하다.

`requires_matching` 조건:

* delivery leg와 payment leg의 economics 불일치
* buyer/seller account 미확정
* asset identifier 또는 registry context 미확정
* netting group 미확정
* settlement date/window 미확정
* counterparty-submitted terms hash 불일치

Matching이 완료되면 terms hash를 고정한다.

```text
terms_hash = hash(
  settlement_type,
  legs[],
  atomicity,
  settlement_window,
  fees,
  metadata_hash
)
```

모든 approval, acceptance, signature는 이 `terms_hash`에 대해 수행한다.

## 3. Funding

SettlementIntent funding은 multi-leg다.

```json
{
  "type": "funding_instruction",
  "funding_instruction": {
    "legs": [
      {
        "leg": "leg_delivery",
        "account": "acct_seller",
        "asset": "asset_bond_2029",
        "required": "1000000",
        "available": "1000000",
        "status": "funded"
      },
      {
        "leg": "leg_payment",
        "account": "acct_buyer",
        "asset": "asset_usdc",
        "required": "998500.00",
        "available": "900000.00",
        "shortfall": "98500.00",
        "status": "shortfall"
      }
    ]
  }
}
```

## 4. Atomic settlement execution

For `atomicity=all_or_none`, command compiler should attempt one atomic Daml transaction when possible:

```text
exercise SettlementIntent_Submit
  -> exercise delivery leg transfer
  -> exercise payment leg transfer
  -> archive old SettlementIntent
  -> create SettlementIntent(status=succeeded)
```

If Canton topology, package availability, party authority, or external-party signing prevents one-shot execution, Pillar transitions through:

```text
requires_signature -> submitted -> processing -> succeeded
```

If partial settlement is allowed, do not overload the base enum. Use:

```json
{
  "status": "processing",
  "settlement_progress": {
    "completed_legs": 8,
    "total_legs": 10,
    "partial_allowed": true
  }
}
```

For MVP, default should be `atomicity=all_or_none`.

---

# Canton Command Compile Timing

Pillar must distinguish **Daml package compile**, **command plan compile**, and **Canton transaction prepare**.

## 1. Daml source compile / DAR build

Timing: build/deploy time.

```text
Daml source -> DAR -> upload to participant -> package allowlist
```

This is not per-Intent. It belongs to release management.

## 2. Command plan compile

Timing: after `confirm`, after approval/acceptance/funding checks are sufficiently stable.

Inputs:

```text
intent_id
terms_hash
source/destination internal account refs
asset registry context
holding selection policy
available holdings at ledger offset
party authorization model
package version
token standard interface version
```

Output:

```json
{
  "command_plan_id": "cp_01JZ...",
  "intent": "ti_...",
  "ledger_offset": "123456",
  "package_version": "pillar-intents-1.0.0",
  "input_holding_refs": ["opaque_internal_ref"],
  "choice": "TransferIntent_Submit",
  "plan_hash": "sha256:..."
}
```

This plan is not exposed to public API.

## 3. Canton transaction prepare

Timing: only when an external party must sign.

Official external-party flow requires preparation and execution to be separated: a participant prepares a Daml transaction, the external party signs the transaction hash, and then the signed transaction is executed. ([Digital Asset Documentation][8])

Pillar flow:

```text
requires_signature:
  compile command plan
  call prepare transaction
  store prepared_transaction_hash
  create signature_session
  return next_action.collect_signature

signature collected:
  verify signature
  submit execute command
  status -> submitted / processing
```

Important constraint: prepare pins contract IDs. If holdings are archived between prepare and execute, the execution can fail. Pillar must then discard the prepared transaction, re-read holdings, recompile, and return `requires_signature` or `requires_funding`. ([Digital Asset Documentation][9])

## 4. Local/custodial party execution

For local/custodial parties, Pillar can compile and submit directly through Ledger API. The API should still treat it as async:

```text
confirm
  -> ledger transition to submitted
  -> submit command
  -> completion stream
  -> transaction stream
  -> projection
  -> webhook
```

---

# Ledger Transaction ↔ Intent State Mapping

## 1. TransferIntent mapping

| Public status                      | Canonical ledger source                                                                                           | Projection rule                                                   | Webhook timing                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `requires_approval`                | `TransferIntent(status=requires_approval)` active contract                                                        | Latest active contract for intent id                              | After create/transition transaction projected        |
| `requires_counterparty_acceptance` | `TransferIntent(status=requires_counterparty_acceptance)` and/or Token Standard transfer offer/instruction active | Counterparty acceptance not observed                              | After ledger transaction creating acceptance request |
| `requires_signature`               | `TransferIntent(status=requires_signature)` + signature session marker hash                                       | Prepared transaction hash exists but valid signature not executed | After signature-required transition projected        |
| `requires_funding`                 | `TransferIntent(status=requires_funding)` + funding requirement marker                                            | Holding projection shows shortfall or lock conflict               | After funding evaluation transition projected        |
| `submitted`                        | `TransferIntent(status=submitted)` + `IntentOperationMarker(action=confirm)`                                      | Command attempt created; completion not yet decisive              | After submitted transition projected                 |
| `processing`                       | Intermediate transfer instruction/hold/reservation contract active                                                | Asset movement not yet complete                                   | After intermediate ledger transaction projected      |
| `succeeded`                        | Final transfer transaction observed; destination holding update observed; `TransferIntent(status=succeeded)`      | Final status contract active                                      | After final ledger transaction projected             |
| `failed`                           | `TransferIntent(status=failed)` created by failure-recording command                                              | Unrecoverable error recorded on ledger                            | After failure transition projected                   |
| `canceled`                         | `TransferIntent(status=canceled)`                                                                                 | Cancel choice committed                                           | After cancel transaction projected                   |
| `expired`                          | `TransferIntent(status=expired)`                                                                                  | Expire choice committed                                           | After expire transaction projected                   |
| `reversed`                         | Reversal transaction completed; original linked to reversal                                                       | Original intent full reversal recorded                            | After reversal transaction projected                 |

## 2. SettlementIntent mapping

| Public status                      | Canonical ledger source                                     | Projection rule                        |
| ---------------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| `requires_matching`                | `SettlementIntent(status=requires_matching)`                | Terms hash not final                   |
| `requires_approval`                | `SettlementIntent(status=requires_approval)`                | Policy/compliance approval missing     |
| `requires_counterparty_acceptance` | `SettlementIntent(status=requires_counterparty_acceptance)` | Acceptance contracts incomplete        |
| `requires_signature`               | `SettlementIntent(status=requires_signature)`               | External signatures incomplete         |
| `requires_funding`                 | `SettlementIntent(status=requires_funding)`                 | One or more legs unfunded              |
| `submitted`                        | `SettlementIntent(status=submitted)`                        | Settlement command attempt created     |
| `processing`                       | Settlement instruction/hold/batch active                    | Final all-or-none result not projected |
| `succeeded`                        | All legs completed under atomicity rule                     | Final success transition active        |
| `failed`                           | Failure transition active                                   | Unrecoverable settlement failure       |
| `canceled`                         | Cancel transition active                                    | No further settlement                  |
| `expired`                          | Expire transition active                                    | Settlement window closed               |
| `reversed`                         | Compensating settlement completed                           | Original fully reversed                |

## 3. Command failure handling

Canton command failure itself may appear as completion error rather than business transaction. To preserve “ledger source of truth,” Pillar records failure by submitting a separate ledger transition:

```text
completion error observed
  -> submit RecordIntentFailure(intent_id, command_id, error_hash)
  -> TransferIntent(status=failed or requires_funding/requires_signature)
  -> webhook emitted after RecordIntentFailure transaction is projected
```

If the original command actually succeeded and the failure recorder races with success, the ledger transition guard rejects the stale failure.

---

# Webhook Event Timing

## 1. Event generation principle

Pillar webhook events are generated **after ledger-derived projection updates**, not merely after API request acceptance.

```text
Ledger transaction observed
  -> Projection update committed
  -> Event object created
  -> Webhook delivery enqueued
```

Stripe-style behavior to copy:

* Webhooks are retried.
* Event delivery order is not guaranteed.
* Consumers must dedupe by `event.id`.
* Thin events are safer: fetch latest object before acting. Stripe explicitly warns that event ordering is not guaranteed and recommends retrieving missing/current objects when needed. ([Stripe Docs][10])

## 2. Event object

```json
{
  "id": "evt_01JZ7Z...",
  "object": "event",
  "livemode": false,
  "type": "transfer_intent.succeeded",
  "api_version": "2026-05-26",
  "created": "2026-05-26T10:06:12Z",
  "data": {
    "object": {
      "id": "ti_01JZ7Y...",
      "object": "transfer_intent",
      "status": "succeeded"
    }
  },
  "request": {
    "id": "req_01JZ7Y...",
    "idempotency_key": "confirm-ord-123"
  }
}
```

## 3. Event types

### TransferIntent events

```text
transfer_intent.created
transfer_intent.requires_action
transfer_intent.submitted
transfer_intent.processing
transfer_intent.succeeded
transfer_intent.failed
transfer_intent.canceled
transfer_intent.expired
transfer_intent.reversed
```

### SettlementIntent events

```text
settlement_intent.created
settlement_intent.requires_action
settlement_intent.submitted
settlement_intent.processing
settlement_intent.succeeded
settlement_intent.failed
settlement_intent.canceled
settlement_intent.expired
settlement_intent.reversed
```

## 4. Delivery model

| Item               | Design                                                    |
| ------------------ | --------------------------------------------------------- |
| Delivery           | HTTPS POST                                                |
| Signature          | `Pillar-Signature` HMAC with timestamp                    |
| Retry              | exponential backoff                                       |
| Idempotency        | receiver dedupes by `evt_...`                             |
| Versioning         | event object shape fixed by webhook endpoint version      |
| Thin event default | `data.object` has id/status; client retrieves full object |
| Replay             | Workbench and CLI support manual resend                   |
| Ordering           | not guaranteed                                            |

---

# Internal Runtime

## 1. Runtime components

| Component               | Responsibility                                                      |
| ----------------------- | ------------------------------------------------------------------- |
| API Gateway             | auth, API version, idempotency, request logging                     |
| Intent Orchestrator     | FSM, allowed transitions, next_action, operation ids                |
| Policy Engine           | KYC/AML/sanctions/limits/operator approval                          |
| Hosted Approval Service | hosted approval/counterparty acceptance UI                          |
| Funding Service         | balance/holding projection read, UTXO selection, reservation policy |
| Command Compiler        | Daml command plan, Token Standard choices, package resolution       |
| Signature Service       | external-party prepare/sign/execute sessions                        |
| Canton Adapter          | gRPC Ledger API submission, completion stream, transaction stream   |
| Projection Worker       | ledger events → DB projections                                      |
| Webhook Dispatcher      | event creation, signing, delivery, retry                            |
| Reconciliation Worker   | offset replay, ACS scan, stale command recovery                     |
| Workbench               | logs, event deliveries, API version, ledger trace                   |
| CLI                     | local development, fixtures, webhook listening, event trigger       |
| Sandbox                 | isolated Canton + fake assets + fake signers                        |

## 2. Idempotency

Pillar follows Stripe’s semantics: mutating requests accept an idempotency key, and retries with the same key return the original result if parameters match. Stripe stores the first result, including failures, and rejects parameter mismatch under the same key; Pillar should mirror that model. ([Stripe Docs][11])

Schema:

```sql
idempotency_keys (
  account_id             text not null,
  environment            text not null,
  method                 text not null,
  path                   text not null,
  key_hash               text not null,
  request_body_hash      text not null,
  api_version            text not null,
  request_id             text not null,
  operation_id           text,
  response_status        int,
  response_body_json     jsonb,
  ledger_operation_ref   text,
  created_at             timestamptz not null,
  expires_at             timestamptz not null,
  primary key (account_id, environment, method, path, key_hash)
)
```

Rules:

* Key max length: 255 chars.
* Sensitive values must not be used as keys.
* Store key hash, not raw key.
* Retention: minimum 24h; enterprise accounts can configure longer.
* If API response timed out after ledger submission, replay searches by `operation_id` and ledger marker.

## 3. Balance / Holding projection

Public API:

```http
GET /v1/balances?account=acct_sender
GET /v1/holdings?account=acct_sender&asset=asset_usdc&status=available
```

Response:

```json
{
  "object": "list",
  "data": [
    {
      "id": "bal_01JZ...",
      "object": "balance",
      "account": "acct_sender",
      "asset": "asset_usdc",
      "available": "75.00",
      "locked": "25.00",
      "pending_in": "0.00",
      "pending_out": "25.00"
    }
  ],
  "has_more": false
}
```

Internal rule:

```text
available = active holdings not locked by pending transfer/settlement
locked    = holdings referenced by active offer/reservation/instruction
```

Token Standard docs explicitly discuss UTXO selection and locked funds; Pillar should treat holding availability as first-class product state. ([Digital Asset Documentation][5])

## 4. Ledger offset management

Projection workers maintain per-participant offsets.

```sql
ledger_offsets (
  participant_id      text primary key,
  stream_name         text not null,
  last_offset         text not null,
  updated_at          timestamptz not null
)
```

Recovery:

```text
on restart:
  read last_offset
  resume transaction stream from last_offset
  resume completion stream from last completion offset
  rebuild affected projections
```

Completion stream support for offset-based resume is documented in the Ledger API reference. ([Digital Asset Documentation][12])

---

# DB Schema

DB categories:

```text
Projection
Audit
Config
Delivery
```

No table is canonical for ledger state.

## 1. Intent projections

```sql
transfer_intent_projection (
  id                         text primary key,
  account_id                 text not null,
  environment                text not null,
  status                     text not null,
  amount                     numeric(38, 18) not null,
  asset_id                   text not null,
  source_account_id          text not null,
  destination_account_id     text not null,
  flow                       text not null,
  confirmation_method        text not null,
  approval_method            text not null,
  next_action_json           jsonb,
  client_secret_hash         text,
  last_error_json            jsonb,
  reversal_summary_json      jsonb,
  metadata_json              jsonb,
  created_at                 timestamptz not null,
  updated_at                 timestamptz not null,
  expires_at                 timestamptz,
  ledger_offset              text not null,
  ledger_event_id            text not null,
  active_contract_ref_hash   text,
  revision                   bigint not null
);
```

```sql
settlement_intent_projection (
  id                         text primary key,
  account_id                 text not null,
  environment                text not null,
  status                     text not null,
  settlement_type            text not null,
  atomicity                  text not null,
  legs_json                  jsonb not null,
  settlement_window_json     jsonb,
  next_action_json           jsonb,
  client_secret_hash         text,
  last_error_json            jsonb,
  metadata_json              jsonb,
  created_at                 timestamptz not null,
  updated_at                 timestamptz not null,
  expires_at                 timestamptz,
  ledger_offset              text not null,
  ledger_event_id            text not null,
  active_contract_ref_hash   text,
  revision                   bigint not null
);
```

## 2. Balance / holding projections

```sql
balance_projection (
  account_id              text not null,
  environment             text not null,
  asset_id                text not null,
  available               numeric(38, 18) not null,
  locked                  numeric(38, 18) not null,
  pending_in              numeric(38, 18) not null,
  pending_out             numeric(38, 18) not null,
  ledger_offset           text not null,
  updated_at              timestamptz not null,
  primary key (account_id, environment, asset_id)
);
```

```sql
holding_projection (
  holding_id              text primary key,
  account_id              text not null,
  asset_id                text not null,
  amount                  numeric(38, 18) not null,
  status                  text not null, -- available, locked, archived
  lock_ref                text,
  ledger_offset           text not null,
  active_contract_ref_hash text,
  updated_at              timestamptz not null
);
```

## 3. Ledger command audit

```sql
ledger_command_attempts (
  operation_id             text primary key,
  intent_id                text not null,
  intent_object            text not null,
  account_id               text not null,
  action                   text not null,
  command_id               text not null,
  submission_id            text,
  user_id                  text,
  act_as_hash              text,
  read_as_hash             text,
  command_plan_hash        text,
  status                   text not null, -- planned, submitted, completed, failed, reconciled
  completion_status_json   jsonb,
  ledger_offset            text,
  created_at               timestamptz not null,
  updated_at               timestamptz not null
);
```

## 4. Hosted approval sessions

```sql
approval_sessions (
  id                       text primary key,
  account_id               text not null,
  intent_id                text not null,
  intent_object            text not null,
  purpose                  text not null,
  status                   text not null, -- open, completed, expired, canceled
  token_hash               text not null,
  client_secret_hash       text,
  actor_ref                text,
  terms_hash               text not null,
  return_url               text,
  cancel_url               text,
  expires_at               timestamptz not null,
  created_at               timestamptz not null,
  completed_at             timestamptz
);
```

## 5. Webhook

```sql
webhook_endpoints (
  id                       text primary key,
  account_id               text not null,
  environment              text not null,
  url                      text not null,
  enabled_events           text[] not null,
  api_version              text not null,
  signing_secret_hash      text not null,
  status                   text not null,
  created_at               timestamptz not null,
  updated_at               timestamptz not null
);
```

```sql
events (
  id                       text primary key,
  account_id               text not null,
  environment              text not null,
  type                     text not null,
  api_version              text not null,
  data_json                jsonb not null,
  request_id               text,
  idempotency_key_hash     text,
  ledger_offset            text not null,
  created_at               timestamptz not null
);
```

```sql
webhook_deliveries (
  id                       text primary key,
  event_id                 text not null references events(id),
  webhook_endpoint_id      text not null references webhook_endpoints(id),
  status                   text not null, -- pending, delivered, failed, dead_letter
  attempt_count            int not null,
  next_attempt_at          timestamptz,
  last_response_status     int,
  last_response_body_hash  text,
  created_at               timestamptz not null,
  updated_at               timestamptz not null
);
```

## 6. Config

```sql
api_version_config (
  account_id              text primary key,
  default_api_version     text not null,
  created_at              timestamptz not null,
  updated_at              timestamptz not null
);
```

```sql
asset_registry_config (
  asset_id                text primary key,
  environment             text not null,
  display_code            text not null,
  precision               int not null,
  registry_ref_hash       text not null,
  token_standard_version  text not null,
  enabled                 boolean not null
);
```

---

# Failure Modes

## 1. API request timeout after ledger submit

Scenario:

```text
client calls confirm
Pillar submits ledger command
HTTP connection times out
command later succeeds
client retries with same Idempotency-Key
```

Recovery:

1. Idempotency row maps key to `operation_id`.
2. Runtime searches projection/ledger marker by `operation_id`.
3. If final object exists, return it.
4. If not yet projected, return current object with `status=submitted` or `processing`.
5. Webhook eventually delivers final status.

## 2. Command completion error

Scenario:

```text
holding selected at offset N
holding archived before command execution
completion returns error
```

Recovery:

1. Classify error.
2. If stale holding / insufficient funds: ledger-transition to `requires_funding`.
3. If stale prepared transaction: ledger-transition to `requires_signature` with new `next_action`.
4. If policy violation: `failed`.
5. Emit webhook only after failure/retry transition is ledger-projected.

## 3. Projection lag

Scenario:

```text
ledger transaction committed
projection worker behind
GET /v1/transfer_intents/{id} returns old status
```

Recovery:

* API returns projection with `request_id`.
* For read-after-write endpoints, API may wait for target ledger offset up to short timeout.
* Workbench shows projection lag.
* Webhook generation waits for projection.

## 4. Duplicate confirm

Scenario:

```text
client double-clicks confirm
```

Recovery:

* Same idempotency key → same response.
* Different idempotency key → FSM guard checks status.
* If already `submitted/processing/succeeded`, return current object, no duplicate ledger movement.

## 5. Hosted approval stale link

Scenario:

```text
approval link opened after cancel or expire
```

Recovery:

* Hosted service checks latest projection and ledger status.
* Link returns expired/canceled page.
* No command submitted.

## 6. External signature stale

Scenario:

```text
prepared transaction hash generated
input holdings archived
signature submitted
execute fails
```

Recovery:

* Mark old signature session stale.
* Re-read holdings.
* Recompile command.
* Return new `next_action.collect_signature` or `requires_funding`.

## 7. Webhook endpoint down

Recovery:

* Retry with exponential backoff.
* Dead-letter after max attempts.
* Workbench manual resend.
* CLI resend.
* Consumer dedupe by `event.id`.
* Consumer fetches latest object because ordering is not guaranteed.

## 8. Ledger stream interruption

Recovery:

```text
projection worker restart
  -> resume from last offset
  -> if offset pruned, rebuild from ACS + retained audit
  -> reconcile command attempts
  -> regenerate missing webhook events from ledger-derived state changes
```

## 9. Reversal failure

Scenario:

```text
original transfer succeeded
reverse transfer cannot fund
```

Recovery:

* Original remains `succeeded`.
* Reversal object is `requires_funding` or `failed`.
* Original becomes `reversed` only after successful compensating transfer.

---

# Security / Compliance

## 1. API authentication

| Surface                    | Auth                                               |
| -------------------------- | -------------------------------------------------- |
| Secret REST API            | `sk_...` account secret key                        |
| Browser/mobile limited API | publishable key + `client_secret`                  |
| Hosted approval            | signed session token + user auth/MFA as configured |
| Webhook                    | HMAC signature                                     |
| Internal Canton Adapter    | service identity, mTLS, participant credentials    |
| Workbench                  | operator SSO/RBAC                                  |
| CLI                        | scoped developer token                             |

## 2. Client secret controls

* Never log raw `client_secret`.
* Never store raw `client_secret`.
* Never embed in hosted approval URL.
* Scope by intent, account, environment, action, API version.
* Expire on intent terminal state.
* Rotate on suspicious access.

## 3. Webhook security

* `Pillar-Signature` includes timestamp and HMAC.
* Reject old timestamps.
* Support signing secret rotation.
* Use HTTPS only.
* Webhook handler should ack quickly and process async.
* Delivery is at-least-once, not exactly-once.

## 4. Ledger security

* Public API never exposes Ledger API.
* JSON Ledger API remains internal/reverse-proxy protected, consistent with official guidance that it should not be internet exposed. ([Digital Asset Documentation][4])
* Daml package allowlist per environment.
* Participant routing allowlist.
* Separate local/custodial party permissions from external-party signing.
* For external parties, Pillar does not hold signing keys.

## 5. Compliance gates

`requires_approval` is the compliance state.

Examples:

| Gate                                 | Result                                                    |
| ------------------------------------ | --------------------------------------------------------- |
| KYC incomplete                       | `requires_approval`                                       |
| Sanctions screening pending          | `requires_approval`                                       |
| Travel-rule data missing             | `requires_approval`                                       |
| Transfer above limit                 | `requires_approval`                                       |
| Operator four-eyes approval required | `requires_approval`                                       |
| Asset jurisdiction restriction       | `failed` or `requires_approval`                           |
| Counterparty not onboarded           | `requires_counterparty_acceptance` or `requires_approval` |

All approval decisions should create ledger-traceable markers with actor, policy version, terms hash, and decision hash.

## 6. PII minimization

* Ledger stores references and hashes, not raw PII.
* DB stores PII only in tenant-controlled config/profile tables if necessary.
* Webhook payloads are thin by default.
* Metadata is capped and scanned; sensitive metadata warning in docs.

---

# Implementation Plan

## Phase 0 — Spec freeze

Deliverables:

* `TransferIntent` status enum
* `SettlementIntent` status enum
* public API OpenAPI spec
* webhook event schema
* API versioning policy
* id prefix conventions
* idempotency contract
* Daml template draft

## Phase 1 — Ledger model MVP

Build:

* `TransferIntent` Daml template
* `SettlementIntent` Daml template
* `IntentOperationMarker`
* choices: `Approve`, `Accept`, `RequireSignature`, `RequireFunding`, `Submit`, `MarkProcessing`, `Succeed`, `Fail`, `Cancel`, `Expire`, `Reverse`
* DAR build pipeline
* package upload pipeline
* Canton sandbox test harness

Canton sandbox is appropriate for local development where target production topology is not required. ([Digital Asset Documentation][13])

## Phase 2 — Projection and reconciliation

Build:

* transaction stream consumer
* completion stream consumer
* offset checkpointing
* projection tables
* ACS-based rebuild
* command attempt correlation
* replay integration tests

## Phase 3 — TransferIntent API MVP

Endpoints:

```text
POST /v1/transfer_intents
GET  /v1/transfer_intents/{id}
POST /v1/transfer_intents/{id}/confirm
POST /v1/transfer_intents/{id}/cancel
POST /v1/transfer_intents/{id}/reverse
GET  /v1/balances
GET  /v1/holdings
```

MVP flows:

* direct custodial transfer
* requires_funding
* requires_counterparty_acceptance
* cancel
* expire
* reverse

## Phase 4 — Hosted approval + client SDK

Build:

* approval session object
* hosted approval UI
* `client_secret` retrieve/complete API
* browser/mobile SDK helpers
* signature collection UI
* terms hash display
* return/cancel URL handling

## Phase 5 — External-party signing

Build:

* command plan compiler
* prepare transaction integration
* signature session
* execute signed transaction
* stale prepare detection
* recompile loop

## Phase 6 — SettlementIntent MVP

Build:

* atomic DvP
* two-party acceptance
* multi-leg funding check
* settlement window expiry
* settlement reversal
* settlement webhook events

## Phase 7 — Workbench / CLI / Sandbox

### Pillar Workbench

Mirror the useful Stripe Workbench affordances:

* request logs
* API version usage
* webhook deliveries
* event browser
* object inspector
* ledger trace
* command attempts
* projection lag

Stripe Workbench exposes request logs, API versions, events, and webhooks; this is the right operating model for Pillar operators. ([Stripe Docs][2])

### Pillar CLI

Commands:

```bash
pillar login
pillar sandbox start
pillar transfer_intents create --amount 100 --asset asset_usdc ...
pillar transfer_intents confirm ti_...
pillar listen --forward-to localhost:4242/webhook
pillar trigger transfer_intent.succeeded
pillar events resend evt_...
pillar fixtures fixtures/transfer.json
```

Stripe CLI supports sandbox resource management, webhook testing, and event triggering; Pillar CLI should copy that developer ergonomics. ([Stripe Docs][14])

### Pillar Sandbox

Features:

* local Canton sandbox
* fake assets
* fake accounts
* fake approval users
* fake signer
* deterministic ledger fixtures
* webhook trigger fixtures
* no live asset movement

Stripe sandbox isolates testing from live mode; Pillar sandbox should give the same confidence for Canton-backed assets. ([Stripe Docs][15])

## Phase 8 — Security/compliance hardening

Build:

* HSM/KMS integration
* mTLS to participants
* API key rotation
* webhook signing secret rotation
* hosted approval MFA
* audit export
* compliance policy versioning
* data retention controls
* penetration testing
* replay/rebuild disaster recovery drill

---

# API and SDK Examples

## 1. Create TransferIntent

```bash
curl https://api.pillar.example/v1/transfer_intents \
  -u sk_test_...: \
  -H "Pillar-Version: 2026-05-26" \
  -H "Idempotency-Key: ord_123_create_transfer" \
  -d amount="100.00" \
  -d asset="asset_usdc" \
  -d source="acct_sender" \
  -d destination="acct_receiver" \
  -d approval_method="hosted" \
  -d confirmation_method="manual" \
  -d "metadata[order_id]"="ord_123"
```

Response:

```json
{
  "id": "ti_01JZ7Y9H4MJ0T3EVJQK8RK3E4R",
  "object": "transfer_intent",
  "status": "requires_approval",
  "client_secret": "ti_01JZ7Y..._secret_4b7...",
  "next_action": {
    "type": "hosted_approval",
    "hosted_approval": {
      "approval_session": "aps_01JZ7Y...",
      "url": "https://approve.pillar.example/s/aps_01JZ7Y...",
      "expires_at": "2026-05-26T14:00:00Z"
    }
  }
}
```

## 2. Confirm TransferIntent

```bash
curl https://api.pillar.example/v1/transfer_intents/ti_01JZ7Y9H4MJ0T3EVJQK8RK3E4R/confirm \
  -u sk_test_...: \
  -H "Idempotency-Key: ord_123_confirm"
```

Response if signature is needed:

```json
{
  "id": "ti_01JZ7Y9H4MJ0T3EVJQK8RK3E4R",
  "object": "transfer_intent",
  "status": "requires_signature",
  "next_action": {
    "type": "collect_signature",
    "collect_signature": {
      "signature_session": "sig_01JZ8A...",
      "expires_at": "2026-05-26T14:00:00Z"
    }
  }
}
```

## 3. Create SettlementIntent

```bash
curl https://api.pillar.example/v1/settlement_intents \
  -u sk_test_...: \
  -H "Idempotency-Key: trade_2026_0001_create" \
  -H "Content-Type: application/json" \
  -d '{
    "settlement_type": "atomic_dvp",
    "atomicity": "all_or_none",
    "legs": [
      {
        "id": "delivery",
        "type": "delivery",
        "asset": "asset_bond_2029",
        "amount": "1000000",
        "from": "acct_seller",
        "to": "acct_buyer"
      },
      {
        "id": "payment",
        "type": "payment",
        "asset": "asset_usdc",
        "amount": "998500.00",
        "from": "acct_buyer",
        "to": "acct_seller"
      }
    ],
    "settlement_window": {
      "opens_at": "2026-05-26T12:00:00Z",
      "closes_at": "2026-05-26T18:00:00Z"
    },
    "metadata": {
      "trade_id": "TRD-2026-0001"
    }
  }'
```

## 4. Node SDK

```ts
import { Pillar } from "@pillar/sdk";

const pillar = new Pillar("sk_test_...", {
  apiVersion: "2026-05-26",
});

const transfer = await pillar.transferIntents.create(
  {
    amount: "100.00",
    asset: "asset_usdc",
    source: "acct_sender",
    destination: "acct_receiver",
    approval_method: "hosted",
    confirmation_method: "manual",
    metadata: {
      order_id: "ord_123",
    },
  },
  {
    idempotencyKey: "ord_123_create_transfer",
  }
);

if (transfer.next_action?.type === "hosted_approval") {
  console.log("Redirect user:", transfer.next_action.hosted_approval.url);
}

const confirmed = await pillar.transferIntents.confirm(
  transfer.id,
  {},
  {
    idempotencyKey: "ord_123_confirm",
  }
);

switch (confirmed.status) {
  case "requires_signature":
    await pillar.signatureSessions.collect(
      confirmed.next_action.collect_signature.signature_session
    );
    break;
  case "requires_funding":
    console.log(confirmed.next_action.funding_instruction);
    break;
  case "submitted":
  case "processing":
    console.log("Wait for webhook.");
    break;
  case "succeeded":
    console.log("Transfer complete.");
    break;
}
```

## 5. Webhook handler

```ts
import { Pillar } from "@pillar/sdk";

const pillar = new Pillar("sk_test_...");
const endpointSecret = process.env.PILLAR_WEBHOOK_SECRET!;

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;

  try {
    event = pillar.webhooks.constructEvent(
      req.body,
      req.headers["pillar-signature"],
      endpointSecret
    );
  } catch (err) {
    res.status(400).send("Invalid signature");
    return;
  }

  // Dedupe by event.id in your DB before processing.
  switch (event.type) {
    case "transfer_intent.succeeded": {
      const transfer = await pillar.transferIntents.retrieve(
        event.data.object.id
      );
      // Fulfill only after retrieve confirms status.
      break;
    }
    case "transfer_intent.failed":
    case "settlement_intent.failed":
      // Notify ops or user.
      break;
  }

  res.sendStatus(200);
});
```

---

# Open Questions

1. **Should every Intent creation be on-ledger?**
   Recommended: yes, to satisfy ledger source-of-truth. Possible alternative: create off-ledger draft and only ledger-create on confirm, but that weakens traceability.

2. **How much metadata can go on-ledger?**
   Recommended: store metadata hash on ledger, raw metadata in DB. This minimizes PII and avoids ledger privacy leakage.

3. **Partial reversal status?**
   Current enum has `reversed`. If partial reversal is a core product requirement, add `amount_reversed` and maybe `partially_reversed`; otherwise keep enum minimal.

4. **Settlement partial completion?**
   MVP should use `atomicity=all_or_none`. Partial settlement requires explicit product semantics, per-leg webhooks, and more complex failure handling.

5. **Multi-synchronizer settlement?**
   Need confirm whether target workflows require atomicity across synchronizers. If yes, settlement design must include a cross-domain orchestration layer.

6. **Token Standard versions to support?**
   Need define minimum supported Token Standard / Wallet SDK versions per environment. Wallet SDK release notes show active support for Canton 3.5.x / Splice 0.6.x in 2026-era docs. ([Digital Asset Documentation][16])

7. **External-party signing UX ownership?**
   Pillar can provide hosted signing UX, embed SDK, or delegate to third-party wallet. API grammar should support all three.

8. **Operational visibility boundary?**
   Workbench can expose Canton trace for operators, but customer-facing Dashboard should remain Canton-invisible unless an enterprise customer explicitly requests raw ledger trace.

9. **Failure status philosophy?**
   Decide whether recoverable command errors return to `requires_*` or enter `failed` with `retryable=true`. Recommended: recoverable errors return to `requires_*`.

10. **API version naming policy?**
    Stripe’s named monthly release model is mature; Pillar should choose date-only or named release and keep webhook endpoint version pinning from day one.

---

# Agent-ready Checklist

## State machine

* [ ] Implement `TransferIntentStatus` enum exactly:
  `requires_approval`, `requires_counterparty_acceptance`, `requires_signature`, `requires_funding`, `submitted`, `processing`, `succeeded`, `failed`, `canceled`, `expired`, `reversed`.
* [ ] Implement `SettlementIntentStatus` enum:
  `requires_matching`, `requires_approval`, `requires_counterparty_acceptance`, `requires_signature`, `requires_funding`, `submitted`, `processing`, `succeeded`, `failed`, `canceled`, `expired`, `reversed`.
* [ ] Add FSM guards for confirm/cancel/reverse/expire.
* [ ] Add recoverable failure routing back to `requires_funding` or `requires_signature`.
* [ ] Add terminal-state immutability.

## Ledger

* [ ] Create Daml templates for `TransferIntent`, `SettlementIntent`, `IntentOperationMarker`.
* [ ] Add choices for approve, accept, submit, fail, cancel, expire, reverse.
* [ ] Ensure all API mutations have ledger-traceable operation markers.
* [ ] Store terms hash and metadata hash, not raw sensitive payload.
* [ ] Add package version and command plan hash to operation trace.

## Canton runtime

* [ ] Implement gRPC Ledger API command submission.
* [ ] Implement completion stream consumer.
* [ ] Implement transaction stream consumer.
* [ ] Implement offset checkpointing.
* [ ] Implement command id / submission id correlation.
* [ ] Implement external-party prepare/sign/execute.
* [ ] Implement stale prepared transaction detection.
* [ ] Implement Token Standard Holding/UTXO selection.

## API

* [ ] OpenAPI spec for `/v1/transfer_intents`.
* [ ] OpenAPI spec for `/v1/settlement_intents`.
* [ ] `Idempotency-Key` on all mutating routes.
* [ ] `Pillar-Version` support.
* [ ] `client_secret` generation and hash storage.
* [ ] `next_action` schema.
* [ ] Hosted approval session API.
* [ ] Balance and holding APIs.
* [ ] Error model: `type`, `code`, `message`, `param`, `request_id`.

## Webhooks

* [ ] Event object schema.
* [ ] Thin event default.
* [ ] Webhook endpoint API.
* [ ] HMAC signature.
* [ ] Retry/backoff.
* [ ] Manual resend.
* [ ] Delivery logs.
* [ ] Endpoint API version pinning.
* [ ] Ordering-independent consumer docs.

## DB / Projection

* [ ] Intent projection tables.
* [ ] Balance projection table.
* [ ] Holding projection table.
* [ ] Ledger command audit table.
* [ ] Idempotency table.
* [ ] Webhook event/delivery tables.
* [ ] Rebuild projection from ledger offsets.
* [ ] Reconcile stale command attempts.

## Hosted UX / SDK

* [ ] Hosted approval page.
* [ ] Hosted counterparty acceptance page.
* [ ] Hosted signature collection page.
* [ ] Browser SDK using `client_secret`.
* [ ] Node SDK with idempotency helpers.
* [ ] Webhook verification helper.
* [ ] CLI: `listen`, `trigger`, `fixtures`, `events resend`.

## Workbench / Sandbox

* [ ] Workbench request logs.
* [ ] Workbench API version dashboard.
* [ ] Workbench webhook delivery explorer.
* [ ] Workbench ledger trace inspector.
* [ ] Pillar sandbox environment.
* [ ] Fake asset minting/funding fixtures.
* [ ] Local Canton sandbox startup.
* [ ] Deterministic integration tests.

## Security / Compliance

* [ ] API key rotation.
* [ ] Webhook secret rotation.
* [ ] `client_secret` redaction in logs.
* [ ] Hosted approval token TTL.
* [ ] RBAC for Workbench ledger trace.
* [ ] KYC/AML/sanctions policy gate.
* [ ] Approval policy versioning.
* [ ] HSM/KMS for custodial signing.
* [ ] mTLS/OIDC for internal services.
* [ ] PII minimization review.

## Acceptance criteria

* [ ] A TransferIntent can be created, confirmed, funded, signed, submitted, succeeded, canceled, expired, and reversed in sandbox.
* [ ] A SettlementIntent can execute atomic DvP in sandbox.
* [ ] Projection DB can be dropped and rebuilt from ledger.
* [ ] Duplicate confirm cannot duplicate asset movement.
* [ ] Webhook receiver can handle duplicate and out-of-order events.
* [ ] Public API never returns Canton contract id by default.
* [ ] Workbench can trace a public `ti_...` to ledger command id, completion, transaction offset, and Daml package version.

[1]: https://docs.stripe.com/payments/paymentintents/lifecycle "docs.stripe.com"
[2]: https://docs.stripe.com/workbench/overview?locale=en-GB "docs.stripe.com"
[3]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[4]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html "JSON Ledger API Service V2 — Digital Asset’s platform documentation"
[5]: https://docs.digitalasset.com/integrate/devnet/token-standard/index.html "Token Standard — Digital Asset’s platform documentation"
[6]: https://docs.stripe.com/api/payment-link "docs.stripe.com"
[7]: https://docs.stripe.com/api/payment_intents/object "docs.stripe.com"
[8]: https://docs.digitalasset.com/overview/3.4/explanations/canton/external-party.html "Local and external parties — Digital Asset’s platform documentation"
[9]: https://docs.digitalasset.com/integrate/devnet/preparing-and-signing-transactions/index.html "Preparing and Signing Transactions Using External Party — Digital Asset’s platform documentation"
[10]: https://docs.stripe.com/event-destinations/eventbridge "docs.stripe.com"
[11]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[12]: https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html "gRPC Ledger API Reference — Digital Asset’s platform documentation"
[13]: https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html "Sandbox — Digital Asset’s platform documentation"
[14]: https://docs.stripe.com/stripe-cli "docs.stripe.com"
[15]: https://docs.stripe.com/sandboxes "docs.stripe.com"
[16]: https://docs.digitalasset.com/integrate/devnet/release-notes/index.html "Wallet SDK Release Notes — Digital Asset’s platform documentation"
