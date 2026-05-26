# Executive Summary

Pillar의 Balance/Holding read model은 **contract-first가 아니라 position-first**여야 한다. 외부 개발자는 `contract_id`, `template_id`, split/archive/create, stakeholder visibility 같은 Canton/Daml 개념을 보지 않는다. 대신 Stripe처럼 `asset`, `holding`, `balance`, `balance_transaction`을 조회한다. 내부 런타임은 Canton-native로 유지하고, Ledger API의 create/archive/exercise event를 Pillar의 `LedgerEntry`로 정규화한 뒤, 이것을 `Holding`, `Balance`, `BalanceTransaction` projection으로 접는다.

핵심 설계 결론은 다음과 같다.

| Layer              |  Source of truth |                   외부 노출 | 역할                                                                               |
| ------------------ | ---------------: | ----------------------: | -------------------------------------------------------------------------------- |
| Canton Ledger      |              Yes |                      No | 최종 권리 상태, transfer/lock/redeem/freeze/reversal의 법적·기술적 근거                        |
| Pillar DB          |               No |                     Yes | projection, audit, config, idempotency, webhook delivery, dashboard/Workbench 상태 |
| LedgerEntry        |      No, derived | No 또는 opaque trace only | Canton event를 projection-friendly canonical fact로 변환                             |
| Holding            |       Projection |                     Yes | 고객이 이해하는 “보유 단위/lot/position slice”                                              |
| Balance            |       Projection |                     Yes | `account + asset` 기준의 available/locked/pending aggregate                         |
| BalanceTransaction | Projection/Audit |                     Yes | Stripe-style statement line; contract fragmentation을 하나의 경제적 사건으로 축약             |

리서치 기준: Stripe 공식 문서는 `Balance`가 `available`과 `pending`을 최상위 balance 개념으로 제공하고, `BalanceTransaction`은 계정 balance에 들어오거나 나가는 모든 자금 이동을 표현한다고 설명한다. Pillar는 이 문법을 Canton-backed asset에 맞게 확장해 `available`, `locked`, `pending`, `settled_total`을 제공한다. ([Stripe Docs][1]) Stripe의 list API는 `limit`, `starting_after`, `ending_before` 기반 cursor pagination을 사용하고, idempotent request는 같은 key의 재시도에 대해 첫 응답의 status/body를 재사용한다. Pillar API도 동일한 운영 철학을 채택한다. ([Stripe Docs][2]) Stripe의 webhook은 HTTPS endpoint로 Event object를 push하고, Event object는 생성 당시의 API version으로 data가 고정된다. Pillar webhook도 event payload immutability와 endpoint-level API version pinning을 도입해야 한다. ([Stripe Docs][3])

Canton/Daml 공식 문서는 Daml contract가 committed create 시점부터 archive 시점까지 active이고, active contract 자체는 immutable이라 state 변경은 create/archive로만 이뤄진다고 설명한다. 따라서 Pillar는 contract fragmentation을 정상 상태로 간주하고, 외부 API에서는 절대 contract 단위를 노출하지 않는다. ([Digital Asset Documentation][4]) Ledger API는 command stream과 update/event stream이 분리된 비동기 구조이며, command 결과는 completion/update를 통해 별도로 처리해야 한다. 또한 Update Service는 create/exercise/archive event를 stream하고, State Service는 active contract set을 특정 offset 기준으로 bootstrap할 수 있다. ([Digital Asset Documentation][5]) Digital Asset Quickstart도 backend가 ledger interaction을 중재하고 frontend는 Canton/Ledger API와 직접 통신하지 않는 구조를 권장한다. Pillar도 이 구조를 제품 원칙으로 고정한다. ([Digital Asset Documentation][6])

---

# Goals / Non-goals

## Goals

1. **Balance/Holding-first API**

   * 외부 API의 기본 문법은 `GET /v1/balances`, `GET /v1/holdings`, `GET /v1/balance_transactions`.
   * Canton contract, party, participant, synchronizer, offset은 기본 응답에서 숨긴다.

2. **Ledger-source-of-truth**

   * 최종 asset ownership, lock, freeze, redeem, reversal은 반드시 Canton ledger event에서 유도한다.
   * Pillar DB는 projection, audit, config, idempotency, delivery 상태만 저장한다.

3. **Fragmentation invisibility**

   * Daml contract가 partial transfer, lock, redemption, package upgrade, contract-key redesign 등으로 split/archive/create되어도 외부 `holding_id`와 `balance_transaction_id`는 stable하다.

4. **Stripe-grade API grammar**

   * list object, cursor pagination, date-based API versioning, idempotency key, metadata, event object, webhook endpoint version pinning, SDK auto-pagination을 day one부터 지원한다.

5. **Ledger-traceable operations**

   * 모든 `balance_transaction`은 하나 이상의 internal `ledger_entries`와 연결된다.
   * 외부에는 opaque `ledger_reference`만 제공하고, Workbench/admin 권한에서만 상세 trace를 보여준다.

6. **Projection rebuildability**

   * DB projection은 언제든 ledger에서 재생성 가능해야 한다.
   * rebuild는 blue/green projection namespace로 수행하고 checksum 검증 후 cutover한다.

## Non-goals

1. 외부 개발자에게 Canton `contract_id`, Daml `template_id`, party visibility, participant offset을 API primitive로 노출하지 않는다.
2. Pillar DB를 권리 원장으로 사용하지 않는다.
3. pending intent를 ledger-final balance로 위장하지 않는다.
4. contract fragment 개수를 holding 개수로 오해시키지 않는다.
5. `BalanceTransaction`을 회계 총계의 유일한 source of truth로 만들지 않는다. 회계적 source of truth는 ledger event와 그 event에서 파생된 immutable audit chain이다.

---

# Architecture

## High-level topology

```text
External Developer
   |
   |  Stripe-like REST API / SDK / CLI
   v
Pillar API Gateway
   |-- API version resolver
   |-- auth / scopes / tenant routing
   |-- idempotency layer
   |-- request log / Workbench
   |
   v
Intent Service ---------------> Webhook Dispatcher
   |                              |
   |                              v
   |                         event_destinations
   |
   v
Policy + Compliance Engine
   |
   v
Fragment Resolver
   |
   v
Canton Ledger Adapter
   |-- gRPC Ledger API commands
   |-- command completion correlation
   |-- update stream consumer
   v
Canton Ledger
   ^
   |
Projector / Reconciler
   |-- LedgerEntry ingestion
   |-- Holding projection
   |-- Balance projection
   |-- BalanceTransaction projection
   |-- rebuild / checksum
   v
Pillar DB
```

Canton/Daml runtime은 command submission, command completion, update stream, State Service, Event Query Service를 사용한다. Ledger API command submission은 “서버가 command 형식을 수락했다”는 의미와 “ledger effect가 발생했다”는 의미를 분리하므로, Pillar는 intent 상태와 projection 상태를 별도로 관리해야 한다. ([Digital Asset Documentation][5])

## Object relationship

```text
AssetClass
  1 ─── * Asset
            1 ─── * Holding
                    * ─── * LedgerEntry      (via holding_ledger_entries)
            1 ─── * Balance                  (account_id + asset_id)
            1 ─── * BalanceTransaction
                    * ─── * LedgerEntry      (via balance_transaction_ledger_entries)
```

### Relationship semantics

| Object               | Meaning                                                                  |                 Persistence |     External? |
| -------------------- | ------------------------------------------------------------------------ | --------------------------: | ------------: |
| `AssetClass`         | fungibility, unit scale, transfer rules, instrument family               |                      Config |           Yes |
| `Asset`              | concrete issued asset/instrument under an AssetClass                     | Config + projection summary |           Yes |
| `Holding`            | logical customer/account position, independent of contract fragmentation |                  Projection |           Yes |
| `Balance`            | aggregate of holdings and pending reservations per `account + asset`     |                  Projection |           Yes |
| `BalanceTransaction` | immutable statement line for economic effect                             |            Projection/Audit |           Yes |
| `LedgerEntry`        | normalized Canton event fact                                             |      Audit/Projection input | No by default |

## Contract fragmentation handling

Daml contract lifecycle is immutable: active contracts are changed by archiving old contracts and creating new ones. This is exactly why Pillar must not expose `contract_id` as the user-facing inventory primitive. ([Digital Asset Documentation][4])

Internal mapping:

```text
Daml Contract Fragment
  contract_id: "00ab..."
  template_id: "Pillar.AssetHolding:Holding"
  quantity: 40
  status: active
  holding_id: "hld_123"

Daml Contract Fragment
  contract_id: "00cd..."
  template_id: "Pillar.AssetHolding:Holding"
  quantity: 60
  status: active
  holding_id: "hld_123"

External Holding
  id: "hld_123"
  quantity: "100.000000"
```

If a partial transfer archives one 100-unit contract and creates a 40-unit transferred contract plus a 60-unit remainder contract, external clients see:

```text
before: hld_123 quantity 100
after:  hld_123 quantity 60
        balance_transaction bt_x debit -40
```

They never see that one Daml contract became two contracts.

---

# API / Object Model

## API conventions

Pillar uses Stripe-like conventions:

```http
GET /v1/balances
GET /v1/holdings
GET /v1/balance_transactions
```

Common query params:

| Param                          | Type                    | Meaning                 |
| ------------------------------ | ----------------------- | ----------------------- |
| `limit`                        | integer, 1–100          | page size               |
| `starting_after`               | object id               | forward cursor          |
| `ending_before`                | object id               | backward cursor         |
| `account`                      | id                      | account filter          |
| `asset`                        | id                      | asset filter            |
| `asset_class`                  | id                      | asset class filter      |
| `created[gte]`, `created[lte]` | timestamp               | time filter             |
| `consistency`                  | `projection` | `ledger` | read consistency        |
| `livemode`                     | boolean                 | sandbox/live separation |

Stripe list endpoints use cursor-style pagination with `limit`, `starting_after`, and `ending_before`; Pillar should preserve this grammar for SDK compatibility and developer intuition. ([Stripe Docs][2])

## API versioning

Request header:

```http
Pillar-Version: 2026-05-26
```

Rules:

1. Each account has a default API version.
2. Each SDK pins a compatible API version.
3. Each webhook endpoint has its own event API version.
4. Event payloads are immutable once created.
5. Breaking changes are released under dated versions, not silent field mutation.

This mirrors Stripe’s practice of SDK/API version pinning and webhook endpoint API versioning. ([Stripe Docs][7])

## IDs

| Prefix   | Object                  |
| -------- | ----------------------- |
| `acls_`  | AssetClass              |
| `asset_` | Asset                   |
| `acct_`  | Account                 |
| `hld_`   | Holding                 |
| `bal_`   | Balance                 |
| `bt_`    | BalanceTransaction      |
| `le_`    | LedgerEntry, internal   |
| `lr_`    | opaque ledger reference |
| `pi_`    | Pillar Intent           |
| `evt_`   | Event                   |
| `wh_`    | Webhook endpoint        |

No public ID contains Canton contract IDs.

---

## Object: AssetClass

```json
{
  "id": "acls_tokenized_cash",
  "object": "asset_class",
  "name": "Tokenized Cash",
  "category": "cash",
  "unit_scale": 6,
  "fungibility": "asset",
  "transferable": true,
  "redeemable": true,
  "lockable": true,
  "freezable": true,
  "metadata": {},
  "created": 1764028800,
  "livemode": true
}
```

### Fields

| Field          | Meaning                                                  |
| -------------- | -------------------------------------------------------- |
| `unit_scale`   | atomic unit scale. Example: `6` means `1.000000`         |
| `fungibility`  | `asset`, `issuer_asset`, `series`, `lot`, `non_fungible` |
| `transferable` | whether transfer intents are allowed                     |
| `redeemable`   | whether redeem intents are allowed                       |
| `lockable`     | whether ledger-backed locks are supported                |
| `freezable`    | whether compliance freeze can apply                      |

---

## Object: Asset

```json
{
  "id": "asset_usdp",
  "object": "asset",
  "asset_class": "acls_tokenized_cash",
  "code": "USDP",
  "name": "Pillar USD",
  "issuer": "iss_pillar_bank",
  "unit_scale": 6,
  "status": "active",
  "transfer_rules": {
    "requires_recipient_kyc": true,
    "allow_partial_transfer": true
  },
  "metadata": {},
  "created": 1764028800,
  "livemode": true
}
```

`AssetClass` defines the general grammar; `Asset` is the concrete issued instrument. For example, `Tokenized Cash` can be the class and `Pillar USD` the asset.

---

## Object: Holding

A `Holding` is a **logical position**, not a Daml contract.

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

### Holding statuses

| Status             | Meaning                                           |
| ------------------ | ------------------------------------------------- |
| `available`        | fully spendable                                   |
| `partially_locked` | some quantity locked                              |
| `locked`           | fully locked                                      |
| `frozen`           | compliance freeze blocks spending                 |
| `redeeming`        | locked for redemption                             |
| `pending`          | projected from in-flight intent, not ledger-final |
| `closed`           | no active quantity remains                        |

---

## Object: Balance

```json
{
  "id": "bal_acct_merchant_001_asset_usdp",
  "object": "balance",
  "account": "acct_merchant_001",
  "asset": "asset_usdp",
  "asset_class": "acls_tokenized_cash",
  "settled_total": "1250.000000",
  "available": "1000.000000",
  "locked": "250.000000",
  "pending": "0.000000",
  "pending_breakdown": {
    "incoming": "0.000000",
    "outgoing": "0.000000"
  },
  "as_of": 1764032400,
  "consistency": "projection",
  "livemode": true
}
```

### Balance calculation

Let the balance key be:

```text
balance_key = account_id + asset_id + livemode + custody_scope
```

All quantities are stored internally as integer atomic units.

```text
settled_total =
  Σ active on-ledger holding fragment quantity
  where owner_account = account_id
  and asset = asset_id
  and state in (available, locked, frozen, redeeming)

onledger_locked =
  Σ active lock quantity
  + Σ active redeem-lock quantity
  + Σ freeze-equivalent locked quantity

soft_reserved_out =
  Σ outgoing intent quantity
  where intent.status in (requires_ledger_submit, submitted, completion_pending)
  and no corresponding committed ledger effect has been projected

pending_in =
  Σ incoming intent quantity
  where not yet ledger-final

pending_out =
  soft_reserved_out
  + Σ outgoing external-settlement quantity
  where not yet ledger-final

available =
  settled_total - onledger_locked - soft_reserved_out

locked =
  onledger_locked

pending =
  pending_in - pending_out
```

Important invariant:

```text
available + locked = settled_total - soft_reserved_out
```

`soft_reserved_out` exists only to prevent double-spend between API acceptance and ledger commitment. Once the ledger emits the corresponding lock/transfer/redeem event, the projector clears the soft reservation and updates `locked` or `settled_total`.

---

## Object: BalanceTransaction

```json
{
  "id": "bt_9smP2L",
  "object": "balance_transaction",
  "account": "acct_merchant_001",
  "asset": "asset_usdp",
  "asset_class": "acls_tokenized_cash",
  "type": "transfer",
  "status": "available",
  "amount": "-40.000000",
  "available_delta": "-40.000000",
  "locked_delta": "0.000000",
  "pending_delta": "0.000000",
  "ending_balance": {
    "available": "960.000000",
    "locked": "250.000000",
    "settled_total": "1210.000000"
  },
  "source": {
    "type": "transfer",
    "id": "pi_transfer_123"
  },
  "reversal_of": null,
  "available_on": 1764032400,
  "created": 1764032400,
  "ledger_reference": "lr_2bY8Tn",
  "livemode": true,
  "metadata": {}
}
```

Stripe’s `BalanceTransaction` object has `amount`, `fee`, `net`, status, source, and availability semantics. Pillar extends this with `available_delta`, `locked_delta`, and `pending_delta` because Canton-backed assets can change spendability without changing total ownership. ([Stripe Docs][8])

### BalanceTransaction types

| Type              |            `amount` | `available_delta` | `locked_delta` | Meaning                       |
| ----------------- | ------------------: | ----------------: | -------------: | ----------------------------- |
| `issue`           |                `+x` |              `+x` |            `0` | asset issuance/mint           |
| `transfer` debit  |                `-x` |              `-x` |            `0` | outgoing transfer             |
| `transfer` credit |                `+x` |              `+x` |            `0` | incoming transfer             |
| `lock`            |                 `0` |              `-x` |           `+x` | spendability changes only     |
| `unlock`          |                 `0` |              `+x` |           `-x` | lock released                 |
| `freeze`          |                 `0` |              `-x` |           `+x` | compliance lock equivalent    |
| `unfreeze`        |                 `0` |              `+x` |           `-x` | freeze removed                |
| `redeem`          |                `-x` |       `0` or `-x` |    `-x` or `0` | burn/redeem asset             |
| `reversal`        | inverse of original |           inverse |        inverse | compensating ledger operation |
| `fee`             |                `-x` |              `-x` |            `0` | platform/network fee          |

---

## GET /v1/balances

### Request

```http
GET /v1/balances?account=acct_merchant_001&asset=asset_usdp&consistency=projection&limit=10
```

### Query params

| Param            | Type    | Description                                      |
| ---------------- | ------- | ------------------------------------------------ |
| `account`        | id      | required unless privileged aggregate scope       |
| `asset`          | id      | optional                                         |
| `asset_class`    | id      | optional                                         |
| `include_zero`   | boolean | default `false`                                  |
| `consistency`    | enum    | `projection` default, `ledger` for verified read |
| `limit`          | integer | default `10`, max `100`                          |
| `starting_after` | id      | cursor                                           |
| `ending_before`  | id      | cursor                                           |

### Response

```json
{
  "object": "list",
  "url": "/v1/balances",
  "has_more": false,
  "data": [
    {
      "id": "bal_acct_merchant_001_asset_usdp",
      "object": "balance",
      "account": "acct_merchant_001",
      "asset": "asset_usdp",
      "settled_total": "1250.000000",
      "available": "1000.000000",
      "locked": "250.000000",
      "pending": "0.000000",
      "pending_breakdown": {
        "incoming": "0.000000",
        "outgoing": "0.000000"
      },
      "as_of": 1764032400,
      "consistency": "projection",
      "livemode": true
    }
  ]
}
```

---

## GET /v1/holdings

### Request

```http
GET /v1/holdings?account=acct_merchant_001&asset=asset_usdp&status=partially_locked
```

### Query params

| Param                          | Type      | Description                                                                |
| ------------------------------ | --------- | -------------------------------------------------------------------------- |
| `account`                      | id        | account owner                                                              |
| `asset`                        | id        | asset filter                                                               |
| `asset_class`                  | id        | class filter                                                               |
| `status`                       | enum      | `available`, `locked`, `partially_locked`, `frozen`, `redeeming`, `closed` |
| `source[type]`                 | string    | source object type                                                         |
| `source[id]`                   | id        | source object id                                                           |
| `created[gte]`, `created[lte]` | timestamp | creation filter                                                            |
| `consistency`                  | enum      | `projection` or `ledger`                                                   |

### Response

```json
{
  "object": "list",
  "url": "/v1/holdings",
  "has_more": false,
  "data": [
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
      "created": 1764028800,
      "updated": 1764032400,
      "livemode": true,
      "metadata": {}
    }
  ]
}
```

---

## GET /v1/balance_transactions

### Request

```http
GET /v1/balance_transactions?account=acct_merchant_001&asset=asset_usdp&type=transfer&limit=20
```

### Query params

| Param                          | Type      | Description                                                                              |
| ------------------------------ | --------- | ---------------------------------------------------------------------------------------- |
| `account`                      | id        | account filter                                                                           |
| `asset`                        | id        | asset filter                                                                             |
| `asset_class`                  | id        | class filter                                                                             |
| `holding`                      | id        | holding filter                                                                           |
| `type`                         | enum      | `issue`, `transfer`, `lock`, `unlock`, `freeze`, `unfreeze`, `redeem`, `reversal`, `fee` |
| `status`                       | enum      | `pending`, `available`, `failed`, `reversed`                                             |
| `source[type]`                 | string    | source object type                                                                       |
| `source[id]`                   | id        | source object id                                                                         |
| `created[gte]`, `created[lte]` | timestamp | time filter                                                                              |
| `consistency`                  | enum      | `projection` or `ledger`                                                                 |

### Response

```json
{
  "object": "list",
  "url": "/v1/balance_transactions",
  "has_more": true,
  "data": [
    {
      "id": "bt_9smP2L",
      "object": "balance_transaction",
      "account": "acct_merchant_001",
      "asset": "asset_usdp",
      "type": "transfer",
      "status": "available",
      "amount": "-40.000000",
      "available_delta": "-40.000000",
      "locked_delta": "0.000000",
      "pending_delta": "0.000000",
      "ending_balance": {
        "available": "960.000000",
        "locked": "250.000000",
        "settled_total": "1210.000000"
      },
      "source": {
        "type": "transfer",
        "id": "pi_transfer_123"
      },
      "ledger_reference": "lr_2bY8Tn",
      "created": 1764032400,
      "livemode": true
    }
  ]
}
```

---

# Internal Runtime

## LedgerEntry design

`LedgerEntry`는 Canton event를 projection에 적합하게 정규화한 internal fact다.

```json
{
  "id": "le_01HX...",
  "participant_id": "ptp_internal_1",
  "ledger_offset": "000000000000000088",
  "update_id": "1220...",
  "transaction_id": "1220...",
  "event_id": "0",
  "event_type": "created",
  "contract_id_hash": "sha256:...",
  "template_id": "Pillar.AssetHolding:Holding",
  "command_id": "cmd_pi_transfer_123",
  "workflow_id": "wf_pi_transfer_123",
  "business_operation_id": "pi_transfer_123",
  "payload_hash": "sha256:...",
  "projected": true,
  "ingested_at": "2026-05-26T10:01:02Z"
}
```

LedgerEntry rules:

1. One Canton event becomes one `ledger_entry`.
2. One economic operation can have many `ledger_entries`.
3. One external `balance_transaction` can link to many `ledger_entries`.
4. LedgerEntry insertion is idempotent on `(participant_id, update_id, event_id)`.
5. Contract IDs are stored internally, encrypted or hashed for audit; never returned in public API.

Canton Update Service can return active-contract-set delta or full ledger-effect transaction shapes; Pillar should use ACS delta for normal projection and ledger effects/tree shape for trace/debug/reconciliation. ([Digital Asset Documentation][5])

---

## Projection pipeline

```text
1. Subscribe to Canton UpdateService from last checkpoint.
2. For each update:
   a. insert ledger_entries
   b. update ledger_contract_fragments
   c. derive holding deltas
   d. derive balance_transaction rows
   e. update balances
   f. write projection checkpoint
   g. enqueue webhook events
3. Commit DB transaction.
4. Advance checkpoint only after all derived writes succeed.
```

The checkpoint key must include `participant_id` because Canton offsets are meaningful in the context of the participant node that observed them. ([Digital Asset Documentation][5])

---

## `consistency=projection` vs `consistency=ledger`

### `consistency=projection`

Default.

Behavior:

1. Read from Pillar DB.
2. Include `consistency: "projection"`.
3. Include `as_of`.
4. If projection lag exceeds tenant SLA, return:

   * `200` with `projection_stale: true`, or
   * `503 projection_unavailable` if strict account policy is enabled.

Use case:

* dashboards
* normal API reads
* webhook reconciliation
* SDK list calls

### `consistency=ledger`

Stronger read.

Behavior options:

1. **Wait-for-projection mode**

   * Ask ledger adapter for latest observed participant position.
   * Wait until projector checkpoint reaches that position.
   * Return DB projection once caught up.

2. **Direct recompute mode**

   * Use State Service/Event Query Service for the relevant parties and templates.
   * Compute ephemeral balance.
   * Optionally reconcile against DB projection.
   * Return result without exposing contract IDs.

Ledger consistency caveat:

```text
consistency=ledger means:
  “consistent with all ledger events visible to Pillar’s configured participant/party set at read time.”

It does not mean:
  “omniscient view across parties or participants Pillar is not entitled to observe.”
```

Daml visibility is party/stakeholder based; observers see create/archive actions for contracts they observe, and parties see actions in which they have a stake. Pillar must therefore design account-party mappings and observer patterns deliberately. ([Digital Asset Documentation][9])

---

## Partial transfer

### Problem

Canton/Daml may represent a 100-unit holding as:

```text
contract A: 70
contract B: 30
```

External user requests transfer of `40`.

### Internal algorithm

```text
Input:
  from_account = acct_A
  to_account   = acct_B
  asset        = asset_usdp
  amount       = 40

Steps:
  1. Create transfer intent pi_transfer_123.
  2. Resolve account -> Daml party/authorization context.
  3. Read projected available balance with row-level lock.
  4. Reject if available < 40.
  5. Select fragments deterministically:
       - unlocked
       - non-frozen
       - transferable
       - same asset
       - same custody/synchronizer scope
       - FIFO by acquisition time, then contract creation order
  6. Create soft reservation for 40.
  7. Submit Daml command:
       - if selected fragment quantity == amount:
           transfer whole fragment
       - if selected fragment quantity > amount:
           archive original
           create recipient fragment amount
           create source remainder
       - if selected across multiple fragments:
           archive selected fragments
           create one or more recipient fragments
           create source remainder if needed
  8. Correlate completion by command_id/workflow_id.
  9. Projector consumes ledger update:
       - archive old fragments
       - create new fragments
       - update holdings
       - emit source debit balance_transaction
       - emit destination credit balance_transaction
       - clear soft reservation
 10. Webhooks:
       - balance_transaction.created
       - balance.updated
       - holding.updated
       - transfer.succeeded
```

### External result

The source account sees one debit `BalanceTransaction`:

```json
{
  "type": "transfer",
  "amount": "-40.000000",
  "source": {
    "type": "transfer",
    "id": "pi_transfer_123"
  }
}
```

The destination account sees one credit `BalanceTransaction`:

```json
{
  "type": "transfer",
  "amount": "40.000000",
  "source": {
    "type": "transfer",
    "id": "pi_transfer_123"
  }
}
```

No contract fragmentation is exposed.

---

## Lock / freeze / redeem / reversal

## Lock

A lock changes spendability, not ownership.

```text
Before:
  settled_total = 100
  available     = 100
  locked        = 0

Lock 30:
  settled_total = 100
  available     = 70
  locked        = 30
```

BalanceTransaction:

```json
{
  "type": "lock",
  "amount": "0.000000",
  "available_delta": "-30.000000",
  "locked_delta": "30.000000"
}
```

Implementation options:

1. Daml creates a separate `AssetLock` contract referencing locked fragments.
2. Daml archives an available holding contract and creates locked/remainder contracts.
3. Daml creates an authorization/encumbrance contract consumed by subsequent transfer/redeem.

Pillar projection normalizes all three into the same external lock semantics.

## Unlock

```text
available += x
locked    -= x
settled_total unchanged
```

BalanceTransaction:

```json
{
  "type": "unlock",
  "amount": "0.000000",
  "available_delta": "30.000000",
  "locked_delta": "-30.000000"
}
```

## Freeze

Freeze is a compliance lock. It can be scoped to:

| Scope         | Meaning                  |
| ------------- | ------------------------ |
| account       | all assets in account    |
| asset/account | one asset in one account |
| holding       | specific logical holding |
| intent        | block one operation      |
| issuer/global | issuer-level freeze rule |

Projection rule:

```text
effective_locked =
  explicit_locks
  + redeem_locks
  + freeze_equivalent_amount
```

For account-level freeze, `freeze_equivalent_amount = all otherwise available quantity`.

BalanceTransaction:

```json
{
  "type": "freeze",
  "amount": "0.000000",
  "available_delta": "-100.000000",
  "locked_delta": "100.000000"
}
```

## Redeem

Recommended flow:

```text
1. redeem_intent.created
2. lock quantity for redemption
3. submit ledger redeem command
4. ledger archives/redeems/burns asset contract or consumes redeem lock
5. balance_transaction type=redeem
6. holding closed or reduced
```

If redemption was pre-locked:

```text
Before redeem:
  settled_total = 100
  available     = 70
  locked        = 30

Redeem locked 30:
  settled_total = 70
  available     = 70
  locked        = 0
```

BalanceTransaction:

```json
{
  "type": "redeem",
  "amount": "-30.000000",
  "available_delta": "0.000000",
  "locked_delta": "-30.000000"
}
```

If redemption is immediate without pre-lock:

```json
{
  "type": "redeem",
  "amount": "-30.000000",
  "available_delta": "-30.000000",
  "locked_delta": "0.000000"
}
```

## Reversal

A reversal is never an edit to the original transaction. It is a compensating ledger operation.

```json
{
  "id": "bt_reverse_123",
  "type": "reversal",
  "amount": "40.000000",
  "reversal_of": "bt_9smP2L",
  "source": {
    "type": "reversal",
    "id": "pi_reversal_123"
  }
}
```

Rules:

1. Original `balance_transaction` remains immutable.
2. Reversal creates new ledger-traceable operation.
3. If the original recipient lacks available balance:

   * reject reversal,
   * create pending debit claim,
   * or allow negative balance only if asset policy permits.
4. Reversal must reference original source intent and original ledger reference.
5. Webhook emits both `balance_transaction.created` and `balance_transaction.reversed` for the original transaction.

---

## Projection rebuild

Two rebuild modes are required.

### Mode A: Full replay

```text
1. Create projection namespace projection_version=N+1.
2. Reset checkpoint to ledger start or retained earliest offset.
3. Replay UpdateService events.
4. Recompute:
     ledger_contract_fragments
     holdings
     balances
     balance_transactions
5. Compare checksums with active projection.
6. Cut over atomically.
```

### Mode B: Snapshot + replay

```text
1. Use State Service to get active contracts at offset X.
2. Build active fragments and holdings from snapshot.
3. Subscribe to UpdateService from offset X.
4. Apply deltas after X.
5. Verify checksum.
6. Cut over.
```

State Service is specifically designed to obtain active contracts at a certain offset and then continue with the updates stream to maintain a consistent active-contract-set view. ([Digital Asset Documentation][5]) PQS SQL also treats offset as the ordering primitive for consistent transaction views. ([Digital Asset Documentation][10])

### Rebuild invariants

| Invariant                                                    | Check                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| no duplicate ledger entries                                  | unique `(participant_id, update_id, event_id)`        |
| no negative available unless policy allows                   | balance constraint                                    |
| fragment sum equals holding sum                              | per `holding_id` checksum                             |
| holding sum equals balance settled total                     | per `account_id + asset_id` checksum                  |
| every balance transaction maps to ledger entry group         | join table non-empty except DB-only soft pending rows |
| every committed intent has command/workflow/ledger reference | audit constraint                                      |
| projection checkpoint advances monotonically                 | per participant                                       |

---

# DB Schema

Below is a production-oriented PostgreSQL schema sketch. Quantities are stored in atomic units as `NUMERIC(78,0)` to avoid float errors.

## Core config

```sql
CREATE TABLE asset_classes (
  id                  TEXT PRIMARY KEY,
  object              TEXT NOT NULL DEFAULT 'asset_class',
  livemode            BOOLEAN NOT NULL,
  name                TEXT NOT NULL,
  category            TEXT NOT NULL,
  unit_scale          INTEGER NOT NULL CHECK (unit_scale >= 0 AND unit_scale <= 18),
  fungibility         TEXT NOT NULL,
  transferable        BOOLEAN NOT NULL DEFAULT TRUE,
  redeemable          BOOLEAN NOT NULL DEFAULT FALSE,
  lockable            BOOLEAN NOT NULL DEFAULT TRUE,
  freezable           BOOLEAN NOT NULL DEFAULT TRUE,
  transfer_rules      JSONB NOT NULL DEFAULT '{}',
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assets (
  id                  TEXT PRIMARY KEY,
  object              TEXT NOT NULL DEFAULT 'asset',
  livemode            BOOLEAN NOT NULL,
  asset_class_id      TEXT NOT NULL REFERENCES asset_classes(id),
  code                TEXT NOT NULL,
  name                TEXT NOT NULL,
  issuer_id           TEXT,
  unit_scale          INTEGER NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('active','paused','retired')),
  ledger_template     TEXT NOT NULL,
  ledger_interface    TEXT,
  transfer_rules      JSONB NOT NULL DEFAULT '{}',
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX assets_livemode_code_idx
  ON assets(livemode, code);
```

## Ledger ingestion / audit

```sql
CREATE TABLE ledger_entries (
  id                    TEXT PRIMARY KEY,
  livemode              BOOLEAN NOT NULL,
  participant_id         TEXT NOT NULL,
  synchronizer_id        TEXT,
  ledger_offset          TEXT NOT NULL,
  offset_seq             BIGINT NOT NULL,
  update_id              TEXT NOT NULL,
  transaction_id         TEXT,
  event_id               TEXT NOT NULL,
  event_type             TEXT NOT NULL CHECK (
    event_type IN ('created','archived','exercised','reassigned','topology')
  ),
  contract_id_ciphertext BYTEA,
  contract_id_hash       TEXT,
  template_id            TEXT,
  command_id             TEXT,
  submission_id          TEXT,
  workflow_id            TEXT,
  business_operation_id  TEXT,
  payload_hash           TEXT NOT NULL,
  payload_json           JSONB,
  ledger_effective_at    TIMESTAMPTZ,
  ingested_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  projection_version     INTEGER NOT NULL DEFAULT 1,

  UNIQUE (participant_id, update_id, event_id),
  UNIQUE (participant_id, offset_seq, event_id)
);

CREATE INDEX ledger_entries_business_op_idx
  ON ledger_entries(business_operation_id);

CREATE INDEX ledger_entries_command_idx
  ON ledger_entries(command_id);
```

## Contract fragments

```sql
CREATE TABLE ledger_contract_fragments (
  id                    TEXT PRIMARY KEY,
  livemode              BOOLEAN NOT NULL,
  participant_id         TEXT NOT NULL,
  contract_id_hash       TEXT NOT NULL,
  contract_id_ciphertext BYTEA,
  template_id            TEXT NOT NULL,

  asset_id               TEXT NOT NULL REFERENCES assets(id),
  account_id             TEXT NOT NULL,
  holding_id             TEXT,
  quantity_atoms         NUMERIC(78,0) NOT NULL CHECK (quantity_atoms >= 0),

  state                  TEXT NOT NULL CHECK (
    state IN ('active','archived','locked','frozen','redeeming')
  ),

  created_ledger_entry_id TEXT NOT NULL REFERENCES ledger_entries(id),
  archived_ledger_entry_id TEXT REFERENCES ledger_entries(id),
  created_offset_seq      BIGINT NOT NULL,
  archived_offset_seq     BIGINT,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at            TIMESTAMPTZ,

  UNIQUE (participant_id, contract_id_hash)
);

CREATE INDEX fragments_holding_idx
  ON ledger_contract_fragments(holding_id);

CREATE INDEX fragments_balance_idx
  ON ledger_contract_fragments(account_id, asset_id, state);
```

## Holdings

```sql
CREATE TABLE holdings (
  id                    TEXT PRIMARY KEY,
  object                TEXT NOT NULL DEFAULT 'holding',
  livemode              BOOLEAN NOT NULL,
  account_id            TEXT NOT NULL,
  asset_id              TEXT NOT NULL REFERENCES assets(id),
  asset_class_id         TEXT NOT NULL REFERENCES asset_classes(id),

  quantity_atoms         NUMERIC(78,0) NOT NULL DEFAULT 0,
  available_atoms        NUMERIC(78,0) NOT NULL DEFAULT 0,
  locked_atoms           NUMERIC(78,0) NOT NULL DEFAULT 0,
  pending_atoms          NUMERIC(78,0) NOT NULL DEFAULT 0,

  status                TEXT NOT NULL CHECK (
    status IN ('available','partially_locked','locked','frozen','redeeming','pending','closed')
  ),

  source_type            TEXT,
  source_id              TEXT,
  restrictions           JSONB NOT NULL DEFAULT '[]',
  metadata               JSONB NOT NULL DEFAULT '{}',

  first_seen_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  projection_version     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX holdings_account_asset_idx
  ON holdings(account_id, asset_id, status);
```

## Balances

```sql
CREATE TABLE balances (
  id                    TEXT PRIMARY KEY,
  object                TEXT NOT NULL DEFAULT 'balance',
  livemode              BOOLEAN NOT NULL,
  account_id            TEXT NOT NULL,
  asset_id              TEXT NOT NULL REFERENCES assets(id),
  asset_class_id         TEXT NOT NULL REFERENCES asset_classes(id),

  settled_total_atoms    NUMERIC(78,0) NOT NULL DEFAULT 0,
  available_atoms        NUMERIC(78,0) NOT NULL DEFAULT 0,
  locked_atoms           NUMERIC(78,0) NOT NULL DEFAULT 0,
  pending_in_atoms       NUMERIC(78,0) NOT NULL DEFAULT 0,
  pending_out_atoms      NUMERIC(78,0) NOT NULL DEFAULT 0,

  last_ledger_entry_id   TEXT REFERENCES ledger_entries(id),
  projection_offset_seq  BIGINT,
  projection_version     INTEGER NOT NULL DEFAULT 1,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (livemode, account_id, asset_id)
);

CREATE INDEX balances_account_idx
  ON balances(account_id, livemode);
```

## Balance transactions

```sql
CREATE TABLE balance_transactions (
  id                    TEXT PRIMARY KEY,
  object                TEXT NOT NULL DEFAULT 'balance_transaction',
  livemode              BOOLEAN NOT NULL,
  account_id            TEXT NOT NULL,
  asset_id              TEXT NOT NULL REFERENCES assets(id),
  asset_class_id         TEXT NOT NULL REFERENCES asset_classes(id),

  type                  TEXT NOT NULL CHECK (
    type IN ('issue','transfer','lock','unlock','freeze','unfreeze','redeem','reversal','fee','adjustment')
  ),
  status                TEXT NOT NULL CHECK (
    status IN ('pending','available','failed','reversed')
  ),

  amount_atoms           NUMERIC(78,0) NOT NULL DEFAULT 0,
  available_delta_atoms  NUMERIC(78,0) NOT NULL DEFAULT 0,
  locked_delta_atoms     NUMERIC(78,0) NOT NULL DEFAULT 0,
  pending_delta_atoms    NUMERIC(78,0) NOT NULL DEFAULT 0,

  ending_available_atoms NUMERIC(78,0),
  ending_locked_atoms    NUMERIC(78,0),
  ending_total_atoms     NUMERIC(78,0),

  source_type            TEXT,
  source_id              TEXT,
  reversal_of            TEXT REFERENCES balance_transactions(id),

  available_on           TIMESTAMPTZ,
  ledger_reference       TEXT NOT NULL,
  metadata               JSONB NOT NULL DEFAULT '{}',

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  projection_version     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX bt_account_asset_created_idx
  ON balance_transactions(account_id, asset_id, created_at DESC);

CREATE INDEX bt_source_idx
  ON balance_transactions(source_type, source_id);
```

## BalanceTransaction ↔ LedgerEntry join

```sql
CREATE TABLE balance_transaction_ledger_entries (
  balance_transaction_id TEXT NOT NULL REFERENCES balance_transactions(id),
  ledger_entry_id        TEXT NOT NULL REFERENCES ledger_entries(id),
  role                   TEXT NOT NULL CHECK (
    role IN ('cause','effect','reversal','fee','trace')
  ),
  PRIMARY KEY (balance_transaction_id, ledger_entry_id)
);
```

## Intents and soft reservations

```sql
CREATE TABLE intents (
  id                    TEXT PRIMARY KEY,
  object                TEXT NOT NULL DEFAULT 'intent',
  livemode              BOOLEAN NOT NULL,
  type                  TEXT NOT NULL CHECK (
    type IN ('transfer','lock','unlock','freeze','unfreeze','redeem','reversal','issue')
  ),
  status                TEXT NOT NULL CHECK (
    status IN (
      'requires_confirmation',
      'requires_ledger_submit',
      'submitted',
      'completion_pending',
      'succeeded',
      'failed',
      'canceled'
    )
  ),

  account_id            TEXT,
  counterparty_account_id TEXT,
  asset_id              TEXT REFERENCES assets(id),
  amount_atoms           NUMERIC(78,0),

  idempotency_key_hash   TEXT,
  command_id             TEXT,
  submission_id          TEXT,
  workflow_id            TEXT,

  failure_code           TEXT,
  failure_message        TEXT,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at           TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ
);

CREATE TABLE soft_reservations (
  id                    TEXT PRIMARY KEY,
  livemode              BOOLEAN NOT NULL,
  intent_id             TEXT NOT NULL REFERENCES intents(id),
  account_id            TEXT NOT NULL,
  asset_id              TEXT NOT NULL REFERENCES assets(id),
  holding_id            TEXT REFERENCES holdings(id),
  quantity_atoms         NUMERIC(78,0) NOT NULL CHECK (quantity_atoms > 0),
  status                TEXT NOT NULL CHECK (
    status IN ('active','released','committed','expired')
  ),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at             TIMESTAMPTZ NOT NULL
);

CREATE INDEX soft_reservations_balance_idx
  ON soft_reservations(account_id, asset_id, status);
```

## Projection state

```sql
CREATE TABLE projection_checkpoints (
  id                    TEXT PRIMARY KEY,
  livemode              BOOLEAN NOT NULL,
  participant_id         TEXT NOT NULL,
  projection_name        TEXT NOT NULL,
  projection_version     INTEGER NOT NULL,
  last_ledger_offset     TEXT NOT NULL,
  last_offset_seq        BIGINT NOT NULL,
  last_update_id         TEXT,
  status                TEXT NOT NULL CHECK (
    status IN ('building','active','paused','failed','retired')
  ),
  checksum               TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (participant_id, projection_name, projection_version)
);

CREATE TABLE projection_runs (
  id                    TEXT PRIMARY KEY,
  projection_name        TEXT NOT NULL,
  projection_version     INTEGER NOT NULL,
  mode                  TEXT NOT NULL CHECK (mode IN ('full_replay','snapshot_replay')),
  status                TEXT NOT NULL CHECK (
    status IN ('running','succeeded','failed','cutover')
  ),
  started_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at           TIMESTAMPTZ,
  error                  JSONB
);
```

## Webhooks

```sql
CREATE TABLE webhook_endpoints (
  id                    TEXT PRIMARY KEY,
  livemode              BOOLEAN NOT NULL,
  account_id            TEXT NOT NULL,
  url_ciphertext         BYTEA NOT NULL,
  api_version            TEXT NOT NULL,
  enabled_events         TEXT[] NOT NULL,
  secret_ciphertext      BYTEA NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('enabled','disabled')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id                    TEXT PRIMARY KEY,
  object                TEXT NOT NULL DEFAULT 'event',
  livemode              BOOLEAN NOT NULL,
  account_id            TEXT NOT NULL,
  api_version            TEXT NOT NULL,
  type                  TEXT NOT NULL,
  data                  JSONB NOT NULL,
  request_id             TEXT,
  idempotency_key_hash   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id                    TEXT PRIMARY KEY,
  event_id              TEXT NOT NULL REFERENCES events(id),
  endpoint_id           TEXT NOT NULL REFERENCES webhook_endpoints(id),
  status                TEXT NOT NULL CHECK (
    status IN ('pending','delivered','failed','retrying')
  ),
  attempt_count          INTEGER NOT NULL DEFAULT 0,
  next_attempt_at        TIMESTAMPTZ,
  last_status_code       INTEGER,
  last_error             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Stripe recommends not storing sensitive data in metadata or description fields; Pillar should enforce the same constraint for all public `metadata` maps. ([Stripe Docs][11])

---

# Failure Modes

## 1. Projector lag

**Symptom:** `GET /v1/balances` returns stale available balance.

**Mitigation:**

* expose `consistency=projection` default with `as_of`;
* allow `consistency=ledger`;
* alert if lag exceeds SLA;
* webhook dispatcher waits for projection commit before emitting balance events.

## 2. Command accepted but not completed

Ledger API command submission acceptance does not mean the command was executed; completion/update must be correlated. ([Digital Asset Documentation][5])

**Mitigation:**

* intent status remains `completion_pending`;
* soft reservation expires only under controlled reconciliation;
* retry only with same command/idempotency identity within dedup window.

## 3. Duplicate command / API retry

Stripe-style idempotency is mandatory for all write endpoints. The first result for an idempotency key is reused for retries. ([Stripe Docs][12]) Canton command deduplication is based on change ID, including submitting parties, user ID, and command ID; it is guaranteed only when commands go to the same Participant Node. ([Digital Asset Documentation][5])

**Mitigation:**

* `Idempotency-Key` maps to stable `intent_id`;
* `command_id = hash(tenant_id, idempotency_key, intent_type)`;
* route retries to same participant where required;
* reject parameter mismatch under same idempotency key.

## 4. Contract contention

**Symptom:** selected contract fragment was archived by another accepted operation.

**Mitigation:**

* fragment resolver re-runs selection;
* intent returns `requires_retry` internally;
* external API remains intent-centric;
* if balance no longer sufficient, fail with `insufficient_available_balance`.

## 5. Partial transfer across many fragments

**Risk:** large command, payload size, or Daml choice limit.

**Mitigation:**

* max fragments per command;
* pre-compaction operation;
* deterministic fragment selection;
* split large transfer into ledger-atomic chunks only if business rule permits;
* expose one external transfer only after all chunks succeed, or represent chunked partials explicitly as child intents.

## 6. Freeze races with transfer

**Scenario:** transfer intent is accepted, then compliance freeze arrives before ledger command commits.

**Policy:**

* hard freeze wins over pending transfer unless freeze policy says otherwise.
* if command already ledger-final, reversal/freeze next holder is required.
* if command not final, cancel intent and release soft reservation.

## 7. Reversal insufficient balance

**Scenario:** recipient spent received assets.

**Options:**

1. reject reversal;
2. create pending negative claim;
3. freeze remaining balance;
4. allow negative balance only for configured asset/account class.

Default: reject unless regulated workflow requires claim creation.

## 8. Projection rebuild mismatch

**Mitigation:**

* build new projection namespace;
* compare checksums before cutover;
* never mutate active projection destructively;
* preserve ledger_entries audit table;
* block `consistency=ledger` fallback if visibility scope is incomplete.

## 9. Ledger pruning

**Risk:** old events unavailable for full replay.

**Mitigation:**

* create signed projection snapshots before pruning;
* retain audit-critical ledger references;
* store payload hashes and minimal audit material;
* test restore from snapshot + replay.

## 10. Webhook duplication / ordering

Webhook delivery is at-least-once.

**Mitigation:**

* event IDs are unique;
* webhook payloads are immutable;
* include `created`, `api_version`, `request.idempotency_key`;
* SDK verifies signatures and deduplicates by `event.id`.

## 11. Multi-participant / multi-synchronizer offsets

Canton offsets are participant-contextual, and offset ordering can differ across synchronizers. ([Digital Asset Documentation][5])

**Mitigation:**

* checkpoint key includes participant and synchronizer scope;
* avoid comparing raw offsets across participants;
* expose only Pillar `as_of` and opaque `ledger_reference` externally.

---

# Security / Compliance

## Access control

Scopes:

| Scope                       | Allows                     |
| --------------------------- | -------------------------- |
| `balances.read`             | read balances              |
| `holdings.read`             | read holdings              |
| `balance_transactions.read` | read statement lines       |
| `transfers.write`           | create transfer intents    |
| `locks.write`               | create/release locks       |
| `freezes.write`             | compliance freeze          |
| `redeems.write`             | redeem assets              |
| `ledger_trace.read`         | privileged Workbench trace |

## Canton invisibility

External API must not expose:

* `contract_id`
* Daml `template_id`
* participant ID
* synchronizer ID
* raw ledger offset
* party ID
* observer/stakeholder topology

Digital Asset docs note that party IDs are not human-readable and should be treated as opaque identifiers; Pillar should map human-facing `account_id` to internal party/authorization context and not leak it. ([Digital Asset Documentation][13])

## Metadata safety

`metadata` is allowed for developer correlation but not for secrets, credentials, private keys, bank data, regulated identifiers, or sensitive PII. This follows the same pattern as Stripe metadata guidance. ([Stripe Docs][11])

## Auditability

Each operation stores:

```text
request_id
idempotency_key_hash
intent_id
command_id
submission_id
workflow_id
update_id
ledger_reference
balance_transaction_ids
webhook_event_ids
```

Digital Asset Quickstart observability shows command ID, ledger offset, transaction ID, submission ID, and trace ID as useful correlation identifiers. Pillar should collect these internally and expose them in Workbench/admin surfaces. ([Digital Asset Documentation][14])

## Webhook security

1. HMAC signature per delivery.
2. Timestamp tolerance.
3. Replay protection.
4. Endpoint-level API version.
5. Delivery retry with exponential backoff.
6. Event payload immutability.

## Sandbox / live separation

Stripe sandboxes are isolated test environments that do not affect live integration or move real money. Pillar should mirror this with separate `livemode=false` data, sandbox ledger topology, sandbox issuer assets, and sandbox webhook destinations. ([Stripe Docs][15]) Canton Sandbox runs a Canton ledger with Daml code using a simple topology of one Participant Node and one Synchronizer Node, which is suitable for local tests that do not need production topology fidelity. ([Digital Asset Documentation][16])

---

# Implementation Plan

## Phase 0 — Design freeze

Deliverables:

* define Daml asset interfaces:

  * `IAssetHolding`
  * `IAssetLock`
  * `IAssetFreeze`
  * `IRedeemableAsset`
  * `IReversibleOperation`
* define external OpenAPI:

  * `/v1/balances`
  * `/v1/holdings`
  * `/v1/balance_transactions`
* define version header:

  * `Pillar-Version`
* define ID prefixes and metadata rules.

## Phase 1 — Projection foundation

Deliverables:

* `ledger_entries` ingestion from UpdateService;
* checkpointing by participant;
* `ledger_contract_fragments`;
* `holdings`;
* `balances`;
* rebuild from State Service snapshot + updates.

Canton JSON Ledger API can be enabled and used with command-line tools for development and OpenAPI verification; use this for sandbox-level smoke tests, not as the production command path if gRPC gives better typed control. ([Digital Asset Documentation][17])

## Phase 2 — Read API MVP

Deliverables:

* `GET /v1/balances`;
* `GET /v1/holdings`;
* `GET /v1/balance_transactions`;
* cursor pagination;
* `consistency=projection`;
* SDK models.

## Phase 3 — Intent runtime

Deliverables:

* idempotency table;
* transfer intent;
* lock intent;
* redeem intent;
* command submission/completion correlation;
* fragment resolver;
* soft reservations.

## Phase 4 — Ledger consistency and reconciliation

Deliverables:

* `consistency=ledger`;
* direct State Service recompute path;
* projection checksum;
* nightly reconciliation;
* Workbench ledger trace view.

## Phase 5 — Webhook-first workflow

Deliverables:

* event types:

  * `balance.updated`
  * `holding.created`
  * `holding.updated`
  * `balance_transaction.created`
  * `transfer.succeeded`
  * `lock.created`
  * `redeem.succeeded`
  * `reversal.succeeded`
* endpoint API version pinning;
* signed delivery;
* retry dashboard.

## Phase 6 — Stripe-grade developer tooling

Deliverables:

* Pillar SDKs:

  * TypeScript
  * Python
  * Java
  * Go
* auto-pagination helpers;
* webhook signature helpers;
* `pillar listen`;
* `pillar trigger`;
* `pillar fixtures`;
* sandbox Canton topology with mock issuer;
* Workbench:

  * API logs
  * idempotency replay
  * projection lag
  * ledger trace
  * webhook delivery explorer

Stripe SDK docs state that official libraries reduce boilerplate and use semantic versioning while APIs are versioned by release date; Pillar SDKs should follow the same versioning posture. ([Stripe Docs][18]) Stripe CLI supports API calls, webhook testing, request log streaming, local event forwarding, triggers, and fixtures; Pillar CLI should implement the equivalent for Canton-backed asset workflows. ([Stripe Docs][19]) Stripe Workbench provides API Explorer, Shell, event destination management, and integration health insights; Pillar Workbench should use the same product surface pattern for ledger trace, projection health, and webhook delivery. ([Stripe Docs][20])

---

# Open Questions

1. **Holding merge policy**

   * Should incoming fungible holdings merge by default into one logical holding, or preserve acquisition lots?
   * Recommended default: merge for cash-like assets, preserve lot for securities/tax-sensitive assets.

2. **Negative balance policy**

   * Are reversals allowed to create negative balances?
   * Recommended default: no, except explicitly configured credit/claim accounts.

3. **Freeze authority**

   * Which actor can freeze: issuer, platform, regulator, account owner, court-order workflow?
   * This should be encoded in Daml authorization, not only DB policy.

4. **Partial transfer selection**

   * FIFO, LIFO, smallest-fragment-first, or policy-driven?
   * Recommended default: FIFO with compaction threshold.

5. **Multi-participant topology**

   * Does Pillar operate one participant per tenant, pooled participant, or customer-hosted participant?
   * API experience remains identical; internal ledger routing changes.

6. **Asset precision**

   * Per asset `unit_scale` max?
   * Recommended: 0–18 for API, atomic `NUMERIC(78,0)` internally.

7. **Redeem settlement**

   * Does redemption create off-ledger fiat payout, on-ledger burn receipt, or both?
   * `redeem` should be a ledger-final balance decrease; off-ledger payout should be a separate settlement object.

8. **PQS usage**

   * Use PQS for fast query support or maintain Pillar’s own projector only?
   * Recommended: Pillar projector is canonical product projection; PQS is optional reconciliation/debug accelerator.

9. **Package upgrade**

   * How do old Daml templates project into the same `Asset/Holding/Balance` interface after DAR upgrade?
   * Recommended: interface-based projection plus template adapter registry.

10. **Public ledger trace**

* Should external users see an opaque `ledger_reference`, or should regulated users be able to export signed trace bundles?
* Recommended: opaque by default, signed trace bundle through privileged/export API.

---

# Agent-ready Checklist

## Product/API agent

* [ ] Define OpenAPI schemas for `AssetClass`, `Asset`, `Holding`, `Balance`, `BalanceTransaction`.
* [ ] Implement list response shape: `object=list`, `url`, `has_more`, `data`.
* [ ] Add `limit`, `starting_after`, `ending_before`.
* [ ] Add `consistency=projection|ledger`.
* [ ] Ensure no public response includes `contract_id`, `template_id`, party ID, participant ID, or raw ledger offset.
* [ ] Define public error codes:

  * `insufficient_available_balance`
  * `balance_projection_stale`
  * `ledger_consistency_timeout`
  * `asset_frozen`
  * `holding_locked`
  * `idempotency_key_in_use`
  * `reversal_not_possible`

## Ledger agent

* [ ] Implement UpdateService consumer.
* [ ] Normalize create/archive/exercise into `ledger_entries`.
* [ ] Store `(participant_id, update_id, event_id)` uniqueness.
* [ ] Implement State Service bootstrap.
* [ ] Implement command submission/completion correlation.
* [ ] Set `command_id`, `submission_id`, `workflow_id` from intent.
* [ ] Add adapter registry per Daml template/interface version.

## Projection agent

* [ ] Build `ledger_contract_fragments`.
* [ ] Build `holdings`.
* [ ] Build `balances`.
* [ ] Build `balance_transactions`.
* [ ] Implement soft reservation clearing on ledger commit.
* [ ] Implement rebuild full replay.
* [ ] Implement rebuild snapshot + replay.
* [ ] Implement checksum validation.
* [ ] Implement projection lag metrics.

## Transfer/lock/redeem agent

* [ ] Implement deterministic fragment selection.
* [ ] Implement partial transfer split/remainder logic.
* [ ] Implement lock projection as `amount=0`, `available_delta=-x`, `locked_delta=+x`.
* [ ] Implement freeze as compliance lock equivalent.
* [ ] Implement redeem from available and redeem from locked.
* [ ] Implement reversal as compensating operation, not mutation.

## DB agent

* [ ] Create core config tables.
* [ ] Create ledger audit tables.
* [ ] Create projection tables.
* [ ] Create idempotency and intent tables.
* [ ] Create webhook tables.
* [ ] Add quantity atomic-unit constraints.
* [ ] Add row-level locks for balance-affecting intents.
* [ ] Add metadata validation and sensitive-key rejection.

## Security/compliance agent

* [ ] Add scoped API keys/OAuth.
* [ ] Add tenant isolation.
* [ ] Encrypt contract IDs and webhook secrets.
* [ ] Hash idempotency keys.
* [ ] Add metadata PII scanner.
* [ ] Add freeze authority model.
* [ ] Add audit export with opaque ledger reference.
* [ ] Add webhook signature verification.

## Developer tooling agent

* [ ] Generate TypeScript SDK.
* [ ] Generate Python SDK.
* [ ] Add auto-pagination.
* [ ] Add webhook signature helper.
* [ ] Implement `pillar listen`.
* [ ] Implement `pillar trigger balance_transaction.created`.
* [ ] Implement `pillar fixtures`.
* [ ] Implement sandbox seed assets and test accounts.
* [ ] Implement Workbench API logs, webhook logs, projection lag, ledger trace.

## Acceptance criteria

* [ ] A single Daml contract split into multiple contracts still appears as one stable Holding when policy says merge.
* [ ] A partial transfer produces exactly one external debit and one external credit balance transaction.
* [ ] A lock changes `available` and `locked` but not `settled_total`.
* [ ] A redeem decreases `settled_total`.
* [ ] A reversal creates a new compensating balance transaction.
* [ ] Projection can be dropped and rebuilt from ledger without changing public object history, except for explicitly documented rebuild corrections.
* [ ] `consistency=ledger` never returns a result older than the ledger visibility target it claims to satisfy.
* [ ] Public API remains Canton-invisible.

[1]: https://docs.stripe.com/api/balance "docs.stripe.com"
[2]: https://docs.stripe.com/api/pagination "docs.stripe.com"
[3]: https://docs.stripe.com/webhooks "docs.stripe.com"
[4]: https://docs.digitalasset.com/build/3.5/tutorials/smart-contracts/contracts.html "Basic contracts — Digital Asset’s platform documentation"
[5]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[6]: https://docs.digitalasset.com/build/3.5/quickstart/configure/project-structure-overview.html "Canton Network quickstart project structure — Digital Asset’s platform documentation"
[7]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[8]: https://docs.stripe.com/api/balance_transactions/object "docs.stripe.com"
[9]: https://docs.digitalasset.com/build/3.5/tutorials/smart-contracts/compose.html "Compose choices — Digital Asset’s platform documentation"
[10]: https://docs.digitalasset.com/build/3.5/component-howtos/pqs/references/sql-api.html "SQL API — Digital Asset’s platform documentation"
[11]: https://docs.stripe.com/api/metadata "docs.stripe.com"
[12]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[13]: https://docs.digitalasset.com/build/3.5/explanations/parties-users.html "Parties and users on a Canton ledger — Digital Asset’s platform documentation"
[14]: https://docs.digitalasset.com/build/3.5/quickstart/observe/observability-troubleshooting-overview.html "Canton Network Quickstart observability & troubleshooting overview — Digital Asset’s platform documentation"
[15]: https://docs.stripe.com/sandboxes "docs.stripe.com"
[16]: https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html "Sandbox — Digital Asset’s platform documentation"
[17]: https://docs.digitalasset.com/build/3.5/tutorials/json-api/canton_and_the_json_ledger_api.html "Get started with Canton and the JSON Ledger API — Digital Asset’s platform documentation"
[18]: https://docs.stripe.com/sdks "docs.stripe.com"
[19]: https://docs.stripe.com/stripe-cli "docs.stripe.com"
[20]: https://docs.stripe.com/workbench "docs.stripe.com"
