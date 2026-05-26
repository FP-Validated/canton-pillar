# 13. Sandbox / Test Helpers / Test Clock — Pillar Developer Test Environment

## Executive Summary

Pillar의 개발자 테스트 환경은 **“mock API”가 아니라 “managed Canton sandbox 위에서 동작하는 Stripe-grade test mode”**로 설계한다. 외부 개발자는 Canton, Daml contract ID, participant topology를 몰라도 `sk_test_*` 키와 `/v1/test_helpers/*` API, CLI, webhook trigger, test clock만으로 자산 발행·보유·락·결제·만기·상환 시나리오를 재현할 수 있다.

공식 문서 리서치 기준은 다음과 같다.

| 영역                           | 확인한 공식 문서 요약                                                                                                                                                                                                                                         | Pillar 설계 반영                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Stripe API grammar           | Stripe API는 REST, 예측 가능한 resource URL, JSON 응답, 표준 HTTP status/auth/verb를 사용하며, 사용하는 API key가 live/sandbox 실행 모드를 결정한다. ([Stripe Docs][1])                                                                                                           | Pillar도 `sk_test_*` / `sk_live_*` 키로 mode를 결정하고 API shape는 동일하게 유지한다.                                                     |
| Stripe sandbox/test mode     | Stripe 계정에는 test mode sandbox가 있고 추가 sandbox도 만들 수 있으며, test mode와 general sandbox는 설정 격리/접근제어/삭제 가능성에서 차이가 있다. ([Stripe Docs][2])                                                                                                                   | Pillar는 기본 test sandbox + 추가 managed Canton sandbox를 제공한다.                                                                |
| Stripe Test Clock            | Stripe Test Clock은 testmode 객체의 시간을 deterministic하게 제어하고, 생성/조회/삭제/advance API와 clock lifecycle event를 제공한다. ([Stripe Docs][3])                                                                                                                      | Pillar Test Clock은 Canton static time, business clock contract, scheduler, projection rebuild, webhook emission을 함께 제어한다. |
| Stripe Webhook               | Stripe webhook은 HTTPS endpoint로 JSON Event object를 push하고, handler는 빠르게 `2xx`를 반환해야 하며, webhook signature 검증과 replay 방지가 중요하다. ([Stripe Docs][4])                                                                                                    | Pillar webhook도 signed event, quick-ack, async delivery, retry, redelivery, event versioning을 제공한다.                       |
| Stripe webhook delivery      | Stripe는 live mode에서 지수 backoff로 최대 3일 재시도하고, sandbox에서는 몇 시간 동안 3회 재시도한다. event ordering도 보장하지 않는다. ([Stripe Docs][4])                                                                                                                               | Pillar test mode에서도 delivery failure, retry, out-of-order delivery를 강제로 시뮬레이션한다.                                          |
| Stripe CLI / trigger         | Stripe CLI는 sandbox resource 관리, webhook testing, `listen`, `trigger`를 지원하며 trigger는 실제 API object를 생성할 수 있다. ([Stripe Docs][5])                                                                                                                     | Pillar CLI는 `pillar webhooks listen/trigger`, `pillar fixtures seed`, `pillar test-clocks advance`를 제공한다.                 |
| Stripe Workbench             | Workbench는 API Explorer/Shell, logs, events, event destinations, integration health를 제공한다. ([Stripe Docs][6])                                                                                                                                        | Pillar Workbench는 API logs, ledger trace, projections, webhook deliveries, sandbox controls를 통합한다.                        |
| Canton Sandbox               | Digital Asset Sandbox는 Daml code를 포함한 Canton ledger를 실행하며, 단일 Participant Node + Synchronizer Node의 단순 topology를 제공한다. `dpm sandbox`는 port, admin API, JSON API, static/wall-clock time, DAR upload option을 제공한다. ([Digital Asset Documentation][7]) | Pillar managed sandbox는 single/multi participant Canton runtime을 tenant별로 자동 provision한다.                                 |
| Canton Ledger API            | Ledger API는 command stream과 update/event stream으로 구성되고, command 결과는 비동기 completion/update로 확인된다. command deduplication은 act_as, user ID, command ID로 구성된 change ID 기준이다. ([Digital Asset Documentation][8])                                          | Pillar runtime은 intent-first API를 ledger command + completion + update projection + webhook으로 변환한다.                       |
| Canton Time Service          | Time Service는 testing service이고, Canton이 static time mode로 구성된 경우 ledger time을 get/set할 수 있다. ([Digital Asset Documentation][8])                                                                                                                     | Pillar Test Clock은 test ledger에서만 허용하고 live mode에서는 403으로 차단한다.                                                           |
| Daml testing                 | Daml Script는 fresh ledger에서 multi-party command/query 테스트를 수행하는 주요 도구이며 `dpm test`로 regression에 쓸 수 있다. ([Digital Asset Documentation][9])                                                                                                           | Pillar fixtures는 Daml Script fixture와 API fixture를 모두 지원한다.                                                               |
| Canton Quickstart / LocalNet | Canton Network Quickstart는 Docker Compose, Make, Gradle, reference app, LocalNet, observability scaffolding을 제공한다. ([Digital Asset Documentation][10])                                                                                               | Pillar developer sandbox는 Quickstart/LocalNet 패턴을 제품화한 managed control plane으로 둔다.                                        |
| Canton token testing         | Canton Network docs에는 token standard allocation API 기반 test trading app과 registry API simulation test harness가 있다. ([Canton Network Docs][11])                                                                                                       | Pillar test assets는 registry/wallet/off-ledger API simulation까지 포함한다.                                                     |

핵심 결론은 간단하다. **Pillar의 test mode는 DB fixture가 아니라 ledger-backed fixture다.** 개발자는 Stripe처럼 간단히 쓰지만, 내부에서는 Canton-native command, update stream, party/participant, time, DAR, projection, webhook이 모두 정합성을 유지한다.

---

## Goals / Non-goals

### Goals

1. **Stripe-grade 개발자 경험**

   * `sk_test_*` 키만 바꾸면 같은 API grammar로 test/live를 전환한다.
   * 모든 object는 `id`, `object`, `livemode`, `created`, `metadata`를 가진다.
   * 모든 mutation은 `Idempotency-Key`를 지원한다.
   * 모든 async workflow는 webhook-first로 설계한다.

2. **Canton-backed deterministic testing**

   * test assets, holdings, locks, settlements, redemptions는 실제 Canton ledger command로 생성한다.
   * Test Clock advance는 ledger state, scheduler, projection, webhook을 함께 움직인다.
   * reset은 sandbox ledger를 재초기화하되 control-plane ledger에는 reset operation을 남긴다.

3. **Balance/Holding-first API**

   * 외부 개발자는 contract ID가 아니라 `asset`, `holding`, `balance`, `intent`, `redemption`을 다룬다.
   * contract ID는 내부 trace/debug에서만 노출 가능하다.

4. **Intent-first runtime**

   * `/transfers`, `/settlements`, `/redemptions` 같은 외부 mutation은 즉시 ledger transaction이 아니라 `intent`를 만든다.
   * intent lifecycle은 `requires_action`, `processing`, `succeeded`, `failed`, `expired`, `canceled`로 관리한다.

5. **Webhook-first async workflow**

   * test helper는 webhook delivery, retry, ordering failure, signature, redelivery까지 테스트 가능해야 한다.

6. **Operations are ledger-traceable**

   * sandbox create/reset, clock advance, fixture seed, failure injection은 control-plane ledger에 `TestOperation`으로 기록한다.
   * business ledger가 reset되어도 reset history는 별도 immutable control ledger에 남는다.

### Non-goals

1. **Live ledger time 조작**

   * live mode에서 `/v1/test_helpers/*`는 전부 `403 test_mode_only`다.

2. **DB를 source of truth로 쓰는 fixture**

   * DB insert로 holdings/balances를 조작하지 않는다.
   * DB는 projection, audit, config, delivery log만 저장한다.

3. **Canton contract-first public API**

   * public API에서 `contractId`, `choice`, `DAR`, `participant`를 기본 노출하지 않는다.
   * advanced debug endpoint에서만 trace metadata로 제공한다.

4. **완전한 production topology 복제 강제**

   * 기본 sandbox는 single participant 또는 compact multi-participant topology다.
   * production-grade topology simulation은 optional `topology_profile`로 제공한다.

---

## Architecture

### 1. Mode model: test mode / live mode

Pillar의 mode는 **API key가 결정**한다.

| Mode | API key                  | Ledger target                                       | Test helpers | Object field      |
| ---- | ------------------------ | --------------------------------------------------- | ------------ | ----------------- |
| Test | `sk_test_*`, `pk_test_*` | Managed Canton sandbox                              | 허용           | `livemode: false` |
| Live | `sk_live_*`, `pk_live_*` | Customer live participant / production synchronizer | 차단           | `livemode: true`  |

Mode invariant:

```text
same external API grammar
+ different API key
+ different ledger target
+ same object model
+ test-only helper namespace
```

예외 규칙:

```text
POST /v1/test_helpers/*
with sk_live_* => 403 test_mode_only
```

응답 예시:

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "test_mode_only",
    "message": "This endpoint is only available in test mode.",
    "request_id": "req_01J..."
  }
}
```

### 2. Managed Canton sandbox

Pillar는 tenant별로 managed sandbox를 provision한다.

```text
Pillar API
  -> Auth / Mode Resolver
  -> Test Control Plane
  -> Sandbox Orchestrator
  -> Canton Sandbox Runtime
       - Participant(s)
       - Synchronizer
       - JSON/gRPC Ledger API
       - Admin API
       - DAR package set
       - Static-time option
  -> Projection Workers
  -> Webhook Dispatcher
  -> Workbench / CLI
```

Sandbox profiles:

| Profile                  | 용도                                  | Topology                                      |
| ------------------------ | ----------------------------------- | --------------------------------------------- |
| `single_party_fast`      | unit/integration quick test         | 1 participant, synthetic counterparties       |
| `multi_party_standard`   | settlement/transfer realistic test  | issuer, custodian, investor, operator parties |
| `token_standard`         | Canton token standard compatibility | registry/wallet/allocation fixture 포함         |
| `bond_lifecycle`         | maturity/redemption/coupon test     | issuer, paying agent, holder, registrar       |
| `external_party_signing` | external signer / custody test      | external party key simulation                 |

Sandbox object:

```json
{
  "id": "sbox_01JZ9...",
  "object": "test_helpers.sandbox",
  "livemode": false,
  "status": "ready",
  "topology_profile": "multi_party_standard",
  "canton": {
    "ledger_api": "managed",
    "json_api": "managed",
    "time_mode": "static_time",
    "dar_version": "pillar-assets-2026-05-01"
  },
  "default_test_clock": "clock_01JZ9...",
  "created": 1779792000
}
```

### 3. Control-plane ledger vs business sandbox ledger

Sandbox reset creates a traceability problem: if we destroy the sandbox ledger, the reset event would disappear. Pillar solves this by splitting ledgers.

| Ledger                      | Reset? | Purpose                                                                                    |
| --------------------------- | -----: | ------------------------------------------------------------------------------------------ |
| **Pillar Control Ledger**   |     No | sandbox create/reset, clock advance request, fixture seed, forced failure, operator action |
| **Sandbox Business Ledger** |    Yes | test assets, holdings, locks, settlements, redemptions                                     |

Reset flow:

```text
POST /v1/test_helpers/reset
  -> create ControlLedger.TestSandboxResetRequested
  -> stop sandbox runtime
  -> archive/delete DB projections for sandbox generation N
  -> create sandbox generation N+1
  -> upload DARs / allocate parties / seed base contracts
  -> rebuild projection from offset 0
  -> create ControlLedger.TestSandboxResetCompleted
  -> emit test_helpers.sandbox.reset_completed
```

This preserves principle 5: **Operations must be ledger-traceable.**

### 4. Fixtures

Fixtures are declarative, versioned, ledger-backed scenario definitions.

Fixture sources:

1. Built-in:

   * `cash_usd_basic`
   * `tokenized_treasury_bill`
   * `corporate_bond_5y`
   * `settlement_dvp_basic`
   * `lock_expiry_basic`
   * `redemption_maturity_basic`
2. Customer-defined:

   * YAML/JSON fixture uploaded through API/CLI.
3. Daml Script-backed:

   * run under `dpm script` or Pillar fixture runner.
4. API fixture:

   * materialized through public Pillar API calls.

Fixture invariant:

```text
Fixture seed must produce ledger updates.
Projection is derived, not inserted as truth.
```

### 5. Test assets

Test assets are ledger-backed instruments created only in test mode.

Asset classes:

| Type     | Object           | Ledger template group                        |
| -------- | ---------------- | -------------------------------------------- |
| Cash     | `asset.cash`     | CashInstrument, CashHolding                  |
| Security | `asset.security` | SecurityInstrument, SecurityHolding          |
| Bond     | `asset.bond`     | BondTerms, BondHolding, RedemptionObligation |
| Fund     | `asset.fund`     | FundShareClass, FundHolding                  |
| Custom   | `asset.custom`   | CustomInstrument with schema                 |

Seeded asset example:

```json
{
  "id": "asset_test_us_tbill_001",
  "object": "asset",
  "livemode": false,
  "type": "bond",
  "status": "active",
  "symbol": "TBILL26_TEST",
  "currency": "USD",
  "issuer": "participant_test_issuer",
  "terms": {
    "maturity_date": "2026-12-31",
    "redemption_price": "100.000000",
    "day_count": "ACT/360"
  },
  "ledger": {
    "sandbox": "sbox_01JZ9...",
    "trace_id": "trace_01JZ9..."
  }
}
```

### 6. Test participants

Public API exposes participants as **business actors**, not Canton participants.

| Public object      | Internal mapping                         |
| ------------------ | ---------------------------------------- |
| `test_participant` | Canton party + optional participant node |
| `test_account`     | Pillar account + party rights            |
| `test_wallet`      | holder party + holding account           |
| `test_issuer`      | issuer party + registry rights           |
| `test_custodian`   | custodian party + settlement authority   |

Participant seed example:

```json
{
  "id": "tpt_issuer_acme",
  "object": "test_helpers.participant",
  "livemode": false,
  "role": "issuer",
  "display_name": "ACME Test Issuer",
  "party_hint": "acme_issuer",
  "capabilities": ["issue_asset", "approve_redemption"]
}
```

### 7. Test clocks

Pillar Test Clock is a **test-only deterministic time controller**.

It has two layers:

| Layer                 | Purpose                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `business_clock`      | On-ledger `TestClockState(clock_id, frozen_time)` contract used by business lifecycle rules      |
| `sandbox_static_time` | Optional Canton static ledger time advanced through Time Service in dedicated sandbox-clock mode |

Default behavior:

```text
time_isolation = business_clock
multiple clocks per sandbox allowed
```

Strict Canton time behavior:

```text
time_isolation = sandbox_static_time
one active clock per sandbox generation
ledger time is advanced globally
recommended for Daml time constraint tests
```

Test Clock lifecycle:

```text
ready
  -> advancing
  -> ready

ready
  -> advancing
  -> internal_failure
```

Clock advance side effects:

1. Create control-ledger `TestClockAdvanceRequested`.
2. Advance `TestClockState` on sandbox business ledger.
3. Run due-time scheduler:

   * lock expiry
   * settlement window open/close
   * bond maturity
   * redemption execution
4. Wait for ledger completions.
5. Rebuild projection to target offset.
6. Emit webhooks.
7. Create control-ledger `TestClockAdvanceCompleted`.

### 8. Simulation modules

#### Lock expiry simulation

Purpose:

```text
Prove that locked holdings expire/release/fail correctly.
```

Objects:

* `holding_lock`
* `transfer_intent`
* `settlement_intent`

Events:

* `holding.locked`
* `holding_lock.expiring`
* `holding_lock.expired`
* `holding_lock.released`
* `transfer_intent.failed`

Flow:

```text
seed holding
create lock expires_at = T+2h
advance clock to T+2h
scheduler exercises ExpireLock
projection marks available balance
webhook emits holding_lock.expired
```

#### Settlement window simulation

Purpose:

```text
Test DvP / FvP / atomic settlement behavior around window open, close, fail.
```

Objects:

* `settlement_intent`
* `settlement_window`
* `delivery_leg`
* `payment_leg`

Events:

* `settlement_window.opened`
* `settlement_intent.processing`
* `settlement_intent.succeeded`
* `settlement_window.closed`
* `settlement_intent.expired`

Flow:

```text
seed asset + cash holdings
create settlement intent with window [T+1h, T+4h]
advance to T+1h => window opened
optionally inject counterparty failure
advance to T+4h => expire unsettled intents
```

#### Bond maturity / redemption simulation

Purpose:

```text
Test maturity date, record date, paying agent approval, redemption payout.
```

Objects:

* `asset.bond`
* `bond_terms`
* `redemption_intent`
* `redemption_obligation`
* `cash_holding`

Events:

* `bond.maturity_reached`
* `redemption.created`
* `redemption.processing`
* `redemption.succeeded`
* `redemption.failed`

Flow:

```text
seed bond with maturity_date = D
seed holder position
advance clock to D
scheduler creates redemption obligations
paying agent funds cash leg
redemption settles
webhook emits redemption.succeeded
```

### 9. Forced failure helpers

Failure helpers are test-only, ledger-traceable failure injections.

Failure categories:

| Category       | Code                             | Effect                                                 |
| -------------- | -------------------------------- | ------------------------------------------------------ |
| Ledger command | `ledger_command_rejected`        | next matching command returns failed completion        |
| Participant    | `participant_unavailable`        | runtime blocks command submission or delays completion |
| Projection     | `projection_lag`                 | projection worker pauses at offset                     |
| Webhook        | `webhook_delivery_timeout`       | dispatcher simulates timeout                           |
| Settlement     | `counterparty_rejects`           | settlement leg rejected                                |
| Balance        | `insufficient_holding`           | holding check fails                                    |
| Registry       | `asset_registry_mismatch`        | registry lookup returns mismatch                       |
| Clock          | `clock_advance_internal_failure` | Test Clock status becomes `internal_failure`           |
| Idempotency    | `idempotency_conflict`           | reused key with different params returns conflict      |

Failure injection object:

```json
{
  "id": "fail_01JZ9...",
  "object": "test_helpers.failure",
  "livemode": false,
  "scope": "next_matching_request",
  "failure_type": "webhook_delivery_timeout",
  "match": {
    "event_type": "settlement_intent.succeeded",
    "webhook_endpoint": "we_01JZ9..."
  },
  "status": "armed",
  "expires_at": 1779795600
}
```

### 10. Webhook trigger helpers

Webhook trigger modes:

| Mode             |       Ledger mutation? | Use case                         |
| ---------------- | ---------------------: | -------------------------------- |
| `fixture_backed` |                    Yes | Production-like event generation |
| `redelivery`     | No new ledger mutation | Existing event retry             |
| `synthetic`      |                     No | Handler contract test only       |

Important invariant:

```text
Production-like webhook events must be derived from ledger updates.
Synthetic events are clearly marked with synthetic=true and ledger_update_id=null.
```

Trigger event example:

```json
{
  "id": "evt_01JZ9...",
  "object": "event",
  "livemode": false,
  "type": "settlement_intent.succeeded",
  "api_version": "2026-05-26",
  "created": 1779792000,
  "data": {
    "object": {
      "id": "seti_01JZ9...",
      "object": "settlement_intent",
      "status": "succeeded"
    }
  },
  "request": {
    "id": "req_01JZ9...",
    "idempotency_key": "ik_test_..."
  },
  "ledger": {
    "sandbox": "sbox_01JZ9...",
    "update_id": "upd_...",
    "workflow_id": "wf_..."
  },
  "synthetic": false
}
```

---

## API / Object Model

### Common API grammar

Headers:

```http
Authorization: Bearer sk_test_...
Pillar-Version: 2026-05-26
Idempotency-Key: 3d2fd1c7-2fc7-4af7-b2a6-8d4f9b8f2b81
```

Common response shape:

```json
{
  "id": "clock_01JZ9...",
  "object": "test_helpers.test_clock",
  "livemode": false,
  "created": 1779792000,
  "metadata": {}
}
```

Common error shape:

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "parameter_invalid",
    "message": "frozen_time must be after the current frozen_time.",
    "param": "frozen_time",
    "request_id": "req_01JZ9..."
  }
}
```

### Required endpoint 1: `POST /v1/test_helpers/test_clocks`

Creates a Pillar Test Clock.

Request:

```json
{
  "name": "bond maturity test",
  "frozen_time": "2026-06-01T00:00:00Z",
  "sandbox": "sbox_default",
  "time_isolation": "business_clock",
  "metadata": {
    "suite": "redemption-e2e"
  }
}
```

Response:

```json
{
  "id": "clock_01JZ9ABC",
  "object": "test_helpers.test_clock",
  "livemode": false,
  "name": "bond maturity test",
  "sandbox": "sbox_01JZ9...",
  "frozen_time": 1780272000,
  "status": "ready",
  "time_isolation": "business_clock",
  "created": 1779792000,
  "metadata": {
    "suite": "redemption-e2e"
  }
}
```

Recommended companion endpoint:

```http
POST /v1/test_helpers/test_clocks/{clock_id}/advance
```

Request:

```json
{
  "frozen_time": "2026-12-31T00:00:00Z",
  "process_due_workflows": true,
  "webhook_behavior": "deliver",
  "simulations": [
    "lock_expiry",
    "settlement_window",
    "bond_maturity_redemption"
  ]
}
```

Response:

```json
{
  "id": "clock_01JZ9ABC",
  "object": "test_helpers.test_clock",
  "livemode": false,
  "status": "advancing",
  "frozen_time": 1780272000,
  "status_details": {
    "advancing": {
      "target_frozen_time": 1798675200,
      "job": "job_01JZ9ADV"
    }
  }
}
```

### Required endpoint 2: `POST /v1/test_helpers/assets/seed`

Seeds test assets, participants, holdings, locks, settlement windows, and bond lifecycle fixtures.

Request:

```json
{
  "sandbox": "sbox_default",
  "test_clock": "clock_01JZ9ABC",
  "fixture": "bond_maturity_redemption_basic",
  "participants": [
    {
      "idempotency_key": "issuer-acme",
      "role": "issuer",
      "display_name": "ACME Test Issuer"
    },
    {
      "idempotency_key": "holder-alice",
      "role": "holder",
      "display_name": "Alice Test Holder"
    },
    {
      "idempotency_key": "paying-agent",
      "role": "paying_agent",
      "display_name": "Pillar Paying Agent"
    }
  ],
  "assets": [
    {
      "type": "bond",
      "symbol": "ACME26_TEST",
      "currency": "USD",
      "issuer": "issuer-acme",
      "face_value": "1000000.00",
      "maturity_date": "2026-12-31",
      "redemption_price": "100.00"
    }
  ],
  "holdings": [
    {
      "owner": "holder-alice",
      "asset": "ACME26_TEST",
      "quantity": "1000000.00"
    }
  ],
  "metadata": {
    "test_case": "redemption-at-maturity"
  }
}
```

Response:

```json
{
  "id": "fxrun_01JZ9SEED",
  "object": "test_helpers.fixture_run",
  "livemode": false,
  "status": "succeeded",
  "sandbox": "sbox_01JZ9...",
  "test_clock": "clock_01JZ9ABC",
  "created": 1779792000,
  "assets": [
    "asset_01JZ9BOND"
  ],
  "participants": [
    "tpt_issuer_acme",
    "tpt_holder_alice",
    "tpt_paying_agent"
  ],
  "holdings": [
    "hld_01JZ9ALICE"
  ],
  "ledger": {
    "workflow_id": "wf_fxrun_01JZ9SEED",
    "update_ids": ["upd_001", "upd_002", "upd_003"],
    "projection_offset": "00000000000000000042"
  }
}
```

### Required endpoint 3: `POST /v1/test_helpers/webhooks/trigger`

Triggers or redelivers webhook events.

Request: fixture-backed trigger

```json
{
  "event_type": "bond.maturity_reached",
  "mode": "fixture_backed",
  "sandbox": "sbox_default",
  "test_clock": "clock_01JZ9ABC",
  "parameters": {
    "asset": "asset_01JZ9BOND"
  },
  "webhook_endpoint": "we_01JZ9...",
  "api_version": "2026-05-26"
}
```

Response:

```json
{
  "id": "evt_01JZ9MATURITY",
  "object": "event",
  "livemode": false,
  "type": "bond.maturity_reached",
  "created": 1798675200,
  "api_version": "2026-05-26",
  "pending_webhooks": 1,
  "data": {
    "object": {
      "id": "asset_01JZ9BOND",
      "object": "asset",
      "type": "bond",
      "status": "matured"
    }
  },
  "delivery": {
    "id": "evtdel_01JZ9...",
    "status": "pending",
    "webhook_endpoint": "we_01JZ9..."
  },
  "ledger": {
    "sandbox": "sbox_01JZ9...",
    "update_id": "upd_maturity_001",
    "workflow_id": "wf_clock_advance_01JZ9"
  },
  "synthetic": false
}
```

Request: synthetic trigger

```json
{
  "event_type": "settlement_intent.failed",
  "mode": "synthetic",
  "override": {
    "data.object.status": "failed",
    "data.object.failure_code": "counterparty_rejected"
  },
  "webhook_endpoint": "we_01JZ9..."
}
```

Synthetic response includes:

```json
{
  "synthetic": true,
  "ledger": {
    "sandbox": "sbox_01JZ9...",
    "update_id": null,
    "workflow_id": null
  }
}
```

### Required endpoint 4: `POST /v1/test_helpers/reset`

Resets a test sandbox.

Request:

```json
{
  "sandbox": "sbox_default",
  "mode": "hard",
  "preserve": [
    "api_keys",
    "webhook_endpoints",
    "sandbox_config"
  ],
  "seed_base_fixtures": true,
  "metadata": {
    "reason": "before CI suite"
  }
}
```

Response:

```json
{
  "id": "reset_01JZ9...",
  "object": "test_helpers.reset",
  "livemode": false,
  "status": "processing",
  "sandbox": "sbox_01JZ9...",
  "previous_generation": 7,
  "target_generation": 8,
  "mode": "hard",
  "created": 1779792000
}
```

Reset modes:

| Mode              | Behavior                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `soft`            | Archive/cancel all active business test contracts through ledger choices where possible. Keeps ledger history. |
| `hard`            | Rotates sandbox generation, creates clean Canton runtime, rebuilds projections. Recommended for CI.            |
| `projection_only` | Rebuilds Pillar DB projections from ledger. Does not mutate ledger.                                            |
| `webhook_only`    | Clears test delivery attempts and event queue. Does not mutate ledger.                                         |

### Additional recommended endpoints

```http
GET    /v1/test_helpers/sandboxes
POST   /v1/test_helpers/sandboxes
GET    /v1/test_helpers/sandboxes/{id}
POST   /v1/test_helpers/sandboxes/{id}/reset

GET    /v1/test_helpers/test_clocks
GET    /v1/test_helpers/test_clocks/{id}
POST   /v1/test_helpers/test_clocks/{id}/advance
DELETE /v1/test_helpers/test_clocks/{id}

POST   /v1/test_helpers/participants/seed
POST   /v1/test_helpers/fixtures/run
GET    /v1/test_helpers/fixtures/{fixture_run_id}

POST   /v1/test_helpers/failures/inject
DELETE /v1/test_helpers/failures/{failure_id}

POST   /v1/test_helpers/locks/expire
POST   /v1/test_helpers/settlement_windows/simulate
POST   /v1/test_helpers/bonds/{asset_id}/mature
POST   /v1/test_helpers/redemptions/simulate
```

### CLI commands

Core setup:

```bash
pillar login
pillar config set api_key sk_test_...
pillar sandboxes create --profile multi_party_standard --name ci-sandbox
pillar sandboxes status
pillar sandboxes reset sbox_01JZ9 --hard
```

Fixtures:

```bash
pillar fixtures list
pillar fixtures seed bond_maturity_redemption_basic \
  --sandbox sbox_01JZ9 \
  --clock clock_01JZ9 \
  --out json

pillar assets seed \
  --type bond \
  --symbol ACME26_TEST \
  --currency USD \
  --maturity-date 2026-12-31 \
  --holder holder-alice \
  --quantity 1000000
```

Participants:

```bash
pillar participants seed --role issuer --name "ACME Test Issuer"
pillar participants seed --role holder --name "Alice Test Holder"
pillar participants list --sandbox sbox_01JZ9
```

Test clocks:

```bash
pillar test-clocks create \
  --name "bond maturity suite" \
  --frozen-time 2026-06-01T00:00:00Z

pillar test-clocks advance clock_01JZ9 \
  --to 2026-12-31T00:00:00Z \
  --process-due-workflows

pillar test-clocks list
pillar test-clocks delete clock_01JZ9
```

Lifecycle simulations:

```bash
pillar locks expire --holding-lock hlock_01JZ9 --clock clock_01JZ9

pillar settlement-windows simulate \
  --intent seti_01JZ9 \
  --open-at 2026-06-01T09:00:00Z \
  --close-at 2026-06-01T17:00:00Z

pillar bonds mature asset_01JZ9BOND --clock clock_01JZ9
pillar redemptions simulate --asset asset_01JZ9BOND --holder holder-alice
```

Failure helpers:

```bash
pillar failures inject ledger_command_rejected \
  --match "operation=settlement.confirm" \
  --once

pillar failures inject webhook_delivery_timeout \
  --event settlement_intent.succeeded \
  --endpoint we_01JZ9

pillar failures clear fail_01JZ9
```

Webhooks:

```bash
pillar webhooks listen --forward-to localhost:4242/webhook
pillar webhooks trigger settlement_intent.succeeded
pillar webhooks trigger bond.maturity_reached --fixture-backed
pillar webhooks replay evt_01JZ9 --endpoint we_01JZ9
pillar webhooks deliveries list --event evt_01JZ9
```

Debug / Workbench-style:

```bash
pillar logs requests --request req_01JZ9
pillar logs ledger-trace --workflow wf_01JZ9
pillar projections rebuild --sandbox sbox_01JZ9
pillar canton console --sandbox sbox_01JZ9 --advanced
```

---

## Internal Runtime

### Runtime components

| Component              | Responsibility                                                               |
| ---------------------- | ---------------------------------------------------------------------------- |
| API Gateway            | Auth, mode resolution, versioning, idempotency, request log                  |
| Test Control Plane     | Sandbox lifecycle, reset, fixture orchestration, failure injection           |
| Canton Sandbox Manager | Provision/stop/rotate Canton sandbox runtimes                                |
| Fixture Runner         | Converts fixture definitions into Pillar intents or direct internal commands |
| Ledger Command Adapter | Submits Daml commands, sets command ID / workflow ID                         |
| Completion Correlator  | Tracks command completions and failed submissions                            |
| Update Ingestor        | Reads Canton update stream from offsets                                      |
| Projection Builder     | Builds balances, holdings, intents, events from ledger updates               |
| Clock Orchestrator     | Advances TestClockState and due workflows                                    |
| Due Workflow Scheduler | Lock expiry, settlement windows, maturity/redemption                         |
| Webhook Event Builder  | Converts projection changes into versioned Event objects                     |
| Webhook Dispatcher     | Delivers signed events with retry/failure simulation                         |
| Workbench Service      | Logs, traces, offsets, event deliveries, sandbox controls                    |

### Intent lifecycle

External request:

```text
POST /v1/settlement_intents
```

Internal flow:

```text
API Request
  -> create request_log + idempotency row
  -> create IntentSubmitted command
  -> Canton completion
  -> UpdateIngestor sees ledger update
  -> ProjectionBuilder updates settlement_intents
  -> EventBuilder creates settlement_intent.created
  -> WebhookDispatcher delivers event
```

Status model:

```text
requires_action
processing
succeeded
failed
expired
canceled
```

### Clock advance runtime

```text
POST /v1/test_helpers/test_clocks/{id}/advance
  -> validate sk_test
  -> acquire sandbox clock lock
  -> write control-ledger TestClockAdvanceRequested
  -> set test clock status = advancing
  -> submit AdvanceClock command to business ledger
  -> run due workflow scheduler until quiescent
  -> wait until projections reach target offsets
  -> enqueue webhook events
  -> set clock status = ready
```

Quiescence rule:

```text
Clock advance is ready only when:
1. all due ledger commands have completed or failed,
2. projection offset >= every command completion update offset,
3. event builder has materialized all events,
4. webhook delivery queue has enqueued all configured events.
```

### Failure injection runtime

Failure injection is intercepted at controlled boundaries:

| Boundary               | Injectable                                     |
| ---------------------- | ---------------------------------------------- |
| API Gateway            | HTTP 400/401/409/429/500                       |
| Idempotency layer      | idempotency conflict/replay                    |
| Ledger Command Adapter | command rejection / delayed completion         |
| Completion Correlator  | completion timeout                             |
| Projection Builder     | projection lag / projection rebuild            |
| Scheduler              | due workflow failure                           |
| Webhook Dispatcher     | timeout / 400 / 500 / TLS error / out-of-order |

Each injection has:

```text
scope: once | count | time_window | next_matching_request
match: endpoint | event_type | intent_id | sandbox | participant role
expiry: timestamp
trace: control-ledger operation ID
```

---

## DB Schema

Principle: **Pillar DB stores only Projection / Audit / Config.** No DB table is authoritative for asset ownership, holdings, locks, settlement, or maturity. Those facts come from Canton ledger updates.

### Config tables

```sql
create table api_keys (
  id text primary key,
  account_id text not null,
  mode text not null check (mode in ('test', 'live')),
  key_hash text not null,
  default_sandbox_id text,
  created_at timestamptz not null
);

create table sandbox_configs (
  id text primary key,
  account_id text not null,
  mode text not null check (mode = 'test'),
  generation integer not null default 1,
  topology_profile text not null,
  canton_runtime_ref text not null,
  dar_version text not null,
  time_mode text not null check (time_mode in ('wall_clock', 'static_time')),
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table webhook_endpoints (
  id text primary key,
  account_id text not null,
  mode text not null check (mode in ('test', 'live')),
  url text not null,
  api_version text not null,
  enabled_events jsonb not null,
  signing_secret_ref text not null,
  status text not null,
  created_at timestamptz not null
);
```

### Idempotency / request audit

```sql
create table request_logs (
  id text primary key,
  account_id text not null,
  mode text not null,
  method text not null,
  path text not null,
  api_version text not null,
  idempotency_key text,
  request_body_hash text,
  response_body jsonb,
  status_code integer,
  created_at timestamptz not null
);

create unique index request_logs_idem_idx
on request_logs(account_id, mode, method, path, idempotency_key)
where idempotency_key is not null;
```

### Ledger trace audit

```sql
create table ledger_operations (
  id text primary key,
  account_id text not null,
  mode text not null,
  sandbox_id text,
  sandbox_generation integer,
  operation_type text not null,
  request_id text,
  workflow_id text,
  command_id text,
  submission_id text,
  update_id text,
  offset text,
  status text not null,
  created_at timestamptz not null
);
```

### Projection offset tracking

```sql
create table projection_offsets (
  sandbox_id text not null,
  sandbox_generation integer not null,
  participant_ref text not null,
  last_offset text not null,
  last_update_id text,
  updated_at timestamptz not null,
  primary key (sandbox_id, sandbox_generation, participant_ref)
);
```

### Holding / balance projections

```sql
create table asset_projections (
  id text primary key,
  account_id text not null,
  mode text not null,
  sandbox_id text,
  sandbox_generation integer,
  asset_type text not null,
  symbol text,
  currency text,
  status text not null,
  terms jsonb not null default '{}',
  ledger_update_id text not null,
  ledger_offset text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table holding_projections (
  id text primary key,
  account_id text not null,
  mode text not null,
  sandbox_id text,
  sandbox_generation integer,
  asset_id text not null,
  owner_ref text not null,
  total_quantity numeric(38, 12) not null,
  available_quantity numeric(38, 12) not null,
  locked_quantity numeric(38, 12) not null,
  status text not null,
  ledger_update_id text not null,
  ledger_offset text not null,
  updated_at timestamptz not null
);

create table balance_projections (
  account_id text not null,
  mode text not null,
  sandbox_id text,
  sandbox_generation integer,
  owner_ref text not null,
  asset_id text not null,
  total_quantity numeric(38, 12) not null,
  available_quantity numeric(38, 12) not null,
  locked_quantity numeric(38, 12) not null,
  ledger_offset text not null,
  updated_at timestamptz not null,
  primary key (account_id, mode, sandbox_id, sandbox_generation, owner_ref, asset_id)
);
```

### Test helper projections

```sql
create table test_clocks (
  id text primary key,
  account_id text not null,
  sandbox_id text not null,
  sandbox_generation integer not null,
  name text,
  frozen_time timestamptz not null,
  status text not null,
  time_isolation text not null,
  control_ledger_operation_id text,
  business_ledger_update_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table fixture_runs (
  id text primary key,
  account_id text not null,
  sandbox_id text not null,
  sandbox_generation integer not null,
  fixture_name text,
  status text not null,
  input jsonb not null,
  output jsonb not null default '{}',
  workflow_id text,
  created_at timestamptz not null
);

create table failure_injections (
  id text primary key,
  account_id text not null,
  sandbox_id text not null,
  sandbox_generation integer not null,
  failure_type text not null,
  scope text not null,
  match jsonb not null,
  status text not null,
  remaining_count integer,
  expires_at timestamptz,
  control_ledger_operation_id text,
  created_at timestamptz not null
);
```

### Webhook projections

```sql
create table events (
  id text primary key,
  account_id text not null,
  mode text not null,
  sandbox_id text,
  sandbox_generation integer,
  type text not null,
  api_version text not null,
  data jsonb not null,
  synthetic boolean not null default false,
  ledger_update_id text,
  workflow_id text,
  request_id text,
  created_at timestamptz not null
);

create table webhook_deliveries (
  id text primary key,
  event_id text not null references events(id),
  webhook_endpoint_id text not null,
  status text not null,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  last_status_code integer,
  last_error jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

---

## Failure Modes

| Failure mode                      | Cause                                    | User-visible result                             | Recovery                                                |
| --------------------------------- | ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| `test_mode_only`                  | live key used on test helper             | 403                                             | Use `sk_test_*`                                         |
| Sandbox not ready                 | Canton runtime provisioning              | 409 `sandbox_not_ready`                         | Retry with same idempotency key                         |
| Reset in progress                 | sandbox generation rotating              | 409 `sandbox_resetting`                         | Wait for `test_helpers.sandbox.reset_completed` webhook |
| Clock already advancing           | concurrent advance request               | 409 `clock_advancing`                           | Poll clock or retry after ready                         |
| Clock target invalid              | target <= current frozen time            | 400 `clock_time_invalid`                        | Use future timestamp                                    |
| Static time conflict              | multiple clocks in static-time sandbox   | 400 `time_isolation_conflict`                   | Use business clock or dedicated sandbox                 |
| Ledger command rejected           | Daml authorization/business rule failure | intent `failed`, webhook emitted                | Inspect `failure_code`, ledger trace                    |
| Completion timeout                | participant/synchronizer slow            | request returns processing                      | Webhook later delivers result                           |
| Projection lag                    | update ingestor behind                   | object `processing`, `projection_stale=true`    | Poll or wait for webhook                                |
| Webhook timeout                   | endpoint slow/unavailable                | delivery `failed`/`pending`                     | Automatic retry or CLI replay                           |
| Event ordering issue              | async delivery                           | user receives later event first                 | Handler must fetch object by ID                         |
| Idempotency conflict              | same key, different params               | 409 `idempotency_key_reused`                    | Use new key                                             |
| Hard reset during test            | caller reset sandbox                     | old object IDs become invalid in new generation | Use new fixture run IDs                                 |
| Clock advance internal failure    | forced or scheduler failure              | clock `internal_failure`                        | reset clock/sandbox or clear failure injection          |
| Bond redemption insufficient cash | paying agent not funded                  | redemption `failed`                             | Seed cash or inject funding step                        |
| Settlement window closed          | clock advanced past close                | settlement `expired`                            | New settlement intent                                   |

---

## Security / Compliance

### 1. Mode isolation

* Test and live keys are cryptographically distinct.
* Test keys cannot address live ledgers.
* Live keys cannot call `/v1/test_helpers/*`.
* Test webhook secrets and live webhook secrets are separate.
* Test sandbox data is never promoted into live.

### 2. Tenant isolation

* Each account gets isolated sandbox config and key namespace.
* Sandbox runtime can be:

  * shared worker + isolated ledger namespace for low-risk dev,
  * dedicated container for CI,
  * dedicated participant topology for enterprise.

### 3. Ledger traceability

Every test helper mutation records:

```text
request_id
idempotency_key
account_id
sandbox_id
generation
operation_type
workflow_id
command_id
update_id
offset
```

For hard reset, business ledger history may be discarded, but control-plane ledger keeps lifecycle trace.

### 4. Webhook security

Pillar webhook delivery signs payloads:

```http
Pillar-Signature: t=1779792000,v1=...
```

Verification rules:

* HMAC-SHA256 over `timestamp + "." + raw_body`.
* Default tolerance: 5 minutes.
* Multiple active secrets during rotation.
* Replay protection by event ID + delivery ID.
* Test mode can intentionally emit invalid signatures through failure helper.

### 5. Data classification

| Data           | Test mode            | Live mode                     |
| -------------- | -------------------- | ----------------------------- |
| API key secret | vault only           | vault only                    |
| Webhook secret | vault only           | vault only                    |
| Ledger payload | sandbox ledger       | live ledger                   |
| DB projection  | derived              | derived                       |
| Audit logs     | retained by policy   | retained by compliance policy |
| Fixture data   | deletable/resettable | not applicable                |

### 6. Compliance controls

* No production asset state can be created through test helper APIs.
* Reset is forbidden in live.
* Test participant names must be marked as synthetic.
* Test ISIN/CUSIP-like identifiers should use reserved test prefixes or metadata to avoid confusion.
* Workbench must display a persistent **TEST MODE** banner.
* CLI should require `--live` for live operations and never default to live destructive commands.

---

## Implementation Plan

### Phase 0 — API grammar and mode foundation

Deliverables:

* `sk_test_*` / `sk_live_*` resolver.
* `livemode` field on every object.
* `Pillar-Version` support.
* `Idempotency-Key` support for all POST endpoints.
* Request log + error object standardization.
* Live rejection for `/v1/test_helpers/*`.

Exit criteria:

```text
Same API path works in test/live where applicable.
Test helper namespace is impossible to invoke with live key.
```

### Phase 1 — Managed Canton sandbox MVP

Deliverables:

* Sandbox provisioner.
* Default `single_party_fast` profile.
* DAR upload/bootstrap.
* Party allocation.
* Projection worker from offset 0.
* Hard reset with generation rotation.
* Control-plane ledger operation trace.

Exit criteria:

```text
POST /v1/test_helpers/reset creates clean sandbox generation and projections rebuild correctly.
```

### Phase 2 — Fixtures and test assets

Deliverables:

* `POST /v1/test_helpers/assets/seed`.
* Built-in fixtures:

  * `cash_usd_basic`
  * `security_transfer_basic`
  * `bond_maturity_redemption_basic`
  * `settlement_dvp_basic`
* Test participants and holdings.
* Fixture run object and CLI.

Exit criteria:

```text
A developer can seed a bond, holder, paying agent, and initial holding from one API call.
```

### Phase 3 — Test Clock

Deliverables:

* `POST /v1/test_helpers/test_clocks`.
* `POST /v1/test_helpers/test_clocks/{id}/advance`.
* `business_clock` contract model.
* Optional `sandbox_static_time` profile.
* Clock status lifecycle and events.
* Clock-bound assets, locks, settlements, redemptions.

Exit criteria:

```text
Advancing a clock deterministically expires locks, opens/closes settlement windows, and matures bonds.
```

### Phase 4 — Simulation modules

Deliverables:

* Lock expiry scheduler.
* Settlement window scheduler.
* Bond maturity scheduler.
* Redemption workflow.
* Webhook event materialization.

Exit criteria:

```text
CI can run full lock -> settlement -> maturity -> redemption suite without sleeps.
```

### Phase 5 — Webhook trigger helpers

Deliverables:

* `POST /v1/test_helpers/webhooks/trigger`.
* `fixture_backed`, `redelivery`, `synthetic` modes.
* CLI `pillar webhooks listen/trigger/replay`.
* Signed payloads.
* Delivery logs and retry simulator.

Exit criteria:

```text
Developers can test webhook handlers locally with event delivery, retries, redelivery, and synthetic failure cases.
```

### Phase 6 — Forced failure helpers

Deliverables:

* `POST /v1/test_helpers/failures/inject`.
* Failure injection registry.
* Ledger command, projection, scheduler, webhook, idempotency fault boundaries.
* CLI `pillar failures inject/clear`.

Exit criteria:

```text
Every major async workflow can be tested under success, rejection, timeout, projection lag, and webhook failure.
```

### Phase 7 — Workbench and SDK polish

Deliverables:

* Workbench request logs.
* Ledger trace viewer.
* Projection offset viewer.
* Webhook delivery viewer.
* Sandbox reset UI.
* SDK support:

  * Node
  * Python
  * Java
  * Go
* SDK test helper namespace.

Exit criteria:

```text
A developer can debug from API request ID to ledger workflow ID to webhook delivery attempt in one UI.
```

---

## Open Questions

1. **Clock isolation default**

   * Should enterprise customers get one sandbox per test clock by default, or should we default to multi-clock `business_clock` and reserve `sandbox_static_time` for strict Canton time tests?

2. **Control-plane ledger technology**

   * Should the control-plane ledger be Canton itself, or an append-only audit ledger with Canton-compatible trace IDs? My recommendation: Canton for consistency.

3. **Fixture versioning**

   * Should fixture versions pin DAR versions automatically, or should fixture/DAR compatibility be validated at seed time?

4. **Synthetic webhook policy**

   * Should synthetic events be allowed for all event types, or only for handler contract tests? My recommendation: allow all but mark `synthetic=true` and require `mode=synthetic` explicitly.

5. **Reset retention**

   * How long should old sandbox generation projections be retained after hard reset? My recommendation: 7 days for dev, configurable for enterprise CI.

6. **Advanced Canton visibility**

   * Should public Workbench expose contract IDs to developers? My recommendation: hidden by default, visible behind “Advanced Canton trace” permission.

7. **Token standard compatibility**

   * How closely should Pillar fixtures align with Canton Network Token Standard allocation/holding APIs? My recommendation: provide a compatibility profile but keep Pillar’s public API holding-first and Canton-invisible.

---

## Agent-ready Checklist

### Product / API

* [ ] Add `livemode` to all response objects.
* [ ] Implement `sk_test_*` / `sk_live_*` mode resolver.
* [ ] Block `/v1/test_helpers/*` for live keys.
* [ ] Standardize error object.
* [ ] Add `Pillar-Version` parser.
* [ ] Add `Idempotency-Key` storage and replay behavior.
* [ ] Define event catalog for test helpers.
* [ ] Define fixture catalog and versioning.

### Canton runtime

* [ ] Build sandbox provisioner.
* [ ] Support topology profiles.
* [ ] Upload Pillar DARs during sandbox bootstrap.
* [ ] Allocate test parties.
* [ ] Configure JSON/gRPC Ledger API.
* [ ] Support static-time sandbox profile.
* [ ] Implement generation rotation for hard reset.
* [ ] Record lifecycle operations on control-plane ledger.

### Projection

* [ ] Implement update ingestor per sandbox generation.
* [ ] Track offsets per participant.
* [ ] Build asset projections.
* [ ] Build holding/balance projections.
* [ ] Build intent projections.
* [ ] Build test clock projections.
* [ ] Implement projection rebuild command.
* [ ] Mark stale projections during lag/failure tests.

### Test helpers

* [ ] Implement `POST /v1/test_helpers/test_clocks`.
* [ ] Implement `POST /v1/test_helpers/test_clocks/{id}/advance`.
* [ ] Implement `POST /v1/test_helpers/assets/seed`.
* [ ] Implement `POST /v1/test_helpers/webhooks/trigger`.
* [ ] Implement `POST /v1/test_helpers/reset`.
* [ ] Implement participant seed helper.
* [ ] Implement failure injection helper.
* [ ] Implement lock expiry simulation.
* [ ] Implement settlement window simulation.
* [ ] Implement bond maturity simulation.
* [ ] Implement redemption simulation.

### Webhooks

* [ ] Build signed event payloads.
* [ ] Add event delivery queue.
* [ ] Add retry policy for test/live.
* [ ] Add webhook delivery logs.
* [ ] Add redelivery endpoint.
* [ ] Add synthetic event flag.
* [ ] Add invalid signature simulation.
* [ ] Add timeout / 500 / out-of-order delivery simulation.

### CLI

* [ ] `pillar sandboxes create/status/reset`
* [ ] `pillar fixtures list/seed`
* [ ] `pillar assets seed`
* [ ] `pillar participants seed/list`
* [ ] `pillar test-clocks create/advance/list/delete`
* [ ] `pillar locks expire`
* [ ] `pillar settlement-windows simulate`
* [ ] `pillar bonds mature`
* [ ] `pillar redemptions simulate`
* [ ] `pillar failures inject/clear`
* [ ] `pillar webhooks listen/trigger/replay`
* [ ] `pillar logs requests`
* [ ] `pillar logs ledger-trace`
* [ ] `pillar projections rebuild`

### Workbench

* [ ] Test/live mode banner.
* [ ] API request logs.
* [ ] Ledger trace by request ID.
* [ ] Sandbox generation timeline.
* [ ] Fixture run viewer.
* [ ] Test clock viewer.
* [ ] Webhook delivery viewer.
* [ ] Failure injection viewer.
* [ ] Projection offset viewer.

### Security

* [ ] Secrets vault for API keys.
* [ ] Separate test/live webhook secrets.
* [ ] HMAC webhook signatures.
* [ ] Replay protection.
* [ ] Tenant sandbox isolation.
* [ ] RBAC for reset/failure helpers.
* [ ] Audit export.
* [ ] Advanced Canton trace permission.

Final architectural stance: **Pillar test mode must feel like Stripe, but behave like Canton.** The developer gets deterministic one-command testing; the platform keeps every meaningful asset operation ledger-backed, projection-derived, traceable, and safe.

[1]: https://docs.stripe.com/api "docs.stripe.com"
[2]: https://docs.stripe.com/testing-use-cases "docs.stripe.com"
[3]: https://docs.stripe.com/api/test_clocks "docs.stripe.com"
[4]: https://docs.stripe.com/webhooks "docs.stripe.com"
[5]: https://docs.stripe.com/stripe-cli "docs.stripe.com"
[6]: https://docs.stripe.com/workbench?utm_source=chatgpt.com "Workbench"
[7]: https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html "Sandbox — Digital Asset’s platform documentation"
[8]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[9]: https://docs.digitalasset.com/build/3.5/tutorials/smart-contracts/tests.html "Test Daml contracts — Digital Asset’s platform documentation"
[10]: https://docs.digitalasset.com/build/3.5/quickstart/configure/project-structure-overview.html "Canton Network quickstart project structure — Digital Asset’s platform documentation"
[11]: https://docs.canton.network/sdks-tools/api-reference/splice-daml/splice-token-test-trading-app?utm_source=chatgpt.com "splice-test-trading-app docs"
