# 19. Compliance / Risk / Policy Engine

아래 설계는 Pillar의 Policy/Risk/Compliance 계층을 **ledger-enforced policy plane**으로 정의한다. 핵심은 단순한 “API 앞단의 룰 엔진”이 아니라, **정책 결정은 Pillar가 설명 가능하게 계산하고, 물질적 효력은 Canton Ledger/Daml 모델이 강제**하는 구조다.

---

## Executive Summary

Pillar의 Policy/Risk/Compliance 계층은 **Stripe-like 외부 경험**과 **Canton-native 내부 실행**을 연결하는 통제 계층이다.

외부 개발자는 Canton, Daml contract ID, participant, command, offset을 보지 않는다. 대신 다음과 같은 Stripe-grade 리소스를 다룬다.

* `transfer_intent`
* `policy_decision`
* `risk_assessment`
* `approval_request`
* `freeze`
* `claim`
* `dispute`
* `policy_version`
* `policy_simulation`
* `compliance_export`

내부적으로는 모든 실질 상태 변경이 Canton Ledger command로 귀결된다. Pillar DB는 다음 세 가지 역할만 수행한다.

1. **Projection**: ledger state의 읽기 최적화 뷰
2. **Audit**: API request, decision, webhook, export, evidence trace
3. **Config**: policy version, rules, list, limits, webhook endpoint 설정

가장 중요한 설계 원칙은 다음이다.

> **Policy engine may decide; ledger must enforce.**

즉, 정책 엔진이 “allow”라고 판단해도 실제 transfer는 ledger-side `CompliancePermit`, `ApprovalGrant`, `VelocityWindow`, `Freeze` 상태를 만족해야만 실행된다. 반대로 DB projection이 stale해도 ledger command가 최종 안전장치가 된다.

### 리서치 근거 요약

Stripe의 API는 REST, resource-oriented URL, form-encoded request body, JSON response, standard HTTP semantics를 기본 문법으로 삼고 있으며, sandbox와 live mode는 API key로 구분된다. Pillar도 외부 API를 이 문법에 맞춘다. ([Stripe 문서][1])

Stripe는 create/update 요청의 안전한 재시도를 위해 idempotency key를 공식적으로 사용한다. Pillar도 모든 mutation API에 `Idempotency-Key`를 필수 또는 강권장 헤더로 둔다. ([Stripe 문서][2])

Stripe API versioning은 Workbench에서 계정 기본 버전을 관리하고, 요청별 `Stripe-Version` override를 지원하며, webhook endpoint도 API version을 가진다. Pillar는 이를 `Pillar-Version`과 event-level `api_version`으로 차용한다. ([Stripe 문서][3])

Stripe webhook은 비동기 상태 변경을 HTTPS JSON event로 전달하며, CLI local forwarding, Workbench endpoint registration, signature verification, 빠른 2xx 응답을 권장한다. Pillar도 webhook-first 운영 모델을 따른다. ([Stripe 문서][4]) ([Stripe 문서][4]) ([Stripe 문서][4])

Stripe Workbench는 API Explorer, event destinations, integration errors, logs, workflow inspection을 제공한다. Pillar Workbench는 이를 policy/risk/compliance 전용 운영 콘솔로 확장한다. ([Stripe 문서][5]) ([Stripe 문서][6])

Stripe의 capabilities, transfers, Radar risk score, allow/block lists, disputes, reports는 Pillar의 capability policy, transfer policy, risk score, party list, dispute flow, enterprise export 설계의 주요 API UX 레퍼런스다. ([Stripe 문서][7]) ([Stripe 문서][8]) ([Stripe 문서][9]) ([Stripe 문서][10]) ([Stripe 문서][11]) ([Stripe 문서][12])

Canton/Daml 쪽에서는 Ledger API가 **commands to ledger**와 **updates/events from ledger** 구조를 갖는다. Commands는 애플리케이션이 ledger state를 바꾸는 경로이고, updates/events는 ledger changes를 읽는 경로다. Pillar 내부 runtime은 이 구조를 그대로 따른다. ([Digital Asset][13])

Daml contracts는 create부터 archive까지 immutable active contract로 존재하며, active contract set은 create/archive로만 변한다. 따라서 freeze, approval, permit, dispute, claim 등도 “상태 변경”이 아니라 새로운 ledger action과 contract transition으로 표현해야 한다. ([Digital Asset][14])

Canton Quickstart architecture는 backend가 ledger interaction을 중앙화하고, frontend가 직접 Ledger API에 접근하지 않는 구조를 권장한다. Queries는 PQS, commands는 Ledger API gRPC로 분리된다. Pillar도 외부 API와 Workbench가 Canton을 직접 호출하지 않는 구조를 채택한다. ([Digital Asset][15])

---

## Goals / Non-goals

## Goals

### 1. Ledger-traceable compliance

모든 실질 operation은 다음 중 하나 이상으로 ledger-trace 가능해야 한다.

* `workflow_id`
* `command_id`
* `submission_id`
* `update_id`
* ledger offset
* Daml template / choice name
* policy version hash
* decision facts hash

### 2. Stripe-grade API grammar

외부 API는 다음 특성을 가져야 한다.

* resource-oriented URL
* stable object schema
* idempotent mutation
* API version pinning
* predictable errors
* thin webhook event
* sandbox/live mode parity
* SDK/CLI/Workbench first-class support

### 3. Intent-first operation

Transfer, freeze, claim, dispute는 transaction이 아니라 **intent/case**로 시작한다.

예:

```text
POST /v1/transfer_intents
POST /v1/transfer_intents/{id}/confirm
```

`confirm`은 동기 성공을 보장하지 않는다. 정책, approval, ledger command, projection, webhook을 거쳐 최종 상태가 확정된다.

### 4. Balance/Holding-first abstraction

외부 API는 contract ID를 노출하지 않는다.

고객은 다음을 본다.

* `balance`
* `holding`
* `asset`
* `transfer_intent`
* `freeze`
* `claim`
* `dispute`

내부 런타임만 Daml contract ID, template, choice, participant, synchronizer, ledger offset을 다룬다.

### 5. Deterministic and explainable policy

모든 policy decision은 다음을 가져야 한다.

* policy version
* policy hash
* input facts hash
* matched rules
* check-level result
* risk score
* final outcome
* human-readable reason
* machine-readable reason code

### 6. Policy simulation and versioning

정책은 즉시 live에 반영되지 않는다.

정책 lifecycle:

```text
draft → validated → staged → shadow → active → deprecated → archived
```

각 version은 signed manifest와 hash를 가진다.

### 7. Compliance export

Enterprise 고객은 특정 기간의 다음 데이터를 export할 수 있어야 한다.

* policy decisions
* risk assessments
* approvals
* transfer traces
* freezes
* claims
* disputes
* webhook delivery logs
* ledger references
* evidence file hashes
* policy version manifest

---

## Non-goals

### 1. Pillar DB를 asset truth로 만들지 않는다

Pillar DB의 `balances_projection`이나 `holdings_projection`은 빠른 read view다. 최종 truth는 Canton Ledger다.

### 2. Canton/Daml을 외부 API에 노출하지 않는다

외부 고객은 다음을 보지 않는다.

* Daml contract ID
* Daml template ID
* participant ID
* synchronizer ID
* ledger offset
* command internals

단, enterprise audit/export에는 Canton trace metadata를 포함할 수 있다.

### 3. Policy engine이 법률 자문 시스템이 되지 않는다

Jurisdiction policy는 configurability와 enforcement를 제공한다. 특정 국가의 법률 해석 자체를 Pillar가 보증하지 않는다.

### 4. Allowlist가 hard control을 우회하지 않는다

Allowlist는 risk friction을 낮출 수 있지만, 다음을 우회할 수 없다.

* blocklist
* freeze
* missing capability
* insufficient holding
* active dispute lock
* ledger-side transfer constraint

### 5. Off-ledger approval만으로 transfer를 실행하지 않는다

Human approval은 ledger-side `ApprovalGrant` 또는 `CompliancePermit`으로 반영되어야 한다.

---

# Architecture

## 1. High-level Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ External Clients                                              │
│ API / SDK / CLI / Workbench                                   │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│ Pillar API Gateway                                            │
│ - AuthN/AuthZ                                                  │
│ - API versioning                                               │
│ - idempotency                                                  │
│ - request normalization                                        │
│ - tenant/live/sandbox routing                                  │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│ Intent Layer                                                  │
│ - TransferIntent                                               │
│ - FreezeIntent                                                 │
│ - ClaimCase                                                    │
│ - DisputeCase                                                  │
│ - PolicySimulation                                             │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│ Policy / Risk / Compliance Engine                             │
│ - capability policy                                            │
│ - asset transfer policy                                        │
│ - jurisdiction policy                                          │
│ - velocity policy                                              │
│ - allowlist/blocklist                                          │
│ - risk score                                                   │
│ - approval policy                                              │
│ - freeze/claim/dispute policy                                  │
│ - audit decision object                                        │
│ - simulation / shadow mode                                     │
└───────────────────────────────┬──────────────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
┌──────────────────────────────┐    ┌───────────────────────────┐
│ Config / Audit DB             │    │ Ledger Adapter             │
│ - policy versions             │    │ - command compiler          │
│ - rules / lists / limits      │    │ - gRPC Ledger API           │
│ - decisions / evidence        │    │ - command dedup             │
│ - webhook logs                │    │ - update consumer           │
└──────────────────────────────┘    └─────────────┬─────────────┘
                                                   │
                                                   ▼
                                      ┌───────────────────────────┐
                                      │ Canton Ledger              │
                                      │ - source of truth           │
                                      │ - Daml contracts/choices    │
                                      │ - immutable ledger updates   │
                                      └─────────────┬─────────────┘
                                                    │
                                                    ▼
                                      ┌───────────────────────────┐
                                      │ Projection Layer / PQS      │
                                      │ - holdings projection       │
                                      │ - balances projection       │
                                      │ - case status projection    │
                                      │ - ledger offset tracking    │
                                      └─────────────┬─────────────┘
                                                    │
                                                    ▼
                                      ┌───────────────────────────┐
                                      │ Webhook Router              │
                                      │ - thin events               │
                                      │ - retries                   │
                                      │ - signatures                │
                                      │ - event retrieval API       │
                                      └───────────────────────────┘
```

---

## 2. Core Design Principle

Pillar에는 두 종류의 policy enforcement가 있다.

| Layer                      |                                         역할 | Source of truth     |
| -------------------------- | -----------------------------------------: | ------------------- |
| Pre-ledger policy decision |  allow, deny, approval 필요, freeze 필요 등을 계산 | Pillar audit/config |
| Ledger-side enforcement    | 실제 transfer/freeze/claim/dispute 상태 변경을 강제 | Canton Ledger       |

즉, `policy_decision.outcome = "allow"`는 충분조건이 아니다. 실제 transfer choice는 ledger에서 다음을 확인해야 한다.

* sender has active transfer capability
* receiver has active receive capability
* asset is transferable
* no blocking freeze
* no active claim lock over amount
* velocity window can be consumed
* valid `CompliancePermit`
* required `ApprovalGrant` exists
* holding has sufficient available amount

---

## 3. Ledger-side Policy Artifacts

Pillar의 Daml model에는 최소한 다음 compliance artifacts가 필요하다.

| Ledger artifact            | 목적                                                 |
| -------------------------- | -------------------------------------------------- |
| `AccountCapability`        | account별 가능한 기능 정의                                 |
| `Holding`                  | asset holding의 authoritative state                 |
| `TransferIntent`           | ledger-traceable transfer lifecycle                |
| `CompliancePermit`         | 특정 intent에 대한 짧은 수명의 policy allow token            |
| `ApprovalRequest`          | manual approval 요청                                 |
| `ApprovalGrant`            | 승인 결과                                              |
| `VelocityWindow`           | ledger-enforced limit counter/reservation          |
| `Freeze`                   | account/holding/asset/party scope freeze           |
| `Claim`                    | 특정 holding/amount에 대한 권리 주장                        |
| `Dispute`                  | transfer 또는 holding 관련 분쟁                          |
| `EvidenceAnchor`           | evidence file hash/reference                       |
| `PolicyVersionAttestation` | active policy version hash의 optional ledger anchor |

`PolicyVersionAttestation`은 정책 전문을 ledger에 저장하지 않는다. 대신 다음만 저장한다.

```text
policy_version_id
policy_hash
activated_by
activated_at
effective_from
```

정책 전문은 Pillar Config DB에 있고, export 시 signed manifest로 제공한다.

---

## 4. Policy Modules

## 4.1 Account Capability Policy

Stripe Connect의 capabilities처럼, Pillar account는 특정 operation을 수행하려면 capability가 active여야 한다. Stripe도 connected account의 기능을 capabilities로 관리하며, 특정 action을 수행하려면 관련 capability가 active여야 한다. ([Stripe 문서][7])

### Capability examples

```text
asset_hold
asset_receive
asset_transfer
asset_issue
asset_redeem
asset_bridge
dispute_manage
claim_create
admin_freeze
policy_admin
export_compliance
```

### Capability states

```text
inactive
pending
active
restricted
revoked
expired
```

### Capability decision

Capability policy는 다음을 확인한다.

* account status
* tenant status
* capability state
* KYC/KYB completeness
* jurisdiction compatibility
* asset class permission
* sanctions/list result
* outstanding disputes or freezes
* account risk tier

### Example

```json
{
  "type": "account_capability",
  "capability": "asset_transfer",
  "result": "fail",
  "reason": "capability.restricted",
  "message": "Account cannot initiate asset transfers while restricted."
}
```

---

## 4.2 Asset Transfer Policy

Asset transfer policy는 `transfer_intent` 생성 및 confirm 시 적용된다.

### Checks

| Check                    | 설명                                                         |
| ------------------------ | ---------------------------------------------------------- |
| asset status             | asset이 active/transferable인지                               |
| asset class              | stablecoin, tokenized deposit, fund unit, security token 등 |
| issuer restrictions      | issuer-specific policy                                     |
| sender capability        | `asset_transfer`                                           |
| receiver capability      | `asset_receive`                                            |
| holding availability     | available balance sufficient                               |
| decimals / minimum unit  | amount precision                                           |
| lockup / maturity        | lockup period, maturity date                               |
| transfer corridor        | jurisdiction from/to                                       |
| freeze / claim / dispute | blocking encumbrance                                       |
| settlement domain        | supported Canton domain/synchronizer                       |
| risk score               | threshold action                                           |
| approval policy          | manual approval 필요 여부                                      |

Stripe transfer object가 Connect 계정 간 fund movement를 표현하고, transfer events를 제공하는 것처럼, Pillar의 `transfer_intent`는 Canton-backed asset movement의 외부 API 리소스다. ([Stripe 문서][8])

---

## 4.3 Approval Policy

Approval policy는 high-risk 또는 high-value operation에 대해 manual control을 강제한다.

### Approval trigger examples

* amount exceeds threshold
* risk score above configured level
* new counterparty
* cross-jurisdiction corridor
* restricted asset class
* admin freeze release
* claim resolution
* dispute settlement
* policy version activation
* allowlist/blocklist bulk import

### Approval patterns

| Pattern              | 설명                                  |
| -------------------- | ----------------------------------- |
| single approver      | compliance officer 1명               |
| M-of-N               | N명 중 M명 승인                          |
| role quorum          | compliance + treasury 각각 1명         |
| separation of duties | creator와 approver가 달라야 함            |
| escalation           | SLA 초과 시 senior approver            |
| dual control         | freeze release, policy activation 등 |

### Ledger enforcement

Approval은 단순 DB row가 아니다.

```text
ApprovalRequest contract
  └─ Approve choice
       └─ creates ApprovalGrant
```

Transfer execution choice는 필요한 경우 `ApprovalGrant`를 consume하거나 참조한다.

---

## 4.4 Jurisdiction Policy

Jurisdiction policy는 parties, asset, issuer, transfer corridor의 조합을 평가한다.

### Inputs

```text
sender_jurisdiction
receiver_jurisdiction
beneficial_owner_jurisdiction
issuer_jurisdiction
custody_jurisdiction
asset_distribution_jurisdictions
asset_class
transfer_purpose
account_type
```

### Actions

```text
allow
deny
requires_approval
requires_disclosure
requires_enhanced_due_diligence
freeze
manual_review
```

### Example rule

```yaml
id: rule_jurisdiction_kr_us_security_token
when:
  asset.class: security_token
  sender.jurisdiction: KR
  receiver.jurisdiction: US
then:
  action: requires_approval
  reason: jurisdiction.cross_border_security_token
```

---

## 4.5 Velocity Limit

Velocity limit은 DB-only counter로 구현하면 안 된다. 동시 transfer에서 race condition이 발생한다.

Pillar는 두 단계로 처리한다.

1. Projection 기반 preflight check
2. Ledger-side `VelocityWindow` consume/reserve choice

### Limit scopes

```text
account
account_pair
beneficiary
asset
asset_class
issuer
jurisdiction_corridor
tenant
platform
```

### Window types

```text
fixed_window
rolling_window
calendar_day
calendar_month
business_day
```

### Limit examples

```json
{
  "scope": "account",
  "window": "calendar_day",
  "asset": "asset_usdc_001",
  "max_amount_minor": "100000000000",
  "action": "requires_approval"
}
```

### Enforcement pattern

```text
TransferIntent.confirm
  → PolicyDecision allow
  → CompliancePermit create
  → VelocityWindow.consume
  → Holding.transfer
```

If `VelocityWindow.consume` fails, the transfer fails even if the preflight policy decision allowed it.

---

## 4.6 Party Allowlist / Blocklist

Stripe Radar supports lists for allow, block, and review rules. Pillar adopts the same operational pattern but makes list versions auditable and policy-version-bound. ([Stripe 문서][10])

### List types

```text
party_allowlist
party_blocklist
wallet_allowlist
wallet_blocklist
issuer_blocklist
jurisdiction_blocklist
asset_blocklist
beneficiary_blocklist
device_blocklist
ip_blocklist
```

### Entry representation

PII-sensitive values are not stored in plaintext by default.

```text
value_hash = HMAC-SHA256(tenant_secret, normalized_value)
value_ciphertext = optional encrypted raw value
```

### Priority

```text
blocklist > freeze > missing capability > claim lock > jurisdiction deny > risk review > allowlist
```

Allowlist can reduce risk score or skip manual review only when no hard control blocks the operation.

---

## 4.7 Risk Score

Stripe Radar exposes a risk score and risk level, commonly with score bands and rule actions such as allow, block, review, or 3DS request. Pillar uses a similar API shape but adapts it to Canton-backed asset movement. ([Stripe 문서][9])

### Risk score range

```text
0–99
```

### Risk levels

```text
normal
elevated
high
critical
not_assessed
unknown
```

### Risk features

| Feature group | Examples                                  |
| ------------- | ----------------------------------------- |
| account       | age, KYB tier, capability history         |
| counterparty  | first-time receiver, prior disputes       |
| asset         | asset class, issuer, liquidity risk       |
| transfer      | amount, frequency, time of day            |
| jurisdiction  | corridor risk, sanctions exposure         |
| velocity      | window utilization, recent spikes         |
| list          | allowlist/blocklist proximity             |
| device/API    | key age, IP, anomalous integration source |
| ledger        | recent freeze/claim/dispute events        |

### Risk actions

```text
allow
requires_approval
manual_review
deny
freeze
```

### Risk assessment object

```json
{
  "id": "risk_01HX...",
  "object": "risk_assessment",
  "subject": {
    "type": "transfer_intent",
    "id": "trint_01HX..."
  },
  "score": 72,
  "level": "elevated",
  "model_version": "rmod_2026_05",
  "features_hash": "sha256:...",
  "top_factors": [
    "first_time_counterparty",
    "high_velocity_utilization",
    "cross_border_corridor"
  ],
  "action": "requires_approval"
}
```

---

## 4.8 Freeze / Claim / Dispute Flow

## Freeze

Freeze is a ledger-enforced encumbrance.

### Freeze scopes

```text
account
holding
asset
party
transfer_intent
claim
dispute
```

### Freeze lifecycle

```text
pending → active → released
        → expired
        → superseded
```

### Freeze creation flow

```text
POST /v1/freezes
  → actor capability check: admin_freeze
  → jurisdiction/legal-basis policy check
  → approval policy check if required
  → CreateFreeze command
  → Freeze contract active
  → projection update
  → webhook: freeze.created
```

### Ledger rule

Transfer choice must fail if a blocking active freeze exists over:

* sender account
* receiver account
* holding
* asset
* party
* related claim/dispute

---

## Claim

Claim is a formal assertion over a holding, amount, asset, or transfer.

### Claim lifecycle

```text
opened → evidence_required → under_review → accepted
                                      → rejected
                                      → settled
                                      → withdrawn
```

### Claim flow

```text
POST /v1/claims
  → validate claimant capability
  → create Claim contract
  → optionally create HoldingEncumbrance
  → collect evidence
  → review / approval
  → resolve by release, settlement, transfer, or rejection
```

### Claim resolution

A claim resolution never mutates the original transfer. It creates a new ledger operation:

```text
claim.accepted
  → settlement transfer
  → holding release
  → freeze release
```

---

## Dispute

Stripe disputes represent cases where a charge is challenged and evidence may be submitted via API or Dashboard; Stripe also emits dispute events through webhooks. Pillar uses this as the external operational model, adapted to asset transfer disputes. ([Stripe 문서][11])

### Dispute lifecycle

```text
opened
→ evidence_required
→ evidence_submitted
→ under_review
→ accepted
→ rejected
→ settled
→ closed
```

### Dispute flow

```text
POST /v1/disputes
  → policy check
  → create Dispute contract
  → optional freeze or reserve
  → evidence upload / evidence hash
  → manual review
  → ledger-side resolution
  → webhook: dispute.updated
```

### Evidence handling

Evidence files are stored off-ledger. Ledger and audit store:

```text
file_hash
storage_ref
submitted_by
submitted_at
evidence_type
case_id
```

The ledger stores hashes and references, not raw private evidence.

---

## 4.9 Audit Decision Object

Every policy evaluation creates an audit-grade decision object.

Properties:

* deterministic
* immutable after creation
* version-pinned
* facts-hashed
* explainable
* exportable
* correlated with ledger command when applicable

### Decision outcomes

```text
allow
deny
requires_approval
manual_review
freeze
simulate_only
```

### Decision action

```text
proceed
hold
block
create_approval_request
create_freeze
create_case
```

### Example

```json
{
  "id": "pdec_01HXQ0ZP2K8E6V4G5A9N7M1R2T",
  "object": "policy_decision",
  "livemode": false,
  "created": 1780000000,
  "api_version": "2026-05-01",
  "intent": "trint_01HXQ0ZJ9FJ7N6Q7S0A8C3M2B1",
  "subject": {
    "type": "transfer_intent",
    "id": "trint_01HXQ0ZJ9FJ7N6Q7S0A8C3M2B1"
  },
  "policy_version": "pver_2026_05_01_001",
  "policy_hash": "sha256:f7d4...",
  "outcome": "requires_approval",
  "action": "hold",
  "reason": "risk_score.elevated",
  "risk": {
    "score": 72,
    "level": "elevated",
    "model_version": "rmod_2026_05"
  },
  "checks": [
    {
      "type": "account_capability",
      "result": "pass",
      "capability": "asset_transfer"
    },
    {
      "type": "party_list",
      "result": "pass"
    },
    {
      "type": "jurisdiction",
      "result": "pass",
      "corridor": "KR->SG"
    },
    {
      "type": "velocity_limit",
      "result": "warn",
      "remaining_minor": "125000000"
    },
    {
      "type": "approval_policy",
      "result": "requires_approval",
      "required_roles": ["compliance_officer"]
    }
  ],
  "ledger_trace": {
    "workflow_id": "wf_trint_01HXQ0ZJ9FJ7N6Q7S0A8C3M2B1",
    "command_id": null,
    "update_id": null,
    "offset": null
  },
  "facts_hash": "sha256:9ae1...",
  "explainability": {
    "matched_rules": [
      "rule_risk_elevated_amount_001",
      "rule_approval_cross_border_003"
    ],
    "shadow_differences": []
  }
}
```

---

## 4.10 Policy Simulation

Simulation is a first-class API and Workbench feature.

### Use cases

* test candidate policy version
* evaluate historical transfer against new rules
* preview effect of new jurisdiction rule
* compare active vs candidate policy
* run shadow mode before activation
* estimate blocked/reviewed transfer volume

### Simulation modes

```text
fixture
live_facts
historical_replay
shadow
bulk
```

### Simulation output

```json
{
  "id": "psim_01HX...",
  "object": "policy_simulation",
  "mode": "shadow",
  "active_policy_version": "pver_2026_05_01_001",
  "candidate_policy_version": "pver_2026_06_01_001",
  "subject": {
    "type": "transfer_intent",
    "id": "trint_01HX..."
  },
  "active_decision": {
    "outcome": "allow"
  },
  "candidate_decision": {
    "outcome": "requires_approval",
    "reason": "jurisdiction.new_corridor_rule"
  },
  "diff": {
    "outcome_changed": true,
    "new_required_approvals": ["compliance_officer"]
  },
  "ledger_impact": {
    "would_submit_command": false,
    "would_create_approval_request": true,
    "would_consume_velocity": false
  }
}
```

Simulation never submits Canton commands.

---

## 4.11 Policy Versioning

Policy versions are immutable after validation.

### Lifecycle

```text
draft
→ validated
→ staged
→ shadow
→ active
→ deprecated
→ archived
```

### Activation requirements

* valid syntax
* deterministic evaluation
* no unresolved references
* list versions pinned
* velocity configs pinned
* approval matrix pinned
* risk model version pinned
* required approvers signed
* simulation suite passed
* activation manifest signed

### Policy manifest

```json
{
  "id": "pver_2026_05_01_001",
  "object": "policy_version",
  "status": "active",
  "effective_from": 1780000000,
  "bundle_hash": "sha256:...",
  "risk_model_version": "rmod_2026_05",
  "list_versions": [
    "plistv_blocked_parties_004",
    "plistv_trusted_counterparties_009"
  ],
  "velocity_config_version": "vlimv_003",
  "approval_config_version": "apprv_006",
  "activated_by": "usr_...",
  "approved_by": ["usr_compliance_1", "usr_risk_2"],
  "ledger_attestation": {
    "enabled": true,
    "contract": "internal_only",
    "update_id": "internal_only"
  }
}
```

Stripe’s API versioning model separates account default version, request override, webhook endpoint version, and Workbench-based upgrade testing. Pillar mirrors this by separating API rendering version from policy version. ([Stripe 문서][3]) ([Stripe 문서][16])

---

## 4.12 Workbench Policy UI

Pillar Workbench는 단순 dashboard가 아니라 compliance operations console이다.

### Screens

| Screen             | 기능                                              |
| ------------------ | ----------------------------------------------- |
| Policy Studio      | rule authoring, validation, diff                |
| Rule Graph         | rule dependency, priority, shadow impact        |
| Decision Inspector | `policy_decision` 상세, facts hash, matched rules |
| Simulation Runner  | single/bulk/historical/shadow simulation        |
| Approval Queue     | manual review, M-of-N approval                  |
| Risk Console       | risk score, top factors, override history       |
| List Manager       | allowlist/blocklist upload, versioning, expiry  |
| Freeze Console     | create/release/expire freezes                   |
| Claim Console      | claim lifecycle, evidence, resolution           |
| Dispute Console    | dispute lifecycle, evidence, settlement         |
| Export Center      | compliance export generation                    |
| Webhook Monitor    | event delivery, retries, failures               |
| API Explorer       | version-pinned API testing                      |
| CLI Shell          | sandbox operations, replay, fixture creation    |

Stripe Workbench’s API Explorer, event destinations, logs, and integration error inspection are the closest operational reference; Pillar’s Workbench adds policy simulation and ledger trace inspection. ([Stripe 문서][5]) ([Stripe 문서][6])

---

## 4.13 Enterprise Compliance Export

Stripe’s Reports API exposes downloadable CSV reports for reconciliation and accounting use cases. Pillar uses the same API style but exports policy/compliance evidence, not payment reports only. ([Stripe 문서][12])

### Export formats

```text
csv
jsonl
parquet
pdf_summary
signed_manifest
```

### Export contents

* policy decisions
* policy versions
* risk assessments
* transfer intents
* ledger trace metadata
* freezes
* claims
* disputes
* approval decisions
* evidence file hashes
* webhook delivery logs
* API request logs
* idempotency keys
* export manifest hash

### Export object

```json
{
  "id": "cexp_01HX...",
  "object": "compliance_export",
  "status": "succeeded",
  "livemode": true,
  "period": {
    "start": 1777593600,
    "end": 1780271999
  },
  "format": "jsonl",
  "included": [
    "policy_decisions",
    "risk_assessments",
    "approvals",
    "freezes",
    "claims",
    "disputes",
    "ledger_traces",
    "webhook_deliveries"
  ],
  "manifest_hash": "sha256:...",
  "file": {
    "id": "file_01HX...",
    "content_hash": "sha256:...",
    "expires_at": 1780871999
  }
}
```

---

# API / Object Model

## 1. API Headers

```http
Authorization: Bearer sk_live_...
Idempotency-Key: 8f1f2c7a-9c0d-4e17-9f2a-...
Pillar-Version: 2026-05-01
Pillar-Account: acct_...
```

### Header semantics

| Header              | 설명                                   |
| ------------------- | ------------------------------------ |
| `Authorization`     | API key                              |
| `Idempotency-Key`   | mutation deduplication               |
| `Pillar-Version`    | API response/event rendering version |
| `Pillar-Account`    | platform/tenant/account context      |
| `Pillar-Request-Id` | response correlation ID              |

API key와 environment가 sandbox/live mode를 결정한다. Stripe sandbox가 live integration에 영향을 주지 않는 isolated test environment를 제공하는 것처럼, Pillar sandbox도 별도 Canton topology 또는 isolated participant/domain config를 사용한다. ([Stripe 문서][17])

---

## 2. Resource IDs

```text
acct_     account
asset_    asset
hold_     holding
bal_      balance
trint_    transfer_intent
pdec_     policy_decision
risk_     risk_assessment
appr_     approval_request
frz_      freeze
clm_      claim
disp_     dispute
pver_     policy_version
psim_     policy_simulation
cexp_     compliance_export
evt_      event
```

---

## 3. Endpoints

## Account capability

```http
GET  /v1/accounts/{account_id}/capabilities
GET  /v1/accounts/{account_id}/capabilities/{capability}
POST /v1/accounts/{account_id}/capabilities/{capability}/request
POST /v1/accounts/{account_id}/capabilities/{capability}/restrict
POST /v1/accounts/{account_id}/capabilities/{capability}/restore
```

## Transfer intent

```http
POST /v1/transfer_intents
GET  /v1/transfer_intents/{id}
POST /v1/transfer_intents/{id}/confirm
POST /v1/transfer_intents/{id}/cancel
```

## Policy decision

```http
GET /v1/policy_decisions/{id}
GET /v1/policy_decisions?subject=trint_...
```

## Risk

```http
GET  /v1/risk_assessments/{id}
POST /v1/risk_assessments
```

## Approval

```http
GET  /v1/approval_requests
GET  /v1/approval_requests/{id}
POST /v1/approval_requests/{id}/approve
POST /v1/approval_requests/{id}/reject
POST /v1/approval_requests/{id}/reassign
```

## Policy simulation

```http
POST /v1/policy_simulations
GET  /v1/policy_simulations/{id}
```

## Policy versions

```http
POST /v1/policy_versions
GET  /v1/policy_versions/{id}
POST /v1/policy_versions/{id}/validate
POST /v1/policy_versions/{id}/stage
POST /v1/policy_versions/{id}/activate
POST /v1/policy_versions/{id}/deprecate
```

## Party lists

```http
POST /v1/party_lists
GET  /v1/party_lists/{id}
POST /v1/party_lists/{id}/entries
DELETE /v1/party_lists/{id}/entries/{entry_id}
POST /v1/party_lists/{id}/versions/{version_id}/activate
```

## Freeze

```http
POST /v1/freezes
GET  /v1/freezes/{id}
POST /v1/freezes/{id}/release
POST /v1/freezes/{id}/extend
```

## Claims

```http
POST /v1/claims
GET  /v1/claims/{id}
POST /v1/claims/{id}/submit_evidence
POST /v1/claims/{id}/resolve
POST /v1/claims/{id}/withdraw
```

## Disputes

```http
POST /v1/disputes
GET  /v1/disputes/{id}
POST /v1/disputes/{id}/submit_evidence
POST /v1/disputes/{id}/accept
POST /v1/disputes/{id}/reject
POST /v1/disputes/{id}/settle
```

## Compliance exports

```http
POST /v1/compliance_exports
GET  /v1/compliance_exports/{id}
GET  /v1/compliance_exports/{id}/download
```

---

## 4. `transfer_intent` Object

```json
{
  "id": "trint_01HX...",
  "object": "transfer_intent",
  "livemode": false,
  "status": "requires_approval",
  "asset": "asset_usdc_001",
  "amount_minor": "100000000",
  "source_holding": "hold_01HX...",
  "destination_account": "acct_01HY...",
  "description": "Treasury transfer",
  "metadata": {
    "invoice_id": "inv_123"
  },
  "policy_decision": "pdec_01HX...",
  "risk_assessment": "risk_01HX...",
  "approval_request": "appr_01HX...",
  "latest_ledger_trace": {
    "workflow_id": "wf_trint_01HX...",
    "command_status": "not_submitted"
  },
  "created": 1780000000,
  "updated": 1780000021
}
```

### Statuses

```text
requires_confirmation
requires_policy_review
requires_approval
blocked
processing
succeeded
failed
canceled
```

---

## 5. `policy_decision` Object

See full example above.

### Required fields

```text
id
object
created
livemode
api_version
subject
policy_version
policy_hash
facts_hash
outcome
action
reason
checks
ledger_trace
```

---

## 6. `approval_request` Object

```json
{
  "id": "appr_01HX...",
  "object": "approval_request",
  "status": "pending",
  "subject": {
    "type": "transfer_intent",
    "id": "trint_01HX..."
  },
  "required": {
    "strategy": "role_quorum",
    "roles": [
      {
        "role": "compliance_officer",
        "count": 1
      },
      {
        "role": "treasury_admin",
        "count": 1
      }
    ],
    "separation_of_duties": true
  },
  "approvals": [],
  "expires_at": 1780007200,
  "policy_decision": "pdec_01HX..."
}
```

---

## 7. `freeze` Object

```json
{
  "id": "frz_01HX...",
  "object": "freeze",
  "status": "active",
  "scope": {
    "type": "holding",
    "id": "hold_01HX..."
  },
  "reason": "compliance_review",
  "legal_basis": "internal_policy",
  "created_by": "usr_01HX...",
  "policy_decision": "pdec_01HX...",
  "effective_from": 1780000000,
  "expires_at": 1780600000,
  "ledger_trace": {
    "workflow_id": "wf_frz_01HX...",
    "update_id": "internal_only"
  }
}
```

---

## 8. `claim` Object

```json
{
  "id": "clm_01HX...",
  "object": "claim",
  "status": "under_review",
  "scope": {
    "type": "holding",
    "id": "hold_01HX..."
  },
  "amount_minor": "50000000",
  "asset": "asset_usdc_001",
  "claimant": "acct_01HY...",
  "respondent": "acct_01HZ...",
  "evidence": [
    {
      "id": "evd_01HX...",
      "hash": "sha256:..."
    }
  ],
  "related_freeze": "frz_01HX..."
}
```

---

## 9. `dispute` Object

```json
{
  "id": "disp_01HX...",
  "object": "dispute",
  "status": "evidence_required",
  "transfer_intent": "trint_01HX...",
  "amount_minor": "100000000",
  "asset": "asset_usdc_001",
  "reason": "unauthorized_transfer",
  "evidence_due_by": 1780600000,
  "related_freeze": "frz_01HX...",
  "latest_policy_decision": "pdec_01HX..."
}
```

---

## 10. Events / Webhooks

Stripe webhook setup emphasizes HTTPS POST endpoints, event selection, API versioning, local testing through CLI forwarding, and quick 2xx responses before heavy processing. Pillar adopts the same model. ([Stripe 문서][4])

### Event types

```text
policy_decision.created
risk_assessment.created
transfer_intent.requires_approval
transfer_intent.blocked
transfer_intent.processing
transfer_intent.succeeded
transfer_intent.failed
approval_request.created
approval_request.approved
approval_request.rejected
freeze.created
freeze.released
claim.created
claim.updated
dispute.created
dispute.evidence_required
dispute.closed
policy_version.activated
compliance_export.succeeded
compliance_export.failed
```

### Thin event

```json
{
  "id": "evt_01HX...",
  "object": "event",
  "api_version": "2026-05-01",
  "type": "transfer_intent.requires_approval",
  "created": 1780000001,
  "livemode": false,
  "data": {
    "object": {
      "id": "trint_01HX...",
      "object": "transfer_intent"
    }
  },
  "request": {
    "id": "req_01HX...",
    "idempotency_key": "8f1f2c7a-..."
  }
}
```

Stripe also documents thin event migration and idempotency handling for event processing. Pillar should make all webhook events idempotent by event ID and resource ID. ([Stripe 문서][18])

---

# Internal Runtime

## 1. Request Flow: Transfer Confirm

```text
1. Client calls POST /v1/transfer_intents/{id}/confirm
2. API Gateway authenticates API key
3. API version and idempotency key are resolved
4. Intent layer loads TransferIntent projection
5. State loader reads holdings, capabilities, freezes, claims, disputes
6. Policy engine builds DecisionFacts
7. Policy engine evaluates rules
8. Audit decision object is persisted
9. If denied:
      emit transfer_intent.blocked
10. If approval required:
      submit CreateApprovalRequest command
      emit transfer_intent.requires_approval
11. If allowed:
      submit CreateCompliancePermit + ConfirmTransfer command
12. Ledger update consumer receives accepted update
13. Projection layer updates holding/balance/intent state
14. Webhook router emits final event
```

---

## 2. Idempotency and Canton Command Deduplication

Stripe’s idempotency model allows clients to safely retry requests without duplicating operations. Pillar must implement this at API level and map it to ledger command identity. ([Stripe 문서][2])

### Mapping

```text
external Idempotency-Key
  → api_request_logs.idempotency_key
  → idempotency_records.request_hash
  → Canton command_id
  → Ledger command deduplication
```

Canton Ledger API uses application-level IDs such as command ID, workflow ID, and submission ID; command deduplication is based on change identity and is guaranteed when commands are submitted to the same participant node. ([Digital Asset][13])

### Required invariant

```text
same tenant + same operation + same Idempotency-Key
= same request hash
= same command_id
= same observable API result
```

If the same idempotency key is reused with a different request body, Pillar returns:

```json
{
  "error": {
    "type": "idempotency_error",
    "code": "idempotency_key_reused_with_different_payload",
    "message": "This Idempotency-Key was already used with a different request payload."
  }
}
```

---

## 3. DecisionFacts Construction

`DecisionFacts` is the canonical input to policy evaluation.

```json
{
  "subject": {
    "type": "transfer_intent",
    "id": "trint_..."
  },
  "account": {
    "id": "acct_...",
    "capabilities": {
      "asset_transfer": "active"
    },
    "risk_tier": "standard",
    "jurisdiction": "KR"
  },
  "counterparty": {
    "id": "acct_...",
    "capabilities": {
      "asset_receive": "active"
    },
    "jurisdiction": "SG"
  },
  "asset": {
    "id": "asset_usdc_001",
    "class": "stablecoin",
    "issuer": "iss_...",
    "transferable": true
  },
  "holding": {
    "id": "hold_...",
    "available_minor": "1000000000",
    "frozen_minor": "0",
    "claimed_minor": "0"
  },
  "velocity": {
    "calendar_day_used_minor": "500000000",
    "calendar_day_limit_minor": "1000000000"
  },
  "lists": {
    "blocklist_matches": [],
    "allowlist_matches": ["trusted_counterparty"]
  },
  "jurisdiction": {
    "corridor": "KR->SG"
  }
}
```

The canonical JSON is hashed.

```text
facts_hash = SHA-256(canonical_json(DecisionFacts))
```

---

## 4. Policy Evaluation Order

Recommended deterministic order:

```text
1. system kill-switch
2. active freeze
3. party blocklist
4. asset blocklist
5. account capability
6. holding availability
7. claim/dispute lock
8. jurisdiction policy
9. asset transfer policy
10. velocity policy
11. risk score
12. approval policy
13. allowlist friction reduction
14. final outcome
```

Block controls run before risk scoring. Allowlist runs late and cannot bypass hard blocks.

---

## 5. Canton-native Command Flow

Canton Ledger API’s shape is commands into the ledger and updates/events out of the ledger. Pillar’s runtime therefore separates `CommandSubmitter` and `UpdateConsumer`. ([Digital Asset][13])

### Command submitter

Responsibilities:

* build Daml command
* set `workflow_id`
* set deterministic `command_id`
* submit through gRPC Ledger API
* store command audit
* handle completion
* correlate update ID

### Update consumer

Responsibilities:

* consume ledger updates
* decode Daml events
* update projections
* emit internal domain events
* enqueue webhooks
* advance offset

### Query path

For fast read access, Pillar uses projection/PQS. Canton’s example architecture separates queries through PQS and commands through Ledger API gRPC; this is directly aligned with Pillar’s read/write split. ([Digital Asset][15])

---

## 6. JSON Ledger API and Internal Exposure

Canton’s JSON Ledger API v2 is an HTTP/JSON alternative to gRPC and requires JWT; documentation also warns it should not be exposed directly to the internet. Pillar should keep Ledger API access strictly internal and prefer gRPC for core runtime. ([Digital Asset][19])

Allowed usage:

```text
internal sandbox tools
developer diagnostics
controlled CLI in non-production
Workbench internal proxy
```

Disallowed usage:

```text
external customer direct Ledger API access
browser-to-Canton calls
public JSON Ledger API endpoint
```

---

## 7. SDK / CLI / Sandbox

Stripe CLI supports listening to and forwarding webhook events to local endpoints, including filtering event types. Pillar CLI should provide the same developer loop for Canton-backed events. ([Stripe 문서][20])

### Pillar CLI commands

```bash
pillar login
pillar sandbox create
pillar listen --forward-to localhost:4242/webhooks
pillar trigger transfer_intent.succeeded
pillar policy simulate --file transfer.json --policy pver_candidate
pillar policy diff pver_active pver_candidate
pillar disputes create-fixture unauthorized_transfer
pillar exports create --period 2026-05
```

Canton sandbox is a local Canton ledger setup with Daml code, typically a participant node and synchronizer, configurable via command line. Pillar sandbox wraps this behind a Stripe-like developer experience. ([Digital Asset][21])

Daml/DPM builds DAR files that are uploaded to Canton. Pillar build pipeline should produce versioned DARs for policy-related templates and verify dependency hashes. ([Digital Asset][22])

---

# DB Schema

All tables include:

```text
tenant_id
livemode
created_at
updated_at
```

Audit tables are append-only unless explicitly marked.

---

## 1. Config Tables

```sql
policy_sets (
  id,
  tenant_id,
  name,
  status,
  created_at,
  updated_at
);

policy_versions (
  id,
  tenant_id,
  policy_set_id,
  version,
  status,
  effective_from,
  effective_to,
  bundle_json,
  bundle_hash,
  signature,
  risk_model_version,
  created_by,
  approved_by_json,
  activated_by,
  activated_at,
  created_at,
  updated_at
);

policy_rules (
  id,
  tenant_id,
  policy_version_id,
  kind,
  priority,
  expression_json,
  action,
  severity,
  reason_code,
  created_at
);

capability_policy_configs (
  id,
  tenant_id,
  policy_version_id,
  capability,
  requirements_json,
  created_at
);

jurisdiction_policy_configs (
  id,
  tenant_id,
  policy_version_id,
  asset_scope_json,
  from_jurisdiction,
  to_jurisdiction,
  action,
  reason_code,
  created_at
);

velocity_limit_configs (
  id,
  tenant_id,
  policy_version_id,
  scope,
  window_type,
  window_size,
  asset,
  amount_minor,
  action,
  reason_code,
  created_at
);

approval_policy_configs (
  id,
  tenant_id,
  policy_version_id,
  threshold_json,
  quorum_json,
  separation_of_duties_json,
  escalation_json,
  created_at
);

party_lists (
  id,
  tenant_id,
  name,
  list_type,
  value_type,
  default_action,
  active_version_id,
  created_at,
  updated_at
);

party_list_versions (
  id,
  tenant_id,
  list_id,
  version,
  status,
  hash,
  created_by,
  activated_by,
  created_at,
  activated_at
);

party_list_entries (
  id,
  tenant_id,
  list_version_id,
  value_hash,
  value_ciphertext,
  reason_code,
  source,
  expires_at,
  created_at
);

risk_model_configs (
  id,
  tenant_id,
  model_version,
  thresholds_json,
  feature_flags_json,
  status,
  created_at,
  updated_at
);

webhook_endpoints (
  id,
  tenant_id,
  url_ciphertext,
  enabled_events_json,
  api_version,
  secret_ref,
  status,
  created_at,
  updated_at
);
```

---

## 2. Projection Tables

Projection tables are derived from Canton Ledger updates.

```sql
accounts_projection (
  id,
  tenant_id,
  external_account_id,
  party_alias,
  status,
  jurisdiction,
  risk_tier,
  ledger_updated_at,
  ledger_offset,
  updated_at
);

account_capabilities_projection (
  id,
  tenant_id,
  account_id,
  capability,
  status,
  requirements_json,
  ledger_updated_at,
  ledger_offset,
  updated_at
);

assets_projection (
  id,
  tenant_id,
  asset_id,
  issuer_id,
  asset_class,
  status,
  decimals,
  transferable,
  ledger_updated_at,
  ledger_offset,
  updated_at
);

holdings_projection (
  id,
  tenant_id,
  holding_id,
  account_id,
  asset_id,
  total_minor,
  available_minor,
  frozen_minor,
  claimed_minor,
  disputed_minor,
  ledger_updated_at,
  ledger_offset,
  updated_at
);

balances_projection (
  id,
  tenant_id,
  account_id,
  asset_id,
  available_minor,
  pending_minor,
  frozen_minor,
  ledger_updated_at,
  ledger_offset,
  updated_at
);

transfer_intents_projection (
  id,
  tenant_id,
  transfer_intent_id,
  status,
  asset_id,
  source_holding_id,
  destination_account_id,
  amount_minor,
  policy_decision_id,
  risk_assessment_id,
  approval_request_id,
  ledger_workflow_id,
  ledger_update_id,
  ledger_offset,
  updated_at
);

freezes_projection (
  id,
  tenant_id,
  freeze_id,
  status,
  scope_type,
  scope_id,
  reason_code,
  effective_from,
  expires_at,
  ledger_offset,
  updated_at
);

claims_projection (
  id,
  tenant_id,
  claim_id,
  status,
  scope_type,
  scope_id,
  amount_minor,
  related_freeze_id,
  ledger_offset,
  updated_at
);

disputes_projection (
  id,
  tenant_id,
  dispute_id,
  status,
  transfer_intent_id,
  amount_minor,
  related_freeze_id,
  evidence_due_by,
  ledger_offset,
  updated_at
);

approval_requests_projection (
  id,
  tenant_id,
  approval_request_id,
  status,
  subject_type,
  subject_id,
  required_json,
  approvals_json,
  expires_at,
  ledger_offset,
  updated_at
);

ledger_offsets (
  id,
  tenant_id,
  consumer_name,
  participant_ref,
  last_offset,
  updated_at
);
```

---

## 3. Audit Tables

```sql
api_request_logs (
  id,
  tenant_id,
  request_id,
  idempotency_key,
  method,
  path,
  api_version,
  actor_id,
  status_code,
  request_hash,
  response_hash,
  created_at
);

idempotency_records (
  id,
  tenant_id,
  actor_scope,
  idempotency_key,
  request_hash,
  response_hash,
  status,
  expires_at,
  created_at,
  updated_at
);

policy_decisions (
  id,
  tenant_id,
  decision_id,
  subject_type,
  subject_id,
  intent_id,
  policy_version_id,
  policy_hash,
  facts_hash,
  outcome,
  action,
  reason_code,
  decision_json,
  ledger_workflow_id,
  ledger_command_id,
  ledger_update_id,
  ledger_offset,
  created_at
);

risk_assessments (
  id,
  tenant_id,
  risk_id,
  subject_type,
  subject_id,
  score,
  level,
  model_version,
  features_hash,
  explanation_json,
  action,
  created_at
);

ledger_command_audit (
  id,
  tenant_id,
  workflow_id,
  command_id,
  submission_id,
  participant_ref,
  status,
  completion_json,
  update_id,
  ledger_offset,
  created_at,
  updated_at
);

approval_audit (
  id,
  tenant_id,
  approval_request_id,
  actor_id,
  action,
  reason_code,
  signature,
  created_at
);

case_evidence_files (
  id,
  tenant_id,
  case_type,
  case_id,
  file_hash,
  storage_ref,
  encryption_key_ref,
  media_type,
  submitted_by,
  submitted_at
);

webhook_events (
  id,
  tenant_id,
  event_id,
  type,
  api_version,
  resource_type,
  resource_id,
  payload_hash,
  status,
  created_at
);

webhook_deliveries (
  id,
  tenant_id,
  event_id,
  endpoint_id,
  attempt,
  status_code,
  response_body_hash,
  delivered_at,
  created_at
);

compliance_exports (
  id,
  tenant_id,
  export_id,
  period_start,
  period_end,
  format,
  status,
  manifest_hash,
  file_ref,
  file_hash,
  signed_by,
  created_at,
  completed_at
);
```

---

# Failure Modes

| Failure mode                              |                           Risk | Required behavior                                                                      |
| ----------------------------------------- | -----------------------------: | -------------------------------------------------------------------------------------- |
| Duplicate API retry                       | Duplicate transfer/freeze/case | API idempotency record + deterministic Canton `command_id`                             |
| Same idempotency key, different body      |               Ambiguous result | Return `idempotency_error`                                                             |
| Command submitted, no completion observed |          Unknown ledger status | Poll completion/update by workflow ID; keep intent `processing`                        |
| Projection lag                            |          Stale balances/status | Return `as_of_offset`; do not treat projection as final truth                          |
| Policy version changes mid-request        |          Inconsistent decision | Pin policy version at decision start                                                   |
| Off-ledger allow, ledger rejects          |        False positive decision | Mark transfer failed; preserve decision and ledger rejection                           |
| Concurrent velocity usage                 |                   Limit bypass | Ledger-side `VelocityWindow.consume`                                                   |
| Freeze races with transfer                |             Ordering ambiguity | Ledger ordering decides; later completed transfer requires claim/dispute/reversal flow |
| Allowlist abuse                           |                 Control bypass | Allowlist cannot bypass hard controls; entries expire and require approval             |
| Risk provider outage                      |                 Bad allow/deny | Configurable fail-open/fail-closed; default fail-closed for high-risk transfer         |
| Webhook endpoint down                     |             Missed async state | Retry, event retrieval API, signed events, delivery logs                               |
| Approval deadlock                         |                   Intent stuck | Expiry, escalation, reassignment, cancel                                               |
| Policy bug activated                      |       Mass false blocks/allows | simulation, shadow, canary activation, rollback, immutable decision audit              |
| Evidence storage unavailable              |                Case incomplete | Case remains `evidence_required`; no destructive ledger action                         |
| PII leakage in exports                    |              Compliance breach | Redaction, encryption, scoped export permissions                                       |
| Participant routing mismatch              |         Dedup guarantee weaker | Route same tenant/operation class to same participant where dedup is required          |

---

# Security / Compliance

## 1. External API Security

Stripe recommends keeping secret API keys server-side, using restricted keys, rotating keys, auditing requests, and avoiding embedding secrets in source code or clients. Pillar should adopt the same posture. ([Stripe 문서][23]) ([Stripe 문서][24])

Required controls:

* secret API keys only server-side
* restricted keys for Workbench/automation
* per-key capability scopes
* key rotation
* request logs
* IP allowlist option
* tenant/account scoping
* live/sandbox isolation

---

## 2. Webhook Security

Stripe documents signature verification using the `Stripe-Signature` header, HMAC-SHA256, endpoint-specific secrets, raw body verification, and replay protection through timestamp tolerance. Pillar should implement the same pattern. ([Stripe 문서][4])

Pillar webhook security:

```text
Pillar-Signature: t=...,v1=...
```

Controls:

* endpoint-specific secret
* HMAC-SHA256 over raw payload
* timestamp tolerance
* replay protection
* IP allowlist option
* event ID idempotency
* retry audit
* disabled endpoint quarantine

---

## 3. Canton Security Boundary

Canton JSON Ledger API should not be exposed to the public internet and requires JWT. Pillar external API, SDK, CLI, and Workbench must go through Pillar backend, never directly to Canton. ([Digital Asset][19])

Controls:

* private network access to Canton
* service-to-service mTLS
* JWT for Ledger API
* participant-level authorization
* no external contract IDs
* no frontend Ledger API calls
* command audit logs

---

## 4. Data Minimization

Party lists, evidence, and jurisdiction facts may include sensitive data.

Required controls:

* HMAC-hashed normalized identifiers
* encrypted raw values only when needed
* key-per-tenant encryption
* export redaction profiles
* retention policies
* evidence file hashing
* access logs for evidence downloads

---

## 5. Separation of Duties

High-risk actions require separation of duties.

Examples:

| Action                    | Required control                   |
| ------------------------- | ---------------------------------- |
| policy version activation | dual approval                      |
| freeze release            | dual control                       |
| claim settlement          | compliance + treasury              |
| dispute resolution        | case owner cannot be sole approver |
| blocklist bulk import     | maker/checker                      |
| export generation         | compliance export permission       |

---

## 6. Break-glass Controls

Emergency controls must be powerful but narrow.

```text
emergency_freeze_platform
emergency_freeze_asset
emergency_policy_disable_transfer
```

Each break-glass action requires:

* explicit reason
* expiry
* dual approval unless impossible
* ledger trace
* audit export inclusion
* post-action review

---

# Implementation Plan

## Phase 1 — Foundation

Deliverables:

* API gateway with `Pillar-Version`
* idempotency layer
* request/response audit
* webhook event model
* sandbox/live environment split
* base OpenAPI spec
* Daml templates:

  * `AccountCapability`
  * `Holding`
  * `TransferIntent`
  * `CompliancePermit`
  * `Freeze`

Success criteria:

* create transfer intent
* confirm allowed transfer
* receive ledger update
* emit webhook
* replay idempotent request safely

---

## Phase 2 — Core Policy Engine

Deliverables:

* deterministic policy evaluator
* `DecisionFacts` canonicalization
* `policy_decision` object
* account capability policy
* asset transfer policy
* party blocklist
* basic jurisdiction policy
* risk score skeleton
* policy decision inspector

Success criteria:

* every confirm produces auditable `policy_decision`
* denied transfer never submits asset movement command
* allowed transfer requires ledger-side permit

---

## Phase 3 — Velocity and Approval

Deliverables:

* velocity limit config
* ledger-side `VelocityWindow`
* approval policy config
* `ApprovalRequest`
* `ApprovalGrant`
* approval Workbench queue
* approval webhooks

Success criteria:

* concurrent transfers cannot exceed limit
* high-risk transfer pauses as `requires_approval`
* approved transfer resumes with ledger trace

---

## Phase 4 — Policy Versioning and Simulation

Deliverables:

* `policy_version` lifecycle
* signed policy manifest
* rule validation
* simulation API
* Workbench Policy Studio
* shadow mode
* active vs candidate diff
* policy rollback

Success criteria:

* candidate policy can be tested against historical decisions
* activation requires approvals
* decisions remain tied to original policy hash

---

## Phase 5 — Freeze / Claim / Dispute

Deliverables:

* freeze API and Workbench
* claim lifecycle
* dispute lifecycle
* evidence upload/hash
* freeze release controls
* claim/dispute resolution ledger choices
* case webhooks

Success criteria:

* frozen holding cannot transfer
* claim can encumber partial amount
* dispute can collect evidence and resolve via ledger-traced action

---

## Phase 6 — Enterprise Compliance Export

Deliverables:

* export API
* export manifest
* signed file bundle
* CSV/JSONL/Parquet support
* evidence hash inclusion
* webhook delivery inclusion
* ledger trace inclusion

Success criteria:

* customer can export complete audit package for a period
* exported decisions can be verified against policy hash and facts hash

---

## Phase 7 — SDK / CLI / Sandbox

Deliverables:

* Node SDK
* Python SDK
* CLI:

  * `pillar listen`
  * `pillar trigger`
  * `pillar policy simulate`
  * `pillar sandbox create`
* sandbox fixtures
* local webhook forwarding
* test Canton topology

Success criteria:

* developer can test policy, transfer, dispute, webhook locally without seeing Canton internals

---

# Open Questions

## 1. Policy DSL choice

Options:

| Option           | Pros                     | Cons                                       |
| ---------------- | ------------------------ | ------------------------------------------ |
| Custom typed DSL | strongest API/domain fit | more implementation work                   |
| OPA/Rego         | mature policy language   | harder to make Stripe-like/domain-specific |
| Cedar            | authorization-oriented   | less natural for financial velocity/risk   |
| JSON rules       | easy to serialize        | weak expressiveness                        |

Recommended: **custom typed DSL compiled to canonical JSON AST**.

Reason: Pillar needs deterministic hashing, versioning, simulation, explainability, and domain-specific primitives such as `holding.available_minor`, `jurisdiction.corridor`, `velocity.consume`, `freeze.scope`.

---

## 2. How much policy should live on-ledger?

Recommended split:

| On-ledger                   | Off-ledger             |
| --------------------------- | ---------------------- |
| hard enforceable state      | full rule text         |
| capability active state     | risk model features    |
| freeze/claim/dispute status | explainability details |
| permit/approval grant       | simulation history     |
| velocity consumption        | Workbench drafts       |
| policy version hash         | policy source bundle   |

---

## 3. Should every policy decision be anchored on ledger?

Recommended: no.

Anchor:

* active policy version hash
* material permits
* approvals
* freezes
* claims
* disputes
* transfer execution

Do not anchor every simulation or denied decision unless a customer requires regulated audit anchoring.

---

## 4. Risk model ownership

Open:

* Pillar-native risk model only?
* Customer-configured model?
* External KYT/sanctions vendors?
* Hybrid?

Recommended: support external provider adapters but normalize results into Pillar `risk_assessment`.

---

## 5. Multi-participant deployment

Canton command deduplication guarantees depend on routing commands consistently where required. The deployment strategy must define:

* tenant-to-participant routing
* failover behavior
* command ID stability
* replay handling
* participant migration plan

---

## 6. Freeze authority model

Possible authorities:

```text
platform
issuer
custodian
regulator
court_order
customer_admin
```

This affects Daml signatories/controllers and Workbench approval flows.

---

## 7. Evidence retention

Need per-customer and per-jurisdiction policy for:

* evidence file retention
* dispute export retention
* PII deletion
* hash persistence
* legal hold

---

# Agent-ready Checklist

## API

* [ ] Define object prefixes: `pdec_`, `risk_`, `frz_`, `clm_`, `disp_`, `pver_`, `psim_`, `cexp_`.
* [ ] Write OpenAPI spec for policy, risk, approval, freeze, claim, dispute, export endpoints.
* [ ] Add `Pillar-Version` request header.
* [ ] Add event-level `api_version`.
* [ ] Implement Stripe-like error objects.
* [ ] Implement idempotency for all mutation endpoints.
* [ ] Implement event retrieval API: `GET /v1/events/{id}`.

## Policy Engine

* [ ] Define `DecisionFacts` canonical schema.
* [ ] Implement canonical JSON hashing.
* [ ] Implement deterministic evaluator.
* [ ] Implement check-level result model.
* [ ] Implement account capability policy.
* [ ] Implement asset transfer policy.
* [ ] Implement jurisdiction policy.
* [ ] Implement velocity policy.
* [ ] Implement party allowlist/blocklist.
* [ ] Implement risk score object.
* [ ] Implement approval policy.
* [ ] Implement policy simulation.
* [ ] Implement policy version lifecycle.
* [ ] Implement signed policy manifest.

## Canton / Daml

* [ ] Model `AccountCapability`.
* [ ] Model `Holding`.
* [ ] Model `TransferIntent`.
* [ ] Model `CompliancePermit`.
* [ ] Model `ApprovalRequest`.
* [ ] Model `ApprovalGrant`.
* [ ] Model `VelocityWindow`.
* [ ] Model `Freeze`.
* [ ] Model `Claim`.
* [ ] Model `Dispute`.
* [ ] Model `EvidenceAnchor`.
* [ ] Model optional `PolicyVersionAttestation`.
* [ ] Add transfer choice checks for permit, approval, freeze, claim, velocity, capability.
* [ ] Map external idempotency key to Canton `command_id`.
* [ ] Map external intent ID to Canton `workflow_id`.

## Projection / Audit / Config DB

* [ ] Create config tables for policies, rules, lists, limits, approval configs.
* [ ] Create projection tables for accounts, capabilities, holdings, balances, freezes, claims, disputes.
* [ ] Create audit tables for decisions, risk assessments, commands, webhooks, exports.
* [ ] Add append-only audit constraints.
* [ ] Add ledger offset tracking.
* [ ] Add export manifest hashing.
* [ ] Add evidence file hash storage.

## Workbench

* [ ] Build Policy Studio.
* [ ] Build Decision Inspector.
* [ ] Build Simulation Runner.
* [ ] Build Approval Queue.
* [ ] Build Risk Console.
* [ ] Build Party List Manager.
* [ ] Build Freeze Console.
* [ ] Build Claim Console.
* [ ] Build Dispute Console.
* [ ] Build Export Center.
* [ ] Build Webhook Monitor.
* [ ] Build API Explorer.
* [ ] Build Sandbox fixture launcher.

## Webhooks

* [ ] Implement thin event payloads.
* [ ] Implement webhook signatures.
* [ ] Implement timestamp replay protection.
* [ ] Implement delivery retries.
* [ ] Implement endpoint disable/quarantine.
* [ ] Implement event idempotency.
* [ ] Implement local CLI forwarding.
* [ ] Implement delivery logs in Workbench.

## Security / Compliance

* [ ] Implement restricted API keys.
* [ ] Implement least-privilege Workbench roles.
* [ ] Implement maker/checker approvals.
* [ ] Encrypt list values and evidence refs.
* [ ] Hash normalized party identifiers.
* [ ] Add export redaction profiles.
* [ ] Add break-glass freeze with expiry.
* [ ] Keep Canton APIs private.
* [ ] Add mTLS/JWT for internal ledger access.
* [ ] Add full command audit.

## Sandbox / SDK / CLI

* [ ] Create sandbox Canton topology.
* [ ] Package Daml DAR build into environment bootstrap.
* [ ] Provide Node SDK.
* [ ] Provide Python SDK.
* [ ] Implement `pillar listen`.
* [ ] Implement `pillar trigger`.
* [ ] Implement `pillar policy simulate`.
* [ ] Implement `pillar sandbox create`.
* [ ] Add fixture data for transfers, freezes, claims, disputes.
* [ ] Add webhook replay test suite.

---

## Final Architecture Position

Pillar의 Policy/Risk/Compliance 계층은 다음 한 문장으로 정리된다.

> **Pillar exposes Stripe-grade policy APIs, computes explainable risk/compliance decisions off-ledger, and enforces all material asset controls through Canton-native ledger artifacts.**

이 구조가 `Stripe for Canton-backed assets` 목표에 가장 잘 맞는다. API는 간단하고 예측 가능하며, 운영은 webhook-first이고, 내부는 Canton source-of-truth를 훼손하지 않는다.

[1]: https://docs.stripe.com/api "docs.stripe.com"
[2]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[3]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[4]: https://docs.stripe.com/webhooks "docs.stripe.com"
[5]: https://docs.stripe.com/workbench "docs.stripe.com"
[6]: https://docs.stripe.com/workbench/guides "docs.stripe.com"
[7]: https://docs.stripe.com/connect/account-capabilities "docs.stripe.com"
[8]: https://docs.stripe.com/api/transfers "docs.stripe.com"
[9]: https://docs.stripe.com/radar/risk-evaluation "docs.stripe.com"
[10]: https://docs.stripe.com/radar/lists "docs.stripe.com"
[11]: https://docs.stripe.com/disputes/api?utm_source=chatgpt.com "Use the API to respond to disputes"
[12]: https://docs.stripe.com/reports/api "docs.stripe.com"
[13]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[14]: https://docs.digitalasset.com/build/3.5/tutorials/smart-contracts/contracts.html "Basic contracts — Digital Asset’s platform documentation"
[15]: https://docs.digitalasset.com/build/3.5/quickstart/configure/project-structure-overview.html "Canton Network quickstart project structure — Digital Asset’s platform documentation"
[16]: https://docs.stripe.com/upgrades "docs.stripe.com"
[17]: https://docs.stripe.com/sandboxes "docs.stripe.com"
[18]: https://docs.stripe.com/webhooks/migrate-snapshot-to-thin-events "docs.stripe.com"
[19]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html "JSON Ledger API Service V2 — Digital Asset’s platform documentation"
[20]: https://docs.stripe.com/cli "docs.stripe.com"
[21]: https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html "Sandbox — Digital Asset’s platform documentation"
[22]: https://docs.digitalasset.com/build/3.5/sdlc-howtos/smart-contracts/build/how-to-build-dar-files.html "How to build Daml Archive (.dar) files — Digital Asset’s platform documentation"
[23]: https://docs.stripe.com/keys-best-practices?utm_source=chatgpt.com "Best practices for managing secret API keys"
[24]: https://docs.stripe.com/keys?utm_source=chatgpt.com "API keys | Stripe Documentation"
