# Executive Summary

Pillar의 외부 API는 **“Stripe-grade REST API grammar + Canton-native runtime”**로 설계한다. 외부 개발자는 Canton, Daml template, contract id, participant topology를 몰라도 `account`, `asset`, `holding`, `balance`, `*_intent`, `event`만으로 자산 발행·보유·이전·상환을 다룬다. 내부 런타임은 모든 상태 전이를 Canton Ledger command/update stream으로 추적하고, Pillar DB는 **projection / audit / config / idempotency / webhook delivery**만 저장한다.

핵심 결론:

* **Source of truth:** Canton Ledger. DB projection은 재생성 가능해야 한다.
* **Public object model:** contract-first가 아니라 **balance/holding-first**.
* **Mutation model:** transaction-first가 아니라 **intent-first**.
* **Async model:** 동기 응답은 “accepted / processing / current projection”이고 최종성은 **webhook-first**.
* **Trace model:** public API는 Canton-invisible이지만 모든 operation은 `request_id → intent_id → operation_id → ledger_trace_id → command/workflow/update`로 내부 감사 가능해야 한다.
* **API grammar:** Stripe의 버전, idempotency, pagination, expand, metadata, error, request id, API key, webhook, SDK/CLI/Workbench 패턴을 Pillar 표준으로 채택하되, Canton 특성 때문에 idempotency와 ledger command dedup을 이중화한다.

공식 Stripe 문서 기준으로 Stripe API는 REST, 예측 가능한 resource URL, JSON response, 표준 HTTP code/auth/verb를 사용하며, live/sandbox 동작은 API key가 결정된다. Stripe는 request별 API version override, account default version, webhook endpoint versioning, Workbench 기반 업그레이드 흐름을 제공한다. Idempotency는 모든 `POST`에 적용 가능하고, 같은 key에 대해 최초 결과를 저장하며, cursor pagination은 `limit`, `starting_after`, `ending_before`, `object: "list"`, `data`, `has_more`, `url` 구조를 사용한다. ([Stripe Docs][1])

Canton/Daml 공식 문서 기준으로 Ledger API는 command를 ledger로 보내고 update/event stream으로 결과를 읽는 비동기 구조다. Command submission은 “서버가 요청을 파싱하고 수락했다”는 의미이지 ledger 실행 완료가 아니며, completion/update stream으로 상관관계를 맞춰야 한다. 또한 Canton JSON Ledger API는 HTTP/JSON 및 OpenAPI를 제공하지만 공식 문서는 이를 인터넷에 직접 노출하지 말라고 권고한다. 따라서 Pillar는 JSON Ledger API를 public API로 노출하지 않고, 내부 Canton adapter 뒤에 숨긴다. ([Digital Asset Documentation][2])

---

## 리서치 근거 요약

| 영역                               | 공식 문서에서 확인한 내용                                                                                                                                        | Pillar 설계 반영                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Stripe API grammar               | REST, resource-oriented URL, JSON response, standard HTTP code/auth/verb, API key가 live/sandbox 결정. ([Stripe Docs][1])                                | `/v1` REST API, JSON response, key-driven `livemode`, Stripe-like DX.                |
| Stripe versioning                | Account default API version, request header override, webhook endpoint version, SDK pinning, Workbench upgrade flow. ([Stripe Docs][3])               | `Pillar-Version`, account default, endpoint version pinning, SDK pinned API version. |
| Idempotency                      | `Idempotency-Key`는 `POST` retry 안정화용, UUID 추천, 최대 255자, 최초 status/body 저장, parameter mismatch 방지. ([Stripe Docs][4])                                  | 모든 mutating POST에 필수 권장. Ledger operation 및 Canton command id와 연결.                   |
| Pagination                       | `limit`, `starting_after`, `ending_before`, list object shape: `object`, `data`, `has_more`, `url`. ([Stripe Docs][5])                                | 동일 grammar 채택. Projection read에 cursor pagination 적용.                                |
| Expand                           | 모든 API request에서 `expand` 지원, dot notation, list는 `data.*`, 최대 깊이 4. ([Stripe Docs][6])                                                               | Canton raw contract를 제외한 safe expansion만 허용.                                         |
| Metadata                         | 업데이트 가능한 object에 metadata, 최대 50 keys, key 40자, value 500자, 민감정보 금지. ([Stripe Docs][7])                                                               | 동일 제한. Ledger 의미론에 metadata를 암묵 반영하지 않음.                                             |
| Error / request ID / rate limit  | Stripe는 표준 HTTP code와 error attributes를 사용하고, 모든 API request에 `Request-Id` header를 제공하며, 429 시 rate-limit reason header를 사용한다. ([Stripe Docs][8])     | `Pillar-Request-Id`, 표준 error object, rate-limit reason taxonomy 도입.                 |
| API keys                         | Stripe secret key는 `sk_test_`, `sk_live_`, restricted key 등 mode/scope prefix를 사용하며 HTTPS와 Bearer/Basic auth를 지원한다. ([Stripe Docs][9])                | Pillar 전용 prefix `plr_sk_test_`, `plr_sk_live_`, `plr_rk_*`, `plr_whsec_*`.          |
| Webhooks / CLI / Workbench       | Stripe webhook은 Event object를 HTTPS JSON으로 보내고, signature 검증, CLI local testing, Workbench debugging을 제공한다. ([Stripe Docs][10])                       | Event-first async, signed webhook, Pillar CLI, Pillar Workbench.                     |
| Canton Ledger API                | Commands to ledger, updates/events from ledger, completion/update correlation, command dedup, workflow/command id. ([Digital Asset Documentation][2]) | Intent orchestrator + command envelope + update-stream projection.                   |
| Canton JSON Ledger API / OpenAPI | JSON Ledger API는 HTTP/JSON, OpenAPI 3.1, JWT 필요, 인터넷 직접 노출 금지 권고. ([Digital Asset Documentation][11])                                                 | Internal-only Canton adapter. Public OpenAPI는 Pillar-specific.                       |
| Daml SDK / Sandbox / CLI         | `dpm sandbox`, `dpm build`, `dpm test`, `dpm codegen`, Daml Shell 등 개발 도구 제공. ([Digital Asset Documentation][12])                                     | Pillar Sandbox는 Canton sandbox 위에 API gateway, projection, webhook emulator를 얹음.     |
| Projection / PQS                 | PQS는 Ledger API stream을 읽어 PostgreSQL에 현재/과거 ledger state를 저장하고, pruning/reset/redaction 운영이 있다. ([Digital Asset Documentation][13])                  | Pillar DB projection은 ledger-derived이며 watermark/rebuild/prune 전략 필요.                |
| OpenAPI                          | OpenAPI는 HTTP API를 language-agnostic하게 기술하며, `operationId`는 unique해야 하고 tooling에서 사용된다. ([Swagger][14])                                               | Public API spec은 OpenAPI 3.1, deterministic `operationId`, SDK generation contract.  |

---

# Goals / Non-goals

## Goals

1. **Stripe-grade API grammar**

   * 모든 object는 `id`, `object`, `livemode`, `created`, `metadata` 기본 field를 가진다.
   * 모든 list endpoint는 동일한 cursor pagination 문법을 가진다.
   * 모든 mutating POST는 idempotency를 지원한다.
   * 모든 응답은 request ID와 version context를 가진다.

2. **Canton-invisible external API**

   * Public API에 Daml template name, contract id, synchronizer topology, participant internals를 노출하지 않는다.
   * 외부 개발자는 `holding`, `balance`, `transfer_intent`, `event`만 다룬다.

3. **Canton-native internal runtime**

   * 내부 mutation은 Canton command submission으로 수행한다.
   * 최종 상태는 Ledger API update stream으로 반영한다.
   * Canton command id, workflow id, update id, offset은 audit trace에 저장한다.

4. **Balance/Holding-first**

   * 사용자는 “이 account가 이 asset을 얼마나 보유하는가”를 먼저 본다.
   * Contract는 내부 ledger representation일 뿐이다.

5. **Intent-first**

   * 사용자는 `transfer_intent`, `issuance_intent`, `redemption_intent`, `settlement_intent`를 생성한다.
   * Intent lifecycle이 API의 주 상태 모델이다.

6. **Webhook-first async**

   * Ledger finality, approval, compliance check, settlement은 비동기다.
   * 최종 결과는 webhook event로 전달한다.

7. **Deployment-invariant API**

   * 단일 sandbox, enterprise participant, multi-participant Canton network, managed cloud 모두 동일 API experience를 제공한다.

## Non-goals

* Public API에서 Canton JSON Ledger API를 그대로 proxy하지 않는다.
* Public API에서 raw Daml contract id를 primary identifier로 쓰지 않는다.
* Pillar DB를 business-state source of truth로 사용하지 않는다.
* API v1에서 모든 Canton 기능을 노출하지 않는다.
* Metadata를 ledger semantics 또는 authorization decision에 사용하지 않는다.
* 동기 API response만으로 settlement finality를 보장하지 않는다.

---

# Architecture

## Target Architecture

```text
Client / SDK / CLI / Workbench
        |
        v
Pillar Public API Gateway
  - AuthN / API key mode
  - API version resolver
  - Idempotency
  - Rate limit
  - Request ID / tracing
  - OpenAPI contract validation
        |
        v
Resource Service Layer
  - Accounts
  - Assets
  - Holdings
  - Balances
  - Intents
  - Events
  - Webhook endpoints
        |
        v
Intent Orchestrator
  - Validate business invariant
  - Build command envelope
  - Persist audit + idempotency state
  - Submit Canton command
        |
        v
Canton Adapter
  - Ledger API command submission
  - Completion stream consumer
  - Update stream consumer
  - Offset / workflow / command correlation
        |
        v
Canton Ledger
  - Source of truth
  - Daml contracts and choices
        |
        v
Projection Builder
  - Holdings projection
  - Balances projection
  - Asset projection
  - Event outbox
        |
        v
Webhook Dispatcher
  - Signed delivery
  - Retry
  - Delivery audit
```

Canton Ledger API는 command 제출과 update/event stream을 분리한다. Command submission 자체는 ledger effect 완료가 아니며, completion/update stream과 correlation해야 한다. 이 구조 때문에 Pillar API는 mutating call에서 “accepted / processing” object를 반환하고, 최종 성공·실패는 projection update 및 webhook event로 전달한다. ([Digital Asset Documentation][2])

## Layer Responsibilities

| Layer               | Responsibility                                                         | Persistence                   |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| API Gateway         | Auth, version, idempotency, request ID, rate limit, request validation | API audit, idempotency cache  |
| Resource Service    | Public object grammar, projection read, expansion                      | Projection read only          |
| Intent Orchestrator | Business intent validation, command envelope, lifecycle                | Intent audit, operation audit |
| Canton Adapter      | Canton command/update/completion integration                           | Ledger trace audit            |
| Projection Builder  | Ledger-derived materialized views                                      | Rebuildable projection        |
| Webhook Dispatcher  | Event signing/delivery/retry                                           | Delivery log                  |

## Public vs Internal Boundary

**Public API must never expose:**

* Daml template names
* Raw Canton contract IDs
* Participant topology
* Synchronizer internals
* Ledger API JWTs
* Internal party allocation mechanics

**Public API may expose, when safe:**

* `ledger_trace_id`
* `operation_id`
* `request_id`
* `event_id`
* `projection_watermark`
* Opaque `ledger_commit_reference`

**Internal audit stores:**

* `command_id`
* `workflow_id`
* `submission_id`
* `update_id`
* `offset`
* `participant_id`
* `synchronizer_id`
* submitting party / act_as user
* command hash

---

# API / Object Model

## 1. Base API Grammar

```http
GET  /v1/holdings
POST /v1/transfer_intents
GET  /v1/transfer_intents/trint_...
POST /v1/transfer_intents/trint_.../confirm
```

Default request headers:

```http
Authorization: Bearer plr_sk_test_...
Pillar-Version: 2026-06-30.cedar
Idempotency-Key: 7e1e1f54-6e3a-4a3a-9a40-8e3a1d9b8e2e
```

Default response headers:

```http
Pillar-Request-Id: req_01JY...
Pillar-Version: 2026-06-30.cedar
Pillar-Mode: test
Pillar-RateLimit-Limit: 100
Pillar-RateLimit-Remaining: 97
Pillar-RateLimit-Reset: 2026-05-26T04:01:00.000Z
```

## 2. API Versioning

### Standard

Pillar uses **dual versioning**:

1. **Path major version**

   * `/v1`
   * Only changes for large grammar-level migrations.

2. **Date-based behavior version**

   * Header: `Pillar-Version: 2026-06-30.cedar`
   * Account default version stored in config.
   * Webhook endpoint has pinned API version.
   * SDK has pinned default API version.
   * Per-request override allowed in testmode and, for allowed versions, livemode.

Stripe uses account default version, request override via version header, webhook endpoint versioning, and SDK version pinning. Pillar mirrors that model because it gives stable long-lived integrations while allowing controlled upgrades. ([Stripe Docs][3])

### Version format

```text
YYYY-MM-DD.codename
```

Example:

```text
2026-06-30.cedar
```

### Compatibility policy

| Change type                    |           Allowed without new version? | Example                                |
| ------------------------------ | -------------------------------------: | -------------------------------------- |
| Add optional request parameter |                                    Yes | `description` on intent create         |
| Add response field             |                                    Yes | `canceled_at`                          |
| Add new expandable relation    |                                    Yes | `expand[]=latest_operation`            |
| Add new webhook event type     | Yes, if subscriber opted into wildcard | `holding.reconciled`                   |
| Add new enum value             |                    Only for open enums | `status_details.reason`                |
| Rename field                   |                                     No | `asset_code → symbol`                  |
| Remove field                   |                                     No | Remove `metadata`                      |
| Change field meaning           |                                     No | `available` including reserved amount  |
| Change error code semantics    |                                     No | `insufficient_holding` meaning changes |
| Change pagination order        |                                     No | `created desc` to `created asc`        |
| Expose contract IDs            |                       No in public API | Use `ledger_trace_id`                  |

Stripe’s release model distinguishes backward-compatible monthly changes and major releases that may include breaking changes. Pillar adopts the same discipline: additive monthly versions, explicit major behavior versions, and no silent semantic changes. ([Stripe Docs][15])

## 3. Idempotency

### Header

```http
Idempotency-Key: 7e1e1f54-6e3a-4a3a-9a40-8e3a1d9b8e2e
```

### Standard

* Supported on all mutating `POST` endpoints.
* Strongly required for:

  * `POST /v1/*_intents`
  * `POST /v1/*_intents/:id/confirm`
  * `POST /v1/webhook_endpoints`
  * `POST /v1/api_keys`
* Key length: 1–255 chars.
* Recommended format: UUIDv4, ULID, or high-entropy client-generated string.
* Scope: `{account_id, livemode, method, path, idempotency_key}`.
* Request fingerprint includes method, path, normalized body, API version, account, mode.
* Reuse with different fingerprint returns `idempotency_error`.
* Minimum retention: 24h.
* Ledger-mutating retention target: 7 days.
* Do not include PII, secrets, customer names, or asset identifiers in the key.

Stripe saves the first result for an idempotency key, recommends UUIDv4, caps keys at 255 characters, and rejects mismatched parameter reuse. Pillar follows this but extends the model to ledger command correlation. ([Stripe Docs][4])

### Canton-specific rule

For ledger mutations, idempotency is enforced at two layers:

1. **Pillar DB idempotency**

   * Prevents duplicate API-side intent creation or command submission.

2. **Canton command dedup**

   * `command_id` / change identifier derived from the Pillar operation envelope.
   * Protects against duplicate command submission where Canton deduplication applies.

Canton command deduplication is based on the change identifier and deduplication period, but its guarantee depends on the submitted command being known to the same Participant Node. Pillar therefore treats DB idempotency as the primary external guarantee and Canton dedup as a second internal safeguard. ([Digital Asset Documentation][2])

### Idempotent response behavior

| State                                         | Retry response                          |
| --------------------------------------------- | --------------------------------------- |
| Original request still processing             | Same intent object, `status=processing` |
| Original request succeeded                    | Same success response                   |
| Original request failed after execution began | Same failure response                   |
| Validation failed before execution began      | Not persisted; retry allowed            |
| Same key, different body                      | `400 idempotency_error`                 |
| Same key, different API version               | `400 idempotency_error`                 |

## 4. Pagination

### Request

```http
GET /v1/holdings?limit=25
GET /v1/holdings?starting_after=hldg_01JY...
GET /v1/holdings?ending_before=hldg_01JY...
```

### Parameters

| Parameter        | Type              | Rule                              |
| ---------------- | ----------------- | --------------------------------- |
| `limit`          | integer           | Default `10`, min `1`, max `100`  |
| `starting_after` | object ID         | Return objects after this cursor  |
| `ending_before`  | object ID         | Return objects before this cursor |
| `created[gte]`   | RFC3339 timestamp | Optional filter                   |
| `created[lte]`   | RFC3339 timestamp | Optional filter                   |

### Ordering

Default list order:

```text
created desc, id desc
```

This is deterministic and stable even when multiple records have the same timestamp.

### List response format

```json
{
  "object": "list",
  "url": "/v1/holdings",
  "has_more": false,
  "data": [
    {
      "id": "hldg_01JY7Z8E2A9QJ7K3E5S9R4T2K1",
      "object": "holding",
      "livemode": false,
      "created": "2026-05-26T03:15:12.483Z"
    }
  ]
}
```

Stripe’s list endpoints use cursor pagination with `limit`, `starting_after`, `ending_before`, and return `object: "list"`, `data`, `has_more`, and `url`. Pillar adopts this exactly for developer familiarity. ([Stripe Docs][5])

## 5. Expand

### Request

```http
GET /v1/transfer_intents/trint_01JY...?expand[]=asset&expand[]=latest_operation
GET /v1/holdings?expand[]=data.asset&expand[]=data.account
```

### Standard

* Query parameter: `expand[]`.
* Dot notation allowed.
* Max depth: 4.
* List endpoint expansion starts with `data.`.
* Only documented fields are expandable.
* Expansion must not expose raw Canton contract IDs, Daml templates, or participant internals.
* Expanding ledger trace requires privileged scope.

Example:

```json
{
  "id": "trint_01JY...",
  "object": "transfer_intent",
  "asset": {
    "id": "asset_01JY...",
    "object": "asset",
    "symbol": "USD.PILLAR"
  },
  "latest_operation": {
    "id": "op_01JY...",
    "object": "ledger_operation",
    "status": "committed"
  }
}
```

Stripe supports `expand` on API requests, recursive dot notation, list expansion via `data`, and max depth 4. Pillar mirrors this grammar but applies Canton safety filtering. ([Stripe Docs][6])

## 6. Metadata

### Standard

```json
{
  "metadata": {
    "customer_ref": "cus-internal-4812",
    "invoice_ref": "inv-2026-051"
  }
}
```

Rules:

* Type: object of string keys to string values.
* Max keys: 50.
* Max key length: 40.
* Max value length: 500.
* Key names cannot contain `[` or `]`.
* Empty string unsets a value.
* `metadata` is for client-side correlation only.
* Do not store PII, secrets, private keys, compliance-sensitive personal data, or regulated data.
* Metadata does **not** affect authorization, ledger command semantics, settlement, or compliance rules.
* If a client wants data to become ledger-relevant, it must use a typed field such as `reference`, `memo`, `purpose_code`, or `compliance_context`.

Stripe uses metadata for key-value correlation and warns not to store sensitive information. Pillar adopts the same limits, but makes the ledger boundary stricter: metadata is projection/config/audit data unless explicitly modeled as a typed ledger field. ([Stripe Docs][7])

## 7. Standard Error Object

### Shape

```json
{
  "error": {
    "type": "ledger_error",
    "code": "insufficient_holding",
    "message": "The source account does not have enough available holding for this asset.",
    "param": "amount.value",
    "request_id": "req_01JY7Z7PK5F6WQ9H8A1M4N2P3Q",
    "doc_url": "https://docs.pillar.example/errors/insufficient_holding",
    "operation": {
      "id": "op_01JY7Z8E2A9QJ7K3E5S9R4T2K1",
      "object": "ledger_operation",
      "status": "failed"
    }
  }
}
```

### Error types

| Type                    | Meaning                                                 |
| ----------------------- | ------------------------------------------------------- |
| `invalid_request_error` | Bad parameter, malformed request, unsupported expansion |
| `authentication_error`  | Missing or invalid API key                              |
| `permission_error`      | Key is valid but lacks scope                            |
| `not_found_error`       | Object absent or not visible                            |
| `idempotency_error`     | Key conflict or invalid reuse                           |
| `rate_limit_error`      | Request exceeded quota                                  |
| `version_error`         | Unsupported or incompatible API version                 |
| `ledger_error`          | Canton command rejected or business invariant failed    |
| `projection_error`      | Projection unavailable, stale, or inconsistent          |
| `webhook_error`         | Webhook endpoint configuration or delivery issue        |
| `api_error`             | Internal Pillar service error                           |

### Error codes

Examples:

```text
invalid_parameter
missing_required_parameter
unsupported_expand
metadata_too_large
idempotency_key_reused
insufficient_holding
asset_not_transferable
intent_already_confirmed
ledger_command_rejected
ledger_completion_timeout
projection_lag_exceeded
rate_limit_exceeded
api_key_expired
api_version_unsupported
webhook_signature_verification_failed
```

Stripe uses standard HTTP status codes and a structured error object with fields such as `code`, `doc_url`, `message`, and `param`. Pillar adopts this shape and adds safe operation trace fields for ledger-backed workflows. ([Stripe Docs][8])

## 8. Request ID

### Header

```http
Pillar-Request-Id: req_01JY7Z7PK5F6WQ9H8A1M4N2P3Q
```

### Rules

* Every API response has `Pillar-Request-Id`.
* Error body repeats `request_id`.
* Webhook `event.request.id` references the originating API request when applicable.
* Internal trace maps:

```text
req_* → intent_* → op_* → workflow_id / command_id / update_id / offset
```

* Clients may provide:

```http
Pillar-Client-Request-Id: client-generated-id
```

Stripe exposes a request identifier in the `Request-Id` response header and recommends using it for debugging/support. Pillar uses the same support/debugging pattern and extends it into ledger audit. ([Stripe Docs][16])

## 9. Rate Limit Headers

### Response headers

```http
Pillar-RateLimit-Limit: 100
Pillar-RateLimit-Remaining: 83
Pillar-RateLimit-Reset: 2026-05-26T04:01:00.000Z
```

### 429 response headers

```http
HTTP/1.1 429 Too Many Requests
Pillar-Rate-Limited-Reason: endpoint-rate
Retry-After: 2
```

### Reason values

| Reason                           | Meaning                                       |
| -------------------------------- | --------------------------------------------- |
| `global-rate`                    | Account-level request rate exceeded           |
| `global-concurrency`             | Account-level concurrent request cap exceeded |
| `endpoint-rate`                  | Endpoint-specific request rate exceeded       |
| `endpoint-concurrency`           | Endpoint-specific concurrency cap exceeded    |
| `resource-specific`              | Object-specific limiter exceeded              |
| `ledger-participant-concurrency` | Internal participant command pressure         |
| `webhook-delivery-rate`          | Webhook delivery limiter                      |

Stripe returns HTTP 429 for rate limits and uses a reason header such as `global-rate`, `endpoint-rate`, and `resource-specific`. Pillar adopts that taxonomy and adds a Canton-specific participant pressure reason. ([Stripe Docs][17])

## 10. API Key Format

Pillar keys must be Stripe-like but namespace-safe.

| Key type         | Format                | Use                                          |
| ---------------- | --------------------- | -------------------------------------------- |
| Publishable test | `plr_pk_test_<token>` | Client-side non-mutating setup where allowed |
| Publishable live | `plr_pk_live_<token>` | Client-side live mode, restricted            |
| Secret test      | `plr_sk_test_<token>` | Server-side test API                         |
| Secret live      | `plr_sk_live_<token>` | Server-side live API                         |
| Restricted test  | `plr_rk_test_<token>` | Scoped test key                              |
| Restricted live  | `plr_rk_live_<token>` | Scoped live key                              |
| Webhook secret   | `plr_whsec_<token>`   | Webhook signature verification               |
| CLI session      | `plr_cli_<token>`     | Short-lived CLI auth                         |

Rules:

* API key determines `livemode`.
* Test keys can never access live ledger state.
* Live keys can never access sandbox fixtures.
* Secret keys must only be used server-side.
* Restricted keys support scopes:

  * `holdings:read`
  * `balances:read`
  * `intents:create`
  * `intents:confirm`
  * `webhooks:write`
  * `api_keys:read`
* Store only hash + prefix + last4.
* Require HTTPS.
* Accept Bearer auth:

```http
Authorization: Bearer plr_sk_test_...
```

* Optionally accept HTTP Basic for Stripe-compatible tooling:

```text
username = API key
password = empty
```

Stripe uses prefixed keys such as test/live secret keys and supports Bearer or Basic authentication patterns. Pillar follows the same operational ergonomics but uses `plr_` prefixes to avoid ambiguity with Stripe credentials. ([Stripe Docs][9])

## 11. Timestamp Format

Pillar uses **RFC3339 UTC with millisecond precision** for all public JSON timestamps.

```json
{
  "created": "2026-05-26T03:15:12.483Z",
  "updated": "2026-05-26T03:17:01.904Z",
  "expires_at": "2026-05-26T04:15:12.483Z"
}
```

Rules:

* Always UTC.
* Always `Z`.
* Millisecond precision.
* No local timezone offsets in public API.
* No floating-point timestamps.
* DB type: `timestamptz`.
* Ledger-derived timestamps map to projection fields such as:

  * `ledger_recorded_at`
  * `projected_at`
  * `created`
  * `updated`

Stripe v1 commonly uses Unix epoch seconds for many object `created` fields, while Stripe API v2 documentation uses RFC3339 timestamps for some v2 resources. Pillar chooses RFC3339 from day one because ledger reconciliation and audit review are clearer with explicit UTC timestamps. ([Stripe Docs][18])

## 12. Object Naming Convention

### JSON field names

```text
snake_case
```

Examples:

```json
{
  "available_balance": "100.000000",
  "ledger_trace_id": "ltr_01JY...",
  "created": "2026-05-26T03:15:12.483Z"
}
```

### Object type values

```text
lower_snake_case singular
```

Examples:

```text
account
asset
holding
balance
transfer_intent
ledger_operation
event
webhook_endpoint
```

### ID prefixes

| Object            | Prefix   | Example         |
| ----------------- | -------- | --------------- |
| Account           | `acct_`  | `acct_01JY...`  |
| Asset             | `asset_` | `asset_01JY...` |
| Holding           | `hldg_`  | `hldg_01JY...`  |
| Balance           | `bal_`   | `bal_01JY...`   |
| Transfer intent   | `trint_` | `trint_01JY...` |
| Issuance intent   | `isint_` | `isint_01JY...` |
| Redemption intent | `rdint_` | `rdint_01JY...` |
| Settlement intent | `stint_` | `stint_01JY...` |
| Ledger operation  | `op_`    | `op_01JY...`    |
| Ledger trace      | `ltr_`   | `ltr_01JY...`   |
| Event             | `evt_`   | `evt_01JY...`   |
| Webhook endpoint  | `we_`    | `we_01JY...`    |
| Request           | `req_`   | `req_01JY...`   |
| API key           | `key_`   | `key_01JY...`   |

### Amount / quantity fields

Never use JSON number for asset quantities.

```json
{
  "amount": {
    "value": "100.000000",
    "asset": "asset_01JY...",
    "scale": 6
  }
}
```

Rules:

* Decimal values are strings.
* Asset defines scale.
* API rejects excessive precision.
* Rounding is explicit, never implicit.
* Internal Daml representation must be deterministic and scale-safe.

## 13. Livemode / Testmode

Every object includes:

```json
{
  "livemode": false
}
```

Rules:

* API key determines mode.
* Object IDs are globally unique but mode-scoped for access.
* Test and live ledgers are physically/logically isolated.
* Webhook endpoints are mode-specific.
* Events are mode-specific.
* Workbench defaults to testmode.
* CLI can switch mode explicitly.
* Testmode may support fixtures, simulated failures, and deterministic sandbox resets.
* Public API shape is identical in both modes.

Stripe documentation states that the API key determines whether a request is live or sandbox/test. Pillar preserves that model, but behind the scenes maps testmode to sandbox Canton topologies and livemode to production Canton participants. ([Stripe Docs][1])

---

## Core Public Objects

### Account

```json
{
  "id": "acct_01JY...",
  "object": "account",
  "livemode": false,
  "display_name": "Treasury Account",
  "status": "active",
  "metadata": {},
  "created": "2026-05-26T03:00:00.000Z"
}
```

### Asset

```json
{
  "id": "asset_01JY...",
  "object": "asset",
  "livemode": false,
  "symbol": "USD.PILLAR",
  "name": "Pillar Test USD",
  "scale": 6,
  "status": "active",
  "transferable": true,
  "metadata": {},
  "created": "2026-05-26T03:00:00.000Z"
}
```

### Holding

```json
{
  "id": "hldg_01JY...",
  "object": "holding",
  "livemode": false,
  "account": "acct_01JY...",
  "asset": "asset_01JY...",
  "available": "1000.000000",
  "reserved": "25.000000",
  "pending": "10.000000",
  "total": "1035.000000",
  "projection": {
    "watermark": "pwm_01JY...",
    "ledger_trace_id": "ltr_01JY...",
    "projected_at": "2026-05-26T03:15:12.483Z"
  },
  "metadata": {},
  "created": "2026-05-26T03:00:00.000Z"
}
```

### Balance

`balance` is an aggregate view. `holding` is account-asset-specific.

```json
{
  "id": "bal_01JY...",
  "object": "balance",
  "livemode": false,
  "account": "acct_01JY...",
  "available": [
    {
      "asset": "asset_01JY...",
      "value": "1000.000000"
    }
  ],
  "pending": [],
  "reserved": [],
  "projection": {
    "watermark": "pwm_01JY...",
    "projected_at": "2026-05-26T03:15:12.483Z"
  },
  "created": "2026-05-26T03:00:00.000Z"
}
```

### Transfer Intent

```json
{
  "id": "trint_01JY...",
  "object": "transfer_intent",
  "livemode": false,
  "status": "processing",
  "source": {
    "account": "acct_01JY..."
  },
  "destination": {
    "account": "acct_01JY..."
  },
  "amount": {
    "asset": "asset_01JY...",
    "value": "25.000000",
    "scale": 6
  },
  "reference": "client-transfer-4812",
  "latest_operation": "op_01JY...",
  "metadata": {},
  "created": "2026-05-26T03:15:12.483Z",
  "updated": "2026-05-26T03:15:12.483Z"
}
```

### Ledger Operation

Public object, Canton-safe:

```json
{
  "id": "op_01JY...",
  "object": "ledger_operation",
  "livemode": false,
  "intent": "trint_01JY...",
  "status": "committed",
  "ledger_trace_id": "ltr_01JY...",
  "request": "req_01JY...",
  "created": "2026-05-26T03:15:12.483Z",
  "updated": "2026-05-26T03:15:14.112Z"
}
```

Admin-only expanded form:

```json
{
  "id": "op_01JY...",
  "object": "ledger_operation",
  "ledger_trace_id": "ltr_01JY...",
  "status": "committed",
  "workflow_id": "wf_opaque_...",
  "command_id": "cmd_opaque_...",
  "update_id": "upd_opaque_...",
  "offset": "off_opaque_..."
}
```

No raw contract IDs.

---

## Webhook Event Model

Stripe webhook endpoints receive JSON Event objects over HTTPS, and Stripe recommends quickly returning a 2xx response before doing complex work. It also signs webhook payloads with a signature header and endpoint secret. Pillar adopts this exact delivery model with Pillar-specific signatures and event types. ([Stripe Docs][10])

### Event shape

```json
{
  "id": "evt_01JY...",
  "object": "event",
  "livemode": false,
  "type": "transfer_intent.succeeded",
  "api_version": "2026-06-30.cedar",
  "created": "2026-05-26T03:15:14.112Z",
  "data": {
    "object": {
      "id": "trint_01JY...",
      "object": "transfer_intent",
      "status": "succeeded"
    },
    "previous_attributes": {
      "status": "processing"
    }
  },
  "request": {
    "id": "req_01JY...",
    "idempotency_key": "7e1e1f54-6e3a-4a3a-9a40-8e3a1d9b8e2e"
  },
  "ledger_trace_id": "ltr_01JY..."
}
```

### Webhook signature

```http
Pillar-Signature: t=1779765314,v1=<hmac_sha256>
```

Verification:

```text
signed_payload = timestamp + "." + raw_body
expected = HMAC_SHA256(endpoint_secret, signed_payload)
```

Rules:

* Use raw request body.
* Reject old timestamp beyond tolerance.
* Default tolerance: 5 minutes.
* Endpoint secret prefix: `plr_whsec_`.
* Delivery is at-least-once.
* Event order is not globally guaranteed.
* Consumers must deduplicate by `event.id`.
* Retry uses exponential backoff.
* Webhook endpoint API version pins event object shape.

### Event types

```text
transfer_intent.created
transfer_intent.processing
transfer_intent.succeeded
transfer_intent.failed
issuance_intent.succeeded
redemption_intent.succeeded
holding.updated
balance.updated
ledger_operation.committed
ledger_operation.failed
webhook_endpoint.created
```

---

## Stripe API와 비교표

Stripe column은 공식 Stripe 문서의 REST API, versioning, idempotency, pagination, expand, metadata, errors, request id, rate limits, API keys, webhooks, CLI/Workbench/SDK 문서를 기준으로 요약했다. ([Stripe Docs][1])

| Area                 | Stripe                                                              | Pillar Standard                               |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| API style            | REST, resource URLs, JSON responses                                 | Same                                          |
| Source of truth      | Stripe internal platform state                                      | Canton Ledger                                 |
| External abstraction | Payments/subscriptions/accounts                                     | Canton-backed assets, but Canton-invisible    |
| Versioning           | Account default + request override + webhook endpoint version       | Same with `Pillar-Version`                    |
| Idempotency          | `Idempotency-Key` for POST                                          | Same, plus Canton command dedup correlation   |
| Pagination           | `limit`, `starting_after`, `ending_before`                          | Same                                          |
| List response        | `object=list`, `data`, `has_more`, `url`                            | Same                                          |
| Expand               | `expand[]`, dot notation, max depth 4                               | Same, except no raw Canton internals          |
| Metadata             | 50 keys, string values, sensitive data discouraged                  | Same, and not ledger-semantic unless typed    |
| Errors               | Standard HTTP + structured error object                             | Same, plus `ledger_error`, `projection_error` |
| Request ID           | `Request-Id` header                                                 | `Pillar-Request-Id` header                    |
| Rate limit           | 429 + reason header                                                 | Same taxonomy, plus ledger pressure reason    |
| API keys             | `sk_test_`, `sk_live_`, restricted keys                             | `plr_sk_test_`, `plr_sk_live_`, `plr_rk_*`    |
| Live/test            | Key determines mode                                                 | Same; mode maps to live Canton vs sandbox     |
| Timestamp            | Stripe v1 often Unix seconds; v2 docs use RFC3339 in some resources | RFC3339 UTC milliseconds from day one         |
| Async                | Webhook-first for many workflows                                    | Webhook-first for ledger finality             |
| CLI                  | Stripe CLI for API/webhook testing                                  | Pillar CLI for API, sandbox, webhook replay   |
| Workbench            | Logs, events, API versions, Shell, webhook destinations             | Pillar Workbench with request→ledger trace    |
| SDK                  | Official SDKs pin API behavior                                      | Generated SDKs pinned to Pillar API version   |
| OpenAPI              | Stripe publishes OpenAPI spec                                       | Pillar publishes OpenAPI 3.1 public spec      |
| Internal runtime     | Stripe proprietary                                                  | Canton-native command/update/completion       |

---

# Internal Runtime

## Command Envelope

Every ledger mutation creates a command envelope.

```json
{
  "operation_id": "op_01JY...",
  "ledger_trace_id": "ltr_01JY...",
  "request_id": "req_01JY...",
  "idempotency_key_hash": "idem_hash_...",
  "intent_id": "trint_01JY...",
  "api_version": "2026-06-30.cedar",
  "livemode": false,
  "account_id": "acct_01JY...",
  "command_id": "cmd_opaque_...",
  "workflow_id": "wf_opaque_...",
  "submission_id": "sub_opaque_...",
  "act_as": ["party_opaque_internal"],
  "read_as": [],
  "deduplication_period": "PT24H",
  "command_hash": "sha256:...",
  "created": "2026-05-26T03:15:12.483Z"
}
```

Canton Ledger API exposes app-specific IDs including command ID, submission ID, and workflow ID, and update stream entries can contain workflow ID, command ID, events, and update ID. Pillar uses those fields for traceability, while keeping public API identifiers opaque. ([Digital Asset Documentation][2])

## Mutation Flow

```text
1. Receive POST /v1/transfer_intents
2. Authenticate API key and resolve livemode
3. Resolve API behavior version
4. Validate request body and expansion
5. Acquire idempotency lock
6. Create intent object with status=processing
7. Create ledger_operation row
8. Build Canton command envelope
9. Submit command via Ledger API
10. Return intent object
11. Consume completion/update stream
12. Update projection tables
13. Emit event into webhook outbox
14. Deliver signed webhook
```

## Intent Status Lifecycle

```text
requires_confirmation
    |
    v
processing
    |
    +--> succeeded
    |
    +--> failed
    |
    +--> canceled
```

Extended statuses:

| Status                  | Meaning                                        |
| ----------------------- | ---------------------------------------------- |
| `requires_confirmation` | Intent created but not submitted               |
| `requires_action`       | Client, approver, or compliance action needed  |
| `processing`            | Ledger command submitted or pending completion |
| `succeeded`             | Ledger update observed and projection updated  |
| `failed`                | Command rejected or business rule failed       |
| `canceled`              | Canceled before final ledger commitment        |

## Projection Consistency

Read endpoints default to projection state.

Optional query:

```http
GET /v1/holdings?horizon=latest
GET /v1/holdings?consistency=read_your_writes
```

Modes:

| Mode               | Behavior                                                     |
| ------------------ | ------------------------------------------------------------ |
| `eventual`         | Return current projection immediately                        |
| `read_your_writes` | Wait until projection has observed caller’s latest operation |
| `strict`           | Wait up to timeout for projection watermark target           |
| `ledger_only`      | Internal/admin only; not public default                      |

Projection responses include:

```json
{
  "projection": {
    "watermark": "pwm_01JY...",
    "projected_at": "2026-05-26T03:15:12.483Z",
    "lag_ms": 183
  }
}
```

Canton/PQS-style projection systems read ledger API streams and materialize PostgreSQL state; Pillar follows that model but treats all projection tables as rebuildable, not authoritative. ([Digital Asset Documentation][13])

## Sandbox / SDK / CLI / Workbench

### Pillar Sandbox

Built on Canton/Daml sandbox tooling.

Capabilities:

* Local Canton sandbox.
* Local Pillar API gateway.
* Local projection DB.
* Local webhook relay.
* Test API keys.
* Deterministic fixtures.
* Failure simulation:

  * command rejection
  * projection lag
  * webhook retry
  * rate limit
  * idempotency conflict

Daml tooling supports sandbox execution, build/test/codegen workflows, and Canton run modes for development. Pillar Sandbox composes those tools into a Stripe-like developer environment. ([Digital Asset Documentation][12])

### Pillar CLI

Commands:

```bash
pillar login
pillar listen --forward-to localhost:3000/webhooks
pillar trigger transfer_intent.succeeded
pillar fixtures create account
pillar fixtures create asset
pillar api get /v1/holdings
pillar sandbox start
pillar sandbox reset
pillar logs tail --request req_...
pillar traces show ltr_...
```

Stripe CLI supports API calls, webhook testing, local listening, and sandbox resource management. Pillar CLI should match that expectation for Canton-backed assets. ([Stripe Docs][19])

### Pillar Workbench

Features:

* API request logs.
* Request ID search.
* Event log.
* Webhook delivery log.
* API version management.
* API Explorer.
* CLI shell.
* Ledger trace viewer.
* Projection lag dashboard.
* Sandbox fixture manager.
* Upgrade assistant.

Stripe Workbench provides logs, event destination management, API version tooling, shell/API explorer, and integration debugging. Pillar Workbench must add ledger trace and projection health on top. ([Stripe Docs][20])

---

# DB Schema

Pillar DB is not the business-state source of truth. It stores projection, audit, config, idempotency, and delivery state.

## Core Tables

| Table                     | Type                    | Purpose                                  |                              Rebuildable? |
| ------------------------- | ----------------------- | ---------------------------------------- | ----------------------------------------: |
| `api_accounts`            | Config                  | Tenant/platform account                  |                                        No |
| `api_keys`                | Config                  | Hashed API keys, scopes, mode            |                                        No |
| `api_versions`            | Config                  | Account default version, upgrade state   |                                        No |
| `webhook_endpoints`       | Config                  | URL, secret hash, event filters, version |                                        No |
| `idempotency_keys`        | Control                 | Request fingerprint and cached response  |                                 Partially |
| `api_requests`            | Audit                   | Request/response audit                   |                                        No |
| `intents`                 | Audit/projection hybrid | Public intent lifecycle                  | Rebuild status from ledger where possible |
| `ledger_operations`       | Audit                   | Command/workflow/update correlation      |                                        No |
| `assets_projection`       | Projection              | Ledger-derived asset view                |                                       Yes |
| `holdings_projection`     | Projection              | Ledger-derived account-asset holdings    |                                       Yes |
| `balances_projection`     | Projection              | Ledger-derived aggregate balances        |                                       Yes |
| `events`                  | Audit/outbox            | Public event objects                     |                  Rebuildable with caveats |
| `webhook_deliveries`      | Audit                   | Delivery attempts                        |                                        No |
| `projection_watermarks`   | Control                 | Stream offsets and lag                   |                                       Yes |
| `projection_rebuild_jobs` | Ops                     | Rebuild status                           |                                        No |
| `rate_limit_counters`     | Control                 | Token bucket/concurrency state           |                                 Ephemeral |

## Selected Schema

### `idempotency_keys`

```sql
create table idempotency_keys (
  account_id text not null,
  livemode boolean not null,
  method text not null,
  path text not null,
  idempotency_key_hash text not null,
  request_fingerprint text not null,
  api_version text not null,
  request_id text not null,
  operation_id text,
  status text not null,
  response_status integer,
  response_body jsonb,
  locked_until timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (
    account_id,
    livemode,
    method,
    path,
    idempotency_key_hash
  )
);
```

### `ledger_operations`

```sql
create table ledger_operations (
  id text primary key,
  ledger_trace_id text not null unique,
  livemode boolean not null,
  account_id text not null,
  intent_id text,
  request_id text not null,
  api_version text not null,
  workflow_id text,
  command_id text,
  submission_id text,
  update_id text,
  participant_id text,
  synchronizer_id text,
  submitting_party_hash text,
  command_hash text not null,
  status text not null,
  completion_code text,
  completion_message text,
  ledger_offset text,
  ledger_recorded_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

### `holdings_projection`

```sql
create table holdings_projection (
  id text primary key,
  livemode boolean not null,
  account_id text not null,
  asset_id text not null,
  partition_key text not null default 'default',
  available numeric(38, 18) not null,
  reserved numeric(38, 18) not null,
  pending numeric(38, 18) not null,
  total numeric(38, 18) not null,
  scale integer not null,
  ledger_trace_id text,
  projection_watermark text not null,
  ledger_recorded_at timestamptz,
  projected_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (livemode, account_id, asset_id, partition_key)
);
```

### `events`

```sql
create table events (
  id text primary key,
  livemode boolean not null,
  account_id text not null,
  type text not null,
  api_version text not null,
  object_id text not null,
  request_id text,
  ledger_trace_id text,
  payload jsonb not null,
  created_at timestamptz not null
);
```

### `webhook_deliveries`

```sql
create table webhook_deliveries (
  id text primary key,
  event_id text not null references events(id),
  webhook_endpoint_id text not null,
  attempt integer not null,
  status text not null,
  response_status integer,
  response_body_sample text,
  delivered_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz not null
);
```

## DB Invariants

* Projection rows must reference a projection watermark.
* Projection rows must be rebuildable from ledger updates.
* API audit rows are immutable append-only.
* Ledger operation rows are immutable except status/projection correlation fields.
* API key secrets are never stored raw.
* Webhook secrets are never stored raw.
* Metadata is JSONB but validated to public metadata limits.
* No table may become the canonical source for holdings or balances.

---

# Failure Modes

## 1. Client retries after timeout

**Scenario:** Client sends `POST /v1/transfer_intents`, API submits Canton command, client times out.

**Handling:**

* Retry with same `Idempotency-Key`.
* Pillar returns same `transfer_intent`.
* If ledger update later commits, webhook emits `transfer_intent.succeeded`.
* No duplicate command is created.

## 2. Same idempotency key, different request body

**Response:**

```http
400 Bad Request
```

```json
{
  "error": {
    "type": "idempotency_error",
    "code": "idempotency_key_reused",
    "message": "This idempotency key was already used with different request parameters.",
    "request_id": "req_01JY..."
  }
}
```

## 3. Canton command accepted, later rejected

Because command submission does not equal ledger execution completion, Pillar must treat submission as `processing` until completion/update confirms result. ([Digital Asset Documentation][2])

**Handling:**

* Intent status becomes `failed`.
* Ledger operation status becomes `failed`.
* Error is recorded.
* Webhook emits `transfer_intent.failed`.
* Holding/balance projection is not mutated unless ledger update supports it.

## 4. Participant failover / duplicate command risk

**Risk:** Canton command deduplication may depend on participant-node visibility.

**Handling:**

* Pillar DB idempotency is primary.
* Account/party has participant affinity.
* Failover requires command recovery protocol.
* Operation state machine prevents second submission unless recovery lock expires and command status is proven absent.

## 5. Projection lag

**Symptom:** Ledger committed, but `GET /v1/holdings` does not yet show updated balance.

**Handling:**

* Return projection watermark.
* Expose `lag_ms`.
* `consistency=read_your_writes` waits for caller’s latest operation.
* If lag exceeds threshold, return `projection_error` or degraded response depending endpoint.

## 6. Webhook duplicate delivery

**Handling:**

* Delivery is at-least-once.
* Client must dedupe by `event.id`.
* Signature verifies raw body.
* Retries continue until configured TTL.
* Workbench shows delivery attempts.

## 7. Webhook out-of-order events

**Handling:**

* Events include `created`, `request`, `ledger_trace_id`, object `status`.
* Client should retrieve canonical object after receiving event.
* Pillar does not guarantee global event ordering across endpoints.

## 8. Rate limit exceeded

**Response:**

```http
429 Too Many Requests
Pillar-Rate-Limited-Reason: ledger-participant-concurrency
Retry-After: 2
```

```json
{
  "error": {
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded",
    "message": "Too many concurrent ledger operations for this account.",
    "request_id": "req_01JY..."
  }
}
```

## 9. Metadata policy violation

**Handling:**

* Reject request before idempotency result is persisted.
* Return `invalid_request_error`.
* No ledger command submitted.

## 10. API version unsupported

**Handling:**

* Return `version_error`.
* Include supported range.
* Workbench upgrade assistant shows diffs.

## 11. Projection rebuild / reset

Canton/PQS documentation includes operational patterns for pruning, reset-to-offset, and redaction, and notes that some reset operations are destructive and require coordination. Pillar must treat projection rebuilds as controlled operations with clear watermarks and audit records. ([Digital Asset Documentation][21])

**Handling:**

* Stop projection-dependent writes if consistency cannot be guaranteed.
* Rebuild from ledger stream or approved checkpoint.
* Record rebuild job.
* Do not mutate ledger.
* Resume when watermark is healthy.

---

# Security / Compliance

## API Security

* HTTPS only.
* HSTS.
* TLS 1.2+ minimum; TLS 1.3 preferred.
* API keys hashed at rest.
* Key last4 visible only for identification.
* Restricted keys by scope.
* Key rotation API.
* Expiring keys.
* Optional IP allowlist.
* Optional enterprise mTLS.
* Separate test/live keyspaces.
* No API key in query string.
* No secrets in metadata.

## Canton Security Boundary

* External API keys do not map directly to Ledger API JWTs.
* Pillar service identity obtains internal Ledger API credentials.
* API account authorization maps to internal Canton users/parties.
* Public response hides party IDs unless explicitly part of a safe business object.
* Daml party allocation remains internal. Canton docs distinguish parties, users, and party allocation details; Pillar abstracts those from public API. ([Digital Asset Documentation][22])

## Webhook Security

* HMAC SHA-256 signatures.
* Timestamp tolerance.
* Raw body verification.
* Endpoint secret rotation.
* Replay protection.
* Delivery logs.
* Endpoint-level API version pinning.
* Separate test/live webhook endpoints.

## Compliance Design

| Concern           | Pillar control                                                            |
| ----------------- | ------------------------------------------------------------------------- |
| Auditability      | `request_id → operation_id → ledger_trace_id → command/update`            |
| Data minimization | No PII in metadata; typed compliance fields only                          |
| Immutability      | Ledger is source of truth; audit append-only                              |
| Deletion          | Projection redaction where allowed; ledger data governed by ledger policy |
| Segregation       | Test/live isolation                                                       |
| Access control    | API scopes + internal party mapping                                       |
| Evidence          | Workbench logs, request logs, webhook delivery logs, ledger trace export  |
| Reconciliation    | Projection watermark and ledger operation table                           |

---

# OpenAPI 설계 원칙

OpenAPI 공식 사양은 HTTP API를 language-agnostic하게 기술하여 humans와 computers가 source code나 network inspection 없이 API를 이해하도록 하는 표준이다. Operation ID는 unique해야 하며 tooling에서 method generation 등에 쓰인다. Pillar Public API는 OpenAPI를 단순 문서가 아니라 SDK, mock server, contract test, CLI, Workbench API Explorer의 원천으로 사용한다. ([Swagger][14])

## Standard

* Spec version: **OpenAPI 3.1**.
* Public spec and internal admin spec are separate.
* No Daml template or Canton contract schema in public spec.
* All endpoint responses include documented headers.
* Every operation has deterministic `operationId`.

Examples:

```yaml
operationId: transfer_intents_create
operationId: transfer_intents_confirm
operationId: holdings_list
operationId: webhook_endpoints_create
```

## Components

Required shared schemas:

```yaml
components:
  schemas:
    PillarError:
    Metadata:
    Timestamp:
    ListResponse:
    Asset:
    Account:
    Holding:
    Balance:
    TransferIntent:
    LedgerOperation:
    Event:
  headers:
    PillarRequestId:
    PillarVersion:
    PillarMode:
    PillarRateLimitLimit:
    PillarRateLimitRemaining:
    PillarRateLimitReset:
  securitySchemes:
    BearerAuth:
    BasicAuth:
```

OpenAPI security requirement names must correspond to security schemes in components. Pillar should keep auth definitions centralized and generate both docs and SDK auth middleware from the same schema. ([GitHub][23])

## Schema rules

* Use `snake_case`.
* Use `type: string`, `format: date-time` for timestamps.
* Use `type: string` for decimal quantities.
* Avoid `number` for asset amount.
* Document expandable fields with `x-pillar-expandable`.
* Document id prefixes with regex.
* Define error codes as versioned registry.
* Avoid excessive `oneOf` where SDK generators produce poor output.
* Every endpoint must have:

  * success example
  * error example
  * idempotency behavior
  * rate-limit headers
  * request ID header
  * webhook side effects, if any

## Contract gates

No API endpoint ships unless:

* OpenAPI spec exists.
* Generated SDK compiles.
* Mock server validates request/response.
* Golden examples pass.
* Backward compatibility diff passes.
* Error object test passes.
* Webhook event schema test passes.
* Workbench API Explorer can execute it.
* CLI command maps to it where applicable.

---

# Implementation Plan

## Phase 0 — Standards freeze

Deliverables:

* API grammar RFC.
* Object naming registry.
* Error code registry.
* ID prefix registry.
* Versioning policy.
* Metadata policy.
* Rate limit policy.
* Webhook signature spec.
* OpenAPI lint rules.

Exit criteria:

* All teams use one canonical API grammar document.
* No endpoint can define custom pagination, error, timestamp, or metadata behavior.

## Phase 1 — OpenAPI and SDK foundation

Deliverables:

* OpenAPI 3.1 public spec.
* Generated TypeScript SDK.
* Generated Python SDK.
* Generated Go SDK.
* Mock server.
* API examples.
* Contract test harness.

Exit criteria:

* SDKs can create/list/retrieve core objects against mock server.
* Backward compatibility diff runs in CI.

## Phase 2 — API Gateway

Deliverables:

* API key authentication.
* API key hashing and rotation.
* `livemode` resolution.
* `Pillar-Version` resolver.
* `Pillar-Request-Id`.
* Idempotency middleware.
* Rate limiter.
* Standard error middleware.

Exit criteria:

* Stripe-like grammar works before Canton integration.
* All failure modes return standard error object.

## Phase 3 — Canton Adapter

Deliverables:

* Command envelope.
* Ledger operation audit table.
* Command submission integration.
* Completion stream consumer.
* Update stream consumer.
* Workflow/command/update correlation.
* Participant affinity policy.

Exit criteria:

* `transfer_intent` can submit a Canton command and reconcile completion.
* Duplicate request does not create duplicate ledger effect.

## Phase 4 — Projection Engine

Deliverables:

* Asset projection.
* Holding projection.
* Balance projection.
* Projection watermark.
* Rebuild job.
* Lag metrics.
* `consistency=read_your_writes`.

Exit criteria:

* Ledger-derived projection can be rebuilt from zero.
* Holding/balance APIs never depend on non-ledger canonical state.

## Phase 5 — Webhook System

Deliverables:

* Event object schema.
* Webhook endpoint API.
* HMAC signature.
* Delivery outbox.
* Retry scheduler.
* Delivery logs.
* CLI local forwarder.

Exit criteria:

* `transfer_intent.succeeded` delivered at-least-once.
* Webhook consumer can verify signature.
* Workbench shows delivery attempts.

## Phase 6 — Pillar Sandbox / CLI / Workbench

Deliverables:

* `pillar sandbox start`.
* Local Canton sandbox integration.
* Fixture creation.
* Webhook local listener.
* API Explorer.
* Request logs.
* Event logs.
* Ledger trace viewer.
* Version upgrade assistant.

Exit criteria:

* Developer can build an integration locally without knowing Canton.
* Operator can trace `req_*` to ledger operation.

## Phase 7 — Hardening and compliance

Deliverables:

* Load tests.
* Rate limit tuning.
* Security review.
* Key rotation drills.
* Projection rebuild drills.
* Webhook replay drills.
* API version upgrade rehearsals.
* Audit export.
* SOC2 evidence mapping.

Exit criteria:

* Production readiness review passes.
* Public docs and SDKs are version-pinned.
* Operational runbooks exist.

---

# Open Questions

1. **Ledger trace visibility**

   * Should `ledger_trace_id` appear on all intent objects by default, or only via `expand[]=ledger_trace`?

2. **Idempotency retention**

   * Minimum should be 24h. Ledger-mutating default is proposed as 7 days. Do enterprise customers need 30 days?

3. **Projection consistency SLA**

   * What is the target p95/p99 projection lag for live mode?

4. **Asset precision**

   * Should scale be fixed per asset forever? Recommendation: yes, immutable after asset creation.

5. **Metadata and ledger**

   * Should any metadata ever be copied on-ledger? Recommendation: no; use typed `memo` / `reference` fields.

6. **Party abstraction**

   * Should public API ever expose a “ledger identity” object? Recommendation: only for admin/compliance APIs, never as a core developer primitive.

7. **Multi-participant routing**

   * Is participant affinity per account, per party, or per asset network? This affects command dedup and failover design.

8. **Webhook event ordering**

   * Should Pillar offer per-object sequence numbers? Recommendation: add `object_version` for high-integrity consumers.

9. **API version cadence**

   * Adopt Stripe-like monthly additive and semiannual major cadence, or slower enterprise cadence?

10. **Sandbox fidelity**

    * Should sandbox use exactly the same Daml packages as production, or allow fixture-only simplified packages? Recommendation: same packages with fixture choices.

---

# Agent-ready Checklist

## API grammar

* [ ] Define `/v1` base path.
* [ ] Define `Pillar-Version` header.
* [ ] Define `Pillar-Request-Id` response header.
* [ ] Define id prefix registry.
* [ ] Define object base schema: `id`, `object`, `livemode`, `created`, `metadata`.
* [ ] Define timestamp standard: RFC3339 UTC milliseconds.
* [ ] Define list response schema.
* [ ] Define pagination params.
* [ ] Define `expand[]` grammar and max depth.
* [ ] Define metadata limits.
* [ ] Define error object.
* [ ] Define rate limit headers.
* [ ] Define API key prefixes.
* [ ] Define webhook signature header.

## OpenAPI

* [ ] Create OpenAPI 3.1 repo.
* [ ] Add shared schemas.
* [ ] Add shared headers.
* [ ] Add security schemes.
* [ ] Add deterministic `operationId` convention.
* [ ] Add `x-pillar-expandable`.
* [ ] Add error examples.
* [ ] Add webhook event schemas.
* [ ] Add compatibility diff CI.
* [ ] Generate SDKs from spec.
* [ ] Generate mock server from spec.

## Gateway

* [ ] Implement API key auth.
* [ ] Implement key hashing.
* [ ] Implement scope checks.
* [ ] Implement livemode resolution.
* [ ] Implement version resolver.
* [ ] Implement request ID middleware.
* [ ] Implement standard error middleware.
* [ ] Implement idempotency middleware.
* [ ] Implement rate limiter.
* [ ] Implement audit logging.

## Canton runtime

* [ ] Define command envelope.
* [ ] Map `intent_id` to `workflow_id`.
* [ ] Map `operation_id` to `command_id`.
* [ ] Implement command submission.
* [ ] Implement completion consumer.
* [ ] Implement update consumer.
* [ ] Implement participant affinity.
* [ ] Implement command recovery logic.
* [ ] Persist ledger operation audit.
* [ ] Hide raw contract IDs from public API.

## Projection

* [ ] Build asset projection.
* [ ] Build holding projection.
* [ ] Build balance projection.
* [ ] Track projection watermark.
* [ ] Track projection lag.
* [ ] Implement rebuild from ledger stream.
* [ ] Implement `read_your_writes`.
* [ ] Implement projection health API.
* [ ] Implement reconciliation job.

## Webhooks

* [ ] Define event registry.
* [ ] Implement webhook endpoint CRUD.
* [ ] Implement HMAC signing.
* [ ] Implement retry scheduler.
* [ ] Implement delivery logs.
* [ ] Implement event replay.
* [ ] Implement CLI local listener.
* [ ] Implement Workbench delivery inspector.
* [ ] Document at-least-once semantics.

## Sandbox / CLI / Workbench

* [ ] `pillar sandbox start`.
* [ ] `pillar sandbox reset`.
* [ ] `pillar fixtures create`.
* [ ] `pillar listen`.
* [ ] `pillar trigger`.
* [ ] `pillar logs tail`.
* [ ] `pillar traces show`.
* [ ] Workbench API Explorer.
* [ ] Workbench API version manager.
* [ ] Workbench request log.
* [ ] Workbench event log.
* [ ] Workbench ledger trace viewer.

## Production readiness

* [ ] Backward compatibility policy approved.
* [ ] Idempotency chaos tests.
* [ ] Duplicate command tests.
* [ ] Projection lag tests.
* [ ] Webhook duplicate/out-of-order tests.
* [ ] Rate limit tests.
* [ ] Key rotation drill.
* [ ] Projection rebuild drill.
* [ ] Audit export validation.
* [ ] Security review.
* [ ] Compliance evidence mapping.

[1]: https://docs.stripe.com/api "docs.stripe.com"
[2]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[3]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[4]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[5]: https://docs.stripe.com/api/pagination "docs.stripe.com"
[6]: https://docs.stripe.com/api/expanding_objects "docs.stripe.com"
[7]: https://docs.stripe.com/api/metadata "docs.stripe.com"
[8]: https://docs.stripe.com/api/errors "docs.stripe.com"
[9]: https://docs.stripe.com/api/authentication "docs.stripe.com"
[10]: https://docs.stripe.com/webhooks "docs.stripe.com"
[11]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html "JSON Ledger API Service V2 — Digital Asset’s platform documentation"
[12]: https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html "Sandbox — Digital Asset’s platform documentation"
[13]: https://docs.digitalasset.com/build/3.5/component-howtos/daml-shell/index.html "Daml Shell — Digital Asset’s platform documentation"
[14]: https://swagger.io/specification/?utm_source=chatgpt.com "OpenAPI Specification - Version 3.1.0"
[15]: https://docs.stripe.com/upgrades?utm_source=chatgpt.com "API upgrades"
[16]: https://docs.stripe.com/api/request_ids "docs.stripe.com"
[17]: https://docs.stripe.com/rate-limits "docs.stripe.com"
[18]: https://docs.stripe.com/api/subscriptions/object?utm_source=chatgpt.com "The Subscription object | Stripe API Reference"
[19]: https://docs.stripe.com/stripe-cli "docs.stripe.com"
[20]: https://docs.stripe.com/workbench/guides?utm_source=chatgpt.com "Use cases"
[21]: https://docs.digitalasset.com/build/3.5/component-howtos/pqs/operate.html "Operate — Digital Asset’s platform documentation"
[22]: https://docs.digitalasset.com/build/3.5/explanations/parties-users.html "Parties and users on a Canton ledger — Digital Asset’s platform documentation"
[23]: https://github.com/oai/openapi-specification/blob/main/versions/3.1.0.md?utm_source=chatgpt.com "OpenAPI-Specification/versions/3.1.0.md at main"
