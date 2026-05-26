# 12. Security / Keys / AuthZ — Pillar 보안 모델

## Executive Summary

Pillar의 보안 모델은 **Stripe식 외부 API credential model**과 **Canton-native party authorization**을 결합한다. 외부 사용자는 Canton contract, party ID, command ID, offset을 직접 다루지 않는다. 외부 API는 `Intent`, `Holding`, `Balance`, `Webhook`, `Key`, `ServiceAccount` 중심으로 동작하고, 내부 런타임만 Canton Ledger API, Daml command, party rights, completion, offset을 다룬다.

핵심 결론은 다음과 같다.

1. **Canton Ledger가 권한 있는 상태 전이의 source of truth**다. Pillar DB는 API key/config, audit trail, projection, idempotency/result cache만 저장한다.
2. **API key는 capability가 아니라 principal-bound credential**이다. 모든 key는 `principal → account → environment → scopes → constraints → party_entitlements`로 해석된다.
3. **restricted key가 기본값**이다. `secret key`는 legacy/root-level 서버 통합용으로만 허용하고, production에서는 생성·사용에 강한 제한을 둔다.
4. **client_secret은 API key가 아니다.** 특정 `Intent`의 클라이언트 측 조회·확인·next action 수행만 허용하는 짧은 수명의 bearer secret이다.
5. **party-level authorization이 모든 자산 작업의 최종 관문**이다. API scope가 있어도 해당 holding party에 대한 `read`, `act`, `prepare`, `execute` 권한이 없으면 intent 생성·실행을 거부한다.
6. **ledger escape hatch permission은 break-glass 권한**이다. 평상시 외부 API grammar에서는 raw ledger command를 제공하지 않으며, 내부 운영자가 JIT 승인, mTLS, IP allowlist, 2인 승인, ledger-audited marker를 통과한 경우에만 제한적으로 허용한다.
7. **모든 작업은 ledger-traceable**이어야 한다. `request_id`, `idempotency_key`, `intent_id`, `policy_decision_id`, `ledger_command_id`, `workflow_id`, `update_id`, `offset`을 연결한다.

### 공식 문서 리서치 요약

Stripe 공식 문서는 `publishable key`, `secret key`, `restricted API key`, `webhook signing secret`를 명확히 분리한다. Stripe는 publishable key를 프론트엔드에 노출 가능한 key로 설명하고, secret key는 제한 없는 서버용 key이며, restricted key는 명시적 권한을 부여해 손상 시 피해를 줄이는 기본 선택지로 설명한다. 또한 webhook signing secret은 API key가 아니라 webhook 수신자가 이벤트 출처를 검증하기 위한 endpoint별 secret이다. Pillar도 이 구분을 그대로 채택한다. ([Stripe Docs][1])

Stripe key lifecycle 문서에서 key는 IP restriction, expiration, rotation, request log 조회를 지원한다. Pillar는 이를 확장해 모든 secret/restricted/service-account credential에 `allowed_ips`, `expires_at`, `rotated_from`, `rotation_grace_until`, `last_used_at`, `last_used_ip`를 둔다. ([Stripe Docs][2])

Stripe idempotency 문서는 create/update 요청 재시도 시 `Idempotency-Key`를 사용하고, low-level error handling 문서는 idempotency key가 24시간 이후 시스템에서 제거될 수 있음을 설명한다. Pillar는 외부 API idempotency와 Canton command deduplication을 이중화한다. 외부에서는 `Idempotency-Key`; 내부에서는 deterministic `command_id`와 stable participant routing을 사용한다. ([Stripe Docs][3])

Stripe API versioning과 webhook versioning 문서는 request/API version, SDK-pinned version, webhook endpoint version을 분리해서 관리한다. Pillar도 `Pillar-Version` request header, account default API version, webhook endpoint pinned version, SDK pinned version을 분리한다. ([Stripe Docs][4])

Stripe webhook 문서는 HTTPS endpoint, endpoint별 signing secret, raw body + signature header 검증, replay 방지를 위한 timestamp 검증, IP allowlisting을 설명한다. Pillar webhook은 `Pillar-Signature` 헤더, timestamped HMAC, endpoint별 secret, secret rotation grace window, replay cache, optional IP allowlist를 제공한다. ([Stripe Docs][5])

Stripe Workbench와 CLI는 integration debugging, API objects/logs/events/webhook delivery inspection, sandbox resource 관리, local webhook forwarding을 제공한다. Pillar는 `Pillar Workbench`, `pillar listen`, `pillar trigger`, `pillar logs`, `pillar sandbox`를 동일한 개발자 경험으로 설계해야 한다. ([Stripe Docs][6])

Digital Asset 문서 기준으로 Canton Ledger API는 `User Management Service`를 통해 participant-local user와 party rights를 관리한다. party는 ledger-wide identity이고, user는 participant-local API identity이며, user는 `act as` 또는 `read as` party 권한을 가진다. Pillar의 service account와 restricted key는 이 모델 위에 매핑된다. ([Digital Asset Documentation][7])

Canton Ledger API는 JWT authorization을 지원하며, production Ledger API 요청에는 TLS server authentication이 권장된다. Canton reference configuration은 Ledger API TLS, Admin API mTLS, Public API TLS 구성을 분리한다. Pillar 내부 runtime은 Ledger API에는 TLS + JWT, Admin API에는 mTLS + privileged token을 사용한다. ([Digital Asset Documentation][8])

Canton command submission은 `act_as`, `user_id`, `command_id`로 구성되는 change ID를 기준으로 deduplication한다. completion은 command outcome을 보고하고, deduplication은 같은 participant node에 제출될 때만 보장된다. Pillar는 같은 idempotency key를 같은 participant/EPN으로 sticky-route해야 한다. ([Digital Asset Documentation][7])

Canton external party flow는 prepare → inspect/sign → execute 단계로 구성된다. external party에서는 party private key가 party 측에 있고, prepare에는 `readAs`, execute에는 `actAs` scope가 요구된다. Pillar는 customer-controlled asset flow에서 이 모델을 사용하되 외부 API에는 `Intent.next_action`으로만 노출한다. ([Digital Asset Documentation][9])

DPM은 SDK components를 실행하는 command-line tool이고, Sandbox는 단일 Participant Node + Synchronizer Node의 단순 topology로 Daml code를 실행하는 Canton ledger 개발 환경이다. Pillar sandbox는 이 구조를 감싸 “Stripe-like test mode”로 제공한다. ([Digital Asset Documentation][10])

OAuth2 client credentials grant는 confidential client가 자체 credential로 access token을 요청하는 flow이며, OIDC는 OAuth2 위의 identity layer, SAML 2.0은 Web Browser SSO profile을 제공한다. OAuth mTLS는 OAuth client authentication과 certificate-bound tokens를 지원한다. Pillar는 machine-to-machine에는 OAuth2 client credentials, dashboard SSO에는 SAML/OIDC, high-assurance enterprise API에는 mTLS-bound token을 제공한다. ([IETF Datatracker][11])

---

## Goals / Non-goals

### Goals

* **Stripe-grade API grammar**: key prefixes, mode separation, object model, idempotency, request IDs, webhook-first async workflow, version pinning을 day one부터 제공한다.
* **Canton-invisible external API**: 외부 사용자는 Canton party, contract ID, command submission, offset, synchronizer topology를 보지 않는다.
* **Canton-native internal runtime**: 내부에서는 Daml command, party rights, Ledger API completion, offset, update ID, participant routing을 1급 개념으로 다룬다.
* **Least privilege by construction**: `restricted key`, service account, scoped permission, object constraint, party entitlement를 기본으로 한다.
* **Ledger-traceable operations**: API request부터 ledger completion까지 end-to-end trace를 남긴다.
* **Balance/Holding-first model**: 외부 API는 contract-first가 아니라 `balance`, `holding`, `intent`, `event` 중심이다.
* **Deployment-independent API**: single-tenant, hosted participant, customer participant, external party, Canton Network deployment가 바뀌어도 API 경험은 동일해야 한다.
* **Webhook-first async**: ledger completion, settlement, finality, projection update, compliance hold, failure는 webhook으로 전달한다.
* **Auditable security lifecycle**: key 생성, 조회, 회전, 만료, 권한 변경, SSO login, OAuth token issuance, mTLS cert change, ledger escape hatch 사용을 모두 audit한다.

### Non-goals

* Pillar DB를 authoritative asset state로 만들지 않는다.
* 외부 API에 raw Canton Ledger API proxy를 제공하지 않는다.
* 외부 사용자에게 Daml template, contract ID, choice name을 API grammar로 노출하지 않는다.
* `secret key`를 기본 통합 방식으로 권장하지 않는다.
* publishable key만으로 ledger-affecting operation을 수행하지 않는다.
* SSO login을 API authorization의 충분조건으로 보지 않는다. SSO는 human authentication이고, asset operation은 별도 scoped authorization과 party entitlement가 필요하다.
* ledger escape hatch를 일반 운영 도구로 사용하지 않는다.

---

## Architecture

### 1. Trust Boundary

```text
[Client / Browser / Mobile]
        │ publishable key + client_secret
        ▼
[Pillar Public API Edge]
        │ authn/authz/idempotency/rate-limit
        ▼
[Pillar Intent API]
        │ intent-first object model
        ▼
[Policy Engine]
        │ scopes + object constraints + party entitlement
        ▼
[Runtime Orchestrator]
        │ Canton-native command builder
        ▼
[Canton Participant / Ledger API]
        │ source of truth
        ▼
[Projection Indexer] ──► [Pillar DB: Projection / Audit / Config only]
        │
        ▼
[Webhook Dispatcher]
```

### 2. Credential Taxonomy

| Credential               |                         Prefix 예시 | 사용 위치                                  | 권한 성격                                                                                | 저장 방식                                   | 핵심 제약                                            |
| ------------------------ | --------------------------------: | -------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------ |
| Publishable key          |            `pk_test_`, `pk_live_` | Browser, mobile, public SDK            | 공개 가능. client-side initialization, limited retrieval, client_secret-bound action만 허용 | hash + prefix + last4                   | domain allowlist, rate limit, no ledger mutation |
| Secret key               |            `sk_test_`, `sk_live_` | Server only                            | account-level unrestricted 또는 near-root 권한                                           | hash/HMAC only, one-time reveal         | live에서는 기본 비활성, owner approval, no frontend      |
| Restricted key           |            `rk_test_`, `rk_live_` | Server, agents, integrations           | scoped API permission + object constraint + party entitlement                        | hash/HMAC only, one-time reveal         | default production key                           |
| Webhook signing secret   |                          `whsec_` | Pillar → merchant webhook verification | webhook authenticity 검증용. API 호출 불가                                                  | encrypted secret + active/previous hash | endpoint별, mode별, rotation window                |
| Client secret            | `cs_` 또는 `{intent_id}_secret_...` | Browser/mobile                         | 특정 intent의 client action token                                                       | hash, TTL, object-bound                 | short-lived, one intent only, no logs            |
| Service account          |                             `sa_` | machine principal                      | key/OAuth client의 owner principal                                                    | DB config                               | no interactive login                             |
| OAuth2 client credential |      `client_id`, `client_secret` | M2M token issuance                     | short-lived access token 발급                                                          | client secret hash                      | confidential client only, optional mTLS binding  |
| SSO/SAML/OIDC connection |                       `sso_conn_` | Dashboard human auth                   | human identity federation                                                            | config + IdP metadata                   | not sufficient for ledger action                 |
| mTLS certificate         |                SHA-256 thumbprint | Enterprise API / token endpoint        | client possession proof                                                              | cert fingerprint + CA chain config      | cert rotation, revocation, expiry                |
| IP allowlist             |                         CIDR list | API edge / webhook ingress             | network perimeter constraint                                                         | config                                  | not standalone auth                              |

### 3. Authentication Flow

#### Server-side API request

```http
POST /v1/transfer_intents
Authorization: Bearer rk_live_...
Pillar-Version: 2026-05-01
Idempotency-Key: merchant-order-93821
```

Flow:

1. API edge extracts credential prefix and key ID.
2. Credential hash is verified using HMAC with server-side pepper.
3. Mode is resolved: `test`, `sandbox`, `live`.
4. Principal is resolved: service account, user, OAuth client, or internal operator.
5. IP allowlist, mTLS binding, key status, expiration, rotation state are checked.
6. Scope and object constraints are evaluated.
7. Party-level authorization is evaluated.
8. Idempotency lock is acquired.
9. Intent is created.
10. Canton command is submitted asynchronously.
11. Webhook emits final result.

#### Client-side request

```http
GET /v1/transfer_intents/ti_123?client_secret=ti_123_secret_...
Authorization: Bearer pk_live_...
```

Rules:

* Publishable key identifies account/environment only.
* `client_secret` authorizes access to exactly one object.
* Response is redacted.
* No balances, holdings, metadata, party mapping, audit info, or ledger identifiers are returned unless explicitly safe.
* Client secret cannot create service accounts, keys, webhooks, transfers, ledger operations, or refunds/reversals.

### 4. Authorization Layers

Authorization is not a single RBAC check. Pillar uses layered authorization.

```text
Credential valid?
  └─ Account/environment valid?
      └─ Principal active?
          └─ Scope allows operation?
              └─ Object constraints allow target?
                  └─ Party entitlement allows read/act?
                      └─ Ledger runtime user has required Canton rights?
                          └─ Daml model accepts command?
```

### 5. Party-level Authorization

Pillar introduces a first-class `party_entitlement` model.

| Pillar entitlement   | Meaning                                             | Canton mapping                          |
| -------------------- | --------------------------------------------------- | --------------------------------------- |
| `party.read`         | Read balances, holdings, projected events for party | `canReadAs(party)`                      |
| `party.act`          | Submit asset-affecting intents for party            | `canActAs(party)`                       |
| `party.prepare`      | Prepare transaction for external party signing      | Ledger API user with `readAs` for party |
| `party.execute`      | Execute signed external-party transaction           | Ledger API user with `actAs` for party  |
| `party.admin`        | Manage party config, hosting, metadata              | Admin-only; never external default      |
| `party.escape_hatch` | Raw ledger intervention for this party              | break-glass only                        |

Policy rule:

> API scope grants **what function** can be called. Party entitlement grants **which ledger-relevant party** the function may touch.

Example:

```json
{
  "principal": "sa_treasury_ops",
  "scopes": ["holdings:read", "transfer_intents:create"],
  "constraints": {
    "asset_ids": ["asset_usdcx"],
    "max_amount": "100000.00",
    "destination_allowlist": ["acct_counterparty_a", "acct_counterparty_b"]
  },
  "party_entitlements": [
    {
      "party_alias": "merchant_treasury",
      "permissions": ["party.read", "party.act"]
    }
  ]
}
```

---

## API / Object Model

### 1. Core Security Objects

#### `api_key`

```json
{
  "id": "key_7K9...",
  "object": "api_key",
  "type": "restricted",
  "mode": "live",
  "livemode": true,
  "status": "active",
  "prefix": "rk_live",
  "last4": "9f2a",
  "name": "Settlement worker",
  "principal": "sa_settlement_worker",
  "scopes": [
    "holdings:read",
    "balances:read",
    "transfer_intents:create",
    "transfer_intents:read"
  ],
  "constraints": {
    "party_aliases": ["treasury"],
    "asset_ids": ["asset_usdcx"],
    "max_amount": "250000.00"
  },
  "allowed_ips": ["203.0.113.0/24"],
  "mtls_certificate_thumbprints": [],
  "expires_at": "2026-12-31T23:59:59Z",
  "created": "2026-05-26T00:00:00Z",
  "last_used_at": null,
  "last_used_ip": null
}
```

#### `service_account`

```json
{
  "id": "sa_settlement_worker",
  "object": "service_account",
  "account": "acct_merchant",
  "mode": "live",
  "status": "active",
  "display_name": "Settlement Worker",
  "default_scopes": [
    "holdings:read",
    "transfer_intents:create"
  ],
  "party_entitlements": [
    {
      "party_alias": "treasury",
      "permissions": ["party.read", "party.act"]
    }
  ],
  "created_by": "user_admin",
  "created": "2026-05-26T00:00:00Z"
}
```

#### `webhook_endpoint`

```json
{
  "id": "we_123",
  "object": "webhook_endpoint",
  "url": "https://merchant.example/webhooks/pillar",
  "mode": "live",
  "status": "enabled",
  "enabled_events": [
    "transfer_intent.succeeded",
    "transfer_intent.failed",
    "holding.updated",
    "balance.available"
  ],
  "api_version": "2026-05-01",
  "signing_secret_status": "active",
  "allowed_ips": [],
  "created": "2026-05-26T00:00:00Z"
}
```

#### `client_secret`

```json
{
  "id": "cs_123",
  "object": "client_secret",
  "target_object": "transfer_intent",
  "target_id": "ti_123",
  "mode": "live",
  "status": "active",
  "allowed_actions": [
    "retrieve",
    "confirm",
    "complete_next_action"
  ],
  "expires_at": "2026-05-26T01:00:00Z",
  "single_use": false
}
```

### 2. Permission Grammar

Pillar permission names use `{resource}:{action}`.

| Resource             | Read                      | Write / mutate                                           | Admin                 |
| -------------------- | ------------------------- | -------------------------------------------------------- | --------------------- |
| `balances`           | `balances:read`           | —                                                        | —                     |
| `holdings`           | `holdings:read`           | —                                                        | —                     |
| `transfer_intents`   | `transfer_intents:read`   | `transfer_intents:create`, `transfer_intents:cancel`     | —                     |
| `issuance_intents`   | `issuance_intents:read`   | `issuance_intents:create`, `issuance_intents:cancel`     | —                     |
| `redemption_intents` | `redemption_intents:read` | `redemption_intents:create`, `redemption_intents:cancel` | —                     |
| `parties`            | `parties:read`            | `parties:create`                                         | `parties:admin`       |
| `webhook_endpoints`  | `webhook_endpoints:read`  | `webhook_endpoints:write`                                | —                     |
| `api_keys`           | `api_keys:read`           | `api_keys:create`, `api_keys:rotate`, `api_keys:expire`  | —                     |
| `service_accounts`   | `service_accounts:read`   | `service_accounts:write`                                 | —                     |
| `oauth_clients`      | `oauth_clients:read`      | `oauth_clients:write`                                    | —                     |
| `audit_events`       | `audit_events:read`       | —                                                        | —                     |
| `ledger`             | `ledger:read_trace`       | —                                                        | `ledger:escape_hatch` |

### 3. Restricted Key Constraints

Restricted keys are not just scope lists. They include constraints.

```json
{
  "scopes": ["transfer_intents:create"],
  "constraints": {
    "intent_types": ["transfer"],
    "source_party_aliases": ["treasury"],
    "destination_account_ids": ["acct_counterparty_a"],
    "asset_ids": ["asset_usdcx"],
    "max_amount": "50000.00",
    "require_idempotency_key": true,
    "allowed_ips": ["203.0.113.0/24"],
    "valid_after": "2026-05-26T00:00:00Z",
    "expires_at": "2026-08-26T00:00:00Z"
  }
}
```

### 4. Public API Endpoints

```text
POST   /v1/api_keys
GET    /v1/api_keys
POST   /v1/api_keys/{id}/rotate
POST   /v1/api_keys/{id}/expire

POST   /v1/restricted_keys
GET    /v1/restricted_keys

POST   /v1/service_accounts
GET    /v1/service_accounts
POST   /v1/service_accounts/{id}/grant_party_entitlements
POST   /v1/service_accounts/{id}/revoke_party_entitlements

POST   /v1/oauth_clients
POST   /v1/oauth/token

POST   /v1/webhook_endpoints
POST   /v1/webhook_endpoints/{id}/rotate_secret
POST   /v1/webhook_endpoints/{id}/test

GET    /v1/audit_events
GET    /v1/request_logs/{request_id}

GET    /v1/balances
GET    /v1/holdings
POST   /v1/transfer_intents
GET    /v1/transfer_intents/{id}
POST   /v1/transfer_intents/{id}/cancel
```

### 5. Internal-only Escape Hatch API

```text
POST /internal/v1/ledger_escape_hatch/requests
POST /internal/v1/ledger_escape_hatch/requests/{id}/approve
POST /internal/v1/ledger_escape_hatch/requests/{id}/execute
GET  /internal/v1/ledger_escape_hatch/requests/{id}
```

This API is never exposed through public SDKs.

Required controls:

* `ledger:escape_hatch`
* production JIT grant
* 2-person approval
* mTLS
* IP allowlist
* hardware-backed operator MFA
* pre-execution dry run
* Daml package/template/choice allowlist
* party allowlist
* mandatory reason code
* mandatory incident/change ticket
* ledger audit marker
* immutable audit event

---

## Internal Runtime

### 1. Runtime Components

```text
API Gateway
  └─ Credential Verifier
      └─ Policy Engine
          └─ Idempotency Coordinator
              └─ Intent Orchestrator
                  └─ Party Resolver
                      └─ Ledger Command Builder
                          └─ Participant Router
                              └─ Command Submitter
                                  └─ Completion Correlator
                                      └─ Projection Indexer
                                          └─ Webhook Publisher
```

### 2. Runtime Identity

Pillar maintains separate runtime identities.

| Runtime principal                    | Purpose                     | Ledger rights                                      |
| ------------------------------------ | --------------------------- | -------------------------------------------------- |
| `pillar-runtime-{account}-{mode}`    | normal intent execution     | `canActAs` / `canReadAs` only for entitled parties |
| `pillar-projection-{account}-{mode}` | transaction/event ingestion | `canReadAs` for projected parties                  |
| `pillar-webhook-{account}-{mode}`    | webhook dispatch            | no ledger rights                                   |
| `pillar-key-admin`                   | key lifecycle               | no ledger rights by default                        |
| `pillar-party-admin`                 | party onboarding/config     | admin-scoped, tightly controlled                   |
| `pillar-breakglass`                  | ledger escape hatch         | disabled by default, JIT only                      |

### 3. Intent → Canton Command Mapping

For every intent-affecting ledger operation:

```text
Pillar request_id      = req_...
Pillar idempotency_key = merchant supplied key
Pillar intent_id       = ti_...
Policy decision        = pd_...
Canton workflow_id     = ti_...
Canton command_id      = cmd_hash(account, mode, intent_id, idempotency_key)
Canton submission_id   = req_...
Canton user_id         = pillar-runtime-{account}-{mode}
Canton act_as          = resolved source party
```

Rules:

* `workflow_id` is always the Pillar intent ID.
* `command_id` is deterministic for idempotent mutation requests.
* `submission_id` is the API request ID.
* `act_as` is derived from party entitlement, not from user-supplied raw party ID.
* Ledger completion must update `ledger_submissions.status`.
* Projection update must advance `projection_checkpoint.ledger_offset`.

### 4. Idempotency Design

Pillar uses two layers.

**API layer**

* `Idempotency-Key` required for all mutation endpoints in live mode.
* Store normalized request hash.
* If same key + same endpoint + same account + same body hash: return same result.
* If same key but different body hash: return `409 idempotency_key_reused_with_different_request`.
* Default retention: 24h minimum; configurable longer for regulated flows.
* For long-running ledger intents, return the existing intent object rather than replaying command.

**Ledger layer**

* Use deterministic Canton `command_id`.
* Use stable participant/EPN routing for the same account + party + intent.
* Maintain participant assignment in config.
* On failover, use participant HA shared database where applicable.
* Never assume Canton deduplication alone covers cross-participant retries.

### 5. External Party Flow

For customer-controlled party keys:

```text
POST /v1/transfer_intents
  → creates intent.requires_action
  → runtime prepares transaction
  → returns next_action.sign_transaction with client_secret

Client/Wallet signs transaction hash

POST /v1/transfer_intents/{id}/confirm
  → verifies client_secret
  → receives signature
  → runtime executes prepared transaction
  → completion updates intent
  → webhook emits transfer_intent.succeeded / failed
```

External API still remains intent-first. The user never sees Canton raw command internals except a wallet-safe signing payload.

---

## DB Schema

Pillar DB is **not** the ledger. It stores only:

* Projection
* Audit
* Config
* Idempotency/result cache
* Credential metadata and hashed secrets

### 1. Config / IAM Tables

#### `accounts`

| Column                | Type        | Notes                     |
| --------------------- | ----------- | ------------------------- |
| `id`                  | text PK     | `acct_...`                |
| `name`                | text        | merchant/platform name    |
| `status`              | enum        | active, suspended, closed |
| `default_api_version` | text        | e.g. `2026-05-01`         |
| `created_at`          | timestamptz |                           |

#### `environments`

| Column                    | Type        | Notes                                        |
| ------------------------- | ----------- | -------------------------------------------- |
| `id`                      | text PK     | `env_...`                                    |
| `account_id`              | text FK     |                                              |
| `mode`                    | enum        | test, sandbox, live                          |
| `status`                  | enum        | active, disabled                             |
| `canton_topology_profile` | text        | hosted, customer_participant, external_party |
| `created_at`              | timestamptz |                                              |

#### `principals`

| Column         | Type        | Notes                                                  |
| -------------- | ----------- | ------------------------------------------------------ |
| `id`           | text PK     | user/service_account/oauth_client                      |
| `account_id`   | text FK     |                                                        |
| `type`         | enum        | user, service_account, oauth_client, internal_operator |
| `status`       | enum        | active, suspended, deleted                             |
| `display_name` | text        |                                                        |
| `created_at`   | timestamptz |                                                        |

#### `service_accounts`

| Column        | Type                  | Notes        |
| ------------- | --------------------- | ------------ |
| `id`          | text PK/FK principals | `sa_...`     |
| `account_id`  | text FK               |              |
| `description` | text                  |              |
| `created_by`  | text                  | principal ID |
| `created_at`  | timestamptz           |              |

#### `api_keys`

| Column                 | Type        | Notes                                        |
| ---------------------- | ----------- | -------------------------------------------- |
| `id`                   | text PK     | `key_...`                                    |
| `account_id`           | text FK     |                                              |
| `environment_id`       | text FK     |                                              |
| `principal_id`         | text FK     | owner principal                              |
| `type`                 | enum        | publishable, secret, restricted              |
| `prefix`               | text        | `pk_live`, `sk_live`, `rk_live`              |
| `hash`                 | bytea       | HMAC/peppered hash; no plaintext             |
| `last4`                | text        | display only                                 |
| `status`               | enum        | active, pending_expiration, expired, revoked |
| `scopes`               | jsonb       | list                                         |
| `constraints`          | jsonb       | object/party/amount/IP constraints           |
| `allowed_ips`          | cidr[]      | nullable                                     |
| `mtls_thumbprints`     | text[]      | nullable                                     |
| `expires_at`           | timestamptz | nullable                                     |
| `rotation_grace_until` | timestamptz | nullable                                     |
| `rotated_from_key_id`  | text        | nullable                                     |
| `last_used_at`         | timestamptz | nullable                                     |
| `last_used_ip`         | inet        | nullable                                     |
| `created_at`           | timestamptz |                                              |

#### `oauth_clients`

| Column               | Type        | Notes                   |
| -------------------- | ----------- | ----------------------- |
| `id`                 | text PK     | `oc_...`                |
| `account_id`         | text FK     |                         |
| `principal_id`       | text FK     | service account         |
| `client_id`          | text unique | public identifier       |
| `client_secret_hash` | bytea       | nullable when mTLS-only |
| `allowed_grants`     | text[]      | `client_credentials`    |
| `scopes`             | text[]      | max scopes              |
| `token_ttl_seconds`  | int         | default 3600 or less    |
| `mtls_required`      | bool        |                         |
| `cert_thumbprints`   | text[]      |                         |
| `status`             | enum        | active, disabled        |
| `created_at`         | timestamptz |                         |

#### `sso_connections`

| Column          | Type        | Notes                   |
| --------------- | ----------- | ----------------------- |
| `id`            | text PK     | `sso_...`               |
| `account_id`    | text FK     |                         |
| `type`          | enum        | saml, oidc              |
| `idp_entity_id` | text        | SAML                    |
| `issuer`        | text        | OIDC                    |
| `jwks_uri`      | text        | OIDC                    |
| `metadata`      | jsonb       | encrypted where needed  |
| `role_mapping`  | jsonb       | IdP group → Pillar role |
| `status`        | enum        | active, disabled        |
| `created_at`    | timestamptz |                         |

### 2. Authorization Tables

#### `permission_grants`

| Column         | Type        | Notes                          |
| -------------- | ----------- | ------------------------------ |
| `id`           | text PK     | `pg_...`                       |
| `principal_id` | text FK     |                                |
| `scope`        | text        | e.g. `transfer_intents:create` |
| `constraints`  | jsonb       | optional                       |
| `expires_at`   | timestamptz | JIT grants supported           |
| `created_by`   | text        |                                |
| `created_at`   | timestamptz |                                |

#### `party_mappings`

| Column                | Type        | Notes                                              |
| --------------------- | ----------- | -------------------------------------------------- |
| `id`                  | text PK     |                                                    |
| `account_id`          | text FK     |                                                    |
| `party_alias`         | text        | external-safe alias                                |
| `ledger_party_id_enc` | bytea       | encrypted Canton party ID                          |
| `party_type`          | enum        | platform_custody, customer_custody, external_party |
| `participant_profile` | text        | routing profile                                    |
| `status`              | enum        | active, disabled                                   |
| `created_at`          | timestamptz |                                                    |

#### `party_entitlements`

| Column             | Type        | Notes                           |
| ------------------ | ----------- | ------------------------------- |
| `id`               | text PK     |                                 |
| `principal_id`     | text FK     |                                 |
| `party_mapping_id` | text FK     |                                 |
| `permissions`      | text[]      | `party.read`, `party.act`, etc. |
| `constraints`      | jsonb       | asset/amount/flow               |
| `expires_at`       | timestamptz | nullable                        |
| `created_at`       | timestamptz |                                 |

#### `policy_decisions`

| Column                       | Type        | Notes                   |
| ---------------------------- | ----------- | ----------------------- |
| `id`                         | text PK     | `pd_...`                |
| `request_id`                 | text        |                         |
| `principal_id`               | text        |                         |
| `credential_id`              | text        | nullable                |
| `decision`                   | enum        | allow, deny             |
| `reason_code`                | text        |                         |
| `matched_scopes`             | text[]      |                         |
| `matched_party_entitlements` | text[]      |                         |
| `input_hash`                 | bytea       | normalized policy input |
| `created_at`                 | timestamptz |                         |

### 3. Webhook Tables

#### `webhook_endpoints`

| Column           | Type        | Notes                         |
| ---------------- | ----------- | ----------------------------- |
| `id`             | text PK     | `we_...`                      |
| `account_id`     | text FK     |                               |
| `environment_id` | text FK     |                               |
| `url`            | text        | HTTPS required in live        |
| `status`         | enum        | enabled, disabled             |
| `api_version`    | text        | pinned                        |
| `enabled_events` | text[]      |                               |
| `allowed_ips`    | cidr[]      | optional receiver restriction |
| `created_at`     | timestamptz |                               |

#### `webhook_signing_secrets`

| Column                | Type        | Notes                     |
| --------------------- | ----------- | ------------------------- |
| `id`                  | text PK     | `whs_...`                 |
| `webhook_endpoint_id` | text FK     |                           |
| `secret_ciphertext`   | bytea       | KMS envelope encrypted    |
| `status`              | enum        | active, previous, expired |
| `not_before`          | timestamptz |                           |
| `expires_at`          | timestamptz | rotation grace            |
| `created_at`          | timestamptz |                           |

#### `webhook_deliveries`

| Column                | Type        | Notes                                |
| --------------------- | ----------- | ------------------------------------ |
| `id`                  | text PK     | `wd_...`                             |
| `event_id`            | text        |                                      |
| `webhook_endpoint_id` | text FK     |                                      |
| `status`              | enum        | pending, delivered, failed, retrying |
| `attempt_count`       | int         |                                      |
| `last_attempt_at`     | timestamptz |                                      |
| `next_attempt_at`     | timestamptz |                                      |
| `response_status`     | int         | nullable                             |
| `response_body_hash`  | bytea       | nullable                             |
| `created_at`          | timestamptz |                                      |

### 4. Idempotency / Request / Audit Tables

#### `idempotency_records`

| Column              | Type        | Notes                         |
| ------------------- | ----------- | ----------------------------- |
| `id`                | text PK     |                               |
| `account_id`        | text FK     |                               |
| `environment_id`    | text FK     |                               |
| `key_hash`          | bytea       | idempotency key hash          |
| `method`            | text        |                               |
| `path`              | text        |                               |
| `request_hash`      | bytea       | normalized body               |
| `status`            | enum        | processing, succeeded, failed |
| `response_status`   | int         | nullable                      |
| `response_body`     | jsonb       | redacted                      |
| `intent_id`         | text        | nullable                      |
| `ledger_command_id` | text        | nullable                      |
| `expires_at`        | timestamptz |                               |
| `created_at`        | timestamptz |                               |

#### `audit_events`

| Column               | Type        | Notes                  |
| -------------------- | ----------- | ---------------------- |
| `id`                 | text PK     | `ae_...`               |
| `account_id`         | text FK     |                        |
| `environment_id`     | text FK     |                        |
| `request_id`         | text        |                        |
| `actor_principal_id` | text        |                        |
| `credential_id`      | text        | nullable               |
| `event_type`         | text        | e.g. `api_key.rotated` |
| `object_type`        | text        |                        |
| `object_id`          | text        |                        |
| `source_ip`          | inet        |                        |
| `user_agent`         | text        | nullable               |
| `mtls_thumbprint`    | text        | nullable               |
| `api_version`        | text        |                        |
| `policy_decision_id` | text        | nullable               |
| `ledger_command_id`  | text        | nullable               |
| `ledger_update_id`   | text        | nullable               |
| `ledger_offset`      | text        | nullable               |
| `result`             | enum        | success, failure       |
| `metadata`           | jsonb       | redacted               |
| `created_at`         | timestamptz |                        |

### 5. Ledger Projection Tables

#### `ledger_submissions`

| Column                    | Type        | Notes                                   |
| ------------------------- | ----------- | --------------------------------------- |
| `id`                      | text PK     |                                         |
| `intent_id`               | text        |                                         |
| `account_id`              | text        |                                         |
| `environment_id`          | text        |                                         |
| `participant_profile`     | text        |                                         |
| `user_id`                 | text        | Canton Ledger API user                  |
| `act_as_party_mapping_id` | text        |                                         |
| `command_id`              | text        | deterministic                           |
| `workflow_id`             | text        | intent ID                               |
| `submission_id`           | text        | request ID                              |
| `status`                  | enum        | submitted, completed, failed, timed_out |
| `completion_status`       | jsonb       |                                         |
| `update_id`               | text        | nullable                                |
| `offset`                  | text        | nullable                                |
| `created_at`              | timestamptz |                                         |
| `completed_at`            | timestamptz | nullable                                |

#### `holdings_projection`

| Column             | Type        | Notes                  |
| ------------------ | ----------- | ---------------------- |
| `id`               | text PK     | `hld_...`              |
| `account_id`       | text FK     |                        |
| `environment_id`   | text FK     |                        |
| `party_mapping_id` | text FK     |                        |
| `asset_id`         | text        | external-safe asset ID |
| `available_amount` | numeric     | projection only        |
| `locked_amount`    | numeric     | projection only        |
| `ledger_offset`    | text        | source offset          |
| `ledger_update_id` | text        |                        |
| `updated_at`       | timestamptz |                        |

#### `balances_projection`

| Column             | Type        | Notes                      |
| ------------------ | ----------- | -------------------------- |
| `id`               | text PK     |                            |
| `account_id`       | text FK     |                            |
| `environment_id`   | text FK     |                            |
| `asset_id`         | text        |                            |
| `party_mapping_id` | text FK     |                            |
| `balance_type`     | enum        | available, pending, locked |
| `amount`           | numeric     | projection only            |
| `ledger_offset`    | text        |                            |
| `updated_at`       | timestamptz |                            |

---

## Failure Modes

| Failure mode                                        | Expected behavior                                      | Mitigation                                                                               |
| --------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Secret key leaked                                   | Immediate risk of broad account access                 | Prefer restricted keys, anomaly detection, instant revoke, forced rotation, audit alert  |
| Restricted key leaked                               | Damage limited to scopes/constraints                   | object constraints, party entitlement checks, IP allowlist, max amount, short expiration |
| Publishable key abused                              | No ledger mutation possible                            | domain allowlist, rate limit, client_secret required, redacted responses                 |
| client_secret leaked                                | Single intent may be viewed/confirmed                  | short TTL, object-bound, customer binding, TLS only, never log, revoke on intent cancel  |
| Webhook replay                                      | Old valid payload resent                               | timestamped signature, replay nonce cache, tolerance window                              |
| Webhook signature mismatch                          | Delivery rejected by merchant or Pillar receiver       | raw body verification docs, secret rotation grace, test delivery tooling                 |
| Idempotency key reused with different body          | Ambiguous replay                                       | `409` with deterministic error                                                           |
| API request accepted but ledger completion lost     | Intent stuck in `processing`                           | completion reconciler, ledger update scan, timeout state, replay-safe command ID         |
| Canton dedup not effective after participant switch | Duplicate submission risk                              | stable participant routing, HA shared DB, command state reconciliation                   |
| Projection lag                                      | API read may show stale balance                        | expose `ledger_synced_at`, `projection_offset`, eventual consistency status              |
| SSO IdP outage                                      | Dashboard login unavailable                            | break-glass admin accounts, cached IdP metadata, no bypass for asset ops                 |
| JWKS unavailable for OAuth/OIDC                     | Token validation fails                                 | JWKS cache with bounded TTL, fail closed after TTL                                       |
| mTLS certificate expired                            | API/token request fails                                | cert expiry alerts, overlapping cert rotation                                            |
| IP allowlist stale after NAT change                 | Legit traffic denied                                   | self-service update workflow, emergency temporary grant                                  |
| Service account over-scoped                         | Integration can perform excessive actions              | restricted defaults, policy simulator, approval workflow                                 |
| Party entitlement drift vs Canton rights            | Pillar policy allows but ledger rejects, or vice versa | periodic reconciliation job comparing Pillar entitlements and Ledger API user rights     |
| ledger escape hatch abused                          | Raw ledger mutation risk                               | JIT, 2-person approval, mTLS, package/party allowlist, immutable audit, ledger marker    |
| Webhook delivery permanently failing                | Customer misses async outcome                          | retry schedule, dead-letter queue, Workbench delivery replay                             |
| Clock skew                                          | JWT, webhook signature, expiration failures            | NTP enforcement, skew tolerance, alerting                                                |
| Audit event write failure                           | Compliance gap                                         | audit write-ahead queue, fail closed for sensitive ops                                   |

---

## Security / Compliance

### 1. Threat Model

Pillar should model threats using STRIDE plus API-specific authorization risks. OWASP API Security Top 10 highlights object-level authorization as a major API risk because APIs expose object identifiers and must check authorization for every object access. Pillar therefore treats object-level authorization and party-level authorization as mandatory on every read/write path. ([OWASP Foundation][12])

| Threat                 | Example                                                   | Control                                                                       |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Spoofing               | stolen API key, forged OAuth token, fake webhook          | key hashing, JWT validation, mTLS, webhook HMAC                               |
| Tampering              | request body modification, webhook payload mutation       | TLS, signature over raw body, request hash in idempotency record              |
| Repudiation            | operator denies key rotation or escape hatch              | immutable audit log, request ID, policy decision ID, ledger trace             |
| Information disclosure | cross-account holding read, leaked client_secret          | object-level auth, party entitlement, response redaction, no logs for secrets |
| Denial of service      | key brute force, webhook floods, expensive ledger queries | rate limits, CIDR allowlist, circuit breakers, quotas                         |
| Elevation of privilege | service account gains party act rights                    | scoped grants, approval workflow, reconciliation, JIT expiration              |
| Ledger misuse          | raw command bypasses intent grammar                       | no public Ledger API proxy, escape hatch controls                             |
| Projection poisoning   | DB state diverges from ledger                             | projection is non-authoritative, offset reconciliation, replay from ledger    |

### 2. Secret Handling

* Store no plaintext API key after creation.
* Use prefix + key ID for lookup, HMAC-SHA-256 with server-side pepper for verification.
* Store display `last4` only.
* Store webhook secrets encrypted with KMS envelope encryption because they must be used to sign outgoing events.
* Store OAuth client secrets only as hashes.
* Store client secrets only as hashes with TTL.
* Redact all secret-like values in logs, traces, webhook payloads, errors, and support tools.
* Secret reveal is one-time only except publishable keys.

### 3. Key Rotation

Rotation model:

```text
active old key
  → create replacement key
  → new key active immediately
  → old key enters pending_expiration
  → both accepted during grace window if configured
  → old key expires/revokes
  → audit event emitted
```

Policy:

* Secret/restricted keys: rotate at least every 90–180 days for production service accounts unless customer policy overrides.
* Webhook signing secrets: support immediate expiration or delayed expiration window.
* OAuth client secrets: rotate with overlapping active credentials.
* mTLS certificates: rotate with overlapping thumbprints and CA chain validation.
* Publishable keys: rotate/revoke but do not rely on secrecy.

### 4. Key Expiration

* `restricted key`: required `expires_at` for production by default.
* `secret key`: required `expires_at`, except explicitly approved platform owner key.
* `service account OAuth client_secret`: required expiration and rotation.
* `webhook signing secret`: expiration during rotation only; active secret can be long-lived but should be periodically rotated.
* `client_secret`: short TTL; default 30–60 minutes depending on flow.
* `ledger escape hatch grant`: very short TTL; default 15–60 minutes.

### 5. Scoped Permissions

Permission evaluation includes:

```text
scope
+ environment
+ account
+ object ownership
+ resource type
+ intended operation
+ party entitlement
+ amount/asset/destination constraints
+ network constraints
+ time constraints
+ mTLS binding
```

No permission is evaluated in isolation.

### 6. Party-level Authorization

Pillar must enforce party-level authorization before building any Canton command.

Required checks:

* Source holding party is within caller’s `party.act`.
* Destination party is either public/known counterparty or caller has permitted destination constraint.
* Read APIs require `party.read`.
* External party prepare requires `party.prepare`.
* External party execute requires `party.execute`.
* Admin operations require `party.admin`.
* Raw intervention requires `party.escape_hatch` plus global `ledger:escape_hatch`.

### 7. mTLS

mTLS is mandatory for:

* internal service-to-service production traffic;
* Canton Admin API access;
* enterprise customer API option;
* OAuth token endpoint when `mtls_required=true`;
* ledger escape hatch execution path.

mTLS binding model:

```json
{
  "credential_id": "rk_live_...",
  "required_thumbprints": [
    "sha256:ABCD..."
  ],
  "mode": "live",
  "fail_open": false
}
```

### 8. IP Allowlist

IP allowlist applies before credential authorization.

Supported levels:

* account-level default allowlist;
* API key allowlist;
* OAuth client allowlist;
* internal operator allowlist;
* webhook receiver egress allowlist;
* admin/escape hatch allowlist.

IP allowlist is a perimeter control, not a replacement for authentication.

### 9. Webhook Security

Pillar webhook request:

```http
POST /merchant/webhooks/pillar
Pillar-Signature: t=1779770000,v1=<hmac_sha256>
Pillar-Event-Id: evt_...
Pillar-Request-Id: req_...
Pillar-Version: 2026-05-01
```

Signature base string:

```text
{timestamp}.{raw_body}
```

Verification requirements:

* use raw request body;
* verify timestamp tolerance;
* verify active or previous secret during rotation grace;
* reject replayed `event_id + timestamp + signature`;
* return 2xx only after durable processing or durable enqueue;
* expose delivery logs and replay in Workbench.

### 10. Audit Requirements

Mandatory audit events:

* API key created, revealed, rotated, expired, revoked;
* restricted key scope/constraint changed;
* service account created, disabled, granted party entitlement;
* OAuth client created, secret rotated, token issued;
* SSO login, SAML/OIDC config changed, role mapping changed;
* mTLS certificate added, removed, expired;
* IP allowlist changed;
* client_secret issued and used;
* webhook endpoint created, event delivered, delivery failed, secret rotated;
* intent created, confirmed, canceled, failed, completed;
* policy decision allow/deny;
* ledger command submitted, completed, failed;
* projection checkpoint advanced;
* ledger escape hatch requested, approved, executed, denied.

Audit record must include:

```text
timestamp
request_id
actor_principal_id
credential_id
account_id
environment_id
source_ip
user_agent
mTLS certificate thumbprint
API version
idempotency key hash
object type/id
scope requested
party aliases/party mapping IDs
policy decision ID
ledger command_id
ledger workflow_id
ledger update_id
ledger offset
result
reason code
redacted metadata
```

Retention:

* security audit: 7 years default for regulated customers;
* request logs: 90–365 days configurable;
* webhook delivery logs: 30–180 days configurable;
* ledger trace pointers: retained as long as projection retention requires;
* raw secrets: never retained in plaintext.

---

## Implementation Plan

### Phase 0 — Security baseline

* Define credential prefixes and token formats.
* Define `principal`, `service_account`, `api_key`, `permission_grant`, `party_entitlement` schema.
* Implement one-time key reveal and HMAC verification.
* Implement request ID, audit event writer, redaction library.

### Phase 1 — Restricted key first

* Implement restricted key creation.
* Implement scope + constraints evaluator.
* Make restricted key default in dashboard and CLI.
* Keep secret key behind explicit “advanced / legacy” path.
* Add key rotation and expiration APIs.

### Phase 2 — Party-level authorization

* Implement `party_mappings`.
* Implement `party_entitlements`.
* Implement policy engine integration before intent creation.
* Add reconciliation job between Pillar entitlements and Canton Ledger API user rights.
* Add denial reason codes.

### Phase 3 — Intent-to-ledger traceability

* Set `workflow_id = intent_id`.
* Set deterministic `command_id`.
* Set `submission_id = request_id`.
* Persist `ledger_submissions`.
* Implement completion correlator.
* Implement projection checkpointing.

### Phase 4 — Webhook-first async

* Implement webhook endpoints.
* Implement endpoint-specific signing secrets.
* Implement signature rotation.
* Implement event delivery retries and dead-letter queue.
* Add `pillar listen` and `pillar trigger`.

### Phase 5 — OAuth2 / SSO / mTLS

* Implement OAuth2 client credentials token endpoint.
* Add mTLS-bound OAuth clients.
* Add SAML/OIDC dashboard login.
* Implement IdP group-to-role mapping.
* Add JWKS cache and fail-closed behavior.
* Add mTLS cert lifecycle APIs.

### Phase 6 — Ledger escape hatch

* Implement internal-only escape hatch request object.
* Add JIT permission grants.
* Add 2-person approval.
* Add Daml package/template/choice allowlist.
* Add ledger audit marker.
* Add Workbench-only execution UI.
* Add incident/change ticket requirement.

### Phase 7 — SDK / CLI / Sandbox

* SDKs: Node, Python, Java, Go minimum.
* CLI: `pillar keys`, `pillar listen`, `pillar trigger`, `pillar logs`, `pillar sandbox`.
* Sandbox: local Canton sandbox wrapper with test credentials and local webhook forwarding.
* Workbench: request logs, event logs, webhook deliveries, policy simulator, key usage logs.

---

## Open Questions

1. **Custody topology**: Pillar launch default는 omnibus/platform party인가, per-customer party인가, external party인가?
2. **External party support depth**: MVP에서 prepare/sign/execute를 지원할 것인가, 아니면 hosted custody부터 시작할 것인가?
3. **Secret key policy**: live `sk_live`를 완전히 금지할 것인가, 아니면 owner-only legacy mode로 허용할 것인가?
4. **Publishable key expiration**: Stripe-like로 publishable key는 revocation/rotation 중심으로 갈 것인가, 아니면 Pillar만의 hard expiration을 둘 것인가?
5. **Party alias visibility**: 외부 API에 `party_alias`를 노출할 것인가, 아니면 `account`, `holding`, `wallet` abstraction으로만 제공할 것인가?
6. **Ledger audit marker template**: 모든 privileged operation에 Daml `PillarOperationReceipt`를 남길 것인가, 아니면 escape hatch에만 남길 것인가?
7. **Webhook event shape**: snapshot event와 thin event를 모두 제공할 것인가?
8. **API version naming**: 날짜형 `2026-05-01`만 쓸 것인가, Stripe처럼 release codename을 붙일 것인가?
9. **OAuth authorization server**: Pillar 자체 구현인가, Auth0/Okta/Keycloak 등 외부 IdP federation인가?
10. **Regulatory retention**: audit log 7년을 기본으로 할지, customer tier별로 다르게 할지?
11. **Break-glass approval**: 내부 2인 승인만으로 충분한가, 고객 승인도 필요한 tenant가 있는가?
12. **Workbench scope**: 고객에게 policy simulator를 제공할 것인가, 내부 support 도구로만 둘 것인가?

---

## Agent-ready Checklist

### Research / Spec

* [ ] Stripe key model, webhook signature, idempotency, versioning, CLI, Workbench 문서 요약을 design doc에 첨부한다.
* [ ] Canton Ledger API user/party/right model을 `party_entitlement` 설계에 반영한다.
* [ ] Canton command deduplication 조건을 idempotency 설계에 반영한다.
* [ ] OAuth2 client credentials, OIDC, SAML, mTLS spec 요건을 IAM 설계에 반영한다.

### Credential Service

* [ ] `api_keys` table 구현.
* [ ] key prefix parser 구현.
* [ ] one-time reveal 구현.
* [ ] HMAC/pepper verification 구현.
* [ ] `last4`, `last_used_at`, `last_used_ip` 저장.
* [ ] key rotation API 구현.
* [ ] key expiration API 구현.
* [ ] key usage audit 구현.
* [ ] restricted key constraint evaluator 구현.

### Service Account / OAuth

* [ ] `principals` table 구현.
* [ ] `service_accounts` table 구현.
* [ ] `oauth_clients` table 구현.
* [ ] client credentials token endpoint 구현.
* [ ] OAuth token scope clipping 구현.
* [ ] optional mTLS-bound token 구현.
* [ ] OAuth client secret rotation 구현.

### SSO

* [ ] SAML connection config 구현.
* [ ] OIDC connection config 구현.
* [ ] IdP metadata/JWKS cache 구현.
* [ ] group-to-role mapping 구현.
* [ ] dashboard login audit 구현.
* [ ] SSO failure recovery policy 정의.

### mTLS / IP Allowlist

* [ ] API edge client certificate extraction 구현.
* [ ] certificate thumbprint binding 구현.
* [ ] cert rotation overlap 구현.
* [ ] account/key/oauth-client IP allowlist 구현.
* [ ] deny audit event 구현.

### Policy Engine

* [ ] scope evaluator 구현.
* [ ] object constraint evaluator 구현.
* [ ] amount/asset/destination constraint 구현.
* [ ] `party_entitlements` table 구현.
* [ ] party read/act/prepare/execute/admin checks 구현.
* [ ] policy decision logging 구현.
* [ ] policy simulator API 구현.

### Intent Runtime

* [ ] idempotency lock 구현.
* [ ] deterministic `command_id` 생성.
* [ ] `workflow_id = intent_id` 적용.
* [ ] `submission_id = request_id` 적용.
* [ ] participant sticky routing 구현.
* [ ] ledger completion correlator 구현.
* [ ] stuck intent reconciler 구현.

### Webhooks

* [ ] `webhook_endpoints` table 구현.
* [ ] endpoint-specific `whsec` secret 생성.
* [ ] HMAC signature 생성.
* [ ] timestamp/replay protection 구현.
* [ ] secret rotation with grace window 구현.
* [ ] delivery retry and DLQ 구현.
* [ ] `pillar listen` 구현.
* [ ] `pillar trigger` 구현.
* [ ] Workbench delivery replay 구현.

### Client Secret

* [ ] client_secret token format 정의.
* [ ] object-bound hash 저장.
* [ ] TTL enforcement 구현.
* [ ] redacted client retrieve API 구현.
* [ ] confirm/next_action 권한 제한 구현.
* [ ] no-log redaction test 작성.

### Ledger Escape Hatch

* [ ] internal-only API route 구현.
* [ ] `ledger:escape_hatch` permission 정의.
* [ ] JIT grant flow 구현.
* [ ] 2-person approval 구현.
* [ ] mTLS + IP allowlist enforcement 구현.
* [ ] dry-run validation 구현.
* [ ] Daml package/template/choice allowlist 구현.
* [ ] ledger audit marker 구현.
* [ ] immutable audit event 구현.

### DB / Audit / Compliance

* [ ] audit event write-ahead queue 구현.
* [ ] audit log redaction rules 구현.
* [ ] request log retention policy 구현.
* [ ] projection checkpoint table 구현.
* [ ] ledger submission/completion tables 구현.
* [ ] balance/holding projection tables 구현.
* [ ] projection rebuild job 구현.
* [ ] WORM/export option 설계.

### SDK / Workbench / Sandbox

* [ ] SDK에서 API version pinning 지원.
* [ ] SDK에서 idempotency helper 제공.
* [ ] SDK에서 webhook signature verifier 제공.
* [ ] CLI key management 구현.
* [ ] CLI webhook local forwarding 구현.
* [ ] Pillar sandbox가 Canton sandbox를 감싸도록 구현.
* [ ] Workbench request logs 구현.
* [ ] Workbench event logs 구현.
* [ ] Workbench key usage logs 구현.
* [ ] Workbench policy simulator 구현.

[1]: https://docs.stripe.com/get-started/api-request "docs.stripe.com"
[2]: https://docs.stripe.com/keys "docs.stripe.com"
[3]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[4]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[5]: https://docs.stripe.com/webhooks "docs.stripe.com"
[6]: https://docs.stripe.com/workbench "docs.stripe.com"
[7]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[8]: https://docs.digitalasset.com/operate/3.4/howtos/secure/apis/jwt.html "Configure API Authentication and Authorization with JWT — Digital Asset’s platform documentation"
[9]: https://docs.digitalasset.com/overview/3.4/explanations/canton/external-party.html "Local and external parties — Digital Asset’s platform documentation"
[10]: https://docs.digitalasset.com/build/3.4/dpm/dpm.html "Digital Asset Package Manager (Dpm) — Digital Asset’s platform documentation"
[11]: https://datatracker.ietf.org/doc/html/rfc6749 "
            
                RFC 6749 - The OAuth 2.0 Authorization Framework
            
        "
[12]: https://owasp.org/API-Security/editions/2023/en/0x11-t10/?utm_source=chatgpt.com "OWASP Top 10 API Security Risks – 2023"
