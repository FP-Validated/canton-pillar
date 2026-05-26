# 8. Daml Template Library — Pillar Standard v1.0

## Executive Summary

Pillar의 표준 Daml Template Library는 **Canton Ledger를 원장(Source of Truth)** 으로 두고, 외부 API는 **Stripe 수준의 단순한 객체/이벤트/워크플로우 문법**으로 제공하는 구조로 설계한다. 핵심은 다음이다.

**Pillar는 contract-first 플랫폼이 아니다.** 사용자는 `ContractId`, `Party`, `DAR`, `Synchronizer`, `Participant`를 보지 않는다. 사용자는 `account`, `asset`, `balance`, `holding`, `transfer_intent`, `settlement_intent`, `lock`, `redemption_intent`, `reversal`, `claim`, `event`만 본다.

**내부는 Canton-native다.** 모든 상태 전이는 Daml template과 choice로 표현된다. API 요청은 `WorkflowRun`과 각 Intent template으로 번역되고, ledger command completion과 projection stream을 통해 API 객체와 webhook event가 생성된다.

**DB는 권위 저장소가 아니다.** DB는 projection, webhook delivery, API request idempotency, config, audit projection만 저장한다. 잔고와 권리의 최종 진실은 active ledger contract set이다.

**이벤트는 webhook-first다.** Pillar API는 동기 응답에서 “accepted / requires_action / processing”을 반환할 수 있고, 최종 상태는 `*.succeeded`, `*.failed`, `*.canceled` webhook으로 전달한다. 이는 Canton의 비동기 커맨드 처리와 Stripe식 개발자 경험을 결합한다.

---

## 공식 문서 리서치 요약

Stripe 공식 문서 기준으로, idempotency는 retry-safe API의 핵심이다. Stripe는 같은 idempotency key에 대해 최초 요청의 상태 코드와 응답 본문을 저장하고, 같은 key로 재요청하면 같은 결과를 반환한다고 설명한다. Pillar도 API layer idempotency를 1차 방어선으로, Canton command deduplication을 2차 방어선으로 사용한다. ([Stripe Docs][1])

Stripe webhook 문서는 이벤트 전달 순서가 보장되지 않으며, 중복 이벤트 처리를 위해 event ID 또는 event type/object ID 조합을 기록하라고 설명한다. Pillar webhook도 **ordered event stream이 아니라 object-state notification**으로 설계한다. 즉, 클라이언트는 event를 받은 뒤 해당 object를 fetch하여 최신 상태를 확인한다. ([Stripe Docs][2])

Stripe API versioning은 계정 또는 webhook endpoint의 API version, Workbench를 통한 업그레이드 테스트/롤백, SDK의 version pinning을 전제로 한다. Pillar도 `Pillar-Version` header, webhook endpoint별 event schema version, Workbench 기반 upgrade preview를 제공한다. ([Stripe Docs][3])

Stripe v2 공식 문서는 v1/v2 모두 JSON API이며, v2는 SDK/CLI 지원, Sandboxes, thin events, 개선된 idempotency를 제공한다고 설명한다. Pillar는 v1부터 thin-event-first 전략을 채택한다. 이벤트 payload에는 최소 정보와 관련 object reference를 넣고, 상세 상태는 object retrieval API로 확인하게 한다. ([Stripe Docs][4])

Stripe SDK/CLI/Sandbox 문서는 공식 SDK, CLI 기반 local webhook forwarding, sandbox isolation을 개발자 경험의 핵심으로 둔다. Pillar도 Node/Python/Java/Go SDK, `pillar listen`, `pillar trigger`, `pillar logs`, `pillar sandbox`를 1일차 기능으로 설계한다. ([Stripe Docs][5])

Daml 공식 문서 기준으로 template은 fields, `signatory`, `observer`, `choice`, choice controller, optional choice observer 등으로 구성된다. Pillar template library는 이 구조를 그대로 사용하되, 외부 API에서는 Canton 개념을 숨긴다. ([Digital Asset Documentation][6])

Canton Ledger API 문서는 command submission, command completion, deduplication, `command_id`, `submission_id`, `workflow_id`, `deduplicationPeriod`, disclosed contracts 등 비동기 ledger interaction을 제공한다. Pillar runtime은 API request ID와 idempotency key를 ledger command metadata에 연결해 end-to-end traceability를 만든다. ([Digital Asset Documentation][7])

Daml/Canton privacy 문서는 signatory/observer/controller visibility와 transitive disclosure를 명확히 구분한다. Observer를 과도하게 추가하면 counterparty 또는 contract 존재가 노출될 수 있으므로, Pillar는 global observer를 금지하고 object별 최소 visibility를 사용한다. ([Digital Asset Documentation][8])

Canton/Daml package upgrade 문서는 mixed-version rollout, synchronous switch-over, package vetting, symbolic package references, template migration choice, rollback/downgrade strategy를 고려하라고 설명한다. Pillar는 모든 template에 `schemaVersion`, `apiVersion`, `objectId`, `workflowId`, `migrationRef`를 공통 메타데이터로 포함한다. ([Digital Asset Documentation][9])

Daml-LF upgrade 문서는 serializable type 변경이 제한적이며, 특히 backward-compatible 변경에서 optional field 추가가 핵심이라고 설명한다. Pillar는 template v1부터 optional extension fields와 explicit version envelope를 둔다. ([Digital Asset Documentation][10])

Canton contract key 관련 공식 문서는 버전별 상태가 민감하다. 현재 Daml 3.x 문서에는 contract key가 지원되지 않는 릴리스가 있고, Canton 문서는 contract key 기능이 개발 중이거나 특정 버전에 계획되어 있음을 설명한다. Pillar v1은 **contract key에 correctness를 의존하지 않는다**. 외부 object ID uniqueness는 API/DB config layer와 ledger validation template으로 관리한다. ([Digital Asset Documentation][11])

CIP-0056 Canton Network Token Standard는 metadata, holding, peer-to-peer transfer, DvP settlement 등을 표준 API로 제안한다. Pillar의 asset/holding/transfer/settlement 패키지는 이 표준과 호환 가능한 wrapper 또는 adapter 구조를 가져야 한다. ([Canton Network Docs][12])

---

## Goals / Non-goals

### Goals

1. **Stripe-like API grammar**

   * `/v1/accounts`
   * `/v1/assets`
   * `/v1/balances`
   * `/v1/holdings`
   * `/v1/transfer_intents`
   * `/v1/settlement_intents`
   * `/v1/locks`
   * `/v1/redemptions`
   * `/v1/reversals`
   * `/v1/claims`
   * `/v1/events`

2. **Canton-native runtime**

   * 모든 상태 변경은 Daml choice exercise로 수행한다.
   * ledger command completion이 최종 write acknowledgment다.
   * projection DB는 ledger ACS와 transaction stream에서 재구성 가능해야 한다.

3. **Balance/Holding-first design**

   * 사용자는 contract를 보지 않고 balance, available balance, locked balance, pending movement를 본다.
   * 내부적으로는 `Holding` contract와 `HoldingLock` contract가 권리와 제약을 표현한다.

4. **Intent-first workflow**

   * transfer, settlement, redemption, reversal은 transaction이 아니라 intent로 시작한다.
   * intent는 `created → requires_action → processing → succeeded/failed/canceled` 형태의 상태 머신을 가진다.

5. **Webhook-first async**

   * API response는 intent 생성 또는 처리 시작을 반환한다.
   * 최종 상태는 webhook event와 object retrieval로 확인한다.

6. **Ledger traceability**

   * 모든 API request는 `requestId`, `idempotencyKey`, `workflowId`, `commandId`, `submissionId`, `transactionId`, `contractId`로 추적 가능해야 한다.

7. **Deployment abstraction**

   * hosted participant, customer participant, consortium participant, multi-synchronizer 배포 모델이 바뀌어도 API 문법은 바뀌지 않는다.

---

### Non-goals

1. **외부 사용자에게 Canton/Daml 개념 노출 금지**

   * `Party`, `ContractId`, `DAR`, `Participant`, `Synchronizer`, `choice`는 public API의 primary grammar가 아니다.

2. **DB를 balance source of truth로 사용하지 않음**

   * DB balance는 projection cache다.
   * ledger 재생으로 재구성 가능해야 한다.

3. **모든 asset class를 v1에서 지원하지 않음**

   * v1은 fungible Canton-backed asset, claim-based redemption, P2P transfer, atomic settlement에 집중한다.
   * NFT, derivatives, complex corporate action은 extension package로 둔다.

4. **contract key 의존 금지**

   * 현재 및 미래 Canton 버전 간 차이를 고려해 v1 correctness는 contract key에 의존하지 않는다.

5. **global observer 금지**

   * operational convenience를 위해 모든 contract를 operator/auditor에게 무조건 관측시키는 방식은 privacy leak를 만든다.
   * 필요한 template에 필요한 party만 observer로 추가한다.

---

## Architecture

### 1. Logical Architecture

```text
External Client
  │
  │  HTTPS API / SDK / CLI
  ▼
Pillar API Gateway
  - AuthN/AuthZ
  - API version negotiation
  - Idempotency
  - Request validation
  - Stripe-like object grammar
  │
  ▼
Intent Translator
  - API object → Daml command
  - workflowId / commandId / submissionId mapping
  - package version selection
  │
  ▼
Canton Runtime
  - Ledger API gRPC / JSON API
  - Command submission
  - Completion listener
  - ACS / transaction stream
  │
  ▼
Daml Template Library
  - identity
  - account
  - asset
  - holding
  - transfer
  - settlement
  - lock
  - redemption
  - reversal
  - claim
  - workflow
  - audit
  │
  ▼
Projection + Event Runtime
  - Object projections
  - Balance projections
  - Event projection
  - Webhook delivery
  - Audit projection
```

### 2. Source-of-truth Boundaries

| Domain                                         |                             Source of Truth | DB Role                    |
| ---------------------------------------------- | ------------------------------------------: | -------------------------- |
| Identity ledger binding                        |                      Daml `IdentityProfile` | Projection + API lookup    |
| Account status                                 |                              Daml `Account` | Projection                 |
| Asset definition                               |                      Daml `AssetDefinition` | Projection + config cache  |
| Holding ownership                              |                              Daml `Holding` | Projection only            |
| Available balance                              | Active `Holding` minus active `HoldingLock` | Computed projection        |
| Transfer status                                |                       Daml `TransferIntent` | Projection                 |
| Settlement status                              |                     Daml `SettlementIntent` | Projection                 |
| Redemption status                              |                     Daml `RedemptionIntent` | Projection                 |
| Reversal status                                |                       Daml `ReversalIntent` | Projection                 |
| Claim status                                   |                                Daml `Claim` | Projection                 |
| Audit trail                                    |    Daml `AuditRecord` + ledger transactions | Audit projection           |
| Webhook delivery status                        |                                          DB | Operational delivery state |
| API keys / webhook endpoints / package pinning |                                   DB config | Configuration source       |

---

### 3. Ledger Party Model

Pillar는 아래 party roles를 사용한다.

| Party Role        | 의미                                                                            |
| ----------------- | ----------------------------------------------------------------------------- |
| `operator`        | Pillar platform operator party. Workflow, audit, routing, orchestration 권한 보유 |
| `tenant`          | API 고객, issuer, fintech, exchange, bank 등 tenant-level party                  |
| `issuer`          | 특정 asset을 발행/소각/정책관리하는 party                                                  |
| `accountOwner`    | account의 실질 권리자 또는 hosted customer party                                      |
| `custodian`       | hosted asset custody 또는 account custody party                                 |
| `compliance`      | compliance approval/hold/release 권한 party                                     |
| `settlementAgent` | DvP/PvP settlement 조정 party                                                   |
| `auditor`         | 제한적 audit visibility를 받는 party                                                |
| `claimAuthority`  | claim 생성/집행 권한 party                                                          |

**원칙:** `operator`는 모든 contract의 signatory가 아니다. 운영상 필요한 template에만 signatory 또는 observer가 된다. Global observation은 금지한다.

---

### 4. Common Metadata Envelope

모든 template은 아래 공통 field를 가진다.

```text
PillarMeta
- objectId: Text              -- Stripe-like object ID: acct_, asset_, hld_, trn_, stl_ ...
- tenantId: Text
- apiVersion: Text            -- e.g. 2026-05-26
- schemaVersion: Text         -- Daml template schema version
- workflowId: Text
- requestId: Optional Text
- idempotencyKeyHash: Optional Text
- correlationId: Optional Text
- livemode: Bool
- createdAt: Time
- updatedAt: Time
- createdBy: Party
- metadata: Map Text Text     -- PII-free, bounded
- externalRef: Optional Text
- migrationRef: Optional Text
```

**PII rule:** ledger에는 이름, 주소, 이메일, 주민번호, 법인등록번호 같은 직접 식별자를 기본 저장하지 않는다. 필요한 경우 hash, tokenized reference, encrypted external reference만 저장한다.

---

### 5. Package Map

| Package      | Primary Template   | API Object              |
| ------------ | ------------------ | ----------------------- |
| `identity`   | `IdentityProfile`  | `identity`              |
| `account`    | `Account`          | `account`               |
| `asset`      | `AssetDefinition`  | `asset`                 |
| `holding`    | `Holding`          | `holding`, `balance`    |
| `transfer`   | `TransferIntent`   | `transfer_intent`       |
| `settlement` | `SettlementIntent` | `settlement_intent`     |
| `lock`       | `HoldingLock`      | `lock`                  |
| `redemption` | `RedemptionIntent` | `redemption_intent`     |
| `reversal`   | `ReversalIntent`   | `reversal`              |
| `claim`      | `Claim`            | `claim`                 |
| `workflow`   | `WorkflowRun`      | `workflow_run`          |
| `audit`      | `AuditRecord`      | `audit_record`, `event` |

---

## Daml Template Library

## 1. `identity` Package

### Template: `IdentityProfile`

| 항목                 | 정의                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template 목적        | External customer, institution, issuer, operator user, compliance actor를 ledger-visible identity로 표현한다. API의 `identity` 객체와 Canton party binding을 연결한다.                          |
| Signatories        | `tenant`, `operator`. Self-custody 또는 direct participant model에서는 `identityParty`도 signatory 가능.                                                                                 |
| Observers          | `identityParty`, `compliance`, 필요 시 `auditor`. Counterparty는 observer가 아니다.                                                                                                      |
| Choices            | `VerifyIdentity`, `UpdateRiskRating`, `SuspendIdentity`, `ReactivateIdentity`, `RotatePartyBinding`, `ArchiveIdentity`.                                                          |
| Contract lifecycle | `created → pending_verification → verified → active → suspended/reactivated → archived`.                                                                                         |
| API object mapping | `identity.id = idn_*`; `identity.status`; `identity.party_binding_status`; `identity.kyc.status`; `identity.capabilities`; `identity.metadata`.                                  |
| Event mapping      | `identity.created`, `identity.verified`, `identity.updated`, `identity.suspended`, `identity.reactivated`, `identity.archived`.                                                  |
| Upgrade/versioning | `riskRating`, `verificationProvider`, `partyBinding`은 optional extension field로 추가한다. Party rotation은 기존 identity를 archive하지 않고 `RotatePartyBinding`으로 새 binding reference를 남긴다. |
| Privacy/visibility | PII는 ledger에 저장하지 않는다. KYC result는 coarse status만 저장한다. Evidence document는 encrypted off-ledger reference 또는 hash만 둔다.                                                           |

#### Notes

`IdentityProfile`은 API user의 “KYC identity”와 ledger party를 연결하지만, public API는 Canton party를 노출하지 않는다.

---

## 2. `account` Package

### Template: `Account`

| 항목                 | 정의                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template 목적        | Stripe `account`와 유사한 Pillar account/wallet/container를 표현한다. Holding의 owner account, capabilities, compliance status, custody model을 정의한다.                                             |
| Signatories        | `tenant`, `custodian` 또는 `operator`. Self-custody account는 `accountOwner`도 signatory.                                                                                                  |
| Observers          | `accountOwner`, `compliance`, 필요 시 `auditor`.                                                                                                                                          |
| Choices            | `ActivateAccount`, `RestrictAccount`, `UpdateCapabilities`, `LinkIdentity`, `CloseAccount`, `ReopenAccount`.                                                                           |
| Contract lifecycle | `created → pending_verification → active → restricted → closed`; restricted 상태에서는 transfer/redemption 생성이 제한된다.                                                                        |
| API object mapping | `account.id = acct_*`; `account.status`; `account.capabilities.transfers`; `account.capabilities.redemptions`; `account.identity`; `account.default_asset_policy`; `account.livemode`. |
| Event mapping      | `account.created`, `account.activated`, `account.updated`, `account.restricted`, `account.closed`, `account.reopened`.                                                                 |
| Upgrade/versioning | Capability는 enum 고정 대신 extensible map으로 둔다. 신규 capability는 optional field 또는 map entry로 추가한다.                                                                                          |
| Privacy/visibility | Account counterparty는 account contract observer가 아니다. Transfer/settlement 시 필요한 최소 정보만 intent template에서 별도 공개한다.                                                                      |

#### Notes

Account는 balance의 API root다.

```text
GET /v1/accounts/acct_123/balances
```

는 DB balance table을 읽지만, 그 table은 `Holding`과 `HoldingLock` projection에서 계산된다.

---

## 3. `asset` Package

### Template: `AssetDefinition`

| 항목                 | 정의                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template 목적        | Canton-backed asset의 canonical definition. Issuer, symbol, precision, transfer policy, redemption policy, legal terms reference를 표현한다.                   |
| Signatories        | `issuer`, `assetRegistry` 또는 `operator`.                                                                                                                 |
| Observers          | `tenant`, eligible `custodian`, `compliance`, 필요 시 `auditor`.                                                                                            |
| Choices            | `ActivateAsset`, `PauseAsset`, `ResumeAsset`, `UpdateTransferPolicy`, `UpdateRedemptionPolicy`, `IssueHolding`, `RetireAsset`.                           |
| Contract lifecycle | `draft → active → paused/resumed → retired`. Retired asset은 신규 발행/전송 불가, 기존 redemption 또는 migration만 허용.                                                 |
| API object mapping | `asset.id = asset_*`; `asset.code`; `asset.type`; `asset.precision`; `asset.issuer`; `asset.status`; `asset.transfer_policy`; `asset.redemption_policy`. |
| Event mapping      | `asset.created`, `asset.activated`, `asset.paused`, `asset.resumed`, `asset.policy.updated`, `asset.retired`.                                            |
| Upgrade/versioning | `policyVersion`을 별도 둔다. Asset template schema version과 asset policy version을 분리한다.                                                                       |
| Privacy/visibility | Asset metadata는 상대적으로 공개 가능하나 issuer policy, compliance rule, allowlist는 필요 party에만 공개한다. Public display metadata는 API projection에서 제공한다.                |

#### Notes

CIP-0056 token standard와 호환하려면 `AssetDefinition`은 token metadata interface 또는 adapter를 제공해야 한다. Pillar-native asset은 Canton Network token standard를 직접 구현하거나 wrapper로 연동할 수 있다.

---

## 4. `holding` Package

### Template: `Holding`

| 항목                 | 정의                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template 목적        | Ledger-native balance unit. Account가 보유한 asset quantity를 표현한다. API는 holding보다 balance를 우선 보여주지만, holding은 잔고의 원장 단위다.                                                                                      |
| Signatories        | `issuer` 또는 `assetRegistry`. Custody model에 따라 `custodian` 추가 가능.                                                                                                                                          |
| Observers          | `ownerParty`, `tenant`, 필요한 `compliance`.                                                                                                                                                                  |
| Choices            | `SplitHolding`, `MergeHoldings`, `TransferOut`, `LockHolding`, `BurnHolding`, `AnnotateHolding`, `ArchiveDustHolding`.                                                                                     |
| Contract lifecycle | `created → active → split/merged/transferred/locked/burned → archived`. Split/merge/transfer는 기존 holding을 archive하고 새 holding을 생성한다.                                                                       |
| API object mapping | `holding.id = hld_*`; `holding.asset`; `holding.account`; `holding.quantity`; `holding.status`; `holding.available_quantity`; `holding.locked_quantity`. `balance`는 holding projection의 aggregate object다. |
| Event mapping      | `holding.created`, `holding.updated`, `holding.split`, `holding.merged`, `holding.transferred`, `holding.locked`, `holding.burned`, `balance.available`, `balance.updated`.                                |
| Upgrade/versioning | Quantity type과 precision은 immutable. 새 quantity semantics가 필요하면 new asset policy 또는 template version migration을 사용한다.                                                                                      |
| Privacy/visibility | Owner는 observer로 보유 사실을 본다. Counterparty는 settlement/transfer intent에서 필요한 범위만 본다. Auditor에게 모든 holding을 공개하지 않는다.                                                                                         |

#### Notes

`Holding`은 Pillar의 가장 중요한 contract다. 모든 balance는 다음으로 계산한다.

```text
total_balance     = sum(active Holding.quantity)
locked_balance    = sum(active HoldingLock.quantity)
available_balance = total_balance - locked_balance - pending_out
```

DB balance는 cache다. Ledger ACS가 source of truth다.

---

## 5. `transfer` Package

### Template: `TransferIntent`

| 항목                 | 정의                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Template 목적        | Account A에서 Account B로 asset을 이동하려는 API-level intent. Direct transaction이 아니라 상태 머신이다.                                                                                         |
| Signatories        | `senderParty`, `operator` 또는 `custodian`. Regulated asset에서는 `issuer` 또는 `compliance` approval party가 추가될 수 있다.                                                                |
| Observers          | `recipientParty`, `tenant`, `issuer`, 필요한 `compliance`.                                                                                                                        |
| Choices            | `AuthorizeTransfer`, `ApproveCompliance`, `AttachSourceHoldings`, `ExecuteTransfer`, `CancelTransfer`, `ExpireTransfer`, `FailTransfer`.                                       |
| Contract lifecycle | `created → requires_action → authorized → processing → succeeded`; 또는 `created → canceled/expired/failed`.                                                                     |
| API object mapping | `transfer_intent.id = trn_*`; `amount`; `asset`; `source_account`; `destination_account`; `status`; `next_action`; `failure_code`; `ledger_trace`.                             |
| Event mapping      | `transfer_intent.created`, `transfer_intent.requires_action`, `transfer_intent.processing`, `transfer_intent.succeeded`, `transfer_intent.failed`, `transfer_intent.canceled`. |
| Upgrade/versioning | Transfer policy version을 intent 생성 시 snapshot한다. 나중에 asset policy가 바뀌어도 기존 intent의 validation 기준은 명확해야 한다.                                                                     |
| Privacy/visibility | Sender와 recipient는 서로 필요한 최소 정보만 본다. Source holding list는 recipient에게 공개하지 않는다. Recipient에게는 amount, asset, sender display reference 정도만 공개한다.                                 |

#### Notes

Transfer execution은 `Holding.TransferOut` 또는 equivalent consuming choice를 호출하여 source holding을 archive하고 destination holding을 생성한다.

---

## 6. `settlement` Package

### Template: `SettlementIntent`

| 항목                 | 정의                                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template 목적        | Multi-leg DvP/PvP/asset-for-asset settlement를 atomic workflow로 표현한다.                                                                                                                                                  |
| Signatories        | `operator`, `settlementAgent`, 각 leg의 required authorizer.                                                                                                                                                            |
| Observers          | 각 leg participant, relevant issuer, compliance, 필요 시 auditor.                                                                                                                                                         |
| Choices            | `AddSettlementLeg`, `AuthorizeLeg`, `LockLeg`, `ReleaseLeg`, `SettleAtomically`, `CancelSettlement`, `ExpireSettlement`, `FailSettlement`.                                                                            |
| Contract lifecycle | `created → collecting_authorizations → locked → processing → succeeded`; 또는 `canceled/expired/failed`.                                                                                                                |
| API object mapping | `settlement_intent.id = stl_*`; `legs[]`; `status`; `settlement_mode`; `locks[]`; `failure_code`; `ledger_trace`.                                                                                                     |
| Event mapping      | `settlement_intent.created`, `settlement_intent.leg_authorized`, `settlement_intent.locked`, `settlement_intent.processing`, `settlement_intent.succeeded`, `settlement_intent.failed`, `settlement_intent.canceled`. |
| Upgrade/versioning | Settlement leg schema는 extensible variant로 둔다. `cash_leg`, `asset_leg`, `claim_leg`, `external_payment_leg`를 versioned union으로 관리한다.                                                                                  |
| Privacy/visibility | 각 participant는 본인 leg와 settlement-level status만 본다. 모든 leg detail을 모든 participant에게 공개하지 않는다. Atomic execution에 필요한 disclosed contract만 사용한다.                                                                         |

#### Notes

Settlement는 Pillar가 “Stripe for Canton-backed assets”가 되기 위한 핵심이다. Stripe의 PaymentIntent와 유사하게, `SettlementIntent`는 완료 전까지 여러 action과 authorization을 요구할 수 있다.

---

## 7. `lock` Package

### Template: `HoldingLock`

| 항목                 | 정의                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Template 목적        | Holding의 일부 또는 전부를 reservation, compliance hold, lien, settlement escrow, pending redemption 용도로 잠근다.                          |
| Signatories        | `lockAuthority`, `operator` 또는 `compliance`. Settlement lock은 `settlementAgent` 포함.                                            |
| Observers          | `ownerParty`, `issuer`, `tenant`, 필요한 auditor.                                                                                 |
| Choices            | `ConfirmLock`, `ReleaseLock`, `ConsumeLockForTransfer`, `ConsumeLockForSettlement`, `ExtendLock`, `ExpireLock`, `AttachClaim`. |
| Contract lifecycle | `created → active → consumed/released/expired`.                                                                                |
| API object mapping | `lock.id = lock_*`; `asset`; `account`; `quantity`; `reason`; `status`; `expires_at`; `related_object`; `claim`.               |
| Event mapping      | `lock.created`, `lock.active`, `lock.released`, `lock.consumed`, `lock.expired`, `balance.updated`.                            |
| Upgrade/versioning | Lock reason은 string enum 대신 versioned code registry를 사용한다. 신규 reason 추가가 schema migration을 요구하지 않도록 한다.                        |
| Privacy/visibility | Lock reason은 민감할 수 있다. API에는 coarse reason만 노출하고, detailed legal/compliance reference는 authorized party만 본다.                   |

#### Notes

`HoldingLock`은 DB reservation이 아니다. Ledger contract다. 이 원칙이 깨지면 double-spend, stale balance, off-ledger reconciliation 문제가 생긴다.

---

## 8. `redemption` Package

### Template: `RedemptionIntent`

| 항목                 | 정의                                                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template 목적        | Holder가 asset을 issuer 또는 redemption agent에게 상환/소각/출금 요청하는 workflow.                                                                                                                                                              |
| Signatories        | `ownerParty`, `issuer`, `operator` 또는 `redemptionAgent`.                                                                                                                                                                         |
| Observers          | `custodian`, `compliance`, payout agent, 필요 시 auditor.                                                                                                                                                                           |
| Choices            | `RequestRedemption`, `ApproveRedemption`, `LockRedemptionHoldings`, `ExecuteBurn`, `MarkPayoutInitiated`, `MarkPayoutSettled`, `CancelRedemption`, `FailRedemption`.                                                             |
| Contract lifecycle | `created → requires_approval → locked → burning → payout_pending → succeeded`; 또는 `failed/canceled`.                                                                                                                             |
| API object mapping | `redemption_intent.id = rdm_*`; `asset`; `amount`; `source_account`; `status`; `payout_reference`; `failure_code`; `ledger_trace`.                                                                                               |
| Event mapping      | `redemption_intent.created`, `redemption_intent.requires_action`, `redemption_intent.processing`, `redemption_intent.payout_initiated`, `redemption_intent.succeeded`, `redemption_intent.failed`, `redemption_intent.canceled`. |
| Upgrade/versioning | Off-ledger payout fields는 optional reference로 둔다. Payment rail별 상세 필드는 ledger가 아니라 encrypted config/projection에 둔다.                                                                                                              |
| Privacy/visibility | Bank account, wallet address, personal payout detail은 ledger에 직접 저장하지 않는다. Ledger에는 payout reference hash와 status만 저장한다.                                                                                                         |

#### Notes

Redemption은 asset burn과 off-ledger payout을 동시에 다루므로, ledger finality와 external rail finality를 구분해야 한다.

---

## 9. `reversal` Package

### Template: `ReversalIntent`

| 항목                 | 정의                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template 목적        | 잘못된 transfer, settlement, redemption을 ledger-traceable compensating action으로 되돌리는 workflow. 원장을 삭제하거나 rewrite하지 않는다.                               |
| Signatories        | `operator`, affected `issuer`, 필요한 affected party.                                                                                                 |
| Observers          | original sender/recipient, compliance, auditor.                                                                                                    |
| Choices            | `ProposeReversal`, `ApproveReversal`, `RejectReversal`, `ExecuteCompensatingTransfer`, `AttachEvidence`, `CancelReversal`, `FailReversal`.         |
| Contract lifecycle | `created → pending_approval → approved → processing → succeeded`; 또는 `rejected/canceled/failed`.                                                   |
| API object mapping | `reversal.id = rev_*`; `original_object`; `reason`; `amount`; `status`; `evidence_reference`; `ledger_trace`.                                      |
| Event mapping      | `reversal.created`, `reversal.approved`, `reversal.processing`, `reversal.succeeded`, `reversal.rejected`, `reversal.failed`, `reversal.canceled`. |
| Upgrade/versioning | Reversal reason code와 evidence schema는 versioned registry를 사용한다. Original object snapshot hash를 보존한다.                                              |
| Privacy/visibility | Reversal evidence는 법무/컴플라이언스 민감 정보다. Ledger에는 hash/reference만 저장한다. Affected party에게 필요한 summary만 노출한다.                                            |

#### Notes

Reversal은 rollback이 아니다. 반드시 새 ledger transaction으로 보상 이동을 수행한다.

---

## 10. `claim` Package

### Template: `Claim`

| 항목                 | 정의                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Template 목적        | Holding, account, asset, transfer, settlement에 대한 legal/compliance/operational claim을 표현한다.                                            |
| Signatories        | `claimAuthority`, `operator`. Claimant가 institutional party인 경우 `claimantParty`도 signatory.                                            |
| Observers          | `defendantParty`, affected `issuer`, `compliance`, 필요 시 auditor.                                                                       |
| Choices            | `AcknowledgeClaim`, `DisputeClaim`, `AttachLock`, `ReleaseAttachedLock`, `ResolveClaim`, `EscalateClaim`, `ArchiveClaim`.              |
| Contract lifecycle | `created → acknowledged/disputed → locked/escalated → resolved → archived`.                                                            |
| API object mapping | `claim.id = clm_*`; `claim_type`; `status`; `related_object`; `amount`; `lock`; `resolution`; `evidence_reference`.                    |
| Event mapping      | `claim.created`, `claim.acknowledged`, `claim.disputed`, `claim.lock_attached`, `claim.resolved`, `claim.escalated`, `claim.archived`. |
| Upgrade/versioning | Claim type과 resolution code는 versioned registry로 관리한다. Evidence schema는 externalized한다.                                                |
| Privacy/visibility | Claim은 민감하다. Counterparty 전체에게 claim detail을 공개하지 않고, affected party별 최소 disclosure를 적용한다.                                             |

#### Notes

Claim은 `HoldingLock`과 결합될 수 있다. 예: 법적 분쟁이 발생하면 `Claim.AttachLock`이 특정 account의 available balance를 감소시킨다.

---

## 11. `workflow` Package

### Template: `WorkflowRun`

| 항목                 | 정의                                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template 목적        | API request, intent, ledger command, webhook event를 연결하는 ledger-native saga/orchestration record.                                                                                                                     |
| Signatories        | `operator`. Tenant-operated workflow에서는 `tenant`도 signatory.                                                                                                                                                          |
| Observers          | 관련 account/issuer/compliance party 중 필요한 party만.                                                                                                                                                                      |
| Choices            | `StartStep`, `MarkStepSucceeded`, `MarkStepFailed`, `RetryStep`, `AttachObject`, `CompensateWorkflow`, `CancelWorkflow`, `CompleteWorkflow`.                                                                          |
| Contract lifecycle | `created → running → waiting_external_action → completed`; 또는 `failed/canceled/compensated`.                                                                                                                          |
| API object mapping | `workflow_run.id = wfr_*`; `status`; `steps[]`; `related_objects[]`; `request_id`; `idempotency_key_hash`; `ledger_trace`.                                                                                            |
| Event mapping      | `workflow_run.created`, `workflow_run.step_started`, `workflow_run.step_succeeded`, `workflow_run.step_failed`, `workflow_run.completed`, `workflow_run.failed`, `workflow_run.canceled`, `workflow_run.compensated`. |
| Upgrade/versioning | Workflow definition version과 runtime schema version을 분리한다. In-flight workflow는 생성 시의 definition version으로 끝까지 수행한다.                                                                                                   |
| Privacy/visibility | Workflow step detail은 운영상 민감할 수 있다. 외부 API에는 high-level status와 next_action만 노출한다.                                                                                                                                    |

#### Notes

`WorkflowRun`은 Pillar 운영 추적성의 핵심이다. “어떤 API request가 어떤 ledger transaction을 만들었는가?”라는 질문에 답해야 한다.

---

## 12. `audit` Package

### Template: `AuditRecord`

| 항목                 | 정의                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template 목적        | API operation, ledger action, compliance decision, migration, admin action을 immutable audit fact로 기록한다.                                                     |
| Signatories        | `operator` 또는 `auditAuthority`.                                                                                                                             |
| Observers          | affected tenant, affected party, compliance, auditor 중 필요한 party.                                                                                           |
| Choices            | 기본적으로 consuming update choice 없음. 선택적으로 `AcknowledgeAuditRecord` non-consuming choice만 허용.                                                                  |
| Contract lifecycle | `created → active`. Audit contract는 원칙적으로 archive하지 않는다. Retention migration은 별도 governance workflow로 수행한다.                                                 |
| API object mapping | `audit_record.id = aud_*`; `category`; `actor`; `action`; `related_object`; `ledger_trace`; `created`. Public API에서는 보통 `/v1/events`의 backing object로 사용한다. |
| Event mapping      | `audit_record.created`, 그리고 관련 object event에 `audit_record` reference 포함.                                                                                   |
| Upgrade/versioning | Audit schema는 append-only다. 기존 audit fact를 rewrite하지 않는다. 신규 detail은 optional field 또는 related audit record로 추가한다.                                          |
| Privacy/visibility | Audit detail은 최소 공개한다. Full audit는 authorized auditor/compliance party만 본다. API event payload에는 민감 field를 넣지 않는다.                                           |

#### Notes

AuditRecord는 projection DB audit log보다 우선한다. DB audit table은 delivery와 조회 성능을 위한 projection이다.

---

## API / Object Model

## 1. API Grammar

Pillar public API는 Canton-invisible이어야 한다.

```text
POST   /v1/accounts
GET    /v1/accounts/{id}
GET    /v1/accounts/{id}/balances

POST   /v1/assets
GET    /v1/assets/{id}

GET    /v1/holdings/{id}
GET    /v1/holdings?account=acct_...

POST   /v1/transfer_intents
POST   /v1/transfer_intents/{id}/confirm
POST   /v1/transfer_intents/{id}/cancel

POST   /v1/settlement_intents
POST   /v1/settlement_intents/{id}/authorize
POST   /v1/settlement_intents/{id}/settle
POST   /v1/settlement_intents/{id}/cancel

POST   /v1/locks
POST   /v1/locks/{id}/release

POST   /v1/redemption_intents
POST   /v1/redemption_intents/{id}/confirm
POST   /v1/redemption_intents/{id}/cancel

POST   /v1/reversals
POST   /v1/claims

GET    /v1/events
GET    /v1/events/{id}
```

---

## 2. Object ID Grammar

| Object            | Prefix   |
| ----------------- | -------- |
| Identity          | `idn_`   |
| Account           | `acct_`  |
| Asset             | `asset_` |
| Holding           | `hld_`   |
| Balance           | `bal_`   |
| Transfer Intent   | `trn_`   |
| Settlement Intent | `stl_`   |
| Lock              | `lock_`  |
| Redemption Intent | `rdm_`   |
| Reversal          | `rev_`   |
| Claim             | `clm_`   |
| Workflow Run      | `wfr_`   |
| Event             | `evt_`   |
| Audit Record      | `aud_`   |

---

## 3. Example: `transfer_intent`

```json
{
  "id": "trn_01HY...",
  "object": "transfer_intent",
  "amount": "100.00",
  "asset": "asset_usdc_issuer_a",
  "source_account": "acct_sender",
  "destination_account": "acct_recipient",
  "status": "processing",
  "livemode": false,
  "created": 1779782400,
  "metadata": {
    "order_id": "ord_123"
  },
  "next_action": null,
  "failure_code": null,
  "ledger_trace": {
    "workflow_id": "wfr_01HY...",
    "command_id": "cmd_01HY...",
    "transaction_id": null
  }
}
```

---

## 4. Event Object

Pillar event는 thin-event-first다.

```json
{
  "id": "evt_01HY...",
  "object": "event",
  "type": "transfer_intent.succeeded",
  "api_version": "2026-05-26",
  "created": 1779782500,
  "livemode": false,
  "request": {
    "id": "req_01HY...",
    "idempotency_key": "ik_..."
  },
  "data": {
    "object": {
      "id": "trn_01HY...",
      "object": "transfer_intent"
    }
  }
}
```

**Event rules:**

1. Event ordering은 보장하지 않는다.
2. Event delivery는 at-least-once다.
3. Client는 `event.id`로 dedupe한다.
4. Client는 event payload를 final state로 신뢰하지 않고 object retrieval API로 최신 상태를 확인한다.
5. Webhook endpoint는 endpoint별 API version을 가진다.

---

## 5. Idempotency Model

| Layer       | Mechanism                                 |
| ----------- | ----------------------------------------- |
| API Gateway | `Idempotency-Key` + method/path/body hash |
| Runtime     | Stable `commandId` per logical operation  |
| Ledger API  | Command deduplication period              |
| Webhook     | Event ID dedupe                           |
| Client SDK  | Retry with same idempotency key           |

Pillar idempotency rule:

```text
same tenant
+ same method
+ same path
+ same idempotency key
+ same request body hash
= same logical operation
```

다른 body로 같은 key를 쓰면 `409 idempotency_key_reuse_mismatch`를 반환한다.

---

## Internal Runtime

## 1. Write Path

```text
Client
  → API Gateway
  → Idempotency Manager
  → Intent Translator
  → Ledger Command Builder
  → Canton Ledger API
  → Command Completion Listener
  → Projection Worker
  → Event Builder
  → Webhook Dispatcher
```

### Command Metadata

각 ledger command에는 다음을 넣는다.

```text
workflowId      = wfr_*
commandId       = stable per API idempotency key
submissionId    = new per retry
applicationId   = pillar-runtime
actAs           = authorized parties
readAs          = minimal parties
dedupPeriod     = configured per tenant / endpoint
```

**중요:** 같은 logical operation retry는 같은 `commandId`를 사용하고, 재제출은 새 `submissionId`를 사용한다. Canton command deduplication은 동일 participant 경유가 중요하므로, Pillar runtime은 idempotent retry를 같은 participant route로 고정한다.

---

## 2. Read Path

```text
Ledger ACS / Transaction Stream
  → Projection Ingestor
  → Object Projection
  → Balance Projection
  → Event Projection
  → API Read Model
```

Read API는 projection DB를 사용한다. 단, consistency semantics를 명확히 노출한다.

| API                             | Consistency                                       |
| ------------------------------- | ------------------------------------------------- |
| `GET /v1/transfer_intents/{id}` | Projection consistency                            |
| `GET /v1/balances`              | Projection consistency with `as_of_ledger_offset` |
| `GET /v1/events`                | Event projection consistency                      |
| Admin reconcile API             | Ledger ACS reconciliation                         |

필요한 경우 `?expand[]=ledger_trace`로 ledger trace를 포함한다. `ContractId`는 admin/debug API에서만 제한적으로 제공한다.

---

## 3. Projection Strategy

Pillar projection은 다음 네 가지를 분리한다.

1. **Object projection**

   * API object별 현재 상태.

2. **Balance projection**

   * Holding aggregate.
   * `total`, `available`, `locked`, `pending_in`, `pending_out`.

3. **Event projection**

   * Webhook delivery 대상 event.
   * Event payload versioning.

4. **Audit projection**

   * Ledger `AuditRecord`와 transaction metadata의 조회 인덱스.

Projection lag가 발생해도 ledger가 source of truth다. 장애 복구 시 ACS snapshot과 transaction offset으로 projection을 재생성한다.

---

## 4. Package Version Selection

Pillar runtime은 tenant별 package pinning을 지원한다.

```text
tenant_package_pin
- tenant_id
- package_name
- package_version
- package_id
- status: active | canary | deprecated
```

Command builder는 symbolic package reference 또는 configured package selection preference를 사용한다. In-flight workflow는 생성 당시 package version으로 끝까지 처리한다.

---

## DB Schema

DB는 **Projection / Audit / Config / Delivery State**만 저장한다.

## 1. `api_requests`

| Column                 | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `request_id`           | `req_*`                                        |
| `tenant_id`            | Tenant scope                                   |
| `idempotency_key_hash` | Raw key 저장 금지                                  |
| `method`               | HTTP method                                    |
| `path`                 | API path                                       |
| `request_body_hash`    | Reuse mismatch detection                       |
| `api_version`          | Request API version                            |
| `status`               | `received`, `submitted`, `completed`, `failed` |
| `response_status`      | Cached HTTP status                             |
| `response_body_json`   | Cached response                                |
| `workflow_id`          | Linked `WorkflowRun`                           |
| `command_id`           | Ledger command ID                              |
| `created_at`           | First seen                                     |
| `updated_at`           | Last update                                    |

---

## 2. `ledger_commands`

| Column                 | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `command_id`           | Stable logical command ID                          |
| `submission_id`        | Per retry                                          |
| `workflow_id`          | Workflow run                                       |
| `participant_id`       | Route affinity                                     |
| `act_as`               | Parties used                                       |
| `read_as`              | Parties used                                       |
| `deduplication_period` | Runtime dedup config                               |
| `status`               | `submitted`, `completed`, `deduplicated`, `failed` |
| `completion_offset`    | Ledger completion offset                           |
| `transaction_id`       | Ledger transaction/update ID                       |
| `error_code`           | Failure classification                             |
| `error_detail`         | Sanitized error                                    |

---

## 3. `objects`

Generic projection table.

| Column               | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `id`                 | API object ID                               |
| `object_type`        | `account`, `asset`, `transfer_intent`, etc. |
| `tenant_id`          | Tenant                                      |
| `status`             | Object status                               |
| `livemode`           | Sandbox/live                                |
| `api_version`        | Projection format                           |
| `ledger_template_id` | Template identifier                         |
| `ledger_contract_id` | Internal/admin only                         |
| `ledger_offset`      | Source offset                               |
| `payload_json`       | Sanitized object payload                    |
| `created_at`         | API created                                 |
| `updated_at`         | Projection updated                          |

---

## 4. `holdings_projection`

| Column              | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `holding_id`        | `hld_*`                                  |
| `tenant_id`         | Tenant                                   |
| `account_id`        | Owner account                            |
| `asset_id`          | Asset                                    |
| `quantity`          | Decimal string                           |
| `status`            | `active`, `locked`, `burned`, `archived` |
| `contract_id`       | Internal/admin only                      |
| `issuer_party_hash` | Privacy-preserving reference             |
| `owner_party_hash`  | Privacy-preserving reference             |
| `ledger_offset`     | Source offset                            |

---

## 5. `balances_projection`

| Column             | Purpose                         |
| ------------------ | ------------------------------- |
| `balance_id`       | `bal_*`                         |
| `tenant_id`        | Tenant                          |
| `account_id`       | Account                         |
| `asset_id`         | Asset                           |
| `total`            | Sum of holdings                 |
| `available`        | Total minus locks/pending out   |
| `locked`           | Active locks                    |
| `pending_in`       | Accepted but unsettled incoming |
| `pending_out`      | Accepted but unsettled outgoing |
| `as_of_offset`     | Ledger offset                   |
| `reconcile_status` | `ok`, `lagging`, `mismatch`     |

---

## 6. `api_events`

| Column                 | Purpose                       |
| ---------------------- | ----------------------------- |
| `event_id`             | `evt_*`                       |
| `tenant_id`            | Tenant                        |
| `type`                 | `transfer_intent.succeeded`   |
| `api_version`          | Event schema version          |
| `object_id`            | Related object                |
| `object_type`          | Related object type           |
| `request_id`           | Request reference             |
| `idempotency_key_hash` | Request idempotency reference |
| `payload_json`         | Thin event payload            |
| `ledger_offset`        | Source offset                 |
| `created_at`           | Event time                    |

---

## 7. `webhook_endpoints`

| Column               | Purpose                  |
| -------------------- | ------------------------ |
| `endpoint_id`        | `we_*`                   |
| `tenant_id`          | Tenant                   |
| `url`                | Destination              |
| `enabled_events`     | Event type filter        |
| `api_version`        | Endpoint event version   |
| `signing_secret_ref` | Secret manager reference |
| `status`             | `enabled`, `disabled`    |
| `created_at`         | Created                  |

---

## 8. `webhook_deliveries`

| Column               | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `delivery_id`        | Delivery attempt ID                               |
| `event_id`           | Event                                             |
| `endpoint_id`        | Endpoint                                          |
| `attempt`            | Attempt count                                     |
| `status`             | `pending`, `delivered`, `failed`, `dead_lettered` |
| `response_status`    | HTTP status                                       |
| `response_body_hash` | Sanitized                                         |
| `next_retry_at`      | Retry schedule                                    |
| `delivered_at`       | Final delivery time                               |

---

## 9. `config_package_pins`

| Column                | Purpose                                     |
| --------------------- | ------------------------------------------- |
| `tenant_id`           | Tenant                                      |
| `package_name`        | Daml package                                |
| `package_version`     | Semantic version                            |
| `package_id`          | Canton package ID                           |
| `status`              | `active`, `canary`, `deprecated`, `blocked` |
| `effective_from`      | Version activation time                     |
| `rollback_package_id` | Optional rollback target                    |

---

## Failure Modes

| Failure Mode                         | Example                                          | Pillar Handling                                                                                                |
| ------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| API timeout after ledger submission  | Client times out after `POST /transfer_intents`  | Retry with same idempotency key. API returns same object or pending status. Runtime checks command completion. |
| Duplicate API request                | Client retries due network failure               | `api_requests` detects same key/body and replays cached response.                                              |
| Same idempotency key, different body | Client bug                                       | Return `409 idempotency_key_reuse_mismatch`.                                                                   |
| Command already submitted            | Runtime retry after participant delay            | Same `commandId`, new `submissionId`; completion listener resolves final state.                                |
| Projection lag                       | Ledger committed but API read stale              | Object returns `processing` with `as_of_offset`; webhook fires only after projection catches up.               |
| Webhook duplicate                    | Endpoint receives same event twice               | Client must dedupe by `event.id`; Pillar also tracks delivery attempts.                                        |
| Webhook out of order                 | `succeeded` arrives before `processing`          | Client fetches object state. Event order is not a correctness dependency.                                      |
| Endpoint unavailable                 | Customer server down                             | Retry with exponential backoff, then dead-letter; event remains retrievable via Events API.                    |
| Insufficient available balance       | Holding exists but locked                        | TransferIntent moves to `failed` with `insufficient_available_balance`.                                        |
| Contract visibility failure          | Required party cannot see contract               | Runtime fails command, emits operational audit record, raises `ledger_visibility_error`.                       |
| Package mismatch                     | Tenant pinned to wrong package                   | Runtime blocks command before submission if package pin is invalid.                                            |
| In-flight upgrade conflict           | Template version changes mid-workflow            | Workflow remains pinned to creation-time package version.                                                      |
| Privacy leak via observers           | Overbroad observer list                          | Template policy tests reject global observers; privacy review required for new observer.                       |
| External payout failure              | Redemption burn succeeded but bank payout failed | Redemption remains `payout_pending` or `failed_after_burn`; compensation workflow required.                    |
| Reversal impossible                  | Recipient no longer has enough asset             | ReversalIntent moves to `requires_action`; claim/lock workflow may start.                                      |

---

## Security / Compliance

### 1. Authentication and Authorization

* Public API uses tenant-scoped API keys or OAuth client credentials.
* Admin API requires stronger authentication, MFA, and scoped RBAC.
* Ledger API credentials are never exposed to API clients.
* Runtime maps API actor to allowed ledger parties and choices.

### 2. Party Authorization

* `act_as` is minimized per command.
* `read_as` is used only when required.
* Hosted account model and self-custody model are both supported, but API grammar stays identical.

### 3. Privacy

* No global observer.
* No raw PII on ledger by default.
* Evidence, KYC documents, payout details, legal claim detail are stored off-ledger with hash/reference on ledger.
* Template privacy tests must verify signatories, observers, choice controllers, and disclosed contract behavior.

### 4. Webhook Security

* Each webhook endpoint has a signing secret.
* Payload includes timestamp and signature.
* Client verifies signature and rejects replay.
* Event ID dedupe is mandatory.
* Event endpoint versioning is fixed at endpoint creation unless explicitly upgraded.

### 5. Compliance

* `IdentityProfile` gates account capabilities.
* `Account` gates transfers/redemptions.
* `AssetDefinition` gates asset-level transfer/redemption policy.
* `HoldingLock` implements compliance hold and settlement reservation.
* `Claim` implements legal/compliance disputes.
* `AuditRecord` records compliance decisions as ledger facts.

### 6. Operational Audit

Every API mutation must create or reference:

```text
AuditRecord
WorkflowRun
Ledger command metadata
API request record
Projected event
```

This gives a complete chain:

```text
API request
  → idempotency key
  → workflow run
  → ledger command
  → ledger transaction
  → Daml contract event
  → API event
  → webhook delivery
```

---

## Implementation Plan

## Phase 0 — Specification and Research Baseline

* Freeze Pillar API object grammar.
* Define object ID prefixes.
* Define API version format.
* Define event type registry.
* Define tenant/party/custody model.
* Decide CIP-0056 direct implementation vs adapter wrapper.
* Create template privacy policy.

Deliverables:

```text
/spec/api
/spec/events
/spec/daml-template-library
/spec/privacy
/spec/versioning
```

---

## Phase 1 — Daml Core Package MVP

Implement packages:

```text
identity
account
asset
holding
workflow
audit
```

Tests:

* Template lifecycle tests.
* Signatory/observer tests.
* Authorization tests.
* Upgrade compatibility tests.
* Projection fixture tests.
* Sandbox ledger smoke tests.

Developer tooling:

* `dpm build`
* `dpm sandbox`
* DAR upload automation
* Ledger API integration test harness

---

## Phase 2 — Transfer and Balance Runtime

Implement packages:

```text
transfer
lock
```

Runtime:

* API Gateway idempotency.
* Command builder.
* Completion listener.
* ACS/transaction projection.
* Balance projection.
* `transfer_intent` API.
* `balance` API.

Events:

```text
transfer_intent.created
transfer_intent.processing
transfer_intent.succeeded
transfer_intent.failed
balance.updated
```

---

## Phase 3 — Webhook-first Platform

Implement:

* `api_events`
* `webhook_endpoints`
* `webhook_deliveries`
* Event retry.
* Event replay.
* Thin event payload.
* Endpoint-level API versioning.
* CLI local forwarding:

```bash
pillar listen --forward-to localhost:4242/webhook
pillar trigger transfer_intent.succeeded
```

---

## Phase 4 — Settlement / Redemption / Reversal / Claim

Implement packages:

```text
settlement
redemption
reversal
claim
```

Add:

* DvP/PvP settlement.
* Redemption burn + payout state.
* Compensating reversal.
* Claim-attached locks.
* Compliance approval workflows.

---

## Phase 5 — Developer Experience

Deliver:

* Pillar SDKs:

  * Node.js
  * Python
  * Java
  * Go
* OpenAPI spec.
* Postman collection.
* Pillar CLI.
* Pillar Workbench:

  * API logs
  * idempotency replay view
  * webhook event replay
  * package version pins
  * ledger trace viewer
  * sandbox/live toggle
* Pillar Sandbox:

  * isolated tenant
  * fake asset issuer
  * fake payout rail
  * fake compliance reviewer

---

## Phase 6 — Production Hardening

Add:

* Multi-participant routing.
* Package canary rollout.
* DAR vetting workflow.
* ACS reconciliation jobs.
* Projection rebuild jobs.
* Dead-letter webhook recovery.
* Tenant isolation tests.
* Privacy regression tests.
* Disaster recovery runbooks.
* SOC2-ready audit exports.

---

## Open Questions

1. **CIP-0056 alignment**

   * Pillar asset/holding/transfer/settlement templates should directly implement CIP-0056 interfaces, or wrap them with Pillar-native workflow templates?

2. **Party hosting model**

   * Should v1 assume Pillar-hosted parties, tenant-hosted parties, or both?

3. **Issuer involvement in transfer**

   * For each asset class, does issuer sign/authorize every transfer, or only asset policy and redemption?

4. **Observer policy**

   * Which regulators/auditors need ledger visibility versus projection-only reports?

5. **Contract key roadmap**

   * When Canton version support is stable, should Pillar introduce optional ledger-side object key lookup, or continue pure object ID projection?

6. **Reversal legal authority**

   * Which reversal types require counterparty consent, issuer approval, or court/compliance claim?

7. **Redemption finality**

   * When external payout fails after ledger burn, should Pillar mint compensation, reopen claim, or mark `failed_after_burn`?

8. **Multi-synchronizer operation**

   * Should asset settlement across synchronizers be supported in v1, or deferred?

9. **Event retention**

   * Stripe-like 30-day event retrieval is a good default, but regulated tenants may require longer retention.

10. **Workbench governance**

    * Who can upgrade API version, package pin, webhook endpoint version, and tenant runtime policy?

---

## Agent-ready Checklist

### Daml Library

* [ ] Define `PillarMeta` shared type.
* [ ] Define common status enums.
* [ ] Implement `identity.IdentityProfile`.
* [ ] Implement `account.Account`.
* [ ] Implement `asset.AssetDefinition`.
* [ ] Implement `holding.Holding`.
* [ ] Implement `transfer.TransferIntent`.
* [ ] Implement `settlement.SettlementIntent`.
* [ ] Implement `lock.HoldingLock`.
* [ ] Implement `redemption.RedemptionIntent`.
* [ ] Implement `reversal.ReversalIntent`.
* [ ] Implement `claim.Claim`.
* [ ] Implement `workflow.WorkflowRun`.
* [ ] Implement `audit.AuditRecord`.
* [ ] Add lifecycle unit tests for every template.
* [ ] Add authorization tests for every choice.
* [ ] Add privacy tests for every observer set.
* [ ] Add upgrade tests for optional field additions.
* [ ] Add DAR build and sandbox smoke test.

### API

* [ ] Define OpenAPI spec.
* [ ] Define object ID prefix registry.
* [ ] Define error code registry.
* [ ] Define idempotency behavior.
* [ ] Define `Pillar-Version` header.
* [ ] Define expand/include semantics.
* [ ] Define pagination.
* [ ] Define thin event schema.
* [ ] Define webhook signature scheme.

### Runtime

* [ ] Implement API Gateway.
* [ ] Implement Idempotency Manager.
* [ ] Implement Intent Translator.
* [ ] Implement Ledger Command Builder.
* [ ] Implement Completion Listener.
* [ ] Implement Projection Ingestor.
* [ ] Implement ACS Reconciler.
* [ ] Implement Package Pin Manager.
* [ ] Implement Tenant Routing Manager.

### Projections

* [ ] Implement `objects`.
* [ ] Implement `holdings_projection`.
* [ ] Implement `balances_projection`.
* [ ] Implement `api_events`.
* [ ] Implement `ledger_commands`.
* [ ] Implement `ledger_offsets`.
* [ ] Implement `webhook_deliveries`.
* [ ] Implement rebuild-from-ledger job.
* [ ] Implement projection lag metrics.

### Webhooks

* [ ] Implement endpoint registration.
* [ ] Implement endpoint-level API version.
* [ ] Implement event filtering.
* [ ] Implement signing.
* [ ] Implement retry schedule.
* [ ] Implement dead-letter state.
* [ ] Implement event replay.
* [ ] Implement CLI local forwarding.
* [ ] Implement `pillar trigger`.

### Security / Compliance

* [ ] Implement API key auth.
* [ ] Implement tenant RBAC.
* [ ] Implement ledger party authorization map.
* [ ] Implement no-PII-on-ledger policy.
* [ ] Implement evidence hash/reference model.
* [ ] Implement audit record generation.
* [ ] Implement compliance hold workflow.
* [ ] Implement claim-attached lock workflow.
* [ ] Implement privacy regression tests.

### Developer Experience

* [ ] Generate SDKs from OpenAPI.
* [ ] Build Node SDK.
* [ ] Build Python SDK.
* [ ] Build Java SDK.
* [ ] Build Go SDK.
* [ ] Build Pillar CLI.
* [ ] Build Pillar Workbench.
* [ ] Build Pillar Sandbox.
* [ ] Provide sample apps.
* [ ] Provide webhook examples.
* [ ] Provide Canton trace debug guide.

### Production Readiness

* [ ] Define package rollout process.
* [ ] Define rollback process.
* [ ] Define DAR vetting process.
* [ ] Define participant routing policy.
* [ ] Define backup/recovery plan.
* [ ] Define projection rebuild RTO/RPO.
* [ ] Define webhook replay SLA.
* [ ] Define incident runbooks.
* [ ] Define ledger reconciliation reports.
* [ ] Define tenant data isolation review.

---

## Final Architecture Position

Pillar의 표준 Daml Template Library는 다음 문장으로 요약된다.

> **Public API는 Stripe처럼 보이고, 내부 상태 전이는 Canton/Daml처럼 작동하며, 최종 진실은 ledger ACS와 transaction history에 있다.**

v1의 가장 중요한 성공 기준은 `Holding`, `TransferIntent`, `SettlementIntent`, `HoldingLock`, `WorkflowRun`, `AuditRecord`가 일관되게 맞물리는 것이다. 이 여섯 template이 견고하면, redemption, reversal, claim, compliance, SDK, CLI, Workbench는 자연스럽게 확장된다.

[1]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[2]: https://docs.stripe.com/webhooks "docs.stripe.com"
[3]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[4]: https://docs.stripe.com/api-v2-overview "docs.stripe.com"
[5]: https://docs.stripe.com/sdks "docs.stripe.com"
[6]: https://docs.digitalasset.com/build/3.5/reference/daml/structure.html "Overview: Template Structure — Digital Asset’s platform documentation"
[7]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[8]: https://docs.digitalasset.com/build/3.5/tutorials/smart-contracts/compose.html?utm_source=chatgpt.com "Compose choices"
[9]: https://docs.digitalasset.com/build/3.4/sdlc-howtos/applications/upgrade/arch-considerations-upgrading.html "Architectural considerations for upgrading a Canton Network application — Digital Asset’s platform documentation"
[10]: https://docs.digitalasset.com/build/3.5/reference/damllf/daml-lf-translation.html?utm_source=chatgpt.com "How Daml Types are translated to Daml-LF"
[11]: https://docs.digitalasset.com/build/3.5/reference/daml/contract-keys.html?utm_source=chatgpt.com "Reference: Contract Keys"
[12]: https://docs.canton.network/overview/reference/what-are-cips?utm_source=chatgpt.com "CIP Reference - Canton Network Docs"
