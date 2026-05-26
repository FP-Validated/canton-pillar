# 4. Pillar Object Model — Canton-backed Assets용 완성형 객체 모델

## Executive Summary

Pillar는 **“Stripe for Canton-backed assets”** 로 설계한다. 외부 개발자는 Canton, Daml, contract id, party id, participant, synchronizer 같은 개념을 직접 다루지 않는다. 외부 API는 Stripe처럼 **객체 중심, intent-first, webhook-first, idempotency-first** 로 동작한다. 내부 런타임은 Canton-native로 구현되며, 경제적 상태의 최종 진실은 항상 Canton Ledger다.

핵심 설계 결론은 다음과 같다.

| 원칙                              | Pillar 설계 결정                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Ledger is source of truth       | Holding, Balance, Transfer, Settlement, Lock, Redemption, Claim 등 경제 객체는 Canton Ledger 상태에서 projection된다. |
| DB는 Projection / Audit / Config | DB에는 config, request log, idempotency cache, ledger trace, webhook delivery, projection만 저장한다.            |
| Stripe-like external API        | 모든 객체는 `id`, `object`, `created`, `livemode`, `metadata`, `status` 문법을 가진다.                               |
| Canton-invisible API            | public API에는 `contractId`, `partyId`, `participantId`를 노출하지 않는다. 필요 시 `ledger_trace`만 제한적으로 expand한다.     |
| Balance/Holding-first           | 개발자가 contract가 아니라 `holding`, `balance`, `balance_transaction`을 중심으로 읽는다.                                 |
| Intent-first                    | write API는 `TransferIntent`, `SettlementIntent`, `Redemption`, `Claim` 중심이다.                              |
| Webhook-first                   | 비동기 상태 변경은 `Event`와 `WebhookDelivery`로 전달한다.                                                              |
| Operations traceable            | 모든 mutating request는 `RequestLog → LedgerTrace → Projection → Event → WebhookDelivery`로 추적된다.             |
| Deployment-independent UX       | hosted participant, customer participant, hybrid, sandbox 모두 같은 API 문법을 쓴다.                               |

공식 문서 기준으로 Stripe API는 REST resource URL, JSON response, standard HTTP verbs/status/auth를 사용하는 객체형 API이며, sandbox와 live는 API key에 따라 구분된다. Pillar도 같은 API grammar를 채택한다. ([Stripe Docs][1]) Stripe의 idempotency는 모든 `POST`에 적용 가능하고, 같은 key의 첫 결과를 저장해 retry에 동일 결과를 반환하는 구조다. Pillar도 같은 semantics를 쓰되, 내부 Canton command deduplication과 연결한다. ([Stripe Docs][2]) Canton Ledger API는 participant node가 노출하며, gRPC와 JSON API를 제공하고, commands, completions, updates, active contract state, package, party, user management 같은 서비스를 포함한다. Pillar runtime은 이 Ledger API를 내부 write/read backbone으로 사용한다. ([Digital Asset Documentation][3]) ([Digital Asset Documentation][4])

---

# Goals / Non-goals

## Goals

1. **Stripe-grade public API**

   * 리소스 URL, stable object schema, `expand[]`, cursor pagination, idempotency, versioned event payload, webhook retry를 기본 제공한다.

2. **Canton-native execution**

   * 내부 write는 Daml command / choice execution으로 처리한다.
   * Ledger API command submission, completion, update stream, ACS bootstrap을 runtime primitive로 사용한다.

3. **Balance/Holding-first abstraction**

   * 외부 개발자는 Daml contract graph를 이해하지 않아도 된다.
   * `Holding`, `Balance`, `BalanceTransaction`, `LedgerEntry`가 핵심 read model이다.

4. **Intent-first orchestration**

   * `TransferIntent`, `SettlementIntent`, `Redemption`, `Claim`은 사용자의 “의도”를 표현한다.
   * 실제 ledger mutation은 intent 상태 머신의 결과로 발생한다.

5. **Traceable operations**

   * 모든 API mutation은 `RequestLog`, `LedgerTrace`, `Event`, `WebhookDelivery`로 감사 가능해야 한다.

6. **Deployment model abstraction**

   * hosted participant, customer-controlled participant, hybrid participant, sandbox 모두 동일 API를 사용한다.

7. **Replayable projections**

   * DB projection은 ledger update stream 또는 PQS에서 재생 가능해야 한다.
   * DB 손상 시 ledger에서 재구축할 수 있어야 한다.

## Non-goals

1. **DB를 경제적 source of truth로 만들지 않는다.**

   * DB balance row를 직접 수정해 자산 상태를 바꾸는 API는 없다.

2. **외부 API에 Canton/Daml raw primitive를 노출하지 않는다.**

   * `contractId`, raw Daml template id, raw party id는 기본 response에서 숨긴다.

3. **bulk mutation API를 v1 grammar로 제공하지 않는다.**

   * Stripe API도 bulk update를 일반 API 기본 문법으로 제공하지 않는다. Pillar는 batch mutation을 `SettlementIntent.legs[]` 또는 async job으로 표현한다. ([Stripe Docs][1])

4. **Daml contract key에 핵심 uniqueness를 의존하지 않는다.**

   * Canton 3.x 문서상 contract key는 지원되지 않으며 unique key 지원 계획도 없다고 명시되어 있다. Pillar는 public object id, command deduplication, on-ledger registry/assertion choice로 uniqueness를 관리한다. ([Digital Asset Documentation][5])

5. **Webhook을 부가 기능으로 취급하지 않는다.**

   * 비동기 workflow의 primary completion channel은 webhook이다.

---

# 공식 문서 리서치 요약

## Stripe API grammar

Stripe API는 REST resource URL, JSON response, standard HTTP status code, authentication, verbs를 사용하는 구조다. Pillar public API도 이 문법을 기준으로 삼는다. ([Stripe Docs][1])

Stripe object ecosystem에서 `Balance`는 available/pending balance 배열을 제공하고, `BalanceTransaction`은 Stripe 계정 balance에 들어오거나 나가는 모든 자금 이동을 나타낸다. Pillar의 `Balance`와 `BalanceTransaction`은 이 문법을 Canton-backed assets에 맞게 확장한다. ([Stripe Docs][6]) ([Stripe Docs][7])

Stripe `Event` 객체는 `id`, `object`, `api_version`, `data.object`, `previous_attributes`, `pending_webhooks`, `request.id`, `request.idempotency_key`, `type` 등을 포함한다. Pillar `Event`도 동일하게 API-versioned immutable snapshot으로 설계한다. ([Stripe Docs][8])

## API versioning

Stripe는 API version을 계정/Workbench default 또는 `Stripe-Version` header로 관리하고, webhook event는 endpoint 생성 시점 또는 계정 default version의 영향을 받는다. 공식 문서의 확인 시점 기준 current version은 `2026-04-22.dahlia`다. Pillar는 `Pillar-Version` header와 endpoint-level event version을 채택한다. ([Stripe Docs][9])

## Idempotency

Stripe는 idempotency key를 모든 `POST`에 적용할 수 있고, 최초 request의 status code와 body를 저장해 retry에 재사용한다. key는 충분히 random한 UUID를 권장하며, parameter mismatch는 오류로 처리된다. Pillar는 이 구조를 그대로 채택하고, 내부적으로 Canton command id / deduplication window와 연결한다. ([Stripe Docs][2])

Canton 문서는 command deduplication에서 change id가 `act_as parties + user id + command id`로 구성되고, deduplication period 안의 동일 change id 성공 completion 또는 in-flight command를 duplicate로 본다고 설명한다. Pillar는 `Idempotency-Key → command_id` 매핑을 이 모델에 맞춘다. ([Canton Network Docs][10])

## Webhook

Stripe webhook은 HTTPS endpoint로 event를 push하며, endpoint는 복잡한 작업 전에 빠르게 2xx를 반환해야 한다. Event object는 생성 후 변경되지 않는다. Pillar도 Event immutable snapshot과 WebhookDelivery retry/audit 모델을 사용한다. ([Stripe Docs][11])

## Canton / Daml / Ledger API

Canton Ledger API는 participant node가 노출하는 primary API이며, gRPC와 JSON protocol을 제공한다. Daml은 DAR/Daml-LF로 컴파일되고, Ledger API를 통해 command submission, update stream, ACS, party/user/package management 등이 수행된다. ([Digital Asset Documentation][3]) ([Digital Asset Documentation][4])

Canton app architecture 문서는 frontend가 ledger와 직접 통신하지 않고 backend가 Ledger API로 command를 보낸다고 설명한다. Pillar도 API backend가 ledger write를 담당하고, frontend/SDK는 Canton을 직접 다루지 않는다. ([Canton Network Docs][12])

공식 architecture guidance는 read path에서 PQS를 operational datastore로 사용하고, write path에서 retry/idempotency를 설계해야 한다고 설명한다. Pillar는 Projection DB/PQS 기반 read model과 command outbox 기반 write model을 분리한다. ([Canton Network Docs][12]) ([Canton Network Docs][12])

Daml execution model에서는 Ledger API command가 interpretation, validation/collision detection, commitment, completion을 거치며, transaction은 atomic하다. Pillar의 settlement는 가능한 경우 하나의 Daml transaction으로 atomic commit하고, 불가능한 cross-boundary workflow는 lock/intent protocol로 표현한다. ([Digital Asset Documentation][13])

## SDK / Workbench / CLI / Sandbox

Canton SDK 문서는 Daml SDK가 compiler, codegen, sandbox, test tools를 포함하며, `dpm build`, `dpm test`, `dpm sandbox`, `dpm codegen-java/js` 같은 명령을 제공한다고 설명한다. Pillar의 internal SDK/toolchain은 DPM 기반으로 구성한다. ([Canton Network Docs][14])

Canton 개발 도구 문서는 DPM이 primary CLI이고, Sandbox는 single-node local testing, LocalNet은 Docker Compose 기반 multi-validator simulation을 제공한다고 설명한다. Pillar는 local dev에서 Sandbox, integration dev에서 LocalNet, production에서 managed/customer participant를 지원한다. ([Canton Network Docs][15])

Stripe Workbench는 API Explorer, Shell, event destinations, health insights를 제공하고, Stripe CLI는 sandbox resource 관리, API call, webhook testing을 지원한다. Pillar도 `pillar workbench`와 `pillar cli`를 같은 개발자 경험으로 설계한다. ([Stripe Docs][16]) ([Stripe Docs][17])

Stripe Sandboxes는 live integration에 영향 없이 기능을 테스트할 수 있는 isolated test environment를 제공한다. Pillar `Environment.mode=sandbox|test|live`와 `TestClock`은 이 구조를 차용한다. ([Stripe Docs][18])

---

# Architecture

## 1. High-level architecture

```text
Client / SDK / CLI / Workbench
        |
        v
Pillar API Gateway
- auth
- API versioning
- idempotency
- request logging
- object rendering
        |
        v
Object Service Layer
- AccountService
- AssetService
- HoldingService
- TransferIntentService
- SettlementIntentService
- RedemptionService
- ClaimService
        |
        v
Command Outbox / Canton Runner
- command construction
- command_id / submission_id
- retry
- completion tracking
- ledger trace capture
        |
        v
Canton Participant
- Ledger API gRPC
- JSON API for dev/diagnostics
- Party/User/Package services
        |
        v
Canton Ledger / Synchronizer
        |
        v
Projection Runtime
- ACS bootstrap
- Update stream
- PQS integration
- projection materializer
        |
        v
Projection DB / Event Store
        |
        +--------------------+
        |                    |
        v                    v
Webhook Dispatcher       Workbench / Dashboard
```

## 2. Core architectural rule

Pillar objects are split into three categories.

| Category                       | Objects                                                                                                                                                           | Source of truth                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Config objects                 | `Organization`, `Project`, `Environment`, `Participant`, `WebhookEndpoint`, `Template`, `File`, `TestClock`                                                       | Pillar Config DB                       |
| Ledger-backed economic objects | `Account`, `AssetClass`, `Asset`, `Holding`, `Balance`, `TransferIntent`, `Transfer`, `SettlementIntent`, `Settlement`, `Lock`, `Redemption`, `Reversal`, `Claim` | Canton Ledger                          |
| Audit / runtime objects        | `RequestLog`, `LedgerTrace`, `Event`, `WebhookDelivery`, `BalanceTransaction`, `LedgerEntry`                                                                      | Derived from API + Ledger + Projection |

`Account`은 config 성격도 있지만, ledger-backed identity/authorization과 연결되므로 hybrid object로 취급한다. public object row는 DB에 존재할 수 있지만, 경제적 권한과 자산 보유 상태는 ledger가 결정한다.

## 3. Public API conventions

모든 public object는 다음 공통 필드를 가진다.

```json
{
  "id": "ti_...",
  "object": "transfer_intent",
  "created": 1770000000,
  "updated": 1770000100,
  "livemode": false,
  "environment": "env_...",
  "metadata": {},
  "status": "processing"
}
```

## 4. Object ID prefixes

| Object             | Prefix   |
| ------------------ | -------- |
| Organization       | `org_`   |
| Project            | `proj_`  |
| Environment        | `env_`   |
| Account            | `acct_`  |
| Capability         | `cap_`   |
| Participant        | `ptcp_`  |
| PartyMapping       | `pm_`    |
| AssetClass         | `acls_`  |
| Asset              | `ast_`   |
| Holding            | `hld_`   |
| Balance            | `bal_`   |
| BalanceTransaction | `btxn_`  |
| LedgerEntry        | `le_`    |
| TransferIntent     | `ti_`    |
| Transfer           | `tr_`    |
| SettlementIntent   | `si_`    |
| Settlement         | `set_`   |
| Lock               | `lock_`  |
| Redemption         | `red_`   |
| Reversal           | `rev_`   |
| Claim              | `clm_`   |
| Event              | `evt_`   |
| WebhookEndpoint    | `we_`    |
| WebhookDelivery    | `wd_`    |
| RequestLog         | `req_`   |
| LedgerTrace        | `lt_`    |
| Template           | `tpl_`   |
| File               | `file_`  |
| TestClock          | `clock_` |

## 5. HTTP grammar

| Concern          | Pillar design                                            |
| ---------------- | -------------------------------------------------------- |
| API version      | `Pillar-Version: 2026-05-01`                             |
| Idempotency      | `Idempotency-Key: <uuid>` on all mutating requests       |
| Pagination       | `limit`, `starting_after`, `ending_before`               |
| Expansion        | `expand[]=ledger_trace`, `expand[]=balance_transactions` |
| Object listing   | `GET /v1/<objects>`                                      |
| Object retrieval | `GET /v1/<objects>/{id}`                                 |
| Mutation         | `POST /v1/<objects>` or action endpoint                  |
| Deletion         | Soft delete / archive unless config-only object          |
| Error schema     | Stripe-like typed error object                           |
| Async completion | Event + webhook                                          |

## 6. Error object

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "insufficient_available_holding",
    "message": "The source account does not have enough available quantity.",
    "param": "amount",
    "request": "req_...",
    "ledger_trace": "lt_..."
  }
}
```

Recommended error types:

* `api_error`
* `authentication_error`
* `authorization_error`
* `invalid_request_error`
* `idempotency_error`
* `ledger_error`
* `projection_error`
* `rate_limit_error`
* `webhook_error`

---

# API / Object Model

아래 객체별 정의는 다음 필드를 포함한다.

* 목적
* 필드
* 상태 값
* 생성/변경 경로
* 관련 API
* Canton/Daml 내부 매핑
* DB projection 모델
* 이벤트 발생 조건

---

## 1. Organization

### 목적

Pillar tenant의 최상위 소유 단위다. 법인, platform operator, issuer operator, custodian operator를 표현한다.

### 필드

| Field                |      Type | Description                       |
| -------------------- | --------: | --------------------------------- |
| `id`                 |    string | `org_`                            |
| `object`             |    string | `organization`                    |
| `name`               |    string | 표시명                               |
| `legal_name`         |    string | 법적 명칭                             |
| `country`            |    string | ISO country                       |
| `default_currency`   |    string | 기본 회계 통화                          |
| `status`             |      enum | lifecycle                         |
| `compliance_profile` |    object | KYC/KYB, policy profile reference |
| `owner_user_ids`     |     array | dashboard owner users             |
| `created`, `updated` | timestamp | audit                             |
| `metadata`           |    object | external metadata                 |

### 상태 값

* `active`
* `suspended`
* `deleted`

### 생성/변경 경로

* Admin onboarding
* Enterprise contract setup
* Internal provisioning automation

### 관련 API

```http
POST /v1/organizations
GET  /v1/organizations/{id}
POST /v1/organizations/{id}
POST /v1/organizations/{id}/suspend
POST /v1/organizations/{id}/reactivate
```

### Canton/Daml 내부 매핑

* 기본적으로 DB config object.
* 필요 시 organization operator용 Daml party를 생성해 `OrganizationAuthority` 또는 `OperatorAuthority` contract에 연결한다.
* Public API에는 party id를 노출하지 않는다.

### DB projection 모델

Table: `organizations`

| Column                     | Notes             |
| -------------------------- | ----------------- |
| `id`                       | primary key       |
| `status`                   | text enum         |
| `settings_json`            | org-level config  |
| `compliance_profile_json`  | compliance config |
| `created_at`, `updated_at` | audit             |

### 이벤트 발생 조건

* `organization.created`
* `organization.updated`
* `organization.suspended`
* `organization.reactivated`
* `organization.deleted`

---

## 2. Project

### 목적

Organization 하위의 product/application boundary다. API keys, environments, webhook defaults, API version default를 묶는다.

### 필드

| Field                 |      Type | Description                |
| --------------------- | --------: | -------------------------- |
| `id`                  |    string | `proj_`                    |
| `object`              |    string | `project`                  |
| `organization`        |    string | parent org                 |
| `name`                |    string | project name               |
| `status`              |      enum | lifecycle                  |
| `default_api_version` |    string | default Pillar API version |
| `settings`            |    object | project settings           |
| `created`, `updated`  | timestamp | audit                      |
| `metadata`            |    object | user metadata              |

### 상태 값

* `active`
* `archived`

### 생성/변경 경로

* Dashboard에서 project 생성
* Internal admin provisioning
* API version upgrade via Workbench

### 관련 API

```http
POST /v1/projects
GET  /v1/projects/{id}
POST /v1/projects/{id}
POST /v1/projects/{id}/archive
```

### Canton/Daml 내부 매핑

* 직접 ledger object는 아니다.
* 어떤 Daml package/template version을 해당 project environments에서 사용할지 결정하는 deployment policy와 연결된다.

### DB projection 모델

Table: `projects`

| Column                | Notes                     |
| --------------------- | ------------------------- |
| `id`                  | primary key               |
| `organization_id`     | FK                        |
| `default_api_version` | version rendering default |
| `settings_json`       | config                    |
| `status`              | enum                      |

### 이벤트 발생 조건

* `project.created`
* `project.updated`
* `project.archived`

---

## 3. Environment

### 목적

test, sandbox, live runtime isolation boundary다. 동일 project 안에서도 ledger participant, API key, webhook, projection, test clock이 environment별로 분리된다.

### 필드

| Field                 |      Type | Description                                |
| --------------------- | --------: | ------------------------------------------ |
| `id`                  |    string | `env_`                                     |
| `object`              |    string | `environment`                              |
| `project`             |    string | parent project                             |
| `mode`                |      enum | `test`, `sandbox`, `live`                  |
| `deployment_model`    |      enum | `hosted`, `customer_participant`, `hybrid` |
| `status`              |      enum | lifecycle                                  |
| `canton_network`      |    object | synchronizer/network reference             |
| `participant_refs`    |     array | internal participant references            |
| `api_version_default` |    string | environment default version                |
| `webhook_defaults`    |    object | retry/version defaults                     |
| `created`, `updated`  | timestamp | audit                                      |
| `metadata`            |    object | metadata                                   |

### 상태 값

* `provisioning`
* `active`
* `degraded`
* `disabled`
* `archived`

### 생성/변경 경로

* Project creation 시 default test/live environment 생성
* Sandbox provisioning
* Participant migration
* Package deployment

### 관련 API

```http
POST /v1/environments
GET  /v1/environments/{id}
POST /v1/environments/{id}
POST /v1/environments/{id}/disable
POST /v1/environments/{id}/rotate_keys
```

### Canton/Daml 내부 매핑

* Canton participant endpoint, synchronizer, ledger id, package set, party allocation policy와 매핑된다.
* Sandbox/LocalNet/live network가 모두 environment로 추상화된다.

### DB projection 모델

Tables:

* `environments`
* `environment_participants`
* `environment_package_versions`
* `environment_api_versions`

### 이벤트 발생 조건

* `environment.created`
* `environment.ready`
* `environment.degraded`
* `environment.disabled`
* `environment.archived`

---

## 4. Account

### 목적

Pillar의 balance/holding owner다. 고객 계정, treasury 계정, issuer 계정, omnibus 계정, external participant 계정을 표현한다.

### 필드

| Field                |      Type | Description                                             |
| -------------------- | --------: | ------------------------------------------------------- |
| `id`                 |    string | `acct_`                                                 |
| `object`             |    string | `account`                                               |
| `organization`       |    string | owner org                                               |
| `environment`        |    string | runtime env                                             |
| `type`               |      enum | `treasury`, `customer`, `issuer`, `omnibus`, `external` |
| `status`             |      enum | lifecycle                                               |
| `capabilities`       |    object | capability statuses                                     |
| `party_mapping`      |    string | expandable `pm_`                                        |
| `legal_owner`        |    object | customer/legal subject reference                        |
| `requirements`       |    object | onboarding/compliance requirements                      |
| `created`, `updated` | timestamp | audit                                                   |
| `metadata`           |    object | user metadata                                           |

### 상태 값

* `onboarding`
* `active`
* `restricted`
* `suspended`
* `closed`

### 생성/변경 경로

* `POST /v1/accounts`
* Capability approval
* Party allocation completion
* Compliance restriction
* Close account after zero holdings

### 관련 API

```http
POST /v1/accounts
GET  /v1/accounts/{id}
POST /v1/accounts/{id}
GET  /v1/accounts/{id}/balance
GET  /v1/accounts/{id}/holdings
POST /v1/accounts/{id}/close
```

### Canton/Daml 내부 매핑

Recommended Daml templates:

```daml
template AccountAuthority
  with
    accountId : Text
    owner : Party
    custodian : Party
    operator : Party
    accountType : Text
    status : Text
  where
    signatory custodian, operator
    observer owner
```

* `Account`는 보통 Daml `Party` 하나와 연결된다.
* Omnibus account는 하나의 party에 여러 sub-account projection을 가질 수 있지만, v1 기본값은 one Account → one Party다.
* Party/User lifecycle은 Canton Party Management / User Management로 처리한다. Canton 문서상 parties는 네트워크에서 unique하고, users는 participant-local로 parties와 매핑된다. ([Digital Asset Documentation][19])

### DB projection 모델

Tables:

* `accounts`
* `accounts_projection`
* `account_status_history`
* `account_capabilities`

Projection columns:

| Column           | Notes                   |
| ---------------- | ----------------------- |
| `id`             | public id               |
| `environment_id` | env                     |
| `status`         | latest projected status |
| `ledger_offset`  | projection watermark    |
| `update_id`      | ledger update id        |
| `trace_id`       | origin trace            |

### 이벤트 발생 조건

* `account.created`
* `account.activated`
* `account.updated`
* `account.restricted`
* `account.suspended`
* `account.closed`

---

## 5. Capability

### 목적

Account, Organization, Project 또는 Environment에 특정 기능 권한을 부여한다. Stripe의 account capabilities와 유사하지만, Canton workflow authorization과 연결된다.

### 필드

| Field          |      Type | Description                  |
| -------------- | --------: | ---------------------------- |
| `id`           |    string | `cap_`                       |
| `object`       |    string | `capability`                 |
| `subject`      |    string | account/org/project/env id   |
| `type`         |      enum | capability type              |
| `status`       |      enum | lifecycle                    |
| `requirements` |    object | missing/pending requirements |
| `requested_at` | timestamp | requested time               |
| `activated_at` | timestamp | activated time               |
| `disabled_at`  | timestamp | disabled time                |
| `metadata`     |    object | metadata                     |

Capability types:

* `issue_assets`
* `hold_assets`
* `transfer`
* `settle`
* `redeem`
* `lock`
* `claim`
* `webhook`
* `test_clock`
* `external_signing`
* `customer_participant`

### 상태 값

* `requested`
* `pending_review`
* `active`
* `rejected`
* `disabled`

### 생성/변경 경로

* Account onboarding
* Compliance approval
* Operator admin action
* Environment policy update

### 관련 API

```http
POST /v1/capabilities
GET  /v1/capabilities/{id}
POST /v1/capabilities/{id}
POST /v1/accounts/{id}/capabilities/{type}
```

### Canton/Daml 내부 매핑

Two-level design:

1. Product-only capabilities: DB config.
2. Ledger-affecting capabilities: Daml `CapabilityGrant` 또는 `OperatorAuthorization` contract.

```daml
template CapabilityGrant
  with
    subjectAccountId : Text
    capabilityType : Text
    grantee : Party
    operator : Party
    status : Text
  where
    signatory operator
    observer grantee
```

### DB projection 모델

Table: `capabilities`

| Column                       | Notes                     |
| ---------------------------- | ------------------------- |
| `id`                         | primary key               |
| `subject_type`, `subject_id` | polymorphic subject       |
| `type`                       | capability type           |
| `status`                     | current state             |
| `requirements_json`          | missing requirements      |
| `ledger_offset`              | nullable if ledger-backed |

### 이벤트 발생 조건

* `capability.requested`
* `capability.updated`
* `capability.active`
* `capability.rejected`
* `capability.disabled`

---

## 6. Participant

### 목적

Canton participant/validator connection을 표현하는 internal/admin object다. API user는 일반적으로 보지 않지만, enterprise deployment와 Workbench에는 필요하다.

### 필드

| Field                |      Type | Description                   |
| -------------------- | --------: | ----------------------------- |
| `id`                 |    string | `ptcp_`                       |
| `object`             |    string | `participant`                 |
| `environment`        |    string | env                           |
| `name`               |    string | name                          |
| `deployment_model`   |      enum | hosted/customer/hybrid        |
| `status`             |      enum | lifecycle                     |
| `ledger_api_url`     |    string | internal encrypted endpoint   |
| `json_api_url`       |    string | dev/diagnostic endpoint       |
| `admin_api_url`      |    string | internal admin endpoint       |
| `synchronizers`      |     array | synchronizer refs             |
| `package_status`     |    object | DAR/package deployment status |
| `health`             |    object | health snapshot               |
| `created`, `updated` | timestamp | audit                         |

### 상태 값

* `provisioning`
* `active`
* `degraded`
* `disconnected`
* `suspended`
* `retired`

### 생성/변경 경로

* Hosted participant provisioning
* Customer participant registration
* Health check
* Package upload/sync
* Endpoint rotation

### 관련 API

```http
GET  /v1/participants
GET  /v1/participants/{id}
POST /v1/participants
POST /v1/participants/{id}/sync_packages
GET  /v1/participants/{id}/health
```

### Canton/Daml 내부 매핑

* Canton participant node itself.
* Ledger API gRPC endpoint is primary runtime path.
* JSON API is allowed for dev diagnostics. Canton docs describe JSON API as integrated in Canton 3.x and translated through gRPC. ([Canton Network Docs][14])

### DB projection 모델

Tables:

* `participants`
* `participant_health_snapshots`
* `participant_package_status`
* `participant_synchronizers`

### 이벤트 발생 조건

* `participant.created`
* `participant.active`
* `participant.degraded`
* `participant.disconnected`
* `participant.retired`

---

## 7. PartyMapping

### 목적

Pillar public account와 Canton party/user/rights를 연결한다. 외부 API에서 Canton identity를 숨기는 boundary object다.

### 필드

| Field                |      Type | Description                         |
| -------------------- | --------: | ----------------------------------- |
| `id`                 |    string | `pm_`                               |
| `object`             |    string | `party_mapping`                     |
| `account`            |    string | `acct_`                             |
| `participant`        |    string | `ptcp_`                             |
| `status`             |      enum | lifecycle                           |
| `party_hint`         |    string | requested hint                      |
| `party_id`           |    string | internal encrypted/raw Canton party |
| `user_id`            |    string | Canton user id                      |
| `act_as`             |     array | internal rights                     |
| `read_as`            |     array | internal rights                     |
| `external_signing`   |    object | external signing config             |
| `created`, `updated` | timestamp | audit                               |

### 상태 값

* `allocating`
* `active`
* `replicating`
* `rotated`
* `disabled`
* `failed`

### 생성/변경 경로

* Account onboarding
* Participant migration
* Party rotation
* External signing registration

### 관련 API

```http
GET  /v1/party_mappings/{id}
POST /v1/party_mappings
POST /v1/party_mappings/{id}/rotate
```

대부분 restricted/admin API다.

### Canton/Daml 내부 매핑

* Canton Party Management로 party allocate.
* Canton User Management로 user와 party rights 설정.
* Public API response에서는 `party_id`를 기본적으로 숨긴다.

### DB projection 모델

Table: `party_mappings`

| Column                        | Notes     |
| ----------------------------- | --------- |
| `id`                          | public id |
| `account_id`                  | FK        |
| `participant_id`              | FK        |
| `party_id_encrypted`          | encrypted |
| `user_id`                     | internal  |
| `act_as_json`, `read_as_json` | rights    |
| `status`                      | lifecycle |

### 이벤트 발생 조건

* `party_mapping.created`
* `party_mapping.active`
* `party_mapping.failed`
* `party_mapping.rotated`
* `party_mapping.disabled`

---

## 8. AssetClass

### 목적

자산 유형, 발행 규칙, transfer restriction, settlement policy, scale을 정의한다. 예: USD cash token, bond class, fund share class, carbon credit class.

### 필드

| Field                   |      Type | Description                                            |
| ----------------------- | --------: | ------------------------------------------------------ |
| `id`                    |    string | `acls_`                                                |
| `object`                |    string | `asset_class`                                          |
| `issuer_account`        |    string | issuer account                                         |
| `kind`                  |      enum | `fungible`, `non_fungible`, `claim`, `cash_equivalent` |
| `code`                  |    string | internal code                                          |
| `symbol`                |    string | display symbol                                         |
| `scale`                 |   integer | decimal scale                                          |
| `status`                |      enum | lifecycle                                              |
| `settlement_policy`     |    object | supported settlement modes                             |
| `transfer_restrictions` |    object | compliance/eligibility rules                           |
| `templates`             |    object | template refs                                          |
| `metadata`              |    object | metadata                                               |
| `created`, `updated`    | timestamp | audit                                                  |

### 상태 값

* `draft`
* `active`
* `suspended`
* `deprecated`
* `archived`

### 생성/변경 경로

* Issuer creates asset class
* Operator approves class
* Daml package/template version activation
* Compliance restriction update

### 관련 API

```http
POST /v1/asset_classes
GET  /v1/asset_classes/{id}
POST /v1/asset_classes/{id}
POST /v1/asset_classes/{id}/activate
POST /v1/asset_classes/{id}/suspend
```

### Canton/Daml 내부 매핑

Recommended templates:

```daml
template AssetClassTerms
  with
    assetClassId : Text
    issuer : Party
    operator : Party
    kind : Text
    symbol : Text
    scale : Int
    transferPolicy : Text
    status : Text
  where
    signatory issuer, operator
```

* `AssetClassTerms`가 class-level rules를 표현한다.
* Contract key에 의존하지 않고 `assetClassId`를 payload로 포함하며, uniqueness는 Pillar API idempotency + on-ledger registry assertion으로 검증한다.

### DB projection 모델

Tables:

* `asset_classes`
* `asset_class_projection`
* `asset_class_policy_versions`

### 이벤트 발생 조건

* `asset_class.created`
* `asset_class.activated`
* `asset_class.updated`
* `asset_class.suspended`
* `asset_class.deprecated`
* `asset_class.archived`

---

## 9. Asset

### 목적

AssetClass 아래의 구체적 발행물이다. 예: 특정 bond issuance, fund series, invoice token batch, cash asset.

### 필드

| Field                  |           Type | Description             |
| ---------------------- | -------------: | ----------------------- |
| `id`                   |         string | `ast_`                  |
| `object`               |         string | `asset`                 |
| `asset_class`          |         string | `acls_`                 |
| `issuer_account`       |         string | issuer                  |
| `status`               |           enum | lifecycle               |
| `quantity_issued`      | decimal string | total issued            |
| `quantity_outstanding` | decimal string | outstanding             |
| `denomination`         |         object | unit/currency           |
| `maturity_date`        |      timestamp | optional                |
| `identifiers`          |         object | ISIN/CUSIP/internal ids |
| `terms`                |         object | asset-specific terms    |
| `created`, `updated`   |      timestamp | audit                   |
| `metadata`             |         object | metadata                |

### 상태 값

* `pending_issuance`
* `active`
* `paused`
* `matured`
* `redeemed`
* `canceled`

### 생성/변경 경로

* Issuer creates asset draft
* Issue command creates initial holding
* Pause/mature/redeem workflows

### 관련 API

```http
POST /v1/assets
GET  /v1/assets/{id}
POST /v1/assets/{id}
POST /v1/assets/{id}/issue
POST /v1/assets/{id}/pause
```

### Canton/Daml 내부 매핑

Recommended templates:

```daml
template AssetTerms
  with
    assetId : Text
    assetClassId : Text
    issuer : Party
    operator : Party
    status : Text
    termsJson : Text
  where
    signatory issuer, operator
```

Issuance choice:

```daml
choice Issue : ContractId HoldingLot
  with
    holder : Party
    quantity : Decimal
```

### DB projection 모델

Tables:

* `assets`
* `assets_projection`
* `asset_terms_versions`

Projection contains:

* latest status
* issued/outstanding quantities
* ledger watermark
* trace id

### 이벤트 발생 조건

* `asset.created`
* `asset.issued`
* `asset.updated`
* `asset.paused`
* `asset.matured`
* `asset.redeemed`
* `asset.canceled`

---

## 10. Holding

### 목적

특정 account가 특정 asset을 얼마나 보유하는지 보여주는 first-class read object다. Public API에서 contract 대신 holding을 본다.

### 필드

| Field                 |           Type | Description                             |
| --------------------- | -------------: | --------------------------------------- |
| `id`                  |         string | `hld_`                                  |
| `object`              |         string | `holding`                               |
| `account`             |         string | holder                                  |
| `asset`               |         string | asset                                   |
| `asset_class`         |         string | asset class                             |
| `quantity.total`      | decimal string | total quantity                          |
| `quantity.available`  | decimal string | spendable                               |
| `quantity.locked`     | decimal string | locked                                  |
| `quantity.pending`    | decimal string | pending settlement                      |
| `status`              |           enum | lifecycle                               |
| `as_of_ledger_offset` |         string | projection watermark                    |
| `ledger_trace`        |         string | optional expand                         |
| `created`, `updated`  |      timestamp | projection timestamps                   |
| `metadata`            |         object | usually empty or asset/account metadata |

### 상태 값

* `active`
* `locked`
* `pending`
* `zero`
* `closed`

### 생성/변경 경로

Holding은 직접 생성하지 않는다.

* Asset issuance
* Transfer
* Settlement
* Lock/release
* Redemption
* Reversal
* Claim settlement

### 관련 API

```http
GET /v1/holdings
GET /v1/holdings/{id}
GET /v1/accounts/{id}/holdings
```

### Canton/Daml 내부 매핑

Possible templates:

```daml
template HoldingLot
  with
    holdingId : Text
    assetId : Text
    holder : Party
    custodian : Party
    quantity : Decimal
    status : Text
  where
    signatory custodian
    observer holder
```

* Internal ledger may have many `HoldingLot` contracts.
* Public `Holding` aggregates lots by `(account, asset)`.
* `available = active lots - active locks - pending consuming intents`.

### DB projection 모델

Table: `holdings_projection`

| Column               | Notes                    |
| -------------------- | ------------------------ |
| `id`                 | stable public holding id |
| `account_id`         | holder                   |
| `asset_id`           | asset                    |
| `quantity_total`     | decimal                  |
| `quantity_available` | decimal                  |
| `quantity_locked`    | decimal                  |
| `quantity_pending`   | decimal                  |
| `status`             | projection status        |
| `ledger_offset`      | source offset            |
| `update_id`          | source update            |
| `trace_id`           | origin trace             |

### 이벤트 발생 조건

* `holding.created`
* `holding.updated`
* `holding.locked`
* `holding.unlocked`
* `holding.zeroed`
* `holding.closed`

---

## 11. Balance

### 목적

Account 기준의 available / pending / locked aggregate다. Stripe Balance object와 유사하지만 currency뿐 아니라 asset/asset class 기준으로 확장된다.

### 필드

| Field                 |      Type | Description           |
| --------------------- | --------: | --------------------- |
| `id`                  |    string | `bal_`                |
| `object`              |    string | `balance`             |
| `account`             |    string | account               |
| `available`           |     array | available positions   |
| `pending`             |     array | pending positions     |
| `locked`              |     array | locked positions      |
| `as_of_ledger_offset` |    string | projection watermark  |
| `livemode`            |   boolean | env mode              |
| `created`, `updated`  | timestamp | projection timestamps |

Balance item:

```json
{
  "asset": "ast_...",
  "asset_class": "acls_...",
  "quantity": "100.000000",
  "scale": 6
}
```

### 상태 값

Balance 자체는 lifecycle object가 아니다. Operational status만 둔다.

* `current`
* `stale`

### 생성/변경 경로

직접 생성하지 않는다. Projection runtime이 `Holding`, `Lock`, pending intents에서 계산한다.

### 관련 API

```http
GET /v1/balances/{id}
GET /v1/accounts/{id}/balance
```

### Canton/Daml 내부 매핑

* dedicated Daml contract를 만들지 않는다.
* `HoldingLot`, `HoldingLock`, pending `TransferIntent`, pending `SettlementIntent`의 projection에서 계산한다.

### DB projection 모델

Table: `balances_projection`

| Column           | Notes           |
| ---------------- | --------------- |
| `id`             | `bal_`          |
| `account_id`     | account         |
| `available_json` | aggregate       |
| `pending_json`   | aggregate       |
| `locked_json`    | aggregate       |
| `ledger_offset`  | watermark       |
| `status`         | `current/stale` |

### 이벤트 발생 조건

* `balance.available`
* `balance.pending_updated`
* `balance.locked_updated`

이 이벤트는 모든 미세 변화마다 발행하지 않고, 다음 조건에서 발행한다.

* available quantity 변경
* lock/release 발생
* threshold alert 설정 충족
* settlement/redemption completion

---

## 12. BalanceTransaction

### 목적

Balance 또는 Holding에 영향을 준 모든 경제적 변화를 나타내는 immutable movement log다. Stripe Balance Transaction은 balance에 들어오고 나가는 모든 movement를 표현한다. Pillar는 이를 Canton asset movement로 확장한다. ([Stripe Docs][7])

### 필드

| Field            |           Type | Description             |
| ---------------- | -------------: | ----------------------- |
| `id`             |         string | `btxn_`                 |
| `object`         |         string | `balance_transaction`   |
| `account`        |         string | affected account        |
| `asset`          |         string | asset                   |
| `asset_class`    |         string | asset class             |
| `amount`         | decimal string | signed amount           |
| `direction`      |           enum | `credit`, `debit`       |
| `type`           |           enum | movement type           |
| `source`         |     object ref | transfer/settlement/etc |
| `status`         |           enum | lifecycle               |
| `available_on`   |      timestamp | availability time       |
| `ledger_entries` |          array | `le_` ids               |
| `ledger_trace`   |         string | optional                |
| `created`        |      timestamp | event time              |
| `metadata`       |         object | metadata                |

Types:

* `issuance`
* `transfer`
* `settlement`
* `lock`
* `unlock`
* `redemption`
* `reversal`
* `claim`
* `fee`
* `adjustment`

### 상태 값

* `pending`
* `posted`
* `reversed`
* `voided`

### 생성/변경 경로

* Projection runtime creates from ledger committed update.
* Never manually inserted as source-of-truth economic movement.

### 관련 API

```http
GET /v1/balance_transactions
GET /v1/balance_transactions/{id}
```

### Canton/Daml 내부 매핑

* Generated from committed Daml transaction effects:

  * holding consumed
  * holding created
  * lock created/archived
  * transfer settled
  * redemption executed
* `BalanceTransaction.source` maps back to Pillar object, not contract id.

### DB projection 모델

Table: `balance_transactions`

Append-only.

| Column                     | Notes            |
| -------------------------- | ---------------- |
| `id`                       | public id        |
| `account_id`               | affected account |
| `asset_id`                 | affected asset   |
| `amount`                   | signed decimal   |
| `type`                     | movement type    |
| `source_type`, `source_id` | public source    |
| `status`                   | movement status  |
| `ledger_offset`            | source offset    |
| `trace_id`                 | ledger trace     |

### 이벤트 발생 조건

* `balance_transaction.created`
* `balance_transaction.posted`
* `balance_transaction.reversed`

---

## 13. LedgerEntry

### 목적

BalanceTransaction을 double-entry accounting line으로 분해한 immutable accounting object다. Finance/ops/audit에서 사용한다.

### 필드

| Field                 |           Type | Description                    |
| --------------------- | -------------: | ------------------------------ |
| `id`                  |         string | `le_`                          |
| `object`              |         string | `ledger_entry`                 |
| `balance_transaction` |         string | `btxn_`                        |
| `account`             |         string | account                        |
| `asset`               |         string | asset                          |
| `debit`               | decimal string | debit amount                   |
| `credit`              | decimal string | credit amount                  |
| `entry_type`          |           enum | asset, liability, control, fee |
| `status`              |           enum | lifecycle                      |
| `posted_at`           |      timestamp | posted time                    |
| `ledger_trace`        |         string | optional                       |
| `metadata`            |         object | metadata                       |

### 상태 값

* `posted`
* `reversed`

### 생성/변경 경로

* Projection runtime derives from `BalanceTransaction`.
* Reversal creates new compensating entries; original entries are not deleted.

### 관련 API

```http
GET /v1/ledger_entries
GET /v1/ledger_entries/{id}
```

### Canton/Daml 내부 매핑

* Usually not a dedicated Daml contract.
* Derived from transfer/settlement/redemption ledger effects.
* For regulated deployments, Pillar may write `AccountingEntryRecorded` contract/event marker, but public model remains identical.

### DB projection 모델

Table: `ledger_entries`

Append-only.

| Column                   | Notes           |
| ------------------------ | --------------- |
| `id`                     | public id       |
| `balance_transaction_id` | parent          |
| `account_id`             | account         |
| `asset_id`               | asset           |
| `debit`, `credit`        | decimal         |
| `entry_type`             | accounting type |
| `trace_id`               | ledger trace    |

### 이벤트 발생 조건

* Public event usually not emitted.
* Included in:

  * `balance_transaction.posted`
  * `transfer.posted`
  * `settlement.posted`

---

## 14. TransferIntent

### 목적

두 account 사이의 asset movement 의도다. Transfer 자체가 아니라 “요청, 확인, reserve, execute, cancel, fail” 상태를 표현한다.

### 필드

| Field                 |           Type | Description                           |
| --------------------- | -------------: | ------------------------------------- |
| `id`                  |         string | `ti_`                                 |
| `object`              |         string | `transfer_intent`                     |
| `source_account`      |         string | debit account                         |
| `destination_account` |         string | credit account                        |
| `asset`               |         string | asset                                 |
| `amount`              | decimal string | amount                                |
| `status`              |           enum | lifecycle                             |
| `confirmation_method` |           enum | `automatic`, `manual`                 |
| `lock_behavior`       |           enum | `none`, `reserve`, `consume_existing` |
| `lock`                |         string | optional `lock_`                      |
| `transfer`            |         string | resulting `tr_`                       |
| `expires_at`          |      timestamp | expiry                                |
| `failure_code`        |         string | failure reason                        |
| `next_action`         |         object | required action                       |
| `created`, `updated`  |      timestamp | audit                                 |
| `metadata`            |         object | user metadata                         |

### 상태 값

* `requires_source`
* `requires_destination`
* `requires_lock`
* `requires_confirmation`
* `processing`
* `succeeded`
* `canceled`
* `failed`
* `expired`

### 생성/변경 경로

* User creates intent.
* Automatic confirmation can submit ledger command immediately.
* Manual confirmation requires explicit confirm call.
* Lock may be created before final transfer.

### 관련 API

```http
POST /v1/transfer_intents
GET  /v1/transfer_intents/{id}
POST /v1/transfer_intents/{id}
POST /v1/transfer_intents/{id}/confirm
POST /v1/transfer_intents/{id}/cancel
```

Convenience alias:

```http
POST /v1/transfers
```

이 alias는 내부적으로 `TransferIntent`를 create+confirm한다.

### Canton/Daml 내부 매핑

Recommended templates:

```daml
template TransferProposal
  with
    transferIntentId : Text
    source : Party
    destination : Party
    custodian : Party
    assetId : Text
    amount : Decimal
    status : Text
  where
    signatory custodian
    observer source, destination

    choice ConfirmTransfer : ContractId TransferRecord
      controller source, custodian
      do ...
```

Execution:

1. Validate source/destination account status.
2. Validate capability.
3. Validate available holding.
4. Optionally create `HoldingLock`.
5. Consume source holding lot(s).
6. Create destination holding lot(s).
7. Create `TransferRecord`.

### DB projection 모델

Tables:

* `transfer_intents_projection`
* `transfer_intent_status_history`

| Column                   | Notes                  |
| ------------------------ | ---------------------- |
| `id`                     | `ti_`                  |
| `source_account_id`      | source                 |
| `destination_account_id` | destination            |
| `asset_id`               | asset                  |
| `amount`                 | amount                 |
| `status`                 | latest projected state |
| `transfer_id`            | result                 |
| `trace_id`               | latest command trace   |
| `ledger_offset`          | projection watermark   |

### 이벤트 발생 조건

* `transfer_intent.created`
* `transfer_intent.requires_action`
* `transfer_intent.processing`
* `transfer_intent.succeeded`
* `transfer_intent.canceled`
* `transfer_intent.failed`
* `transfer_intent.expired`

---

## 15. Transfer

### 목적

ledger에 실제로 posted된 asset movement다. `TransferIntent`의 성공 결과다.

### 필드

| Field                  |           Type | Description        |
| ---------------------- | -------------: | ------------------ |
| `id`                   |         string | `tr_`              |
| `object`               |         string | `transfer`         |
| `transfer_intent`      |         string | source intent      |
| `source_account`       |         string | debit account      |
| `destination_account`  |         string | credit account     |
| `asset`                |         string | asset              |
| `amount`               | decimal string | amount             |
| `status`               |           enum | lifecycle          |
| `balance_transactions` |          array | debit/credit txns  |
| `ledger_entries`       |          array | accounting entries |
| `ledger_trace`         |         string | optional           |
| `created`, `updated`   |      timestamp | audit              |
| `metadata`             |         object | metadata           |

### 상태 값

* `pending`
* `posted`
* `failed`
* `reversed`
* `partially_reversed`

### 생성/변경 경로

* `TransferIntent` confirmation succeeds.
* Direct `POST /v1/transfers` convenience path creates intent behind the scenes.
* Reversal creates compensating transfer, not deletion.

### 관련 API

```http
POST /v1/transfers
GET  /v1/transfers/{id}
GET  /v1/transfers
```

### Canton/Daml 내부 매핑

```daml
template TransferRecord
  with
    transferId : Text
    transferIntentId : Text
    source : Party
    destination : Party
    assetId : Text
    amount : Decimal
    custodian : Party
  where
    signatory custodian
    observer source, destination
```

* Holding contracts are archived/recreated atomically with `TransferRecord`.
* Daml transaction atomicity is used where all required actors and contracts are in the same workflow boundary. ([Digital Asset Documentation][13])

### DB projection 모델

Table: `transfers_projection`

| Column                   | Notes               |
| ------------------------ | ------------------- |
| `id`                     | `tr_`               |
| `transfer_intent_id`     | parent              |
| `status`                 | posted/reversed/etc |
| `source_account_id`      | source              |
| `destination_account_id` | destination         |
| `asset_id`               | asset               |
| `amount`                 | amount              |
| `trace_id`               | commit trace        |
| `ledger_offset`          | watermark           |

### 이벤트 발생 조건

* `transfer.created`
* `transfer.posted`
* `transfer.failed`
* `transfer.reversed`
* `transfer.partially_reversed`

---

## 16. SettlementIntent

### 목적

다자간, 다자산, multi-leg settlement 의도다. DvP, PvP, netted settlement, delivery-only settlement를 표현한다.

### 필드

| Field                |      Type | Description                                       |
| -------------------- | --------: | ------------------------------------------------- |
| `id`                 |    string | `si_`                                             |
| `object`             |    string | `settlement_intent`                               |
| `mode`               |      enum | `atomic`, `dvp`, `pvp`, `netted`, `delivery_only` |
| `legs`               |     array | settlement legs                                   |
| `participants`       |     array | involved accounts                                 |
| `status`             |      enum | lifecycle                                         |
| `lock_policy`        |      enum | `none`, `required`, `auto`                        |
| `locks`              |     array | generated locks                                   |
| `settlement`         |    string | resulting `set_`                                  |
| `expires_at`         | timestamp | expiry                                            |
| `failure_code`       |    string | failure reason                                    |
| `next_action`        |    object | required action                                   |
| `created`, `updated` | timestamp | audit                                             |
| `metadata`           |    object | metadata                                          |

Settlement leg:

```json
{
  "from": "acct_source",
  "to": "acct_destination",
  "asset": "ast_...",
  "amount": "100.000000",
  "type": "delivery"
}
```

### 상태 값

* `requires_participant_acceptance`
* `requires_lock`
* `ready`
* `processing`
* `succeeded`
* `canceled`
* `failed`
* `expired`

### 생성/변경 경로

* Settlement request created.
* Required parties accept.
* Locks are created.
* Final settle command executes.
* Expiry cancels/unlocks.

### 관련 API

```http
POST /v1/settlement_intents
GET  /v1/settlement_intents/{id}
POST /v1/settlement_intents/{id}/accept
POST /v1/settlement_intents/{id}/lock
POST /v1/settlement_intents/{id}/confirm
POST /v1/settlement_intents/{id}/cancel
```

### Canton/Daml 내부 매핑

Recommended templates:

```daml
template SettlementProposal
  with
    settlementIntentId : Text
    operator : Party
    participants : [Party]
    legsJson : Text
    mode : Text
  where
    signatory operator
    observer participants
```

```daml
template SettlementLock
  with
    settlementIntentId : Text
    holder : Party
    assetId : Text
    amount : Decimal
  where
    signatory holder
```

```daml
template SettlementRecord
  with
    settlementId : Text
    settlementIntentId : Text
    operator : Party
    legsJson : Text
  where
    signatory operator
    observer participants
```

Atomicity policy:

* If all legs can be committed in one Daml transaction, Pillar commits atomically.
* If workflow spans participants/approvals/time, Pillar uses lock + final settlement protocol.
* Public API sees only intent status transitions.

### DB projection 모델

Tables:

* `settlement_intents_projection`
* `settlement_intent_legs_projection`
* `settlement_intent_status_history`

### 이벤트 발생 조건

* `settlement_intent.created`
* `settlement_intent.accepted`
* `settlement_intent.locked`
* `settlement_intent.ready`
* `settlement_intent.processing`
* `settlement_intent.succeeded`
* `settlement_intent.failed`
* `settlement_intent.canceled`
* `settlement_intent.expired`

---

## 17. Settlement

### 목적

최종 settlement 결과다. 하나 이상의 transfer, balance transaction, ledger entry를 포함한다.

### 필드

| Field                  |      Type | Description         |
| ---------------------- | --------: | ------------------- |
| `id`                   |    string | `set_`              |
| `object`               |    string | `settlement`        |
| `settlement_intent`    |    string | source intent       |
| `mode`                 |      enum | settlement mode     |
| `legs`                 |     array | final posted legs   |
| `transfers`            |     array | generated transfers |
| `balance_transactions` |     array | generated btxns     |
| `status`               |      enum | lifecycle           |
| `ledger_trace`         |    string | optional            |
| `created`, `updated`   | timestamp | audit               |
| `metadata`             |    object | metadata            |

### 상태 값

* `posted`
* `failed`
* `reversed`
* `partially_reversed`

### 생성/변경 경로

* `SettlementIntent.confirm` ledger commit
* Auto-settlement once all acceptance/locks complete
* Reversal workflow

### 관련 API

```http
GET /v1/settlements
GET /v1/settlements/{id}
```

### Canton/Daml 내부 매핑

* `SettlementRecord` contract or committed transaction marker.
* Transfer/holding changes are in same Daml transaction where possible.
* Each leg is mapped to generated `BalanceTransaction` and `LedgerEntry`.

### DB projection 모델

Tables:

* `settlements_projection`
* `settlement_legs_projection`
* `settlement_transfers`

### 이벤트 발생 조건

* `settlement.created`
* `settlement.posted`
* `settlement.failed`
* `settlement.reversed`
* `settlement.partially_reversed`

---

## 18. Lock

### 목적

Holding의 일부 또는 전체를 reservation/encumbrance 상태로 묶는다. Settlement, transfer, compliance hold, claim, redemption에 사용된다.

### 필드

| Field                |           Type | Description     |
| -------------------- | -------------: | --------------- |
| `id`                 |         string | `lock_`         |
| `object`             |         string | `lock`          |
| `account`            |         string | owner account   |
| `asset`              |         string | locked asset    |
| `amount`             | decimal string | locked quantity |
| `reason`             |           enum | reason          |
| `scope`              |         object | linked workflow |
| `status`             |           enum | lifecycle       |
| `expires_at`         |      timestamp | expiry          |
| `released_at`        |      timestamp | release time    |
| `consumed_at`        |      timestamp | consume time    |
| `ledger_trace`       |         string | optional        |
| `created`, `updated` |      timestamp | audit           |
| `metadata`           |         object | metadata        |

Reasons:

* `transfer`
* `settlement`
* `compliance`
* `claim`
* `redemption`
* `manual`

### 상태 값

* `active`
* `released`
* `consumed`
* `expired`
* `failed`

### 생성/변경 경로

* Explicit lock API
* Auto-lock from `TransferIntent`
* Auto-lock from `SettlementIntent`
* Compliance system hold
* Expiry scheduler/test clock

### 관련 API

```http
POST /v1/locks
GET  /v1/locks/{id}
GET  /v1/locks
POST /v1/locks/{id}/release
```

### Canton/Daml 내부 매핑

```daml
template HoldingLock
  with
    lockId : Text
    accountId : Text
    holder : Party
    custodian : Party
    assetId : Text
    amount : Decimal
    reason : Text
    expiresAt : Time
  where
    signatory custodian
    observer holder

    choice Release : ()
      controller custodian
      do ...

    choice Consume : ()
      controller custodian
      do ...
```

### DB projection 모델

Table: `locks_projection`

| Column                     | Notes                   |
| -------------------------- | ----------------------- |
| `id`                       | `lock_`                 |
| `account_id`               | account                 |
| `asset_id`                 | asset                   |
| `amount`                   | quantity                |
| `reason`                   | reason                  |
| `source_type`, `source_id` | transfer/settlement/etc |
| `status`                   | latest state            |
| `ledger_offset`            | watermark               |
| `trace_id`                 | origin trace            |

### 이벤트 발생 조건

* `lock.created`
* `lock.active`
* `lock.released`
* `lock.consumed`
* `lock.expired`
* `lock.failed`

---

## 19. Redemption

### 목적

보유 asset을 issuer 또는 redemption agent에게 반환하고, cash/underlying/claim payout을 받는 workflow다.

### 필드

| Field                  |           Type | Description                   |
| ---------------------- | -------------: | ----------------------------- |
| `id`                   |         string | `red_`                        |
| `object`               |         string | `redemption`                  |
| `account`              |         string | redeeming account             |
| `asset`                |         string | redeemed asset                |
| `amount`               | decimal string | amount                        |
| `destination`          |         object | payout/settlement destination |
| `status`               |           enum | lifecycle                     |
| `lock`                 |         string | reservation lock              |
| `balance_transactions` |          array | movement logs                 |
| `files`                |          array | supporting docs               |
| `failure_code`         |         string | failure reason                |
| `next_action`          |         object | required action               |
| `created`, `updated`   |      timestamp | audit                         |
| `metadata`             |         object | metadata                      |

### 상태 값

* `requires_approval`
* `requires_lock`
* `processing`
* `succeeded`
* `failed`
* `canceled`

### 생성/변경 경로

* Account requests redemption.
* Issuer/operator approves.
* Holding is locked.
* Final ledger choice consumes/reduces holding.
* Payout claim/settlement is created.

### 관련 API

```http
POST /v1/redemptions
GET  /v1/redemptions/{id}
POST /v1/redemptions/{id}/approve
POST /v1/redemptions/{id}/cancel
```

### Canton/Daml 내부 매핑

Templates:

* `RedemptionRequest`
* `RedemptionApproval`
* `RedemptionRecord`

Execution:

1. Create request.
2. Lock holding.
3. Issuer/operator approves.
4. Consume locked holding.
5. Create redemption record and optional claim/payout settlement.

### DB projection 모델

Table: `redemptions_projection`

| Column          | Notes        |
| --------------- | ------------ |
| `id`            | `red_`       |
| `account_id`    | redeemer     |
| `asset_id`      | asset        |
| `amount`        | amount       |
| `status`        | lifecycle    |
| `lock_id`       | reservation  |
| `trace_id`      | ledger trace |
| `ledger_offset` | watermark    |

### 이벤트 발생 조건

* `redemption.created`
* `redemption.requires_action`
* `redemption.processing`
* `redemption.succeeded`
* `redemption.failed`
* `redemption.canceled`

---

## 20. Reversal

### 목적

이미 posted된 transfer, settlement, redemption, balance transaction에 대한 compensating workflow다. Ledger history는 삭제하지 않는다.

### 필드

| Field                   |           Type | Description                                                   |
| ----------------------- | -------------: | ------------------------------------------------------------- |
| `id`                    |         string | `rev_`                                                        |
| `object`                |         string | `reversal`                                                    |
| `source_type`           |           enum | `transfer`, `settlement`, `redemption`, `balance_transaction` |
| `source`                |         string | source object id                                              |
| `asset`                 |         string | asset                                                         |
| `amount`                | decimal string | amount                                                        |
| `reason`                |    enum/string | reversal reason                                               |
| `status`                |           enum | lifecycle                                                     |
| `created_by`            |         string | actor                                                         |
| `compensating_transfer` |         string | generated transfer                                            |
| `balance_transactions`  |          array | generated btxns                                               |
| `ledger_trace`          |         string | optional                                                      |
| `created`, `updated`    |      timestamp | audit                                                         |
| `metadata`              |         object | metadata                                                      |

### 상태 값

* `requires_approval`
* `processing`
* `succeeded`
* `failed`
* `canceled`

### 생성/변경 경로

* Operator creates reversal.
* Policy may require approval.
* Ledger creates compensating movement.
* Original object status becomes `reversed` or `partially_reversed`.

### 관련 API

```http
POST /v1/reversals
GET  /v1/reversals/{id}
POST /v1/reversals/{id}/approve
POST /v1/reversals/{id}/cancel
```

### Canton/Daml 내부 매핑

Templates:

* `ReversalRequest`
* `ReversalApproval`
* `CompensatingTransferRecord`

Reversal은 원 transaction을 archive/delete하지 않는다. 새 Daml workflow가 반대 방향 economic movement를 기록한다.

### DB projection 모델

Table: `reversals_projection`

| Column                     | Notes           |
| -------------------------- | --------------- |
| `id`                       | `rev_`          |
| `source_type`, `source_id` | reversed source |
| `amount`                   | amount          |
| `status`                   | lifecycle       |
| `compensating_transfer_id` | result          |
| `trace_id`                 | ledger trace    |
| `ledger_offset`            | watermark       |

### 이벤트 발생 조건

* `reversal.created`
* `reversal.requires_action`
* `reversal.processing`
* `reversal.succeeded`
* `reversal.failed`
* `reversal.canceled`

---

## 21. Claim

### 목적

권리, 분쟁, redemption payout, corporate action, compliance claim을 표현한다. Evidence file과 on-ledger acceptance/settlement를 연결한다.

### 필드

| Field                |           Type | Description     |
| -------------------- | -------------: | --------------- |
| `id`                 |         string | `clm_`          |
| `object`             |         string | `claim`         |
| `claim_type`         |           enum | claim type      |
| `claimant_account`   |         string | claimant        |
| `respondent_account` |         string | respondent      |
| `asset`              |         string | optional asset  |
| `amount`             | decimal string | optional amount |
| `status`             |           enum | lifecycle       |
| `evidence_files`     |          array | file ids        |
| `due_at`             |      timestamp | due date        |
| `resolution`         |         object | result          |
| `ledger_trace`       |         string | optional        |
| `created`, `updated` |      timestamp | audit           |
| `metadata`           |         object | metadata        |

Claim types:

* `entitlement`
* `dispute`
* `redemption_payout`
* `corporate_action`
* `compliance_hold`

### 상태 값

* `open`
* `under_review`
* `accepted`
* `rejected`
* `settled`
* `canceled`
* `expired`

### 생성/변경 경로

* User submits claim.
* Operator or respondent reviews.
* Claim accepted/rejected.
* Settlement or lock/release follows.

### 관련 API

```http
POST /v1/claims
GET  /v1/claims/{id}
POST /v1/claims/{id}/submit_evidence
POST /v1/claims/{id}/accept
POST /v1/claims/{id}/reject
POST /v1/claims/{id}/settle
POST /v1/claims/{id}/cancel
```

### Canton/Daml 내부 매핑

```daml
template ClaimContract
  with
    claimId : Text
    claimant : Party
    respondent : Party
    operator : Party
    claimType : Text
    evidenceRefs : [Text]
    status : Text
  where
    signatory claimant, operator
    observer respondent
```

Choices:

* `AcceptClaim`
* `RejectClaim`
* `SettleClaim`
* `CancelClaim`

### DB projection 모델

Table: `claims_projection`

| Column                   | Notes        |
| ------------------------ | ------------ |
| `id`                     | `clm_`       |
| `claim_type`             | type         |
| `claimant_account_id`    | claimant     |
| `respondent_account_id`  | respondent   |
| `status`                 | lifecycle    |
| `evidence_file_ids_json` | evidence     |
| `resolution_json`        | result       |
| `trace_id`               | ledger trace |
| `ledger_offset`          | watermark    |

### 이벤트 발생 조건

* `claim.created`
* `claim.updated`
* `claim.evidence_submitted`
* `claim.accepted`
* `claim.rejected`
* `claim.settled`
* `claim.canceled`
* `claim.expired`

---

## 22. Event

### 목적

API object state change의 immutable snapshot이다. Webhook의 source object다.

### 필드

| Field                      |      Type | Description             |
| -------------------------- | --------: | ----------------------- |
| `id`                       |    string | `evt_`                  |
| `object`                   |    string | `event`                 |
| `type`                     |    string | event type              |
| `api_version`              |    string | rendered API version    |
| `created`                  | timestamp | event creation time     |
| `livemode`                 |   boolean | env mode                |
| `environment`              |    string | env                     |
| `data.object`              |    object | current object snapshot |
| `data.previous_attributes` |    object | changed attrs           |
| `request.id`               |    string | `req_`                  |
| `request.idempotency_key`  |    string | key if present          |
| `ledger_trace`             |    string | optional trace          |
| `pending_webhooks`         |   integer | pending delivery count  |

Stripe Event 객체의 핵심 필드와 versioned snapshot 구조를 따른다. ([Stripe Docs][8])

### 상태 값

Event 자체는 immutable이다. Delivery 상태는 `WebhookDelivery`에 있다.

### 생성/변경 경로

* Projection change detected.
* Config object changed.
* Runtime audit event generated.

### 관련 API

```http
GET /v1/events
GET /v1/events/{id}
```

### Canton/Daml 내부 매핑

* Ledger-backed objects: update stream event에서 생성.
* Config objects: DB transaction에서 생성.
* `ledger_trace`는 ledger update id / offset / command id와 연결된다.

### DB projection 모델

Table: `events`

Append-only.

| Column                     | Notes             |
| -------------------------- | ----------------- |
| `id`                       | `evt_`            |
| `type`                     | event type        |
| `api_version`              | snapshot version  |
| `data_object_json`         | immutable payload |
| `previous_attributes_json` | diff              |
| `request_id`               | origin request    |
| `trace_id`                 | ledger trace      |
| `created_at`               | timestamp         |

### 이벤트 발생 조건

Event object 자체에 대해 public `event.created` webhook은 기본 발행하지 않는다. Event는 다른 객체 이벤트의 container다.

---

## 23. WebhookEndpoint

### 목적

고객이 event를 수신할 HTTPS endpoint를 설정하는 object다.

### 필드

| Field                |      Type | Description           |
| -------------------- | --------: | --------------------- |
| `id`                 |    string | `we_`                 |
| `object`             |    string | `webhook_endpoint`    |
| `url`                |    string | HTTPS URL             |
| `enabled_events`     |     array | event type filters    |
| `api_version`        |    string | event payload version |
| `status`             |      enum | lifecycle             |
| `description`        |    string | description           |
| `secret`             |    string | write-only/hidden     |
| `created`, `updated` | timestamp | audit                 |
| `metadata`           |    object | metadata              |

### 상태 값

* `enabled`
* `disabled`
* `degraded`
* `deleted`

### 생성/변경 경로

* Dashboard/Workbench
* API
* Secret rotation
* Health degradation after repeated delivery failures

### 관련 API

```http
POST /v1/webhook_endpoints
GET  /v1/webhook_endpoints/{id}
GET  /v1/webhook_endpoints
POST /v1/webhook_endpoints/{id}
DELETE /v1/webhook_endpoints/{id}
POST /v1/webhook_endpoints/{id}/rotate_secret
```

### Canton/Daml 내부 매핑

* No ledger mapping.
* Config DB object.

### DB projection 모델

Table: `webhook_endpoints`

| Column                | Notes               |
| --------------------- | ------------------- |
| `id`                  | `we_`               |
| `environment_id`      | env                 |
| `url`                 | endpoint URL        |
| `enabled_events_json` | filters             |
| `api_version`         | payload version     |
| `secret_hash`         | secret hash/KMS ref |
| `status`              | lifecycle           |

### 이벤트 발생 조건

* `webhook_endpoint.created`
* `webhook_endpoint.updated`
* `webhook_endpoint.disabled`
* `webhook_endpoint.deleted`

---

## 24. WebhookDelivery

### 목적

특정 Event를 특정 WebhookEndpoint로 전달하는 attempt/audit object다.

### 필드

| Field                |      Type | Description        |
| -------------------- | --------: | ------------------ |
| `id`                 |    string | `wd_`              |
| `object`             |    string | `webhook_delivery` |
| `event`              |    string | `evt_`             |
| `endpoint`           |    string | `we_`              |
| `status`             |      enum | lifecycle          |
| `attempt_count`      |   integer | attempts           |
| `last_status_code`   |   integer | response status    |
| `last_error`         |    string | error              |
| `next_attempt_at`    | timestamp | retry time         |
| `delivered_at`       | timestamp | success time       |
| `response_body_hash` |    string | audit hash         |
| `created`, `updated` | timestamp | audit              |

### 상태 값

* `pending`
* `delivering`
* `succeeded`
* `retrying`
* `failed`
* `canceled`

### 생성/변경 경로

* Event created and endpoint matches.
* Dispatcher sends HTTPS request.
* Retry scheduler updates state.
* Manual retry from Workbench.

### 관련 API

```http
GET  /v1/webhook_deliveries
GET  /v1/webhook_deliveries/{id}
POST /v1/webhook_deliveries/{id}/retry
```

### Canton/Daml 내부 매핑

* No ledger mapping.
* Delivery is off-ledger audit/config runtime.

### DB projection 모델

Tables:

* `webhook_deliveries`
* `webhook_delivery_attempts`

### 이벤트 발생 조건

* `webhook_delivery.failed` may be internal/dashboard-only.
* Public object events do not recursively emit for every delivery attempt by default.

---

## 25. RequestLog

### 목적

모든 API request의 immutable-ish audit record다. Idempotency, API version, actor, response, ledger trace를 연결한다.

### 필드

| Field                     |      Type | Description          |
| ------------------------- | --------: | -------------------- |
| `id`                      |    string | `req_`               |
| `object`                  |    string | `request_log`        |
| `method`                  |    string | HTTP method          |
| `path`                    |    string | request path         |
| `environment`             |    string | env                  |
| `actor`                   |    object | API key/user/service |
| `api_version`             |    string | version              |
| `idempotency_key`         |    string | optional             |
| `request_hash`            |    string | canonical hash       |
| `status`                  |      enum | lifecycle            |
| `status_code`             |   integer | HTTP status          |
| `error`                   |    object | error object         |
| `latency_ms`              |   integer | latency              |
| `response_hash`           |    string | response hash        |
| `source_ip`               |    string | IP                   |
| `ledger_trace`            |    string | optional             |
| `created`, `completed_at` | timestamp | audit                |

### 상태 값

* `received`
* `processing`
* `succeeded`
* `failed`
* `replayed`

### 생성/변경 경로

* Every API request creates a RequestLog.
* Idempotency replay links to original request.

### 관련 API

```http
GET /v1/request_logs
GET /v1/request_logs/{id}
```

Workbench API; not usually customer application critical path.

### Canton/Daml 내부 매핑

* If request submits ledger command, `RequestLog` links to `LedgerTrace`.
* If replayed idempotently, links to original `LedgerTrace`.

### DB projection 모델

Tables:

* `request_logs`
* `idempotency_records`

`idempotency_records` stores:

| Column               | Notes                  |
| -------------------- | ---------------------- |
| `environment_id`     | scope                  |
| `key`                | idempotency key        |
| `request_hash`       | canonical request hash |
| `response_status`    | first status           |
| `response_body_json` | first response         |
| `request_log_id`     | original request       |
| `expires_at`         | cleanup                |

### 이벤트 발생 조건

Usually no public webhook. Dashboard health can surface:

* `request_log.failed`
* `request_log.ledger_timeout`

---

## 26. LedgerTrace

### 목적

API request와 Canton ledger execution을 연결하는 audit chain이다.

### 필드

| Field                  |       Type | Description                |
| ---------------------- | ---------: | -------------------------- |
| `id`                   |     string | `lt_`                      |
| `object`               |     string | `ledger_trace`             |
| `request`              |     string | `req_`                     |
| `source_object`        | object ref | object that caused command |
| `participant`          |     string | `ptcp_`                    |
| `environment`          |     string | env                        |
| `act_as`               |      array | internal parties, redacted |
| `user_id`              |     string | Canton user, redacted      |
| `command_id`           |     string | Canton command id          |
| `submission_id`        |     string | Canton submission id       |
| `deduplication_period` |     string | dedup window               |
| `completion_status`    |     object | accepted/rejected          |
| `update_id`            |     string | ledger update id           |
| `transaction_id`       |     string | internal                   |
| `offset`               |     string | ledger offset              |
| `synchronizer`         |     string | synchronizer id            |
| `template_ids`         |      array | internal template refs     |
| `choice`               |     string | Daml choice                |
| `contract_refs`        |      array | encrypted/hash refs        |
| `status`               |       enum | lifecycle                  |
| `created`, `updated`   |  timestamp | audit                      |

### 상태 값

* `not_submitted`
* `submitted`
* `deduplicated`
* `committed`
* `rejected`
* `projected`
* `orphaned`

### 생성/변경 경로

* Mutating request creates trace.
* Canton Runner submits command.
* Completion stream updates trace.
* Update/projection stream marks projected.

### 관련 API

```http
GET /v1/ledger_traces/{id}
```

Restricted/debug API. Expandable:

```http
GET /v1/transfer_intents/ti_...?expand[]=ledger_trace
```

### Canton/Daml 내부 매핑

Direct mapping to Ledger API fields:

* `command_id`
* `submission_id`
* `user_id`
* `act_as`
* completion status
* update id
* transaction id / offset
* template id / choice

Canton command deduplication uses command id as part of change id, so this trace is also the audit point for idempotent retry behavior. ([Canton Network Docs][10])

### DB projection 모델

Table: `ledger_traces`

| Column                         | Notes             |
| ------------------------------ | ----------------- |
| `id`                           | `lt_`             |
| `request_log_id`               | origin request    |
| `participant_id`               | participant       |
| `command_id`                   | command           |
| `submission_id`                | submission        |
| `status`                       | lifecycle         |
| `completion_status_json`       | completion result |
| `update_id`                    | committed update  |
| `ledger_offset`                | offset            |
| `contract_refs_encrypted_json` | internal only     |

### 이벤트 발생 조건

* Public object events are preferred.
* Internal/workbench events:

  * `ledger_trace.rejected`
  * `ledger_trace.orphaned`
  * `ledger_trace.projected`

---

## 27. Template

### 목적

Pillar product/workflow template registry다. Daml package/template/choice를 public API product capability로 매핑한다.

### 필드

| Field                |      Type | Description                   |
| -------------------- | --------: | ----------------------------- |
| `id`                 |    string | `tpl_`                        |
| `object`             |    string | `template`                    |
| `name`               |    string | template name                 |
| `version`            |    string | Pillar template version       |
| `category`           |      enum | asset/transfer/settlement/etc |
| `status`             |      enum | lifecycle                     |
| `api_schema`         |    object | public schema                 |
| `daml_package_id`    |    string | internal package id           |
| `daml_template_id`   |    string | internal template id          |
| `choices`            |     array | supported choices             |
| `compatibility`      |    object | API/package compatibility     |
| `activated_at`       | timestamp | activation                    |
| `created`, `updated` | timestamp | audit                         |
| `metadata`           |    object | metadata                      |

### 상태 값

* `draft`
* `active`
* `deprecated`
* `disabled`
* `archived`

### 생성/변경 경로

* Internal package deployment
* DPM build/package upload
* Environment activation
* Deprecation

### 관련 API

```http
GET /v1/templates
GET /v1/templates/{id}
POST /v1/templates
POST /v1/templates/{id}/activate
POST /v1/templates/{id}/deprecate
```

Internal/admin write.

### Canton/Daml 내부 매핑

* Maps to Daml DAR/package id, template id, interface id, choices.
* Daml templates include signatories, observers, ensure clauses, choices. ([Digital Asset Documentation][20])
* Package deployment is tracked by participant/environment.

### DB projection 모델

Tables:

* `templates`
* `template_versions`
* `environment_template_versions`

### 이벤트 발생 조건

* `template.created`
* `template.activated`
* `template.deprecated`
* `template.disabled`
* `template.archived`

---

## 28. File

### 목적

Evidence, compliance docs, legal docs, redemption docs를 저장하는 encrypted file object다. Blob은 object storage에 있고, ledger에는 file id/hash/reference만 기록한다.

### 필드

| Field                |       Type | Description              |
| -------------------- | ---------: | ------------------------ |
| `id`                 |     string | `file_`                  |
| `object`             |     string | `file`                   |
| `purpose`            |       enum | file purpose             |
| `filename`           |     string | original filename        |
| `size`               |    integer | bytes                    |
| `type`               |     string | MIME type                |
| `hash`               |     string | content hash             |
| `url`                |     string | short-lived download URL |
| `expires_at`         |  timestamp | URL/object expiry        |
| `status`             |       enum | lifecycle                |
| `linked_object`      | object ref | claim/redemption/etc     |
| `created`, `updated` |  timestamp | audit                    |
| `metadata`           |     object | metadata                 |

Stripe File object도 `id`, `created`, `expires_at`, `filename`, `purpose`, `size`, `type`, `url` 같은 구조를 갖는다. Pillar는 여기에 hash/encryption/compliance scanning을 추가한다. ([Stripe Docs][21])

### 상태 값

* `uploaded`
* `processing`
* `available`
* `rejected`
* `expired`
* `deleted`

### 생성/변경 경로

* Multipart upload
* Malware scan
* Hash computation
* Link to claim/redemption/compliance object
* Expiry/delete

### 관련 API

```http
POST /v1/files
GET  /v1/files/{id}
GET  /v1/files
DELETE /v1/files/{id}
```

### Canton/Daml 내부 매핑

* Blob is never stored on ledger.
* Daml contracts may include:

  * `fileId`
  * `contentHash`
  * `purpose`
  * `storageUri` only if safe/legal
* Evidence integrity is proven by hash.

### DB projection 모델

Table: `files`

| Column                  | Notes                  |
| ----------------------- | ---------------------- |
| `id`                    | `file_`                |
| `environment_id`        | env                    |
| `purpose`               | purpose                |
| `filename`              | filename               |
| `size_bytes`            | size                   |
| `mime_type`             | MIME                   |
| `content_hash`          | hash                   |
| `storage_ref_encrypted` | object storage pointer |
| `status`                | lifecycle              |

### 이벤트 발생 조건

* `file.created`
* `file.processing`
* `file.available`
* `file.rejected`
* `file.expired`
* `file.deleted`

---

## 29. TestClock

### 목적

test/sandbox environment에서 시간 기반 workflow를 deterministic하게 테스트한다. Expiry, lock timeout, settlement deadline, redemption window를 제어한다.

### 필드

| Field                          |      Type | Description            |
| ------------------------------ | --------: | ---------------------- |
| `id`                           |    string | `clock_`               |
| `object`                       |    string | `test_clock`           |
| `environment`                  |    string | test/sandbox env       |
| `name`                         |    string | display name           |
| `frozen_time`                  | timestamp | current simulated time |
| `deletes_after`                | timestamp | auto cleanup           |
| `status`                       |      enum | lifecycle              |
| `advancing.target_frozen_time` | timestamp | target time            |
| `created`, `updated`           | timestamp | audit                  |
| `metadata`                     |    object | metadata               |

Stripe Test Clock 문서의 상태 값은 `advancing`, `internal_failure`, `ready`이며, Pillar도 동일한 core states를 채택한다. ([Stripe Docs][22])

### 상태 값

* `ready`
* `advancing`
* `internal_failure`
* `deleted`

### 생성/변경 경로

* Test/sandbox environment only.
* Create clock.
* Attach test objects to clock.
* Advance clock.
* Trigger expiry/scheduler workflows.

### 관련 API

```http
POST /v1/test_clocks
GET  /v1/test_clocks/{id}
POST /v1/test_clocks/{id}/advance
DELETE /v1/test_clocks/{id}
```

### Canton/Daml 내부 매핑

* In sandbox/test, scheduler and command generation use `TestClock.frozen_time`.
* Ledger time manipulation depends on deployment/test setup.
* Production environment cannot use TestClock to alter ledger time.

### DB projection 모델

Table: `test_clocks`

| Column               | Notes            |
| -------------------- | ---------------- |
| `id`                 | `clock_`         |
| `environment_id`     | env              |
| `frozen_time`        | simulated time   |
| `status`             | lifecycle        |
| `target_frozen_time` | advancing target |
| `deletes_after`      | cleanup          |

### 이벤트 발생 조건

* `test_clock.created`
* `test_clock.advancing`
* `test_clock.ready`
* `test_clock.internal_failure`
* `test_clock.deleted`

---

# Internal Runtime

## 1. Write path

```text
POST /v1/transfer_intents
  -> API Gateway
  -> authenticate / authorize
  -> resolve API version
  -> validate idempotency key
  -> create RequestLog
  -> create or replay TransferIntent response
  -> enqueue CommandOutbox item
  -> create LedgerTrace
  -> Canton Runner submits command
  -> Ledger API completion observed
  -> Update stream / PQS projects committed state
  -> Event generated
  -> WebhookDelivery scheduled
```

Canton app guidance recommends backend-mediated ledger writes and separate read/write paths. Pillar follows this design exactly. ([Canton Network Docs][12]) ([Canton Network Docs][12])

## 2. Read path

```text
GET /v1/accounts/acct_x/balance
  -> API Gateway
  -> auth / version rendering
  -> Projection DB read
  -> optional expand[]
  -> return object with as_of_ledger_offset
```

Read model comes from:

* ACS bootstrap
* Ledger update stream
* PQS
* Projection materializer

Canton guidance explicitly describes PQS as a Postgres-backed operational datastore synchronized from the ledger, with privacy constraints respected. Pillar uses PQS/Projection DB as the API read layer, not as economic source of truth. ([Canton Network Docs][12])

## 3. Idempotency and Canton deduplication

Pillar idempotency model:

```text
environment_id + api_key_id + method + path + idempotency_key
  -> request_hash
  -> canonical response
  -> command_id
```

Rules:

1. Same key + same request hash:

   * return same result or current object state linked to same `RequestLog`.
2. Same key + different request hash:

   * return `idempotency_error`.
3. No idempotency key on mutating request:

   * allowed only for low-risk admin mutation or rejected by policy.
4. Command retry:

   * same `command_id`
   * new `submission_id`
   * same `LedgerTrace` lineage.

Canton command deduplication uses command id as part of the change id and is explicitly designed for retry-safe async command submission. ([Canton Network Docs][10])

## 4. Projection consistency

Every projection row carries:

* `ledger_offset`
* `update_id`
* `trace_id`
* `projected_at`

API can support:

```http
GET /v1/transfer_intents/ti_...?consistency=latest
```

Semantics:

* Default: return latest projection.
* `consistency=latest`: wait until relevant `LedgerTrace.offset` has been projected or timeout.
* Response may include:

```json
{
  "status": "processing",
  "projection": {
    "as_of_ledger_offset": "000000...",
    "lag_ms": 420
  }
}
```

## 5. Event generation

Event is generated when projection detects a material object transition.

Examples:

| Projection change                       | Event                         |
| --------------------------------------- | ----------------------------- |
| `TransferIntent.processing → succeeded` | `transfer_intent.succeeded`   |
| `Holding.available changed`             | `holding.updated`             |
| `Lock.active → consumed`                | `lock.consumed`               |
| `SettlementIntent.ready → succeeded`    | `settlement_intent.succeeded` |
| `WebhookEndpoint.enabled → disabled`    | `webhook_endpoint.disabled`   |

## 6. Webhook delivery

Webhook payload:

```json
{
  "id": "evt_...",
  "object": "event",
  "type": "transfer_intent.succeeded",
  "api_version": "2026-05-01",
  "created": 1770000000,
  "livemode": false,
  "data": {
    "object": {
      "id": "ti_...",
      "object": "transfer_intent",
      "status": "succeeded"
    },
    "previous_attributes": {
      "status": "processing"
    }
  },
  "request": {
    "id": "req_...",
    "idempotency_key": "..."
  }
}
```

Delivery rules:

* Sign each payload using HMAC with timestamp.
* Customer endpoint should return 2xx quickly.
* Retry on network failure or non-2xx.
* Store every attempt in `webhook_delivery_attempts`.

Stripe webhook docs emphasize fast 2xx response before complex processing; Pillar should document the same. ([Stripe Docs][11])

---

# DB Schema

## 1. Config schema

```sql
organizations (
  id text primary key,
  status text not null,
  name text not null,
  legal_name text,
  country text,
  default_currency text,
  settings_json jsonb not null default '{}',
  compliance_profile_json jsonb not null default '{}',
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

projects (
  id text primary key,
  organization_id text not null references organizations(id),
  status text not null,
  name text not null,
  default_api_version text not null,
  settings_json jsonb not null default '{}',
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

environments (
  id text primary key,
  project_id text not null references projects(id),
  mode text not null,
  deployment_model text not null,
  status text not null,
  api_version_default text not null,
  canton_network_json jsonb not null default '{}',
  settings_json jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

participants (
  id text primary key,
  environment_id text not null references environments(id),
  status text not null,
  deployment_model text not null,
  endpoint_refs_json jsonb not null default '{}',
  health_json jsonb not null default '{}',
  package_status_json jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

party_mappings (
  id text primary key,
  environment_id text not null references environments(id),
  account_id text not null,
  participant_id text not null references participants(id),
  status text not null,
  party_id_encrypted bytea,
  user_id text,
  rights_json jsonb not null default '{}',
  external_signing_json jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

webhook_endpoints (
  id text primary key,
  environment_id text not null references environments(id),
  status text not null,
  url text not null,
  enabled_events_json jsonb not null,
  api_version text not null,
  secret_ref text not null,
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

templates (
  id text primary key,
  status text not null,
  name text not null,
  version text not null,
  category text not null,
  api_schema_json jsonb not null,
  daml_package_id text,
  daml_template_id text,
  choices_json jsonb not null default '[]',
  compatibility_json jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

## 2. Runtime audit schema

```sql
request_logs (
  id text primary key,
  environment_id text not null,
  actor_json jsonb not null,
  method text not null,
  path text not null,
  api_version text not null,
  idempotency_key text,
  request_hash text,
  status text not null,
  status_code integer,
  error_json jsonb,
  response_hash text,
  latency_ms integer,
  source_ip inet,
  created_at timestamptz not null,
  completed_at timestamptz
);

idempotency_records (
  environment_id text not null,
  key text not null,
  request_hash text not null,
  request_log_id text not null references request_logs(id),
  response_status integer,
  response_body_json jsonb,
  expires_at timestamptz not null,
  primary key (environment_id, key)
);

command_outbox (
  id text primary key,
  environment_id text not null,
  request_log_id text not null references request_logs(id),
  ledger_trace_id text not null,
  command_id text not null,
  submission_id text,
  status text not null,
  command_payload_json jsonb not null,
  next_attempt_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

ledger_traces (
  id text primary key,
  environment_id text not null,
  request_log_id text references request_logs(id),
  participant_id text references participants(id),
  status text not null,
  command_id text,
  submission_id text,
  user_id text,
  act_as_hash text,
  completion_status_json jsonb,
  update_id text,
  transaction_id text,
  ledger_offset text,
  synchronizer_id text,
  template_ids_json jsonb not null default '[]',
  choice text,
  contract_refs_encrypted_json jsonb not null default '[]',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

projection_offsets (
  environment_id text not null,
  participant_id text not null,
  stream_name text not null,
  ledger_offset text not null,
  update_id text,
  projected_at timestamptz not null,
  primary key (environment_id, participant_id, stream_name)
);
```

## 3. Ledger projection schema

```sql
accounts_projection (
  id text primary key,
  environment_id text not null,
  organization_id text not null,
  type text not null,
  status text not null,
  party_mapping_id text,
  requirements_json jsonb not null default '{}',
  metadata_json jsonb not null default '{}',
  ledger_offset text,
  update_id text,
  trace_id text,
  projected_at timestamptz not null
);

asset_classes_projection (
  id text primary key,
  environment_id text not null,
  issuer_account_id text not null,
  kind text not null,
  code text,
  symbol text,
  scale integer not null,
  status text not null,
  settlement_policy_json jsonb not null default '{}',
  transfer_restrictions_json jsonb not null default '{}',
  ledger_offset text,
  update_id text,
  trace_id text,
  projected_at timestamptz not null
);

assets_projection (
  id text primary key,
  environment_id text not null,
  asset_class_id text not null,
  issuer_account_id text not null,
  status text not null,
  quantity_issued numeric,
  quantity_outstanding numeric,
  terms_json jsonb not null default '{}',
  ledger_offset text,
  update_id text,
  trace_id text,
  projected_at timestamptz not null
);

holdings_projection (
  id text primary key,
  environment_id text not null,
  account_id text not null,
  asset_id text not null,
  asset_class_id text not null,
  quantity_total numeric not null,
  quantity_available numeric not null,
  quantity_locked numeric not null,
  quantity_pending numeric not null,
  status text not null,
  ledger_offset text not null,
  update_id text,
  trace_id text,
  projected_at timestamptz not null,
  unique (environment_id, account_id, asset_id)
);

balances_projection (
  id text primary key,
  environment_id text not null,
  account_id text not null unique,
  status text not null,
  available_json jsonb not null,
  pending_json jsonb not null,
  locked_json jsonb not null,
  ledger_offset text not null,
  projected_at timestamptz not null
);

balance_transactions (
  id text primary key,
  environment_id text not null,
  account_id text not null,
  asset_id text not null,
  asset_class_id text,
  amount numeric not null,
  direction text not null,
  type text not null,
  source_type text not null,
  source_id text not null,
  status text not null,
  available_on timestamptz,
  ledger_offset text not null,
  update_id text,
  trace_id text,
  created_at timestamptz not null
);

ledger_entries (
  id text primary key,
  environment_id text not null,
  balance_transaction_id text not null references balance_transactions(id),
  account_id text not null,
  asset_id text not null,
  debit numeric not null default 0,
  credit numeric not null default 0,
  entry_type text not null,
  status text not null,
  trace_id text,
  posted_at timestamptz not null
);
```

Workflow projection tables:

```sql
transfer_intents_projection (
  id text primary key,
  environment_id text not null,
  source_account_id text not null,
  destination_account_id text not null,
  asset_id text not null,
  amount numeric not null,
  status text not null,
  confirmation_method text not null,
  lock_behavior text not null,
  lock_id text,
  transfer_id text,
  expires_at timestamptz,
  failure_code text,
  next_action_json jsonb,
  metadata_json jsonb not null default '{}',
  ledger_offset text,
  update_id text,
  trace_id text,
  projected_at timestamptz not null
);

transfers_projection (
  id text primary key,
  environment_id text not null,
  transfer_intent_id text,
  source_account_id text not null,
  destination_account_id text not null,
  asset_id text not null,
  amount numeric not null,
  status text not null,
  ledger_offset text,
  update_id text,
  trace_id text,
  projected_at timestamptz not null
);

settlement_intents_projection (
  id text primary key,
  environment_id text not null,
  mode text not null,
  status text not null,
  lock_policy text not null,
  legs_json jsonb not null,
  participants_json jsonb not null,
  locks_json jsonb not null default '[]',
  settlement_id text,
  expires_at timestamptz,
  failure_code text,
  next_action_json jsonb,
  metadata_json jsonb not null default '{}',
  ledger_offset text,
  update_id text,
  trace_id text,
  projected_at timestamptz not null
);

settlements_projection (
  id text primary key,
  environment_id text not null,
  settlement_intent_id text not null,
  mode text not null,
  status text not null,
  legs_json jsonb not null,
  transfers_json jsonb not null default '[]',
  balance_transactions_json jsonb not null default '[]',
  ledger_offset text,
  update_id text,
  trace_id text,
  projected_at timestamptz not null
);

locks_projection (
  id text primary key,
  environment_id text not null,
  account_id text not null,
  asset_id text not null,
  amount numeric not null,
  reason text not null,
  source_type text,
  source_id text,
  status text not null,
  expires_at timestamptz,
  ledger_offset text,
  update_id text,
  trace_id text,
  projected_at timestamptz not null
);

redemptions_projection (
  id text primary key,
  environment_id text not null,
  account_id text not null,
  asset_id text not null,
  amount numeric not null,
  destination_json jsonb not null,
  status text not null,
  lock_id text,
  files_json jsonb not null default '[]',
  failure_code text,
  next_action_json jsonb,
  ledger_offset text,
  update_id text,
  trace_id text,
  projected_at timestamptz not null
);

reversals_projection (
  id text primary key,
  environment_id text not null,
  source_type text not null,
  source_id text not null,
  asset_id text,
  amount numeric,
  reason text,
  status text not null,
  compensating_transfer_id text,
  balance_transactions_json jsonb not null default '[]',
  ledger_offset text,
  update_id text,
  trace_id text,
  projected_at timestamptz not null
);

claims_projection (
  id text primary key,
  environment_id text not null,
  claim_type text not null,
  claimant_account_id text not null,
  respondent_account_id text,
  asset_id text,
  amount numeric,
  status text not null,
  evidence_file_ids_json jsonb not null default '[]',
  resolution_json jsonb,
  due_at timestamptz,
  ledger_offset text,
  update_id text,
  trace_id text,
  projected_at timestamptz not null
);
```

## 4. Event / webhook schema

```sql
events (
  id text primary key,
  environment_id text not null,
  type text not null,
  api_version text not null,
  livemode boolean not null,
  data_object_json jsonb not null,
  previous_attributes_json jsonb,
  request_log_id text references request_logs(id),
  idempotency_key text,
  trace_id text references ledger_traces(id),
  pending_webhooks integer not null default 0,
  created_at timestamptz not null
);

webhook_deliveries (
  id text primary key,
  environment_id text not null,
  event_id text not null references events(id),
  endpoint_id text not null references webhook_endpoints(id),
  status text not null,
  attempt_count integer not null default 0,
  last_status_code integer,
  last_error text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  response_body_hash text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

webhook_delivery_attempts (
  id text primary key,
  webhook_delivery_id text not null references webhook_deliveries(id),
  attempt_number integer not null,
  status_code integer,
  error text,
  request_headers_hash text,
  response_body_hash text,
  attempted_at timestamptz not null
);
```

## 5. DB invariants

1. Projection rows are reconstructable from ledger.
2. `balance_transactions`, `ledger_entries`, `events`, `request_logs`, `ledger_traces` are append-only.
3. Public tables do not store raw contract id except via encrypted internal references.
4. Every ledger-backed projection row has `ledger_offset` and `trace_id`.
5. Metadata is not allowed to store sensitive data.
6. JSONB is allowed for schema flexibility, but economic amounts must be typed numeric columns.
7. Enum values are text to preserve API forward compatibility.

---

# Failure Modes

## 1. Duplicate API retry

### Scenario

Client retries `POST /v1/transfer_intents` with same `Idempotency-Key`.

### Behavior

| Case                                    | Result                                              |
| --------------------------------------- | --------------------------------------------------- |
| Same key + same request body            | Return original response                            |
| Same key + different body               | `idempotency_error`                                 |
| Original request still processing       | Return same object with `status=processing`         |
| Ledger committed but projection lagging | Return `processing` plus trace/projection watermark |

## 2. API timeout before ledger completion

### Scenario

API accepted request, command submitted, HTTP client times out.

### Behavior

* `RequestLog.status=processing`
* `LedgerTrace.status=submitted`
* Client retry with same idempotency key returns same object.
* Completion is delivered by webhook.
* Workbench shows trace state.

## 3. Canton command rejected

Common causes:

* insufficient holding
* missing party authorization
* stale or consumed contract
* package/template mismatch
* validation failure
* participant/synchronizer issue

Behavior:

* `LedgerTrace.status=rejected`
* Intent status becomes `failed` or `requires_action`
* Object-specific event emitted:

  * `transfer_intent.failed`
  * `settlement_intent.failed`
  * `redemption.failed`

## 4. Projection lag

### Scenario

Ledger committed but Projection DB has not yet caught up.

### Behavior

* Object may temporarily show `processing`.
* API returns `as_of_ledger_offset`.
* `consistency=latest` can wait for trace offset.
* Webhook only fires after projection materialization to avoid sending unqueryable objects.

## 5. Participant disconnected

### Scenario

Canton participant cannot be reached.

### Behavior

* `Participant.status=disconnected` or `degraded`
* `Environment.status=degraded`
* New commands may return `ledger_unavailable`
* Already submitted commands continue through completion watcher when restored.
* No DB economic mutation is performed to “fake” completion.

## 6. Command deduplication conflict

### Scenario

Same Canton command id appears with incompatible API request.

### Behavior

* Treat as severe idempotency/correlation error.
* Do not submit second incompatible command.
* Return `idempotency_error`.
* Emit internal alert.

## 7. Webhook endpoint failure

### Scenario

Customer endpoint returns non-2xx or times out.

### Behavior

* `WebhookDelivery.status=retrying`
* Attempt recorded.
* Endpoint may become `degraded`.
* Event remains retrievable by `GET /v1/events/{id}`.
* Manual retry supported.

## 8. Lock expiry race

### Scenario

Transfer consumes lock while expiry scheduler attempts release.

### Behavior

* Daml choice validation determines winner.
* Losing command is rejected or deduplicated.
* Projection emits either `lock.consumed` or `lock.expired`, never both as final state.

## 9. Reversal cannot fully execute

### Scenario

Recipient no longer has sufficient asset for reversal.

### Behavior

* `Reversal.status=failed` or `requires_approval`
* Original object remains posted.
* Claim/dispute workflow may be created.
* No destructive ledger rollback is attempted.

## 10. Contract-key assumption failure

Pillar does not depend on contract keys for uniqueness because Canton 3.x does not support them. Uniqueness is enforced by:

* public object id generation
* DB idempotency records
* Canton command deduplication
* Daml choices that assert referenced ids and current state
* projection consistency checks

---

# Security / Compliance

## 1. Authentication

* Environment-scoped API keys:

  * `pk_test_...`
  * `sk_test_...`
  * `pk_live_...`
  * `sk_live_...`
* Dashboard OIDC/SAML.
* Service accounts for backend-to-backend usage.
* Key rotation with request log continuity.

## 2. Authorization

* Organization/project/environment RBAC.
* Account-level permissions.
* Capability gates before ledger commands.
* Canton `act_as` and `read_as` rights must be least-privilege.

## 3. Ledger API security

* TLS/mTLS to participant.
* Ledger API auth tokens scoped by user/party.
* Separate service identities for:

  * command submission
  * projection/indexing
  * package management
  * party management
* External signing support for customer-controlled participant model.

## 4. Webhook security

* HMAC signature with timestamp.
* Secret rotation.
* Replay window.
* Delivery attempt audit.
* Endpoint allowlist for enterprise.
* Fast 2xx requirement and retry-safe customer guidance.

## 5. Data privacy

* Public API never exposes raw party ids by default.
* Raw contract refs are encrypted and restricted to internal trace.
* Daml observers must be minimized because observer choice affects ledger visibility.
* File blobs stay off-ledger; ledger stores only file id/hash/reference.

## 6. Metadata policy

* Metadata is for non-sensitive key/value references only.
* No PII, secrets, private keys, bank details, or regulated personal data in metadata.
* Sensitive data must use dedicated encrypted fields or File object.

Stripe metadata guidance similarly treats metadata as object-attached key-value data and warns against storing sensitive data. ([Stripe Docs][23])

## 7. Compliance workflows

Pillar compliance is object-native:

| Compliance need   | Pillar object                        |
| ----------------- | ------------------------------------ |
| KYC/KYB gating    | `Capability`                         |
| Sanctions hold    | `Lock(reason=compliance)`            |
| Dispute           | `Claim(type=dispute)`                |
| Redemption review | `Redemption.requires_approval`       |
| Audit trail       | `RequestLog`, `LedgerTrace`, `Event` |
| Evidence          | `File`                               |
| Reversal          | `Reversal`                           |

## 8. Audit immutability

Append-only audit objects:

* `RequestLog`
* `LedgerTrace`
* `Event`
* `BalanceTransaction`
* `LedgerEntry`
* `WebhookDeliveryAttempt`

---

# Implementation Plan

## Phase 0 — API grammar and OpenAPI

Deliverables:

* `openapi.yaml`
* common object schema
* common error schema
* pagination schema
* `expand[]` grammar
* `Pillar-Version` header
* `Idempotency-Key` middleware
* object ID generator
* metadata policy
* event type registry

Exit criteria:

* Every object has stable JSON schema.
* SDK generation works for Node, Python, Java.
* Error codes are documented.

## Phase 1 — Daml MVP

Deliverables:

* Daml modules:

  * `Pillar.Account`
  * `Pillar.AssetClass`
  * `Pillar.Asset`
  * `Pillar.Holding`
  * `Pillar.Transfer`
  * `Pillar.Lock`
* Templates:

  * `AccountAuthority`
  * `CapabilityGrant`
  * `AssetClassTerms`
  * `AssetTerms`
  * `HoldingLot`
  * `HoldingLock`
  * `TransferProposal`
  * `TransferRecord`
* Daml Script tests
* `dpm build`
* `dpm test`
* `dpm sandbox`

Daml SDK/DPM is the correct toolchain for build/test/sandbox/codegen workflows. ([Canton Network Docs][14])

Exit criteria:

* Issue asset.
* Create holding.
* Transfer asset.
* Lock/release holding.
* Project holdings/balances.

## Phase 2 — Canton Runner

Deliverables:

* CommandOutbox
* Ledger API client
* command id generation
* submission id generation
* completion watcher
* retry engine
* LedgerTrace recorder
* error classifier

Exit criteria:

* API timeout retry is safe.
* Same idempotency key returns same result.
* Ledger rejection maps to typed API error.
* Workbench can inspect request → command → completion.

## Phase 3 — Projection and Events

Deliverables:

* ACS bootstrap
* Update stream consumer
* PQS integration option
* Materialized projections:

  * accounts
  * assets
  * holdings
  * balances
  * transfer intents
  * transfers
  * locks
* Event generator
* Webhook dispatcher

Exit criteria:

* Ledger replay reconstructs projections.
* Event snapshots are API-versioned.
* Webhooks are signed and retried.
* `GET /v1/events` works.

## Phase 4 — Settlement, Redemption, Reversal, Claim

Deliverables:

* `SettlementIntent`
* `Settlement`
* multi-leg locks
* DvP/PvP support
* `Redemption`
* `Reversal`
* `Claim`
* file evidence linking

Exit criteria:

* Atomic settlement works where ledger transaction supports it.
* Multi-step settlement surfaces correct intent states.
* Reversal creates compensating movement.
* Claim settlement creates traceable outcome.

## Phase 5 — Developer Platform

Deliverables:

* Node SDK
* Python SDK
* Java SDK
* Pillar CLI
* webhook local listener
* API explorer
* Workbench:

  * request logs
  * events
  * webhook deliveries
  * ledger traces
  * participant health
* Sandbox environment
* TestClock

Stripe’s Workbench/CLI/Sandbox model is the reference for this developer platform layer. ([Stripe Docs][16]) ([Stripe Docs][17]) ([Stripe Docs][18])

Exit criteria:

* Developer can create test environment, issue asset, transfer, receive webhook locally.
* CLI can replay/trigger events.
* TestClock can advance expiry workflows.

## Phase 6 — Deployment Models

Deliverables:

* hosted participant
* customer participant
* hybrid participant
* package deployment pipeline
* party allocation automation
* participant health checks
* environment migration playbook
* LocalNet integration for multi-validator testing

Canton LocalNet is useful for simulating multiple validators and network behavior in development. ([Canton Network Docs][15])

Exit criteria:

* Same API behavior across hosted/customer/hybrid.
* Environment status reflects participant health.
* Package mismatch produces safe typed errors.

## Phase 7 — Compliance and Operations Hardening

Deliverables:

* RBAC
* audit export
* KMS/HSM integration
* external signing
* file encryption/scanning
* metadata scanner
* compliance lock policy
* disaster recovery replay
* projection backfill
* reconciliation reports

Exit criteria:

* Every economic movement is ledger-traceable.
* Projection can be rebuilt from ledger.
* Audit export satisfies regulated operations.

---

# Open Questions

1. **Account-to-party cardinality**

   * v1 default should be one account → one party.
   * Omnibus/subaccount mode needs explicit risk and privacy review.

2. **Asset model scope**

   * Should v1 support only fungible assets, or include NFT/unique asset units?
   * Recommendation: v1 fungible-first; NFT via `AssetClass.kind=non_fungible` but not default.

3. **Settlement finality SLA**

   * What is the target SLA for `SettlementIntent.processing → succeeded`?
   * SLA differs by hosted participant vs customer participant.

4. **External signing**

   * Which customers require customer-controlled signing keys?
   * This affects PartyMapping, Ledger API auth, and command submission rights.

5. **LedgerTrace exposure**

   * How much Canton diagnostic detail should enterprise customers see?
   * Recommendation: expose trace status, offset, command correlation; hide raw party/contract ids by default.

6. **Compliance jurisdiction**

   * Redemption, claim, lock, reversal policy may vary by jurisdiction.
   * Need policy engine hooks before final Daml choices.

7. **Template versioning**

   * How long must old Daml packages remain active for old API versions?
   * Need version compatibility matrix.

8. **Cross-synchronizer behavior**

   * Which settlement workflows require cross-domain/cross-synchronizer support?
   * v1 should constrain settlement to supported participant/network topology.

9. **Canton Coin / wallet integration**

   * Is Pillar integrating with existing Canton wallet/Canton Coin flows, or only custom asset workflows?
   * This changes Account/AssetClass/Settlement templates.

10. **Projection source**

    * Use native custom update stream consumer, PQS, or both?
    * Recommendation: custom indexer for product-critical projections, PQS for operational SQL/debug and contract-level inspection.

---

# Agent-ready Checklist

## API schema

* [ ] Define common object fields: `id`, `object`, `created`, `updated`, `livemode`, `environment`, `metadata`.
* [ ] Define object ID prefixes.
* [ ] Define `Pillar-Version` header behavior.
* [ ] Define idempotency request/response behavior.
* [ ] Define cursor pagination.
* [ ] Define `expand[]`.
* [ ] Define error object and error codes.
* [ ] Define event type registry.
* [ ] Produce `openapi.yaml`.

## Daml package

* [ ] Implement `AccountAuthority`.
* [ ] Implement `CapabilityGrant`.
* [ ] Implement `AssetClassTerms`.
* [ ] Implement `AssetTerms`.
* [ ] Implement `HoldingLot`.
* [ ] Implement `HoldingLock`.
* [ ] Implement `TransferProposal`.
* [ ] Implement `TransferRecord`.
* [ ] Implement `SettlementProposal`.
* [ ] Implement `SettlementRecord`.
* [ ] Implement `RedemptionRequest`.
* [ ] Implement `ReversalRequest`.
* [ ] Implement `ClaimContract`.
* [ ] Add Daml Script tests.
* [ ] Run `dpm build`.
* [ ] Run `dpm test`.
* [ ] Run Sandbox smoke tests.

## Runtime

* [ ] Build RequestLog middleware.
* [ ] Build idempotency store.
* [ ] Build CommandOutbox.
* [ ] Build Canton Runner.
* [ ] Generate stable command ids from idempotency records.
* [ ] Track submission ids separately.
* [ ] Implement completion watcher.
* [ ] Implement LedgerTrace lifecycle.
* [ ] Implement typed ledger error classifier.

## Projection

* [ ] Implement ACS bootstrap.
* [ ] Implement update stream consumer.
* [ ] Integrate PQS where useful.
* [ ] Materialize account projection.
* [ ] Materialize asset projection.
* [ ] Materialize holding projection.
* [ ] Materialize balance projection.
* [ ] Materialize transfer/settlement/lock/redemption/claim projections.
* [ ] Store `ledger_offset`, `update_id`, `trace_id` on every projection row.
* [ ] Implement replay/backfill.

## Events and webhooks

* [ ] Implement immutable Event store.
* [ ] Render event payload by endpoint API version.
* [ ] Implement webhook endpoint config.
* [ ] Implement HMAC signature.
* [ ] Implement retry scheduler.
* [ ] Implement delivery attempt audit.
* [ ] Implement manual retry.
* [ ] Implement Workbench event viewer.

## Developer platform

* [ ] Generate Node SDK.
* [ ] Generate Python SDK.
* [ ] Generate Java SDK.
* [ ] Implement Pillar CLI.
* [ ] Implement local webhook listener.
* [ ] Implement sandbox environment creation.
* [ ] Implement TestClock.
* [ ] Implement Workbench request log page.
* [ ] Implement Workbench ledger trace page.
* [ ] Implement Workbench participant health page.

## Test matrix

* [ ] Duplicate idempotency key, same payload.
* [ ] Duplicate idempotency key, different payload.
* [ ] API timeout before ledger completion.
* [ ] Ledger rejection.
* [ ] Projection lag.
* [ ] Participant disconnected.
* [ ] Webhook endpoint failure.
* [ ] Lock expiry race.
* [ ] Transfer reversal.
* [ ] Settlement partial failure before final commit.
* [ ] File rejection.
* [ ] TestClock advance failure.
* [ ] Package mismatch.
* [ ] Party allocation failure.
* [ ] Projection replay from zero.

## Security and compliance

* [ ] API key scoping by environment.
* [ ] Dashboard RBAC.
* [ ] Ledger API service identity scoping.
* [ ] Encrypted party/contract references.
* [ ] File encryption and malware scanning.
* [ ] Metadata sensitive-data scanner.
* [ ] Webhook secret rotation.
* [ ] Audit export.
* [ ] Compliance lock policy.
* [ ] External signing integration.

---

# Final Position

Pillar의 완성형 객체 모델은 **contract-first API가 아니라 Holding/Balance-first API** 여야 한다. Canton/Daml은 내부 correctness, privacy, atomicity, auditability를 담당하고, 외부 제품 경험은 Stripe처럼 객체, intent, event, webhook, idempotency 중심으로 고정한다.

가장 중요한 implementation invariant는 하나다.

> **경제 상태는 Canton Ledger에서만 확정되고, Pillar DB는 그 상태를 읽기 좋게 보여주는 projection 및 운영 audit/config만 저장한다.**

이 invariant를 지키면 deployment model이 hosted에서 customer participant로 바뀌어도 API grammar는 변하지 않는다. That is the product.

[1]: https://docs.stripe.com/api "docs.stripe.com"
[2]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[3]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api.html "Ledger API overview — Digital Asset’s platform documentation"
[4]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[5]: https://docs.digitalasset.com/build/3.5/reference/daml/contract-keys.html "https://docs.digitalasset.com/build/3.5/reference/daml/contract-keys.html"
[6]: https://docs.stripe.com/api/balance/balance_object "docs.stripe.com"
[7]: https://docs.stripe.com/api/balance_transactions "docs.stripe.com"
[8]: https://docs.stripe.com/api/events/object "docs.stripe.com"
[9]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[10]: https://docs.canton.network/appdev/deep-dives/command-deduplication "Command Deduplication - Canton Network Docs"
[11]: https://docs.stripe.com/webhooks "docs.stripe.com"
[12]: https://docs.canton.network/appdev/deep-dives/app-architecture-design "Canton Network Application Architecture Design - Canton Network Docs"
[13]: https://docs.digitalasset.com/build/3.5/tutorials/smart-contracts/compose.html "https://docs.digitalasset.com/build/3.5/tutorials/smart-contracts/compose.html"
[14]: https://docs.canton.network/appdev/modules/m4-sdks-apis "SDKs and APIs - Canton Network Docs"
[15]: https://docs.canton.network/appdev/tooling/development-tools-overview "Development Tools Overview - Canton Network Docs"
[16]: https://docs.stripe.com/workbench "docs.stripe.com"
[17]: https://docs.stripe.com/stripe-cli "docs.stripe.com"
[18]: https://docs.stripe.com/sandboxes "docs.stripe.com"
[19]: https://docs.digitalasset.com/build/3.5/explanations/parties-users.html "Parties and users on a Canton ledger — Digital Asset’s platform documentation"
[20]: https://docs.digitalasset.com/build/3.5/reference/daml/structure.html "https://docs.digitalasset.com/build/3.5/reference/daml/structure.html"
[21]: https://docs.stripe.com/api/files/object "docs.stripe.com"
[22]: https://docs.stripe.com/api/test_clocks/object "docs.stripe.com"
[23]: https://docs.stripe.com/metadata?locale=ja-JP&utm_source=chatgpt.com "メタデータ | Stripe ドキュメント"
