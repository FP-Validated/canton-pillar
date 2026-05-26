아래가 **전체 재작성본**입니다. 이전 출력은 말미 체크리스트만 남은 상태였으므로, 이번에는 제품 전략·아키텍처·API·런타임·DB·실패모드·보안·실행계획·카피까지 하나의 문서로 다시 구성합니다.

# Pillar Product Strategy

## “Stripe for Canton-backed Assets”

**작성자 관점:** Pillar 수석 아키텍트
**기준일:** 2026-05-26
**핵심 정의:** Pillar는 Canton-backed assets를 위한 **Stripe-grade API Operating System**이다.

---

# 0. Research Baseline

## 0.1 Stripe 공식 문서에서 가져와야 할 원칙

Stripe API는 REST 중심, 예측 가능한 resource-oriented URL, JSON 응답, 표준 HTTP status code, 인증, HTTP verb를 API grammar의 기본으로 삼는다. 또한 Stripe는 sandbox/test 환경에서 live data와 banking network에 영향을 주지 않고 API를 사용할 수 있게 하며, API key가 live/sandbox 실행 모드를 결정한다. Pillar도 이 문법을 복사해야 한다. 즉, Canton contract, command, party, synchronizer를 외부 개발자에게 노출하지 않고 `/accounts`, `/balances`, `/transfer_intents`, `/settlement_intents`, `/events` 같은 안정적인 리소스 문법으로 제공해야 한다. ([Stripe Docs][1])

Stripe의 idempotency는 Pillar에 거의 그대로 적용해야 한다. Stripe는 create/update 요청에서 idempotency key를 사용해 네트워크 오류 시 안전하게 재시도할 수 있게 하며, 동일 key의 최초 요청 결과 status code와 body를 저장하고, 같은 key 재사용 시 같은 결과를 반환한다. 또한 최초 요청과 다른 parameter로 같은 key를 쓰면 오류를 내 accidental misuse를 방지한다. Pillar도 모든 write API에 `Idempotency-Key`를 요구하거나 강하게 권장해야 하며, ledger command deduplication에만 의존하면 안 된다. ([Stripe Docs][2])

Stripe API versioning은 Pillar API 안정성 설계의 핵심 선례다. Stripe 문서상 major release는 backward-incompatible change를 포함할 수 있고, monthly release는 backward-compatible change만 포함한다. 현재 Stripe API version은 `2026-04-22.dahlia`로 표시되며, curl 요청은 계정 default API version을 사용하되 `Stripe-Version` header로 override할 수 있다. Webhook events도 endpoint 생성 시 지정한 API version 또는 account default version을 사용한다. Pillar도 `Pillar-Version` 또는 date-based API version을 도입하고, webhook payload version을 endpoint 단위로 고정해야 한다. ([Stripe Docs][3])

Stripe API v2 문서는 JSON request/response, sandbox testing, thin events, page-token pagination, SDK/CLI의 API version pinning을 강조한다. 특히 v2 events는 object snapshot보다 thin event를 기본 방향으로 둔다. Pillar는 ledger-backed system이므로 webhook payload를 “full contract snapshot”으로 밀어 넣기보다, `event.type`, `object.id`, `operation.id`, `ledger_trace.id` 중심의 thin event를 기본으로 설계해야 한다. ([Stripe Docs][4])

Stripe webhook 문서는 event destination을 등록하면 Stripe가 account에서 발생한 event를 HTTPS endpoint로 push한다고 설명한다. 또한 webhook은 bank confirmation, dispute, recurring payment success 같은 asynchronous event 처리에 사용되며, endpoint는 복잡한 처리를 하기 전에 빠르게 2xx를 반환해야 한다. Pillar도 transfer, allocation, settlement, custody approval, external signing, projection update를 webhook-first workflow로 설계해야 한다. ([Stripe Docs][5])

Stripe CLI는 resource 생성/관리, webhook event trigger, real-time API request log streaming, local endpoint forwarding을 제공한다. Pillar CLI는 `pillar listen`, `pillar trigger`, `pillar logs tail`, `pillar ledger-trace`, `pillar sandbox reset`을 day one부터 포함해야 한다. ([Stripe Docs][6])

Stripe Workbench는 integration build/test/debug를 위한 도구이며 Shell, API Explorer, event destination management, health insight를 제공한다. Workbench guide는 API version 확인, recent integration error, API request log, event filtering을 지원한다. Pillar Workbench는 단순 dashboard가 아니라 API request, idempotency, operation lifecycle, ledger trace, webhook delivery, projection lag, UTXO fragmentation, reconciliation을 보는 운영 콘솔이어야 한다. ([Stripe Docs][7])

Stripe event type은 `resource.event` naming convention을 사용한다. Pillar event taxonomy도 `transfer_intent.created`, `transfer_intent.settled`, `settlement_intent.failed`, `balance.available`, `webhook.delivery_failed`처럼 resource-first naming을 사용해야 한다. ([Stripe Docs][8])

## 0.2 Canton / Daml / Ledger API 공식 문서에서 가져와야 할 원칙

Canton/Daml gRPC Ledger API는 command submission, command completion, command service, interactive submission, update service, state service, event query, party management, user management, package management, package service, version service, pruning service를 제공한다. Ledger는 updates의 list이고, transaction은 create/exercise/archive event의 tree이며, completion은 submission 성공/실패를 나타낸다. Pillar 내부 runtime은 이 구조를 그대로 사용해야 하지만, 외부 API는 이 구조를 숨겨야 한다. ([Digital Asset Documentation][9])

Ledger API Command Submission Service는 command를 ledger에 제출하지만, 호출 반환은 command가 실행되었다는 뜻이 아니라 ledger server가 command format을 accept/reject했다는 뜻이다. 실제 on-ledger effect는 Update Service와 Command Completion Service를 통해 확인된다. Pillar의 write API가 synchronous “settled”를 바로 반환하면 안 되는 이유가 여기에 있다. Pillar write API는 `operation`과 `intent`를 만들고, ledger completion/update stream을 통해 상태를 전이해야 한다. ([Digital Asset Documentation][9])

Ledger API command deduplication은 change ID, 즉 submitting parties, user ID, command ID에 기반한다. 문서상 command deduplication은 동일 Participant Node에 command가 제출될 때만 보장된다. 따라서 Pillar idempotency는 ledger deduplication보다 상위 레이어에서 구현해야 하며, command ID는 idempotency/operation과 deterministic하게 연결하되 retry/submission ID는 별도로 관리해야 한다. ([Digital Asset Documentation][9])

Canton JSON Ledger API는 OpenAPI specification을 제공하고, Canton이 JSON Ledger API를 활성화하면 `/docs/openapi`에서 node-specific spec을 확인할 수 있다. 또한 JSON Ledger API는 HTTP/S endpoint를 포함하며 streaming endpoint는 AsyncAPI로 별도 제공된다. Pillar는 내부 integration과 테스트에서 JSON Ledger API/OpenAPI를 활용할 수 있지만, 고객-facing API를 JSON Ledger API 그대로 노출하면 Stripe-grade abstraction이 깨진다. ([Digital Asset Documentation][10])

Canton Network JSON API reference의 async command submit은 `commandId`, `actAs`, `readAs`, `workflowId`, `deduplicationPeriod`, `submissionId`, `synchronizerId`, `packageIdSelectionPreference` 등을 포함한다. 이 필드들은 Pillar 내부 runtime의 핵심 입력이지만, 외부 개발자에게는 `from_account`, `to_account`, `asset`, `amount`, `settlement_policy`, `client_reference_id`로 추상화해야 한다. ([Canton Network Docs][11])

Daml contract는 active 상태가 create transaction부터 archive transaction까지이며, 개별 contract는 immutable이다. Active Contract Set은 create/archive로만 변경된다. Pillar가 “balance/holding-first”여야 하는 이유가 여기에 있다. 외부 고객은 immutable contract와 archive/create delta를 직접 다루면 안 되고, Pillar가 이를 holdings와 balances로 투영해야 한다. ([Digital Asset Documentation][12])

Canton Protocol Specification은 Canton이 smart contract validation과 transaction ordering을 분리한 two-layer consensus 구조라고 설명한다. Participant node는 parties를 host하고 ACS를 유지하며 Ledger API를 제공한다. Canton은 sub-transaction privacy, integrity, consistency, finality 같은 속성을 제공한다. Pillar의 핵심 설계는 이 ledger finality와 privacy model을 존중하면서 API-level observability와 workflow abstraction을 얹는 것이다. ([Canton Network Docs][13])

External party flow는 preparation과 execution으로 나뉜다. preparation은 Ledger API command를 Daml transaction으로 변환하고, execution은 transaction과 signature를 participant node로 보내 synchronizer에 제출한다. Canton JSON API의 interactive submission execute endpoint도 prepared transaction, party signatures, submission ID, hashing scheme version을 요구한다. Pillar의 Hybrid/Self-hosted tier와 custodian integration은 이 prepare → sign → execute 모델을 제품화해야 한다. ([Digital Asset Documentation][14])

Canton Network integration guide는 wallet provider가 Canton Network asset holding/transferring을 위해 CIP-0056 token standard를 지원해야 하며, UTXO management도 필요하다고 설명한다. Pillar가 contract-first가 아니라 holding/balance-first여야 하는 또 다른 이유다. ([Digital Asset Documentation][15])

Canton Wallet SDK release note는 v1이 explicit `partyId`, multi-party flow, transport flexibility, `prepare -> sign -> execute` lifecycle, namespace organization을 강조한다고 설명한다. Pillar SDK는 Canton Wallet SDK와 경쟁하기보다, Canton SDK 위에 더 높은 수준의 fintech/RWA/bank API abstraction을 제공해야 한다. ([Digital Asset Documentation][16])

---

# 1. Executive Summary

## 1.1 Product Definition

**Pillar is the Stripe-grade API operating system for Canton-backed assets.**

한국어로 풀면:

> **Pillar는 Canton Ledger를 source of truth로 유지하면서, 개발자·핀테크·RWA 발행사·은행·수탁기관이 Canton-backed assets를 계정, 잔고, 보유분, 이전, 정산, 승인, 감사, webhook으로 다룰 수 있게 하는 API 운영체제다.**

Pillar의 핵심 포지션은 “Canton 연결 게이트웨이”가 아니다. Gateway는 요청을 받아 Canton API로 전달하는 얇은 translation layer다. Pillar는 그보다 훨씬 더 넓다. Pillar는 다음을 하나의 플랫폼으로 제공해야 한다.

* Stripe-like external API
* Canton-native internal runtime
* Balance/Holding projection layer
* Intent orchestration
* Ledger command outbox
* Completion/update stream processor
* Operation ledger trace
* Idempotency layer
* Webhook/event delivery system
* API versioning system
* SDK / CLI / Sandbox
* Workbench
* Security/compliance controls
* Hosted / Dedicated / Hybrid / Self-hosted deployment model

## 1.2 Core Product Claim

Canton은 regulated asset ledger로 강력하지만, 직접 사용하기에는 다음 복잡성이 있다.

* Daml contract와 choice를 이해해야 한다.
* party, participant, synchronizer, package version, package vetting을 이해해야 한다.
* write path가 submit → completion → update stream으로 비동기적이다.
* contract는 immutable하고 ACS는 create/archive로만 변하므로, 잔고와 보유분을 직접 계산해야 한다.
* token standard 기반 asset은 UTXO selection, merge, allocation, pre-approval, multi-step transfer를 요구한다.
* 은행·수탁기관·RWA 발행사는 API 호출뿐 아니라 감사, approval, compliance evidence, reconciliation, deployment control을 요구한다.

**Pillar의 제품적 답은 이것이다.**

> Canton은 ledger다. Pillar는 Canton-backed assets를 제품으로 만들기 위한 operating system이다.

## 1.3 The 10 Non-negotiable Principles

1. **Canton Ledger is the source of truth.**
   Pillar는 ledger를 대체하지 않는다.

2. **Pillar DB stores only Projection / Audit / Config.**
   Pillar DB의 balance는 authoritative ledger state가 아니라 projection이다.

3. **External API must be Stripe-like and Canton-invisible.**
   고객은 `contractId`, `templateId`, `choice`, `actAs`, `readAs`, `synchronizerId`를 몰라도 된다.

4. **Internal runtime must be Canton-native.**
   내부에서는 Ledger API, command completion, update stream, ACS, parties, packages, token standard를 정확히 다룬다.

5. **Operations must be ledger-traceable.**
   모든 write operation은 command ID, workflow ID, update ID, offset, synchronizer, affected holdings까지 추적 가능해야 한다.

6. **Balance/Holding-first, not contract-first.**
   외부 API는 contract가 아니라 account, asset, balance, holding을 중심으로 설계한다.

7. **Intent-first, not transaction-first.**
   외부 write는 “transaction submit”이 아니라 `transfer_intent`, `settlement_intent`, `allocation` 생성이다.

8. **Webhook-first for async workflow.**
   ledger settlement, custody signing, recipient accept/reject, compliance approval은 webhook/event로 흐른다.

9. **API grammar must be Stripe-grade from day one.**
   Idempotency, versioning, pagination, metadata, request ID, errors, SDK, CLI, sandbox, Workbench를 나중에 붙이면 늦다.

10. **Deployment model changes, API experience does not.**
    Hosted, Dedicated, Hybrid, Self-hosted가 달라도 `/v1/transfer_intents` 경험은 동일해야 한다.

---

# 2. Product Definition / Positioning

## 2.1 Pillar가 해결하는 문제

### Problem A — Canton은 강력하지만 product API가 아니다

Canton Ledger API는 contract, command, party, update stream 중심이다. 이는 ledger client와 Daml application developer에게는 적절하지만, fintech product team이나 bank integration team에는 너무 낮은 수준이다.

Pillar는 이를 다음처럼 바꾼다.

| Direct Canton Concept       | Pillar Product Concept                      |
| --------------------------- | ------------------------------------------- |
| Party                       | Account / Legal Actor / Custody Party       |
| Daml contract               | Holding / Allocation / Transfer Instruction |
| Active Contract Set         | Balance + Holding Projection                |
| Create / Exercise / Archive | Intent lifecycle transition                 |
| Command ID                  | Operation attempt trace                     |
| Workflow ID                 | Operation / Intent trace                    |
| Update stream               | Event / Webhook / Projection                |
| Package / Template / Choice | Asset capability adapter                    |
| Synchronizer                | Deployment/network routing config           |
| External signing            | Approval / Signing workflow                 |

### Problem B — Ledger state와 product state 사이의 간극

Canton에서 state는 ACS와 transaction updates다. 제품에서는 “Alice가 USDCx 1,000을 보유한다”, “Bank A가 investor account의 pending settlement를 본다”, “Issuer가 distribution을 승인한다”가 필요하다.

Pillar는 ledger state를 다음 product state로 투영한다.

* `balance.available`
* `balance.pending_incoming`
* `balance.pending_outgoing`
* `balance.locked`
* `balance.settling`
* `holding.active`
* `allocation.locked`
* `transfer_intent.processing`
* `settlement_intent.settled`

### Problem C — Async workflow가 integration complexity를 폭발시킨다

Canton-backed asset workflow는 synchronous card authorization보다 더 복잡하다.

* custody approval
* external party signing
* AML/sanctions screening
* transfer pre-approval
* recipient accept/reject
* DvP allocation
* ledger command completion
* projection catch-up
* webhook delivery
* reconciliation

Pillar는 이를 하나의 `operation`과 webhook-first lifecycle로 묶는다.

### Problem D — 은행/수탁기관은 “API”만 사지 않는다

은행과 수탁기관은 다음을 요구한다.

* ledger evidence
* audit log
* approval evidence
* key custody boundary
* tenant isolation
* data residency
* deployment control
* self-hosting option
* operational runbook
* reconciliation
* incident trace

따라서 Pillar는 Gateway가 아니라 API Operating System이어야 한다.

---

## 2.2 Canton을 직접 쓰는 것과 Pillar를 쓰는 것의 차이

| 항목                          | Canton 직접 사용                             | Pillar 사용                                          |
| --------------------------- | ---------------------------------------- | -------------------------------------------------- |
| Developer mental model      | Daml contract, choice, command, party    | Account, asset, balance, transfer intent           |
| Write API                   | Ledger command submission                | Intent creation + operation tracking               |
| Read API                    | ACS / transaction stream                 | Balance / holding / event / operation              |
| Idempotency                 | Command deduplication 중심                 | API idempotency + command dedup + operation replay |
| Async state                 | Completion/update stream 직접 처리           | Webhook + Workbench + operation status             |
| Balance                     | 직접 projection 구현                         | Pillar projection 제공                               |
| UTXO selection              | 직접 구현                                    | Pillar holding selector/merge planner              |
| External party signing      | 직접 prepare/sign/execute 구현               | Pillar approval/signing workflow                   |
| Compliance                  | 별도 구현                                    | Policy hook + audit evidence + ledger trace        |
| API versioning              | Ledger API version 이해 필요                 | Pillar API version 고정                              |
| SDK                         | Canton/Daml SDK 사용                       | Pillar SDK + optional Canton-native integration    |
| Debugging                   | logs, Ledger API, participant inspection | Workbench, request log, ledger trace               |
| Deployment                  | validator/participant 직접 운영              | Hosted/Dedicated/Hybrid/Self-hosted 선택             |
| Customer-facing abstraction | 없음                                       | Stripe-like API                                    |

---

## 2.3 왜 단순 Gateway가 아니라 API Operating System이어야 하는가

### Gateway는 “연결”만 해결한다

Gateway의 기능은 보통 다음에 그친다.

* REST → Ledger API translation
* auth proxy
* simple command submit
* response normalization

이 정도로는 Canton-backed asset product를 운영할 수 없다. 이유는 명확하다.

1. Ledger write는 async다.
2. Ledger read는 projection이 필요하다.
3. Token workflow는 UTXO/holding selection이 필요하다.
4. Financial workflow는 approval/compliance가 필요하다.
5. Enterprise workflow는 audit/reconciliation이 필요하다.
6. Developer workflow는 SDK/CLI/Sandbox/Workbench가 필요하다.
7. API stability는 versioning/idempotency/error grammar가 필요하다.

### API Operating System은 “제품 운영”까지 해결한다

Pillar가 Operating System이어야 하는 이유는 다음이다.

| Capability                  | Gateway | Pillar API OS |
| --------------------------- | ------: | ------------: |
| API translation             |     Yes |           Yes |
| Idempotency                 | Partial |   First-class |
| Operation lifecycle         |      No |           Yes |
| Balance projection          |      No |           Yes |
| UTXO selection              |      No |           Yes |
| Ledger trace                |      No |           Yes |
| Webhook delivery            |      No |           Yes |
| API versioning              |      No |           Yes |
| SDK / CLI                   |      No |           Yes |
| Sandbox                     |      No |           Yes |
| Workbench                   |      No |           Yes |
| Compliance hooks            |      No |           Yes |
| Deployment tier abstraction |      No |           Yes |
| Reconciliation              |      No |           Yes |

**Conclusion:**
Pillar의 판매 단위는 “Canton API proxy”가 아니라 **Canton-backed asset operations layer**다.

---

## 2.4 Stripe에서 복사할 것과 복사하지 않을 것

### Copy from Stripe

| Stripe Pattern         | Pillar Implementation                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| Resource-oriented API  | `/accounts`, `/assets`, `/balances`, `/holdings`, `/transfer_intents`, `/settlement_intents` |
| Predictable object IDs | `acct_`, `asset_`, `hld_`, `trint_`, `seti_`, `op_`, `evt_`                                  |
| Idempotency key        | 모든 POST write에서 `Idempotency-Key`                                                            |
| Request ID             | 모든 응답에 `request_id`, header `Pillar-Request-Id`                                              |
| API versioning         | `Pillar-Version: 2026-05-26` 또는 account default version                                      |
| Webhook endpoints      | HMAC signature, retry, replay, versioned payload                                             |
| Event taxonomy         | `resource.event` naming                                                                      |
| SDKs                   | Node, Python, Java, Go                                                                       |
| CLI                    | `pillar listen`, `pillar trigger`, `pillar logs tail`                                        |
| Workbench              | API logs, errors, events, webhook, ledger trace                                              |
| Sandbox                | test/live separation, seeded assets/accounts                                                 |
| Metadata               | 모든 core object에 `metadata` map                                                               |
| Expand/include pattern | selective expansion for related objects                                                      |
| Errors                 | typed error object, machine-readable codes                                                   |

### Do not copy from Stripe

| Stripe에서 복사하지 않을 것                             | 이유                                                       |
| ---------------------------------------------- | -------------------------------------------------------- |
| Payment-specific semantics                     | Pillar는 card/payment processor가 아니라 asset ledger OS      |
| Stripe가 ledger source of truth인 구조             | Pillar의 source of truth는 Canton Ledger                   |
| Synchronous payment-style success mental model | Canton settlement는 completion/update/projection 기반 async |
| Heavy snapshot webhook만 사용하는 방식                | Ledger-backed object는 thin event + fetch-on-receipt가 안전  |
| 중앙집중형 balance authority                        | Pillar DB balance는 projection일 뿐                         |
| 숨겨진 risk/compliance black box                  | 은행/RWA/custody는 policy evidence와 audit trace가 필요         |
| 단일 hosted-only deployment                      | 금융기관은 Dedicated/Hybrid/Self-hosted 요구                    |
| Generic merchant account model                 | Canton party/participant/synchronizer/custody model이 필요  |

---

## 2.5 Persona별 Value Proposition

| Persona    | Pain                                                                       | Pillar Value Proposition                                                                                                   |
| ---------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Developer  | Canton/Daml/Ledger API 학습 부담, async stream 처리, contract ID 추적              | Stripe-like API, SDK, CLI, Sandbox, Workbench. “계정·잔고·이전”으로 시작하고 Canton은 내부에 숨김                                            |
| Fintech    | 빠른 출시, embedded transfer/settlement, compliance integration 필요             | Canton-backed asset product를 weeks가 아니라 API integration 단위로 구현. Webhook, idempotency, sandbox 제공                           |
| RWA Issuer | 발행, investor allocation, transfer restriction, cap table/registry audit 필요 | Asset registry config, issuance workflow, holding projection, transfer policy, investor-level audit trail                  |
| Bank       | control, deployment, audit, data residency, approval, reconciliation 필요    | Dedicated/Hybrid/Self-hosted, ledger trace, RBAC, approval policy, reconciled projections, operational evidence            |
| Custodian  | key custody boundary, external signing, approval workflow, ledger proof 필요 | prepare → sign → execute workflow, signing requests, HSM/KMS integration, custody approvals, traceable operation lifecycle |

---

## 2.6 Product Tiers

| Tier        | Target                                                  | Pillar Runs                                               | Customer Runs                                    | Best For                                | API Experience |
| ----------- | ------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ | --------------------------------------- | -------------- |
| Hosted      | Developers, fintech, early RWA issuers                  | API, DB, projection, runtime, hosted connector, Workbench | App only                                         | Fastest start                           | Same `/v1`     |
| Dedicated   | RWA issuers, regulated fintech, mid-market institutions | Single-tenant Pillar stack, managed connector, Workbench  | Optional customer network controls               | Data isolation, stronger SLA            | Same `/v1`     |
| Hybrid      | Banks, custodians, exchanges                            | API control plane, Workbench, SDK, selected services      | Validator/participant, signer, KMS/HSM, maybe DB | Customer custody/control with Pillar UX | Same `/v1`     |
| Self-hosted | Banks, FMIs, sovereign/regulated institutions           | Software package, upgrade tooling, support                | Full stack                                       | Maximum control, residency, audit       | Same `/v1`     |

### Deployment invariant

> Deployment tier may change ownership of infrastructure, keys, validator, database, and network path. It must not change the external API grammar.

---

## 2.7 경쟁 / 대체재 분석

| Alternative                     | Strength                              | Weakness vs Pillar                                                                                | Pillar Position                                                        |
| ------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Direct Canton/Daml integration  | Maximum control, native ledger access | High complexity, no Stripe-grade product API, each team rebuilds projections/webhooks/idempotency | Pillar abstracts without losing Canton-native correctness              |
| Thin Canton Gateway             | Fast initial proxy                    | No operation lifecycle, no Workbench, no projection, no compliance, no API versioning             | Pillar is not a proxy; it is operating infrastructure                  |
| Wallet SDK / dApp SDK           | Excellent for wallet/dApp flows       | Not a full fintech/RWA/bank operating layer                                                       | Pillar can use these patterns internally, but exposes higher-order API |
| Custody provider APIs           | Strong key custody, approvals         | Often not full Canton-native asset OS or issuer/settlement projection layer                       | Pillar integrates custodians as signing/approval layer                 |
| Tokenization platforms          | Issuance/compliance apps              | Less developer-platform oriented, may be application-specific                                     | Pillar is the programmable API substrate                               |
| Internal bank build             | Full control                          | Slow, expensive, repeated integration work, high operational burden                               | Pillar compresses time-to-market while preserving deployment control   |
| Generic web3/RPC infrastructure | Node access, network data             | Not asset-account-balance-intent-compliance workflow                                              | Pillar is domain-specific for Canton-backed financial assets           |

---

## 2.8 Final One-liner, Pitch, Landing Page Copy

### One-liner

> **Pillar is the Stripe-grade API operating system for issuing, holding, transferring, settling, and auditing Canton-backed assets.**

### 30-second pitch

> Canton gives regulated assets a private, final, institution-grade ledger. Pillar makes that ledger programmable through a Stripe-like API. Developers use accounts, balances, holdings, transfer intents, settlement intents, webhooks, SDKs, CLI, sandbox, and Workbench. Under the hood, Pillar remains Canton-native: every operation maps to ledger commands, completions, updates, and traceable evidence. Hosted, Dedicated, Hybrid, or Self-hosted — the API experience stays the same.

### Landing page hero

**Build financial asset products on Canton without becoming a Canton infrastructure team.**

One API for accounts, balances, holdings, transfers, DvP settlement, webhooks, and audit — powered by Canton Ledger, operated through Pillar.

**CTA:**
Start in Sandbox
Talk to Solutions

### Landing page sections

**Ledger-native. API-simple.**
Pillar hides Canton contract complexity behind a Stripe-grade API while preserving ledger-native correctness.

**Balances and holdings, not contract archaeology.**
Query asset positions the way financial applications think: by account, asset, balance, holding, pending movement, and allocation.

**Intent-first asset movement.**
Create transfer and settlement intents. Pillar handles UTXO selection, approvals, signing, submission, completion, projection, and webhook delivery.

**Every operation is traceable.**
From API request to idempotency key to ledger command to update offset to webhook delivery, Pillar gives financial institutions the evidence trail they need.

**Deploy your way. Keep one API.**
Hosted, Dedicated, Hybrid, or Self-hosted. Same API, same SDKs, same Workbench.

---

# 3. Goals / Non-goals

## 3.1 Goals

### Product goals

1. Make Canton-backed asset integration feel like Stripe.
2. Let developers ship first transfer in sandbox without understanding Daml.
3. Give fintechs and issuers production-grade asset movement APIs.
4. Give banks and custodians deployment, security, approval, and audit controls.
5. Make ledger trace a first-class operational object.
6. Make async workflows reliable through webhooks and operation polling.
7. Keep API stable across Canton package/version/deployment differences.
8. Support token standard workflows, including holdings, UTXO management, transfer pre-approvals, and external signing.
9. Provide Workbench as the operational nerve center.
10. Preserve Canton as the source of truth.

## 3.2 Engineering goals

1. Zero authoritative financial state outside Canton.
2. Deterministic API idempotency independent of ledger command deduplication.
3. Projection rebuild from ledger stream/ACS.
4. Command outbox with exactly-once-intent semantics.
5. Webhook outbox with at-least-once delivery and replay.
6. API version rendering layer.
7. Tenant/environment isolation.
8. Deployment tier abstraction.
9. Ledger connector modularity.
10. Secure external party/custodian signing workflow.

## 3.3 Non-goals

1. Pillar does not replace Canton Ledger.
2. Pillar does not create an off-ledger shadow ledger.
3. Pillar does not expose generic Daml contract APIs as product APIs.
4. Pillar does not require customers to understand contract IDs.
5. Pillar does not guarantee every write settles synchronously.
6. Pillar does not become a regulated broker/dealer/custodian by default.
7. Pillar does not build every issuer-specific business workflow into core.
8. Pillar does not couple API experience to deployment tier.
9. Pillar does not treat webhook delivery as proof of ledger finality.
10. Pillar does not make DB projection equal to ledger truth.

---

# 4. Architecture

## 4.1 System Overview

```text
Client App / SDK / CLI
        |
        v
+-------------------------+
| Pillar API Edge         |
| - Auth                  |
| - API versioning        |
| - Idempotency           |
| - Rate limits           |
| - Request logging       |
+-----------+-------------+
            |
            v
+-------------------------+
| Product API Services    |
| - Accounts              |
| - Assets                |
| - Balances/Holdings     |
| - Transfer Intents      |
| - Settlement Intents    |
| - Allocations           |
| - Operations            |
+-----------+-------------+
            |
            v
+-------------------------+
| Intent Runtime          |
| - Policy checks         |
| - UTXO/Holding selector |
| - Approval workflow     |
| - Signing workflow      |
| - Command planning      |
| - Operation state       |
+-----------+-------------+
            |
            v
+-------------------------+
| Canton Runtime Adapter  |
| - Ledger API            |
| - Command submission    |
| - Completion watcher    |
| - Update stream         |
| - Interactive submit    |
| - Party/package mgmt    |
| - Token standard adapter|
+-----------+-------------+
            |
            v
       Canton Ledger
            |
            v
+-------------------------+
| Projection Runtime      |
| - ACS bootstrap         |
| - Update processor      |
| - Balance aggregation   |
| - Event generation      |
| - Reconciliation        |
+-----------+-------------+
            |
            v
+-------------------------+
| Pillar DB               |
| Config / Projection /   |
| Audit only              |
+-----------+-------------+
            |
            v
+-------------------------+
| Event/Webhook Runtime   |
| - Event outbox          |
| - Delivery retries      |
| - Signature verification|
| - Replay                |
+-------------------------+

Workbench reads: API logs, operations, projections, ledger traces, events, webhooks.
```

## 4.2 Architectural Layers

### Layer 1 — API Edge

Responsibilities:

* Authenticate API keys.
* Resolve tenant/environment.
* Enforce `Pillar-Version`.
* Enforce idempotency.
* Generate `request_id`.
* Normalize errors.
* Rate-limit.
* Record API request log.
* Route to product API services.

### Layer 2 — Product API Services

Responsibilities:

* Expose stable external objects.
* Validate business-level request shape.
* Never expose raw Canton command semantics by default.
* Create intents and operations.
* Read from projections.
* Provide expansion/include of related objects.

### Layer 3 — Intent Runtime

Responsibilities:

* Convert product intent into executable plan.
* Resolve account → party mapping.
* Resolve asset → instrument/registry/admin/synchronizer.
* Select holdings/UTXOs.
* Create allocation plan.
* Apply compliance and approval policy.
* Decide hosted submission vs external signing.
* Create command outbox entries.
* Maintain operation lifecycle.

### Layer 4 — Canton Runtime Adapter

Responsibilities:

* Use gRPC Ledger API and/or JSON Ledger API.
* Submit commands.
* Track completions.
* Stream updates.
* Manage parties and packages where authorized.
* Integrate token standard APIs.
* Execute interactive submission for external parties.
* Record ledger trace.

### Layer 5 — Projection Runtime

Responsibilities:

* Bootstrap from State Service / ACS.
* Consume Update Service stream.
* Update holding projection.
* Aggregate balance projection.
* Update intent status.
* Emit events.
* Maintain checkpoints.
* Rebuild projection from ledger state.
* Detect drift through reconciliation.

### Layer 6 — Event/Webhook Runtime

Responsibilities:

* Create immutable events from projection/operation transitions.
* Persist event outbox.
* Deliver webhooks at least once.
* Sign payloads.
* Retry with backoff.
* Support replay.
* Expose delivery logs in Workbench.

### Layer 7 — Workbench / CLI / SDK / Sandbox

Responsibilities:

* Make integration observable.
* Provide local development.
* Provide test events.
* Provide request logs.
* Provide ledger traces.
* Provide sandbox seeded state.
* Make debugging self-serve.

---

## 4.3 Source of Truth Invariant

**Canton Ledger is the only source of truth for financial state.**

Pillar DB can store:

* Config
* API request logs
* Idempotency records
* Operation state
* Ledger trace metadata
* Projections derived from ledger
* Webhook delivery logs
* Audit records

Pillar DB must not store:

* Authoritative balance
* Authoritative ownership
* Authoritative settlement state
* Off-ledger asset existence as final truth

When projection and ledger disagree, ledger wins.

---

## 4.4 Canton-invisible External API, Canton-native Internal Runtime

### External API must not expose by default

* `contractId`
* `templateId`
* `choice`
* `actAs`
* `readAs`
* `workflowId`
* `commandId`
* `synchronizerId`
* package IDs
* DAR/package vetting details
* raw ACS events

### Internal runtime must track

* party IDs
* participant IDs
* synchronizer IDs
* package IDs
* template/interface IDs
* choice names
* contract IDs
* command IDs
* submission IDs
* workflow IDs
* update IDs
* offsets
* completion status
* disclosed contracts
* external party signatures

---

# 5. API / Object Model

## 5.1 API Design Principles

1. Resource-oriented.
2. Versioned.
3. Idempotent writes.
4. Async-first.
5. Thin events by default.
6. Metadata on core objects.
7. Stable public IDs.
8. Expandable references.
9. Cursor/page-token pagination.
10. Machine-readable errors.
11. No raw Canton leakage in public API.
12. Ledger trace available only to authorized roles.

## 5.2 Headers

```http
Authorization: Bearer pk_live_...
Pillar-Version: 2026-05-26
Idempotency-Key: 8b7b0b3e-...
Pillar-Account: org_...
```

Response headers:

```http
Pillar-Request-Id: req_...
Pillar-Version: 2026-05-26
```

## 5.3 Core Objects

### Account

Represents a product-level actor or account that maps to one or more Canton parties.

```json
{
  "id": "acct_123",
  "object": "account",
  "type": "hosted_party",
  "status": "active",
  "display_name": "Alice Trading Account",
  "party_ref": "ptyref_abc",
  "default_asset_policy": "asset_policy_123",
  "metadata": {
    "customer_id": "cus_789"
  },
  "created": "2026-05-26T00:00:00Z"
}
```

Account types:

* `hosted_party`
* `external_party`
* `custodial_subaccount`
* `omnibus_account`
* `issuer_account`
* `bank_treasury`
* `settlement_account`

### Asset

Represents a Canton-backed asset or instrument.

```json
{
  "id": "asset_usdcx",
  "object": "asset",
  "symbol": "USDCx",
  "name": "USDC on Canton",
  "decimals": 6,
  "instrument_id": "USDCx",
  "registry": "registry_da",
  "admin_party_ref": "ptyref_admin",
  "status": "active",
  "capabilities": [
    "transfer",
    "allocation",
    "preapproval",
    "settlement"
  ],
  "metadata": {}
}
```

### Holding

Represents an atomic ledger-backed holding. It is UTXO-like but not exposed as a raw contract.

```json
{
  "id": "hld_123",
  "object": "holding",
  "account": "acct_123",
  "asset": "asset_usdcx",
  "amount": "1000.000000",
  "status": "active",
  "available": true,
  "locked_by": null,
  "ledger_ref": {
    "trace_id": "ltr_123"
  },
  "created": "2026-05-26T00:00:00Z"
}
```

Default policy: expose holding IDs but not contract IDs. Contract IDs are available only in privileged ledger trace views.

### Balance

Represents aggregated projection by account and asset.

```json
{
  "object": "balance",
  "account": "acct_123",
  "asset": "asset_usdcx",
  "available": "950.000000",
  "pending_incoming": "0.000000",
  "pending_outgoing": "50.000000",
  "locked": "0.000000",
  "settling": "50.000000",
  "as_of": "2026-05-26T00:00:10Z",
  "projection": {
    "offset": "000000000000123",
    "lag_ms": 220
  }
}
```

### TransferIntent

Represents an intent to move asset.

```json
{
  "id": "trint_123",
  "object": "transfer_intent",
  "status": "processing",
  "from_account": "acct_sender",
  "to_account": "acct_receiver",
  "asset": "asset_usdcx",
  "amount": "50.000000",
  "settlement_mode": "standard",
  "operation": "op_123",
  "client_reference_id": "order_987",
  "metadata": {
    "purpose": "customer_withdrawal"
  },
  "created": "2026-05-26T00:00:00Z"
}
```

Lifecycle:

```text
requires_confirmation
requires_approval
requires_signature
requires_input_selection
submitting
processing
settled
failed
canceled
expired
```

### Allocation

Represents locked holdings for transfer or settlement.

```json
{
  "id": "alloc_123",
  "object": "allocation",
  "status": "locked",
  "account": "acct_123",
  "asset": "asset_usdcx",
  "amount": "100.000000",
  "purpose": "settlement_intent",
  "purpose_id": "seti_123",
  "expires_at": "2026-05-26T01:00:00Z",
  "operation": "op_456"
}
```

Lifecycle:

```text
pending
locked
released
consumed
expired
failed
```

### SettlementIntent

Represents DvP, PvP, FoP, or multi-leg settlement.

```json
{
  "id": "seti_123",
  "object": "settlement_intent",
  "type": "dvp",
  "status": "requires_allocation",
  "legs": [
    {
      "type": "deliver",
      "from_account": "acct_seller",
      "to_account": "acct_buyer",
      "asset": "asset_bond_abc",
      "amount": "1000000"
    },
    {
      "type": "pay",
      "from_account": "acct_buyer",
      "to_account": "acct_seller",
      "asset": "asset_usdcx",
      "amount": "995000.000000"
    }
  ],
  "settlement_policy": "atomic_if_supported",
  "operation": "op_789",
  "metadata": {}
}
```

Lifecycle:

```text
requires_allocation
requires_approval
requires_signature
ready
submitting
settling
settled
failed
canceled
partially_released
```

### Operation

Represents an async write operation.

```json
{
  "id": "op_123",
  "object": "operation",
  "type": "transfer_intent.submit",
  "status": "ledger_submitted",
  "intent": {
    "type": "transfer_intent",
    "id": "trint_123"
  },
  "request_id": "req_123",
  "idempotency_key": "8b7b0b3e-...",
  "ledger_trace": "ltr_123",
  "created": "2026-05-26T00:00:00Z",
  "updated": "2026-05-26T00:00:04Z"
}
```

Lifecycle:

```text
queued
running
waiting_for_approval
waiting_for_signature
planned
ledger_submitting
ledger_submitted
ledger_committed
succeeded
failed
canceled
```

### Event

```json
{
  "id": "evt_123",
  "object": "event",
  "type": "transfer_intent.settled",
  "api_version": "2026-05-26",
  "created": "2026-05-26T00:00:10Z",
  "data": {
    "object": {
      "id": "trint_123",
      "object": "transfer_intent"
    }
  },
  "operation": "op_123",
  "request": {
    "id": "req_123",
    "idempotency_key": "8b7b0b3e-..."
  }
}
```

### LedgerTrace

Privileged object.

```json
{
  "id": "ltr_123",
  "object": "ledger_trace",
  "operation": "op_123",
  "workflow_id": "op_123",
  "command_id": "cmd_abc",
  "submission_ids": ["sub_1", "sub_2"],
  "update_id": "1220...",
  "completion_offset": "00000000000123",
  "synchronizer_id": "sync_global",
  "participant_id": "participant_abc",
  "affected_holdings": ["hld_1", "hld_2"],
  "internal_contract_refs": [
    {
      "contract_ref": "encrypted_or_redacted",
      "template": "Holding"
    }
  ]
}
```

---

## 5.4 API Endpoints

### Accounts

```http
POST /v1/accounts
GET  /v1/accounts/:id
POST /v1/accounts/:id/archive
```

### Assets

```http
GET  /v1/assets
GET  /v1/assets/:id
POST /v1/assets
POST /v1/assets/:id/activate
```

### Balances and Holdings

```http
GET /v1/balances?account=acct_123
GET /v1/balances/:account/:asset
GET /v1/holdings?account=acct_123&asset=asset_usdcx
GET /v1/holdings/:id
POST /v1/holdings/merge
```

### Transfer Intents

```http
POST /v1/transfer_intents
GET  /v1/transfer_intents/:id
POST /v1/transfer_intents/:id/confirm
POST /v1/transfer_intents/:id/cancel
```

### Allocations

```http
POST /v1/allocations
GET  /v1/allocations/:id
POST /v1/allocations/:id/release
```

### Settlement Intents

```http
POST /v1/settlement_intents
GET  /v1/settlement_intents/:id
POST /v1/settlement_intents/:id/confirm
POST /v1/settlement_intents/:id/cancel
```

### Operations

```http
GET /v1/operations/:id
GET /v1/operations?intent=trint_123
```

### Events

```http
GET /v1/events
GET /v1/events/:id
```

### Webhooks

```http
POST /v1/webhook_endpoints
GET  /v1/webhook_endpoints
GET  /v1/webhook_endpoints/:id
POST /v1/webhook_endpoints/:id/rotate_secret
POST /v1/webhook_endpoints/:id/test
```

### Ledger Trace

```http
GET /v1/ledger_traces/:id
GET /v1/operations/:id/ledger_trace
```

Access restricted to privileged roles.

---

## 5.5 Error Grammar

```json
{
  "error": {
    "type": "idempotency_error",
    "code": "idempotency_key_parameter_mismatch",
    "message": "This idempotency key was already used with different parameters.",
    "request_id": "req_123",
    "operation": "op_123",
    "doc_url": "https://docs.pillar.dev/errors/idempotency_key_parameter_mismatch"
  }
}
```

Error types:

* `authentication_error`
* `authorization_error`
* `invalid_request_error`
* `idempotency_error`
* `rate_limit_error`
* `ledger_error`
* `projection_error`
* `webhook_error`
* `compliance_error`
* `custody_error`
* `api_version_error`

---

# 6. Internal Runtime

## 6.1 Runtime Flow: TransferIntent

```text
1. Client POST /v1/transfer_intents
2. API Edge authenticates, versions, idempotency-checks
3. Product API creates transfer_intent + operation
4. Runtime resolves:
   - from_account -> party
   - to_account -> party or external recipient
   - asset -> instrument/registry/admin/synchronizer
5. Policy engine runs:
   - account status
   - asset restrictions
   - amount limits
   - AML/sanctions hook
   - custody approval requirement
6. Holding selector chooses input holdings/UTXOs
7. Runtime decides path:
   - hosted party command submit
   - external party prepare/sign/execute
   - two-step transfer requiring recipient accept/reject
8. Command outbox entry created
9. Canton adapter submits command or prepares transaction
10. Completion watcher updates operation status
11. Update stream processor updates projections
12. Event emitted
13. Webhook delivered
14. Workbench shows request -> operation -> ledger trace
```

## 6.2 Idempotency Strategy

Pillar idempotency has three layers.

### Layer 1 — API idempotency

* Key: `(tenant_id, environment_id, method, path, idempotency_key)`
* Store request parameter hash.
* Store response body/status once execution begins.
* Same key + same params → return same operation/result.
* Same key + different params → `idempotency_error`.
* TTL: configurable; default 24–72 hours for Hosted, longer for bank tiers.
* Sensitive data cannot be used as key.

### Layer 2 — Operation determinism

* Every write creates or resumes one `operation`.
* `operation.id` becomes the stable internal workflow anchor.
* Retried API request maps to same operation.

### Layer 3 — Ledger command dedup

* `command_id` derived from `operation.id` + logical command step.
* `workflow_id` = `operation.id` or `intent.id`.
* `submission_id` changes per retry attempt.
* Do not rely on ledger dedup alone because dedup guarantee is participant-scoped.

## 6.3 Command Outbox

Command outbox fields:

* `id`
* `operation_id`
* `step`
* `command_id`
* `workflow_id`
* `submission_id`
* `act_as_party_ref`
* `read_as_party_refs`
* `synchronizer_id`
* `package_selection`
* `command_payload_encrypted`
* `status`
* `attempt_count`
* `next_attempt_at`
* `ledger_update_id`
* `completion_offset`
* `created_at`
* `updated_at`

Status:

```text
pending
prepared
waiting_for_signature
ready_to_submit
submitting
submitted
completed
failed
canceled
```

## 6.4 Projection Runtime

Projection runtime has four jobs.

### ACS bootstrap

* Load active holdings/contracts visible to configured parties.
* Build initial `holding_projection`.
* Aggregate `balance_projection`.
* Record `projection_watermark`.

### Update stream processor

* Consume create/archive/exercise/update events.
* Apply deterministic projection changes.
* Map ledger events to Pillar objects.
* Advance offset checkpoint.

### Reconciliation

* Periodically compare projection with ACS snapshot.
* Record drift.
* Rebuild affected projections if needed.
* Alert Workbench.

### Event generation

* Convert projection and operation transitions into immutable Pillar events.
* Push to event outbox.

## 6.5 Holding / UTXO Management

Pillar must include:

* input holding selector
* minimum fragmentation policy
* max input count policy
* holding merge planner
* auto-merge operation
* locked holding exclusion
* settlement allocation reservation
* dust threshold policy
* issuer/admin restriction handling
* deterministic selection for retries

Selection policy examples:

```text
smallest_sufficient
oldest_first
minimize_fragmentation
prefer_unlocked
prefer_same_synchronizer
manual_holdings
```

## 6.6 Hosted vs External Party Execution

### Hosted party

Pillar can submit commands directly using configured participant credentials.

```text
plan -> submit command -> watch completion -> watch update -> emit event
```

### External party / custodian

Pillar must use prepare/sign/execute.

```text
plan -> prepare transaction -> create signing request -> custodian signs
     -> execute signed transaction -> watch completion/update -> emit event
```

The public API remains identical.

---

# 7. DB Schema

## 7.1 Schema Groups

Pillar DB has exactly three categories.

```text
Config      = customer/env/api/deployment settings
Projection  = derived ledger state
Audit       = request/operation/trace/event/webhook evidence
```

No table is authoritative for financial ownership.

---

## 7.2 Config Tables

### `tenants`

| Column     | Type        |
| ---------- | ----------- |
| id         | text pk     |
| name       | text        |
| tier       | enum        |
| status     | enum        |
| created_at | timestamptz |

### `environments`

| Column              | Type                    |
| ------------------- | ----------------------- |
| id                  | text pk                 |
| tenant_id           | text fk                 |
| mode                | enum: sandbox/test/live |
| api_version_default | text                    |
| region              | text                    |
| status              | enum                    |

### `api_keys`

| Column               | Type        |
| -------------------- | ----------- |
| id                   | text pk     |
| tenant_id            | text        |
| environment_id       | text        |
| key_prefix           | text        |
| key_hash             | text        |
| scopes               | jsonb       |
| restricted_resources | jsonb       |
| last_used_at         | timestamptz |
| revoked_at           | timestamptz |

### `account_configs`

| Column         | Type    |
| -------------- | ------- |
| id             | text pk |
| tenant_id      | text    |
| environment_id | text    |
| account_type   | enum    |
| status         | enum    |
| display_name   | text    |
| metadata       | jsonb   |

### `party_mappings`

| Column             | Type                               |
| ------------------ | ---------------------------------- |
| id                 | text pk                            |
| account_id         | text                               |
| party_id_encrypted | text                               |
| participant_id     | text                               |
| hosting_mode       | enum: hosted/external/multi_hosted |
| act_as_allowed     | bool                               |
| read_as_allowed    | bool                               |
| synchronizer_id    | text                               |

### `asset_registry_configs`

| Column          | Type    |
| --------------- | ------- |
| id              | text pk |
| environment_id  | text    |
| registry_type   | enum    |
| registry_url    | text    |
| admin_party_ref | text    |
| synchronizer_id | text    |
| status          | enum    |

### `instrument_configs`

| Column            | Type    |
| ----------------- | ------- |
| id                | text pk |
| asset_id          | text    |
| instrument_id     | text    |
| decimals          | int     |
| capabilities      | jsonb   |
| transfer_policy   | jsonb   |
| settlement_policy | jsonb   |
| metadata          | jsonb   |

### `webhook_endpoints`

| Column         | Type    |
| -------------- | ------- |
| id             | text pk |
| tenant_id      | text    |
| environment_id | text    |
| url            | text    |
| enabled_events | text[]  |
| api_version    | text    |
| secret_ref     | text    |
| status         | enum    |

---

## 7.3 Projection Tables

### `holding_projection`

| Column                        | Type          |
| ----------------------------- | ------------- |
| id                            | text pk       |
| tenant_id                     | text          |
| environment_id                | text          |
| account_id                    | text          |
| asset_id                      | text          |
| amount                        | numeric       |
| status                        | enum          |
| locked_by_allocation_id       | text nullable |
| ledger_contract_ref_encrypted | text          |
| template_id                   | text          |
| synchronizer_id               | text          |
| created_update_id             | text          |
| archived_update_id            | text nullable |
| created_offset                | text          |
| archived_offset               | text nullable |

### `balance_projection`

| Column            | Type        |
| ----------------- | ----------- |
| id                | text pk     |
| tenant_id         | text        |
| environment_id    | text        |
| account_id        | text        |
| asset_id          | text        |
| available         | numeric     |
| pending_incoming  | numeric     |
| pending_outgoing  | numeric     |
| locked            | numeric     |
| settling          | numeric     |
| total             | numeric     |
| as_of_offset      | text        |
| as_of_time        | timestamptz |
| projection_lag_ms | bigint      |

### `transfer_intent_projection`

| Column          | Type          |
| --------------- | ------------- |
| id              | text pk       |
| tenant_id       | text          |
| environment_id  | text          |
| status          | enum          |
| from_account_id | text          |
| to_account_id   | text          |
| asset_id        | text          |
| amount          | numeric       |
| operation_id    | text          |
| failure_code    | text nullable |
| metadata        | jsonb         |
| created_at      | timestamptz   |
| updated_at      | timestamptz   |

### `settlement_intent_projection`

| Column         | Type          |
| -------------- | ------------- |
| id             | text pk       |
| tenant_id      | text          |
| environment_id | text          |
| type           | enum          |
| status         | enum          |
| legs           | jsonb         |
| operation_id   | text          |
| failure_code   | text nullable |
| created_at     | timestamptz   |
| updated_at     | timestamptz   |

### `allocation_projection`

| Column       | Type        |
| ------------ | ----------- |
| id           | text pk     |
| status       | enum        |
| account_id   | text        |
| asset_id     | text        |
| amount       | numeric     |
| holding_ids  | text[]      |
| purpose_type | text        |
| purpose_id   | text        |
| expires_at   | timestamptz |

### `ledger_checkpoints`

| Column           | Type        |
| ---------------- | ----------- |
| id               | text pk     |
| tenant_id        | text        |
| environment_id   | text        |
| connector_id     | text        |
| party_scope_hash | text        |
| last_offset      | text        |
| last_update_id   | text        |
| updated_at       | timestamptz |

---

## 7.4 Audit / Control Tables

### `api_request_log`

| Column               | Type        |
| -------------------- | ----------- |
| id                   | text pk     |
| tenant_id            | text        |
| environment_id       | text        |
| request_id           | text        |
| method               | text        |
| path                 | text        |
| api_version          | text        |
| idempotency_key_hash | text        |
| status_code          | int         |
| error_code           | text        |
| operation_id         | text        |
| created_at           | timestamptz |

### `idempotency_entries`

| Column                  | Type        |
| ----------------------- | ----------- |
| id                      | text pk     |
| tenant_id               | text        |
| environment_id          | text        |
| method                  | text        |
| path                    | text        |
| key_hash                | text        |
| request_hash            | text        |
| response_status         | int         |
| response_body_encrypted | text        |
| operation_id            | text        |
| locked_until            | timestamptz |
| expires_at              | timestamptz |

### `operations`

| Column               | Type        |
| -------------------- | ----------- |
| id                   | text pk     |
| tenant_id            | text        |
| environment_id       | text        |
| type                 | text        |
| status               | enum        |
| intent_type          | text        |
| intent_id            | text        |
| request_id           | text        |
| idempotency_entry_id | text        |
| failure_code         | text        |
| failure_message      | text        |
| created_at           | timestamptz |
| updated_at           | timestamptz |

### `operation_attempts`

| Column         | Type        |
| -------------- | ----------- |
| id             | text pk     |
| operation_id   | text        |
| attempt_number | int         |
| status         | enum        |
| command_id     | text        |
| submission_id  | text        |
| started_at     | timestamptz |
| completed_at   | timestamptz |

### `operation_ledger_trace`

| Column                  | Type        |
| ----------------------- | ----------- |
| id                      | text pk     |
| operation_id            | text        |
| workflow_id             | text        |
| command_ids             | text[]      |
| submission_ids          | text[]      |
| update_ids              | text[]      |
| offsets                 | text[]      |
| synchronizer_ids        | text[]      |
| participant_ids         | text[]      |
| package_ids             | text[]      |
| contract_refs_encrypted | jsonb       |
| created_at              | timestamptz |

### `event_outbox`

| Column         | Type        |
| -------------- | ----------- |
| id             | text pk     |
| tenant_id      | text        |
| environment_id | text        |
| type           | text        |
| object_type    | text        |
| object_id      | text        |
| api_version    | text        |
| payload        | jsonb       |
| operation_id   | text        |
| created_at     | timestamptz |

### `webhook_deliveries`

| Column               | Type        |
| -------------------- | ----------- |
| id                   | text pk     |
| webhook_endpoint_id  | text        |
| event_id             | text        |
| status               | enum        |
| attempt_count        | int         |
| next_attempt_at      | timestamptz |
| last_response_status | int         |
| last_error           | text        |

### `webhook_delivery_attempts`

| Column               | Type        |
| -------------------- | ----------- |
| id                   | text pk     |
| delivery_id          | text        |
| attempt_number       | int         |
| request_headers      | jsonb       |
| response_status      | int         |
| response_body_sample | text        |
| error                | text        |
| created_at           | timestamptz |

### `reconciliation_runs`

| Column         | Type        |
| -------------- | ----------- |
| id             | text pk     |
| tenant_id      | text        |
| environment_id | text        |
| scope          | jsonb       |
| status         | enum        |
| drift_count    | int         |
| started_at     | timestamptz |
| completed_at   | timestamptz |

---

# 8. Failure Modes

| Failure Mode                                 | Example                                       | Pillar Response                                                                    |
| -------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Idempotency key reused with different params | Same key, different amount                    | Return `idempotency_key_parameter_mismatch`                                        |
| API response lost after operation created    | Client timeout after POST                     | Retry returns same operation                                                       |
| Command submitted, completion delayed        | Ledger command accepted but no completion yet | Operation stays `ledger_submitted`; completion watcher and update stream reconcile |
| Command duplicate                            | Retry hits same command ID                    | API idempotency resolves; ledger dedup is secondary                                |
| Participant outage                           | Canton connector unavailable                  | Operation remains queued/running; retry with backoff; Workbench alert              |
| Projection lag                               | Update stream behind ledger                   | Balance response includes `projection_lag_ms`; Workbench health alert              |
| Projection drift                             | Projection differs from ACS                   | Reconciliation run, rebuild affected account/asset projection                      |
| UTXO fragmentation                           | Too many small holdings                       | Auto-merge planner, holding selection constraints                                  |
| Insufficient available balance               | Holdings locked/pending                       | Return or transition to `requires_funding` / `failed`                              |
| External signer timeout                      | Custodian does not sign                       | Operation `waiting_for_signature`; expire after policy TTL                         |
| Approval rejected                            | Bank ops rejects transfer                     | Intent `canceled` or `failed` with compliance/custody reason                       |
| Recipient rejects transfer                   | Multi-step transfer rejected                  | Intent `failed` or `rejected`; release allocation                                  |
| Package version mismatch                     | Required choice unavailable                   | Runtime blocks operation; asset capability marked degraded                         |
| Synchronizer mismatch                        | Asset/party not on expected synchronizer      | Route according to config or fail with `synchronizer_not_supported`                |
| Webhook endpoint down                        | 500/timeout                                   | Retry with exponential backoff; mark delivery failed; allow replay                 |
| Webhook out of order                         | Network delay                                 | Events include created time, object status, and fetch-on-receipt guidance          |
| DB outage before command submit              | Operation not persisted                       | Do not submit command without persisted operation/outbox                           |
| DB outage after ledger commit                | Projection/event delayed                      | Rebuild from ledger update stream using checkpoint                                 |
| Ledger pruning risk                          | Needed trace pruned                           | Persist audit trace metadata; configure retention; export evidence                 |
| Tenant isolation error                       | Wrong account scope                           | Authz checks on every object; tenant/environment composite keys                    |
| API version mismatch                         | Old client receives new field semantics       | Version renderer returns payload according to pinned version                       |

---

# 9. Security / Compliance

## 9.1 Authentication and Authorization

* Secret API keys for server-side usage.
* Restricted API keys scoped by resource/action.
* Environment-scoped keys: sandbox/test/live.
* API key hash storage only.
* Key rotation.
* Last-used tracking.
* Optional mTLS for enterprise tiers.
* OIDC/SSO for Workbench.
* RBAC for Workbench and admin operations.

## 9.2 Canton Authorization Boundary

Pillar must maintain strict mapping between:

* Pillar tenant
* environment
* account
* Canton party
* participant
* synchronizer
* actAs/readAs rights

No API key should indirectly gain `actAs` over a party unless explicitly mapped and authorized.

## 9.3 Secrets and Key Management

Hosted:

* Pillar-managed KMS.
* Encrypted DB fields.
* Secret rotation.

Dedicated:

* Single-tenant KMS namespace.
* Optional customer-owned keys.

Hybrid:

* Customer-owned signer/HSM.
* Pillar may prepare but not sign.

Self-hosted:

* Customer-owned KMS/HSM.
* Pillar software integrates with local secret backend.

## 9.4 Webhook Security

* HMAC signature header: `Pillar-Signature`.
* Timestamped payload signing.
* Replay window.
* Secret rotation.
* Per-endpoint event filters.
* Delivery logs.
* Manual replay.
* SDK signature verification helpers.

## 9.5 Compliance Controls

Pillar core should provide policy hooks, not hard-code every regulation.

Policy hook points:

* account creation
* asset activation
* transfer intent creation
* transfer confirmation
* allocation creation
* settlement confirmation
* external signing approval
* withdrawal/deposit workflows
* issuer transfer restrictions

Evidence captured:

* request ID
* actor
* API key
* policy version
* approval decision
* screening provider reference
* operation ID
* ledger trace
* webhook delivery trace

## 9.6 Audit

Audit logs must include:

* API requests
* Workbench admin actions
* key creation/revocation
* webhook config changes
* policy changes
* approval decisions
* signing requests
* command submission attempts
* ledger trace exports
* reconciliation runs

## 9.7 Data Privacy

* Minimize PII in metadata.
* Encrypt sensitive metadata.
* Redact contract IDs by default.
* Tenant/environment isolation.
* Support data residency for Dedicated/Hybrid/Self-hosted.
* Ledger trace access requires privileged permission.

---

# 10. Implementation Plan

## Phase 0 — Product and API Grammar Lock

Deliverables:

* Pillar object model v1.
* API naming conventions.
* Error code taxonomy.
* Event taxonomy.
* API versioning policy.
* Idempotency specification.
* Public ID prefix policy.
* Expansion/include policy.
* Metadata policy.
* Sandbox/test/live environment model.

Exit criteria:

* OpenAPI draft for `/v1`.
* Example transfer flow.
* Example settlement flow.
* Example webhook payload.
* Example Workbench trace.

## Phase 1 — Core Platform Foundation

Deliverables:

* API Edge.
* API key auth.
* Tenant/environment model.
* Request logging.
* Idempotency store.
* Operation store.
* Command outbox.
* Event outbox.
* Basic Workbench request log.

Exit criteria:

* POST write returns stable operation under retry.
* Idempotency mismatch detected.
* Request logs visible.

## Phase 2 — Canton Connector and Projection Runtime

Deliverables:

* Ledger API connector.
* Command submission.
* Completion watcher.
* Update stream consumer.
* ACS bootstrap.
* Checkpointing.
* Holding projection.
* Balance aggregation.
* Ledger trace persistence.

Exit criteria:

* Create/exercise/archive updates reflected in holdings/balances.
* Projection rebuild works.
* Operation maps to ledger trace.

## Phase 3 — TransferIntent MVP

Deliverables:

* `POST /v1/transfer_intents`.
* Hosted party transfer path.
* Holding selector.
* Operation lifecycle.
* Transfer events.
* Webhook delivery.
* CLI `pillar transfer_intents create`.
* Workbench operation detail page.

Exit criteria:

* First sandbox transfer works end-to-end.
* Client receives webhook.
* Workbench shows request → operation → ledger trace.

## Phase 4 — SDK / CLI / Sandbox

Deliverables:

* Node SDK.
* Python SDK.
* CLI auth.
* `pillar listen`.
* `pillar trigger`.
* `pillar logs tail`.
* Seeded sandbox accounts/assets.
* Sandbox reset.
* Webhook signature verification helpers.

Exit criteria:

* Developer can complete first transfer using SDK + CLI.
* Local webhook testing works.

## Phase 5 — Allocation and SettlementIntent

Deliverables:

* Allocation API.
* SettlementIntent API.
* DvP/PvP/FoP leg model.
* Multi-leg operation planner.
* Allocation locking/release.
* Settlement event taxonomy.
* Workbench settlement graph.

Exit criteria:

* DvP settlement succeeds in sandbox.
* Failed settlement releases allocations deterministically.

## Phase 6 — External Party / Custodian Flow

Deliverables:

* Prepare/sign/execute integration.
* Signing request object.
* Custodian approval workflow.
* HSM/KMS integration hooks.
* Timeout/expiry policy.
* Ledger trace for signing evidence.

Exit criteria:

* Hybrid flow works without Pillar holding signing key.
* Workbench shows signing lifecycle.

## Phase 7 — Compliance and Enterprise Controls

Deliverables:

* Policy engine.
* Approval queues.
* RBAC.
* SSO/OIDC.
* mTLS/private networking.
* Audit export.
* SIEM export.
* Reconciliation dashboard.
* Data residency controls.

Exit criteria:

* Bank/custodian pilot can meet audit and control requirements.

## Phase 8 — Deployment Tiers

Deliverables:

* Hosted deployment.
* Dedicated deployment.
* Hybrid connector.
* Self-hosted Helm/Terraform.
* Upgrade process.
* Support bundle export.
* DR/backup runbooks.

Exit criteria:

* Same API contract passes across all tiers.
* Self-hosted upgrade test passes.

---

# 11. Open Questions

1. Which assets are first-class at launch: Canton Coin, USDCx, issuer-defined RWA, or all CIP-0056 tokens?
2. Should Pillar expose holding IDs to all clients, or only balance by default?
3. Should public API version use date-based naming like `2026-05-26` or named releases?
4. What is the default webhook style: thin event only, or optional snapshot expansion?
5. Should `transfer_intent` support both 1-step and 2-step transfer in one object or separate modes?
6. What is the default UTXO selection policy per asset?
7. How much ledger trace should be visible in Hosted tier?
8. Should Pillar support customer-provided participant nodes in Hosted, or only in Hybrid?
9. What is the minimum viable Workbench for launch?
10. What compliance providers should be integrated first?
11. Should issuance be in v1 core or an issuer module?
12. What is Pillar’s legal posture: software provider, infrastructure provider, custodian, transfer agent partner, or none?
13. Should Pillar support cross-synchronizer DvP in v1 or defer?
14. What are the retention requirements for operation ledger trace?
15. What is the projection freshness SLA per deployment tier?
16. Should self-hosted deployments phone home for license/telemetry or support fully offline mode?
17. Should SDKs pin API versions automatically?
18. What is the canonical mapping from Canton token standard objects to Pillar `asset`, `holding`, and `allocation`?
19. How should Pillar handle package upgrades and template migrations?
20. Should Workbench include raw Canton debug views for advanced customers?

---

# 12. Agent-ready Checklist

## A. Product / Positioning

* [ ] Freeze one-liner: “Stripe-grade API operating system for Canton-backed assets.”
* [ ] Define primary ICPs: developer, fintech, RWA issuer, bank, custodian.
* [ ] Write persona-specific value proposition.
* [ ] Write “Pillar vs Direct Canton” page.
* [ ] Write “Why not Gateway” page.
* [ ] Write “What we copy from Stripe” page.
* [ ] Write “What we do not copy from Stripe” page.
* [ ] Define competitive category map.
* [ ] Define product tier matrix.
* [ ] Define landing page hero copy.
* [ ] Define 30-second pitch.
* [ ] Define solution narrative for enterprise buyers.

## B. API Grammar

* [ ] Define public ID prefixes.
* [ ] Define object envelope.
* [ ] Define list pagination.
* [ ] Define metadata rules.
* [ ] Define expand/include rules.
* [ ] Define error object.
* [ ] Define request ID behavior.
* [ ] Define API version header.
* [ ] Define default account API version.
* [ ] Define webhook endpoint API version.
* [ ] Define idempotency key behavior.
* [ ] Define idempotency TTL.
* [ ] Define idempotency mismatch error.
* [ ] Define retry-safe write behavior.
* [ ] Define all v1 endpoints.
* [ ] Generate OpenAPI spec.
* [ ] Build API compatibility test suite.

## C. Object Model

* [ ] Define `Account`.
* [ ] Define `Asset`.
* [ ] Define `Holding`.
* [ ] Define `Balance`.
* [ ] Define `TransferIntent`.
* [ ] Define `Allocation`.
* [ ] Define `SettlementIntent`.
* [ ] Define `Operation`.
* [ ] Define `Event`.
* [ ] Define `WebhookEndpoint`.
* [ ] Define `LedgerTrace`.
* [ ] Define `SigningRequest`.
* [ ] Define `Approval`.
* [ ] Define lifecycle statuses.
* [ ] Define status transition matrix.
* [ ] Define object visibility by role.
* [ ] Define ledger trace redaction policy.

## D. Canton Runtime

* [ ] Implement party resolver.
* [ ] Implement account-to-party mapping.
* [ ] Implement asset-to-instrument mapping.
* [ ] Implement synchronizer router.
* [ ] Implement package registry.
* [ ] Implement package version compatibility check.
* [ ] Implement package vetting checks where applicable.
* [ ] Implement template/interface/choice registry.
* [ ] Implement token standard adapter.
* [ ] Implement holding reader.
* [ ] Implement UTXO selector.
* [ ] Implement holding merge planner.
* [ ] Implement command builder.
* [ ] Implement command outbox.
* [ ] Implement command submission.
* [ ] Implement command completion watcher.
* [ ] Implement update stream consumer.
* [ ] Implement ACS bootstrap.
* [ ] Implement projection checkpointing.
* [ ] Implement external party prepare flow.
* [ ] Implement signing request flow.
* [ ] Implement execute signed transaction flow.
* [ ] Implement ledger error mapper.
* [ ] Implement ledger trace recorder.
* [ ] Implement command retry policy.
* [ ] Implement reconciliation job.

## E. Projection / DB

* [ ] Create config schema.
* [ ] Create projection schema.
* [ ] Create audit/control schema.
* [ ] Implement `tenants`.
* [ ] Implement `environments`.
* [ ] Implement `api_keys`.
* [ ] Implement `account_configs`.
* [ ] Implement `party_mappings`.
* [ ] Implement `asset_registry_configs`.
* [ ] Implement `instrument_configs`.
* [ ] Implement `holding_projection`.
* [ ] Implement `balance_projection`.
* [ ] Implement `transfer_intent_projection`.
* [ ] Implement `settlement_intent_projection`.
* [ ] Implement `allocation_projection`.
* [ ] Implement `operations`.
* [ ] Implement `operation_attempts`.
* [ ] Implement `operation_ledger_trace`.
* [ ] Implement `api_request_log`.
* [ ] Implement `idempotency_entries`.
* [ ] Implement `event_outbox`.
* [ ] Implement `webhook_deliveries`.
* [ ] Implement `ledger_checkpoints`.
* [ ] Implement projection rebuild.
* [ ] Implement reconciliation diffs.
* [ ] Test no-authoritative-balance invariant.

## F. Events / Webhooks

* [ ] Define event envelope.
* [ ] Define event type taxonomy.
* [ ] Implement immutable event store.
* [ ] Implement event rendering by API version.
* [ ] Implement webhook endpoint CRUD.
* [ ] Implement endpoint secret generation.
* [ ] Implement HMAC signature.
* [ ] Implement timestamp replay protection.
* [ ] Implement delivery outbox.
* [ ] Implement retry backoff.
* [ ] Implement dead-letter state.
* [ ] Implement manual replay.
* [ ] Implement endpoint event filters.
* [ ] Implement test event trigger.
* [ ] Implement webhook delivery logs.
* [ ] Implement SDK signature verifier.
* [ ] Implement `pillar listen`.
* [ ] Implement `pillar trigger`.

## G. Workbench

* [ ] Build API request log explorer.
* [ ] Build request detail page.
* [ ] Build idempotency detail page.
* [ ] Build operation detail page.
* [ ] Build ledger trace explorer.
* [ ] Build balance explorer.
* [ ] Build holding explorer.
* [ ] Build transfer lifecycle view.
* [ ] Build settlement graph view.
* [ ] Build webhook endpoint manager.
* [ ] Build webhook delivery viewer.
* [ ] Build webhook replay UI.
* [ ] Build event explorer.
* [ ] Build API version dashboard.
* [ ] Build projection lag dashboard.
* [ ] Build connector health dashboard.
* [ ] Build UTXO fragmentation dashboard.
* [ ] Build reconciliation report.
* [ ] Build approval queue.
* [ ] Build signing request view.
* [ ] Build RBAC-scoped views.

## H. SDK / CLI / Sandbox

* [ ] Generate Node SDK.
* [ ] Generate Python SDK.
* [ ] Generate Java SDK.
* [ ] Generate Go SDK.
* [ ] Implement SDK idempotency helper.
* [ ] Implement SDK retry helper.
* [ ] Implement SDK webhook verifier.
* [ ] Implement SDK pagination helper.
* [ ] Implement SDK API version pinning.
* [ ] Implement `pillar login`.
* [ ] Implement `pillar accounts list`.
* [ ] Implement `pillar balances list`.
* [ ] Implement `pillar holdings list`.
* [ ] Implement `pillar transfer_intents create`.
* [ ] Implement `pillar settlement_intents create`.
* [ ] Implement `pillar operations retrieve`.
* [ ] Implement `pillar events list`.
* [ ] Implement `pillar logs tail`.
* [ ] Implement `pillar ledger-trace`.
* [ ] Implement sandbox seeded accounts.
* [ ] Implement sandbox seeded assets.
* [ ] Implement sandbox reset.
* [ ] Implement sandbox webhook simulation.
* [ ] Write first transfer quickstart.
* [ ] Write first DvP settlement quickstart.

## I. Security / Compliance

* [ ] Define API key policy.
* [ ] Implement key hashing.
* [ ] Implement restricted keys.
* [ ] Implement key rotation.
* [ ] Implement key last-used tracking.
* [ ] Implement RBAC.
* [ ] Implement SSO/OIDC.
* [ ] Implement mTLS option.
* [ ] Implement IP allowlist.
* [ ] Implement tenant isolation.
* [ ] Implement environment isolation.
* [ ] Implement field-level encryption.
* [ ] Implement customer KMS option.
* [ ] Implement webhook secret rotation.
* [ ] Implement policy engine.
* [ ] Implement approval workflow.
* [ ] Implement custody signing workflow.
* [ ] Implement audit log.
* [ ] Implement SIEM export.
* [ ] Implement compliance evidence export.
* [ ] Implement data residency controls.
* [ ] Implement retention policy.
* [ ] Write incident response runbook.
* [ ] Write key compromise runbook.
* [ ] Write webhook compromise runbook.

## J. Deployment

* [ ] Define Hosted architecture.
* [ ] Define Dedicated architecture.
* [ ] Define Hybrid architecture.
* [ ] Define Self-hosted architecture.
* [ ] Implement Helm chart.
* [ ] Implement Terraform modules.
* [ ] Implement private networking.
* [ ] Implement customer DB option.
* [ ] Implement customer KMS option.
* [ ] Implement customer validator connector.
* [ ] Implement deployment-tier feature matrix.
* [ ] Implement deployment-tier API invariance tests.
* [ ] Implement observability stack.
* [ ] Define SLOs.
* [ ] Implement backup/restore.
* [ ] Implement DR runbook.
* [ ] Implement support bundle export.
* [ ] Implement self-hosted upgrade process.

## K. Testing / QA

* [ ] API contract tests.
* [ ] API version compatibility tests.
* [ ] Idempotency tests.
* [ ] Idempotency mismatch tests.
* [ ] Lost response after commit simulation.
* [ ] Ledger command retry tests.
* [ ] Completion delay tests.
* [ ] Update stream interruption tests.
* [ ] Projection rebuild tests.
* [ ] ACS reconciliation tests.
* [ ] TransferIntent lifecycle tests.
* [ ] SettlementIntent lifecycle tests.
* [ ] Allocation lifecycle tests.
* [ ] UTXO selection tests.
* [ ] UTXO fragmentation tests.
* [ ] External signing timeout tests.
* [ ] Approval rejection tests.
* [ ] Webhook signature tests.
* [ ] Webhook retry tests.
* [ ] Webhook replay tests.
* [ ] Tenant isolation tests.
* [ ] RBAC tests.
* [ ] Deployment-tier invariance tests.
* [ ] Load tests.
* [ ] Chaos tests.
* [ ] DR restore tests.

## L. Documentation

* [ ] Product positioning.
* [ ] Architecture overview.
* [ ] API reference.
* [ ] Object model reference.
* [ ] Idempotency guide.
* [ ] API versioning guide.
* [ ] Webhook guide.
* [ ] Webhook security guide.
* [ ] Error code reference.
* [ ] Ledger trace guide.
* [ ] Balance/Holding model guide.
* [ ] TransferIntent guide.
* [ ] Allocation guide.
* [ ] SettlementIntent guide.
* [ ] External signing guide.
* [ ] Sandbox quickstart.
* [ ] CLI reference.
* [ ] SDK reference.
* [ ] Workbench guide.
* [ ] Deployment tier guide.
* [ ] Hosted onboarding guide.
* [ ] Dedicated onboarding guide.
* [ ] Hybrid integration guide.
* [ ] Self-hosted installation guide.
* [ ] Compliance evidence guide.
* [ ] Reconciliation guide.
* [ ] Operational runbooks.

---

# 13. Final Design Decision

**Pillar는 Canton Gateway가 아니다.**

Pillar의 정체성은 다음 문장으로 고정한다.

> **Pillar is the Stripe-grade API operating system for Canton-backed assets.**

이 결정은 제품, 아키텍처, API, 런타임, DB, 보안, 배포를 모두 지배한다.

* Canton Ledger가 source of truth다.
* Pillar DB는 projection / audit / config만 저장한다.
* 외부 API는 Stripe-like하고 Canton-invisible해야 한다.
* 내부 runtime은 Canton-native해야 한다.
* 모든 operation은 ledger-traceable해야 한다.
* 제품 모델은 contract-first가 아니라 balance/holding-first다.
* write model은 transaction-first가 아니라 intent-first다.
* workflow는 webhook-first다.
* API grammar는 day one부터 Stripe-grade여야 한다.
* Hosted / Dedicated / Hybrid / Self-hosted가 달라도 API 경험은 바뀌면 안 된다.

**최종적으로 Pillar가 팔아야 하는 것은 “Canton 연결”이 아니라, Canton 기반 자산을 제품으로 만들 수 있는 운영체제다.**

[1]: https://docs.stripe.com/api "docs.stripe.com"
[2]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[3]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[4]: https://docs.stripe.com/api-v2-overview "docs.stripe.com"
[5]: https://docs.stripe.com/webhooks "docs.stripe.com"
[6]: https://docs.stripe.com/stripe-cli/use-cli "docs.stripe.com"
[7]: https://docs.stripe.com/workbench "docs.stripe.com"
[8]: https://docs.stripe.com/api/events/types "docs.stripe.com"
[9]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[10]: https://docs.digitalasset.com/build/3.4/reference/json-api/openapi.html "JSON Ledger API OpenAPI definition — Digital Asset’s platform documentation"
[11]: https://docs.canton.network/reference/json-api-reference/v2commandsasyncsubmit "/v2/commands/async/submit - Canton Network Docs"
[12]: https://docs.digitalasset.com/build/3.5/tutorials/smart-contracts/contracts.html "Basic contracts — Digital Asset’s platform documentation"
[13]: https://docs.canton.network/overview/reference/canton-protocol-specification "Canton Protocol Specification - Canton Network Docs"
[14]: https://docs.digitalasset.com/overview/3.4/explanations/canton/external-party.html "Local and external parties — Digital Asset’s platform documentation"
[15]: https://docs.digitalasset.com/integrate/devnet/integrating-with-canton-network/index.html "Integrating with the Canton Network — Digital Asset’s platform documentation"
[16]: https://docs.digitalasset.com/integrate/devnet/release-notes/index.html "Wallet SDK Release Notes — Digital Asset’s platform documentation"
