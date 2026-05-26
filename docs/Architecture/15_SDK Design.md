# 15. SDK Design — Pillar SDK 제품군 설계

## Executive Summary

Pillar SDK 제품군은 **“Stripe for Canton-backed assets”**의 개발자 경험 계층이다. 외부 개발자는 Canton, Daml template, contract id, participant topology를 알 필요 없이 `asset`, `holding`, `balance`, `transfer_intent`, `event`, `webhook_endpoint` 같은 Stripe-grade resource grammar만 사용한다. 내부 런타임은 Canton-native로 동작하며, 모든 상태 전이는 Canton Ledger에 기록되고 Pillar DB는 **projection / audit / config**만 저장한다.

핵심 설계 결론은 다음이다.

| 영역        | 결정                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SDK 생성 전략 | **OpenAPI 3.1/3.2-ready spec + 언어별 hand-written ergonomic overlay**. 코드젠만으로는 Stripe급 pagination, expand, webhook typing, retry/idempotency UX가 부족하다.                                       |
| 지원 제품     | `pillar-node`, `pillar-python`, `pillar-go`, `pillar-java`, `Pillar.NET`, `@pillar/react`, `pillar-openapi`, Postman collection, `terraform-provider-pillar`.                              |
| 외부 API    | REST/JSON, predictable resource URL, `object` discriminator, cursor list, `expand[]`, `metadata`, `livemode`, `request_id`, `api_version`.                                                 |
| 내부 런타임    | API request → idempotency guard → ledger command mapper → Canton Ledger API command submission/completion → update stream projection → webhook outbox.                                     |
| 비동기 모델    | 모든 장기 workflow는 intent object와 webhook event로 표현한다. API는 시작과 조회를 제공하고, 완료/실패는 webhook-first.                                                                                               |
| 운영 추적성    | `Pillar-Request-Id`, `operation_id`, `command_id`, `workflow_id`, `transaction_id`, `participant_offset`, `event_id`를 연결한다. 외부에는 Canton 용어를 숨기되 audit 권한에는 `ledger_trace`를 expand 가능하게 한다. |

### 공식 문서 리서치 요약

| 소스                                              | 확인 내용                                                                                                                                                                                                                                                                                                                                               | Pillar 반영                                                                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe API/SDK                                  | Stripe API는 REST, resource-oriented URL, JSON response, standard HTTP verbs/status를 중심으로 하며, 공식 server-side SDK는 Node, Python, Go, Java, .NET 등을 지원한다. Stripe SDK는 create/update/delete/retrieve/list/search 같은 resource operation을 표준화한다. ([Stripe Docs][1])                                                                                       | Pillar도 resource client를 동일 문법으로 설계한다: `pillar.transferIntents.create`, `pillar.holdings.list`, `pillar.events.retrieve`.                                 |
| Stripe idempotency                              | Stripe는 `Idempotency-Key`로 안전한 재시도를 지원하고, 동일 key 재사용 시 parameter mismatch를 방지한다. v2 문서는 POST/DELETE idempotency와 더 긴 replay scope를 명시한다. ([Stripe Docs][2])                                                                                                                                                                                         | Pillar는 모든 mutation에 idempotency key를 지원하고, ledger `command_id`와 연결한다.                                                                                    |
| Stripe expand/pagination/request-id             | Stripe는 `expand[]`로 related object를 inline 확장하고, list API는 cursor pagination과 SDK auto-pagination을 제공하며, request id는 response header에서 확인된다. ([Stripe Docs][3])                                                                                                                                                                                     | Pillar는 `Expandable<T>`, `List<T>`, `autoPagingIterable`, `.lastResponse.requestId`를 모든 SDK에 공통 제공한다.                                                     |
| Stripe webhook/versioning/CLI/Workbench/Sandbox | Webhook signature 검증은 raw body와 signature header, endpoint secret을 사용한다. SDK/API version pinning과 webhook endpoint API version alignment가 중요하다. Workbench는 request logs/events/webhook deliveries/API Explorer를 제공하고, CLI는 logs tail, webhook forwarding, trigger를 지원한다. Sandboxes는 live data에 영향 없는 isolated test environment다. ([Stripe Docs][4]) | Pillar는 `Pillar-Signature`, endpoint version pinning, `pillar listen`, `pillar trigger`, Pillar Workbench, Pillar Sandbox를 SDK/개발자 도구 체계에 포함한다.           |
| Canton/Daml Ledger API                          | Ledger API는 ledger로 들어가는 command stream과 ledger에서 나오는 update/event stream으로 구성되며, command 결과는 asynchronous completion/update로 처리된다. Command, Completion, Update, State Service가 핵심이다. ([Digital Asset Documentation][5])                                                                                                                            | Pillar API는 intent-first + webhook-first로 설계한다. 내부는 Command Service/Completion/Update Service를 사용하고 State Service로 projection bootstrap을 수행한다.            |
| Canton command dedup / trace                    | Command deduplication은 change ID 기반이며 `act_as`, `user_id`, `command_id`가 중요하다. Completion에는 command status가 포함된다. ([Digital Asset Documentation][5])                                                                                                                                                                                                | Pillar idempotency key는 deterministic `command_id`와 연결된다. request id ↔ operation id ↔ command id ↔ transaction id를 audit chain으로 저장한다.                    |
| Canton JSON Ledger API / DPM / Sandbox          | JSON Ledger API는 gRPC Ledger API를 HTTP/JSON으로 노출하고 OpenAPI/AsyncAPI reference를 제공한다. Digital Asset 문서는 OpenAPI/AsyncAPI로 client generation을 권장하고, production에서 JSON Ledger API를 인터넷에 직접 노출하지 말라고 명시한다. DPM은 SDK component를 실행하는 CLI이며 Sandbox는 single Participant Node + Synchronizer topology의 Canton ledger다. ([Digital Asset Documentation][6])  | Pillar 외부 API는 자체 REST façade이며, Canton JSON Ledger API는 내부 개발/테스트용으로만 사용한다. Pillar Sandbox는 Canton Sandbox 위에 API façade와 seed fixtures를 올린다.            |
| OpenAPI/Postman                                 | OpenAPI는 HTTP API를 language-agnostic하게 설명하며, OAS 3.1은 `paths`, `components`, `webhooks` 중 하나 이상을 허용한다. Postman은 OpenAPI/AsyncAPI spec에서 collection을 생성하고 동기화할 수 있다. ([OpenAPI Initiative Publications][7])                                                                                                                                          | Pillar OpenAPI는 SDK generation, docs, Postman, conformance tests의 canonical contract다. Webhooks도 spec에 포함한다.                                              |
| Terraform Plugin Framework                      | Terraform provider는 target API를 Terraform CRUD resource/data source로 매핑하며 schema가 provider/resource/data source의 type information 역할을 한다. Data source는 side-effect 없는 external data reference다. ([HashiCorp Developer][8])                                                                                                                          | Terraform provider는 asset config, webhook endpoint, policy, sandbox 등 **configuration**을 관리하고, asset transfer/issuance 같은 financial movement는 기본적으로 금지한다. |

---

## Goals / Non-goals

### Goals

1. **Stripe-grade API grammar**

   * Resource URL, typed object, `object` discriminator, `metadata`, cursor pagination, `expand[]`, idempotency, request id, version pinning을 day one에 포함한다.

2. **Canton-invisible public API**

   * 외부 SDK에는 Daml template, contract id, participant topology, synchronizer details를 노출하지 않는다.
   * 감사 권한이 있는 사용자는 `expand[]=ledger_trace`로 ledger trace metadata만 본다.

3. **Canton-native internal runtime**

   * 모든 asset state transition은 ledger command로 발생한다.
   * Projection lag가 있어도 source of truth는 ledger다.

4. **Balance/Holding-first**

   * 고객은 contract가 아니라 `holding`, `balance`, `movement`, `intent`를 본다.
   * Contract-level detail은 internal/runtime/admin debug 영역이다.

5. **Intent-first**

   * `transfer_intent`, `issuance_intent`, `redemption_intent`, `settlement_intent`가 mutation의 중심이다.
   * “transaction 생성” API가 아니라 “의도 생성/확정/취소” API다.

6. **Webhook-first async workflow**

   * `*.processing`, `*.succeeded`, `*.failed`, `holding.updated`, `balance.available` event를 typed webhook으로 제공한다.

7. **SDK family consistency**

   * Node, Python, Go, Java, .NET의 method grammar와 request options를 동일하게 유지한다.
   * React SDK는 browser-safe hooks만 제공한다.
   * Terraform provider는 config lifecycle만 관리한다.

8. **Deployment invariance**

   * SaaS, private cloud, self-hosted, embedded Canton deployment 간에도 SDK/API experience는 바뀌지 않는다.
   * 바뀌는 것은 `baseUrl`, auth realm, sandbox/live mode뿐이다.

### Non-goals

1. **Public SDK에서 Canton Ledger API 직접 호출 금지**

   * Public SDK는 Pillar API만 호출한다.
   * Canton Ledger API client는 internal runtime SDK로 별도 관리한다.

2. **DB를 canonical balance store로 사용하지 않음**

   * DB balance projection은 serving/cache/audit convenience다.
   * Canonical balance는 ledger-derived state다.

3. **Terraform으로 financial movement 실행 금지**

   * Terraform apply는 반복·drift·destroy semantics가 있어 transfer/issuance/redemption에 부적합하다.
   * 예외는 명시적 `pillar_test_fixture_*` sandbox-only resource.

4. **React SDK에 secret key 노출 금지**

   * React는 publishable key 또는 ephemeral client token만 사용한다.
   * 모든 privileged operation은 server SDK 또는 backend-mediated flow로 수행한다.

5. **OpenAPI codegen만으로 SDK 완성 금지**

   * Codegen은 base types/transport의 source다.
   * Pagination, webhook signing, retry, logging, telemetry, typed event handler는 overlay에서 구현한다.

---

## Architecture

### 1. SDK 제품군

| 제품                 |                         Package name | 대상                     | 주요 기능                                                                                                |
| ------------------ | -----------------------------------: | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Node/TypeScript    |      `pillar` 또는 `@pillar/pillar-js` | Backend Node, TS       | Promise API, `AsyncIterable` auto-pagination, discriminated event union, webhook verification.       |
| Python             |                         `pillar-sdk` | Backend Python         | Typed models, `auto_paging_iter()`, decorator-style event handlers, sync/async clients.              |
| Go                 |        `github.com/pillar/pillar-go` | Backend Go             | `context.Context`, typed params, iterator, errors with request id, webhook verifier.                 |
| Java               |             `com.pillar:pillar-java` | JVM                    | Builder params, typed resources, `autoPagingIterable()`, sealed event hierarchy where supported.     |
| .NET               |                       `Pillar` NuGet | C#/.NET                | async services, `IAsyncEnumerable<T>`, typed options, webhook verifier.                              |
| React              |                      `@pillar/react` | Browser UI             | `PillarProvider`, hooks, TanStack Query adapter, client-token auth, no secret key.                   |
| OpenAPI            |                     `pillar-openapi` | Codegen/docs/contracts | Canonical public API spec, webhook schemas, `x-pillar-*` extensions.                                 |
| Postman            | `Pillar API.postman_collection.json` | Manual testing         | Generated from OpenAPI + custom pre-request scripts for version/idempotency.                         |
| Terraform provider |                    `pillarhq/pillar` | IaC                    | Config resources, read-only data sources, import, drift detection, no movement resources by default. |

### 2. Resource client 구조

공통 client shape:

```text
PillarClient
├─ accounts
├─ assets
├─ holdings
├─ balances
├─ transferIntents
├─ issuanceIntents
├─ redemptionIntents
├─ settlementIntents
├─ movements
├─ ledgerEntries
├─ events
├─ webhookEndpoints
├─ sandboxes
└─ webhooks
   ├─ constructEvent(rawBody, signature, secret)
   ├─ verifySignature(rawBody, signature, secret)
   └─ handlers(...)
```

공통 method grammar:

| Method                            |           HTTP | 예시                                   | 의미                   |
| --------------------------------- | -------------: | ------------------------------------ | -------------------- |
| `create(params, options?)`        |         `POST` | `transferIntents.create()`           | 새 intent/resource 생성 |
| `retrieve(id, params?, options?)` |          `GET` | `holdings.retrieve("hld_...")`       | 단건 조회                |
| `update(id, params, options?)`    |         `POST` | `assets.update("asset_...")`         | mutable config 업데이트  |
| `cancel(id, params?, options?)`   |         `POST` | `transferIntents.cancel("tin_...")`  | intent 취소            |
| `confirm(id, params?, options?)`  |         `POST` | `transferIntents.confirm("tin_...")` | intent 실행 요청         |
| `list(params?, options?)`         |          `GET` | `events.list({ limit: 100 })`        | cursor list          |
| `autoPaging*()`                   | multiple `GET` | language-specific                    | 전체 page 자동 순회        |

### 3. Core SDK layers

```text
┌─────────────────────────────────────────────┐
│ Language SDK ergonomic layer                 │
│ - resource clients                           │
│ - typed object models                        │
│ - event unions / handlers                    │
│ - iterator / auto-pagination                 │
├─────────────────────────────────────────────┤
│ Generated OpenAPI transport + schemas        │
│ - endpoint params                            │
│ - JSON serialization                         │
│ - validation helpers                         │
├─────────────────────────────────────────────┤
│ Pillar core runtime                          │
│ - auth header                                │
│ - version pinning                            │
│ - idempotency                                │
│ - retry/backoff                              │
│ - request id capture                         │
│ - logging / telemetry                        │
│ - webhook HMAC                               │
└─────────────────────────────────────────────┘
```

### 4. Typed object 모델

모든 object는 다음 base shape를 갖는다.

```ts
interface PillarObject {
  id: string;
  object: string;
  livemode: boolean;
  created: number;
  updated?: number;
  metadata: Record<string, string>;
}

type Expandable<T extends PillarObject> = string | T;

interface List<T extends PillarObject> {
  object: "list";
  url: string;
  data: T[];
  has_more: boolean;
  next_cursor?: string | null;
  request_id?: string;
}
```

Object prefix convention:

| Object           |   Prefix | 예시            |
| ---------------- | -------: | ------------- |
| Account          |  `acct_` | `acct_01J...` |
| Asset            | `asset_` | `asset_usdc`  |
| Holding          |   `hld_` | `hld_01J...`  |
| Balance          |   `bal_` | `bal_01J...`  |
| TransferIntent   |   `tin_` | `tin_01J...`  |
| IssuanceIntent   |   `iin_` | `iin_01J...`  |
| RedemptionIntent |   `rin_` | `rin_01J...`  |
| Movement         |   `mov_` | `mov_01J...`  |
| Event            |   `evt_` | `evt_01J...`  |
| WebhookEndpoint  |    `we_` | `we_01J...`   |
| LedgerTrace      |   `ltr_` | `ltr_01J...`  |

### 5. Auto-pagination

공통 list response:

```json
{
  "object": "list",
  "url": "/v1/holdings",
  "has_more": true,
  "next_cursor": "hld_01JABC...",
  "data": []
}
```

언어별 UX:

| SDK     | Auto-pagination                                                         |
| ------- | ----------------------------------------------------------------------- |
| Node/TS | `for await (const h of pillar.holdings.list(params)) {}`                |
| Python  | `for h in pillar.holdings.list(...).auto_paging_iter():`                |
| Go      | `iter := client.Holdings.List(ctx, params); for iter.Next() {}`         |
| Java    | `client.holdings().list(params).autoPagingIterable()`                   |
| .NET    | `await foreach (var h in client.Holdings.ListAutoPagingAsync(options))` |

### 6. Expand support

Public API는 Stripe v1-style `expand[]`를 사용한다.

```http
GET /v1/transfer_intents/tin_123?expand[]=source_holding&expand[]=destination_holding.asset
```

Rules:

| Rule           | 설계                                                     |
| -------------- | ------------------------------------------------------ |
| 최대 depth       | 4                                                      |
| list expansion | list는 `data.<field>` syntax도 허용: `expand[]=data.asset` |
| authorization  | expand 대상별 권한 검사                                       |
| type           | `Expandable<T> = string \| T`                          |
| performance    | heavy expand는 server warning + debug log에 표시           |
| ledger trace   | `expand[]=ledger_trace`는 audit scope 필요                |

### 7. Idempotency key support

Header:

```http
Idempotency-Key: 018fd0e2-bf2e-7f7c-9a7d-78c0c7b26f42
```

Server behavior:

| 항목                  | 정책                                                                    |
| ------------------- | --------------------------------------------------------------------- |
| 적용 method           | 모든 mutation: `POST`, `DELETE`; `GET`에는 무시                             |
| key length          | 최대 255 chars                                                          |
| recommended key     | UUIDv7 또는 충분한 entropy의 random string                                  |
| scope               | tenant + mode + API version + method + path + key                     |
| retention           | 기본 30일, enterprise configurable                                       |
| payload binding     | canonical request body hash 저장                                        |
| mismatch            | `idempotency_key_reused_with_different_params`                        |
| in-flight duplicate | original completion까지 wait 또는 `409 idempotency_key_in_use`            |
| ledger mapping      | `command_id = stable_hash(scope, idempotency_key, request_body_hash)` |
| response replay     | 동일 key는 동일 semantic operation result 반환                               |

### 8. Retry policy

SDK default:

| Setting             |                                                                      Default |
| ------------------- | ---------------------------------------------------------------------------: |
| `maxNetworkRetries` |                                                                          `2` |
| backoff             |                                                    exponential + full jitter |
| base delay          |                                                                        500ms |
| max delay           |                                                                           5s |
| timeout             |                                                    80s default, configurable |
| retryable network   |         connection reset, DNS transient, TLS handshake timeout, read timeout |
| retryable HTTP      |             408, 409 conflict retryable marker, 425, 429, 500, 502, 503, 504 |
| `Retry-After`       |                                                                        우선 적용 |
| POST retry          |                          idempotency key가 있거나 SDK가 retry-safety key를 생성한 경우만 |
| DELETE retry        |                                                           idempotency key 적용 |
| non-retry           | validation error, auth error, insufficient permission, business rule failure |

### 9. Request id exposure

Response header:

```http
Pillar-Request-Id: req_01JABC...
```

SDK exposure:

| SDK     | Access                                                        |
| ------- | ------------------------------------------------------------- |
| Node/TS | `obj.lastResponse.requestId`, `err.requestId`                 |
| Python  | `obj.last_response.request_id`, `err.request_id`              |
| Go      | `obj.LastResponse.RequestID`, `err.(*pillar.Error).RequestID` |
| Java    | `obj.getLastResponse().getRequestId()`                        |
| .NET    | `obj.LastResponse.RequestId`                                  |

### 10. Webhook signature verification

Header:

```http
Pillar-Signature: t=1779744000,v1=hex_hmac_sha256,...
```

Signing payload:

```text
${timestamp}.${raw_body}
```

Verification:

1. Parse `t` and all `v1` signatures.
2. Reject if timestamp outside tolerance, default 300 seconds.
3. Compute `HMAC_SHA256(endpoint_secret, timestamp + "." + rawBody)`.
4. Constant-time compare against any active `v1`.
5. Support multiple secrets during rotation.
6. Parse event only after signature success.
7. Require raw request body, not JSON-reencoded body.

### 11. Typed event handlers

Event base:

```ts
interface Event<TType extends string, TObject extends PillarObject> {
  id: string;
  object: "event";
  type: TType;
  api_version: string;
  created: number;
  livemode: boolean;
  request: {
    id: string | null;
    idempotency_key?: string | null;
  };
  data: {
    object: TObject;
    previous_attributes?: Record<string, unknown>;
  };
}
```

Typed event union:

```ts
type PillarEvent =
  | Event<"transfer_intent.created", TransferIntent>
  | Event<"transfer_intent.processing", TransferIntent>
  | Event<"transfer_intent.succeeded", TransferIntent>
  | Event<"transfer_intent.failed", TransferIntent>
  | Event<"holding.updated", Holding>
  | Event<"balance.available", Balance>
  | Event<"webhook_endpoint.disabled", WebhookEndpoint>;
```

### 12. API version pinning

Header:

```http
Pillar-Version: 2026-05-26
```

Policy:

| Area             | Policy                                                             |
| ---------------- | ------------------------------------------------------------------ |
| SDK release      | 각 SDK major/minor는 default `Pillar-Version`을 pin한다.                |
| Node/Python      | global/per-request override 가능. Type mismatch warning 표시.          |
| Go/Java/.NET     | strongly typed SDK는 SDK release에 고정. override 비권장 또는 preview-only. |
| Webhook endpoint | 생성 시 `api_version` 고정. Event payload는 endpoint version 기준.         |
| OpenAPI          | `/openapi/2026-05-26.yaml`로 immutable spec 제공.                     |
| Deprecation      | 최소 12개월 notice, breaking change는 새 dated version.                  |

### 13. Debug logging

SDK option:

```ts
const pillar = new Pillar(apiKey, {
  debug: true,
  logger: console,
});
```

Log levels:

| Level | 포함                                                                   | 제외                              |
| ----- | -------------------------------------------------------------------- | ------------------------------- |
| debug | method, path, status, retry count, request id, duration, api version | API key, raw body, PII          |
| trace | redacted params, pagination cursor, expand paths                     | secret, signature, bearer token |
| error | request id, error code, safe message                                 | customer-sensitive metadata     |

Env flags:

```bash
PILLAR_LOG=debug
PILLAR_DEBUG=1
PILLAR_REDACT_LOGS=1
```

### 14. Telemetry opt-out

Default telemetry is **minimal and redacted**. Enterprise/self-hosted deployments can default it off.

Collected only when enabled:

* SDK name/version
* runtime/language version
* API version
* endpoint category, not full URL with IDs
* latency bucket
* retry count
* error category, not payload

Never collected:

* API keys
* webhook secrets
* request/response body
* asset holder identity
* ledger transaction payload
* metadata values

Opt-out:

```bash
PILLAR_TELEMETRY_DISABLED=1
```

```ts
new Pillar(apiKey, { telemetry: false });
```

---

## API / Object Model

### 1. Public API grammar

Pillar public API is Stripe-like:

```http
GET    /v1/assets
POST   /v1/assets
GET    /v1/assets/{asset}
POST   /v1/assets/{asset}

GET    /v1/holdings
GET    /v1/holdings/{holding}

GET    /v1/balances
GET    /v1/balances/{balance}

POST   /v1/transfer_intents
GET    /v1/transfer_intents/{transfer_intent}
POST   /v1/transfer_intents/{transfer_intent}/confirm
POST   /v1/transfer_intents/{transfer_intent}/cancel

POST   /v1/issuance_intents
POST   /v1/redemption_intents
POST   /v1/settlement_intents

GET    /v1/movements
GET    /v1/ledger_entries

GET    /v1/events
GET    /v1/events/{event}

POST   /v1/webhook_endpoints
GET    /v1/webhook_endpoints
POST   /v1/webhook_endpoints/{webhook_endpoint}
DELETE /v1/webhook_endpoints/{webhook_endpoint}
```

### 2. Core objects

#### Asset

```json
{
  "id": "asset_usdc",
  "object": "asset",
  "livemode": false,
  "created": 1779744000,
  "code": "USDC",
  "name": "USD Coin",
  "type": "stablecoin",
  "precision": 6,
  "status": "active",
  "issuer_account": "acct_issuer",
  "metadata": {}
}
```

#### Holding

```json
{
  "id": "hld_01JABC",
  "object": "holding",
  "livemode": false,
  "created": 1779744000,
  "account": "acct_treasury",
  "asset": "asset_usdc",
  "status": "active",
  "quantity": {
    "total": "1000.000000",
    "available": "900.000000",
    "locked": "100.000000",
    "pending_inbound": "0.000000",
    "pending_outbound": "0.000000"
  },
  "ledger_trace": "ltr_01JTRACE",
  "metadata": {}
}
```

#### TransferIntent

```json
{
  "id": "tin_01JABC",
  "object": "transfer_intent",
  "livemode": false,
  "created": 1779744000,
  "status": "processing",
  "asset": "asset_usdc",
  "amount": "100.000000",
  "source_holding": "hld_source",
  "destination_account": "acct_destination",
  "destination_holding": null,
  "client_reference_id": "order_6735",
  "description": "Treasury rebalance",
  "ledger_trace": "ltr_01JTRACE",
  "metadata": {
    "desk": "treasury"
  }
}
```

#### LedgerTrace

Publicly opaque, audit-expandable:

```json
{
  "id": "ltr_01JTRACE",
  "object": "ledger_trace",
  "request_id": "req_01JREQ",
  "operation_id": "op_01JOP",
  "workflow_id": "tin_01JABC",
  "command_id": "cmd_01JCMD",
  "submission_id": "sub_01JSUB",
  "transaction_id": "1220abc...",
  "participant_offset": "000000000000000088",
  "event_ids": ["#1220abc...:0"],
  "created": 1779744000
}
```

### 3. Status model

#### Intent statuses

| Status                  | 의미                                        |
| ----------------------- | ----------------------------------------- |
| `requires_confirmation` | 생성됨, 아직 ledger mutation 확정 요청 전           |
| `processing`            | ledger command submitted/completing       |
| `succeeded`             | ledger update projected                   |
| `failed`                | command rejected 또는 business rule failure |
| `canceled`              | 사용자/API가 취소                               |
| `expired`               | confirmation window 만료                    |

#### Holding availability

| Field              | 의미                                           |
| ------------------ | -------------------------------------------- |
| `total`            | ledger-projected total quantity              |
| `available`        | transfer 가능한 수량                              |
| `locked`           | pending intent, lien, settlement lock에 묶인 수량 |
| `pending_inbound`  | ledger workflow상 들어올 예정                      |
| `pending_outbound` | ledger workflow상 나갈 예정                       |

### 4. Error object

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "idempotency_key_reused_with_different_params",
    "message": "The supplied idempotency key was already used with different request parameters.",
    "param": null,
    "request_id": "req_01JREQ",
    "doc_url": "https://docs.pillar.dev/errors/idempotency_key_reused_with_different_params"
  }
}
```

Error taxonomy:

| Type                    | Examples                                  |
| ----------------------- | ----------------------------------------- |
| `api_error`             | internal transient failure                |
| `authentication_error`  | invalid key                               |
| `authorization_error`   | insufficient scope                        |
| `invalid_request_error` | invalid param, unsupported expand         |
| `idempotency_error`     | reused key mismatch                       |
| `ledger_error`          | command rejected, participant unavailable |
| `rate_limit_error`      | too many requests                         |
| `webhook_error`         | signature failure, endpoint disabled      |

### 5. Code examples

#### Node / TypeScript

```ts
import Pillar from "pillar";
import express from "express";

const pillar = new Pillar(process.env.PILLAR_SECRET_KEY!, {
  apiVersion: "2026-05-26",
  maxNetworkRetries: 2,
  telemetry: false,
  debug: process.env.NODE_ENV !== "production",
});

const transfer = await pillar.transferIntents.create(
  {
    asset: "asset_usdc",
    amount: "100.000000",
    source_holding: "hld_source",
    destination_account: "acct_destination",
    client_reference_id: "order_6735",
    metadata: { desk: "treasury" },
    expand: ["source_holding", "ledger_trace"],
  },
  {
    idempotencyKey: crypto.randomUUID(),
  }
);

console.log(transfer.id, transfer.status, transfer.lastResponse.requestId);

for await (const holding of pillar.holdings.list({
  account: "acct_treasury",
  asset: "asset_usdc",
  limit: 100,
  expand: ["data.asset"],
})) {
  console.log(holding.id, holding.quantity.available);
}

const app = express();

app.post(
  "/pillar/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const event = pillar.webhooks.constructEvent(
      req.body,
      req.header("Pillar-Signature")!,
      process.env.PILLAR_WEBHOOK_SECRET!
    );

    await pillar.webhooks.dispatch(event, {
      "transfer_intent.succeeded": async (evt) => {
        const intent = evt.data.object;
        console.log("Transfer settled", intent.id);
      },
      "holding.updated": async (evt) => {
        console.log("Holding updated", evt.data.object.id);
      },
    });

    res.json({ received: true });
  }
);
```

#### Python

```python
import os
import uuid
from pillar import PillarClient, RequestOptions, Webhook

pillar = PillarClient(
    api_key=os.environ["PILLAR_SECRET_KEY"],
    api_version="2026-05-26",
    max_network_retries=2,
    telemetry=False,
)

transfer = pillar.transfer_intents.create(
    {
        "asset": "asset_usdc",
        "amount": "100.000000",
        "source_holding": "hld_source",
        "destination_account": "acct_destination",
        "client_reference_id": "order_6735",
        "expand": ["source_holding", "ledger_trace"],
    },
    options=RequestOptions(idempotency_key=str(uuid.uuid4())),
)

print(transfer.id, transfer.status, transfer.last_response.request_id)

for holding in pillar.holdings.list(
    {"account": "acct_treasury", "limit": 100, "expand": ["data.asset"]}
).auto_paging_iter():
    print(holding.id, holding.quantity.available)


webhooks = Webhook.Handler()

@webhooks.on("transfer_intent.succeeded")
def handle_transfer_succeeded(event):
    intent = event.data.object
    print("Transfer settled", intent.id)

def handle_http_request(raw_body: bytes, signature: str):
    event = Webhook.construct_event(
        raw_body,
        signature,
        os.environ["PILLAR_WEBHOOK_SECRET"],
    )
    webhooks.dispatch(event)
```

#### Go

```go
package main

import (
	"context"
	"fmt"
	"os"

	pillar "github.com/pillar/pillar-go"
	"github.com/google/uuid"
)

func main() {
	ctx := context.Background()

	client := pillar.NewClient(os.Getenv("PILLAR_SECRET_KEY"),
		pillar.WithAPIVersion("2026-05-26"),
		pillar.WithMaxNetworkRetries(2),
		pillar.WithTelemetry(false),
	)

	params := &pillar.TransferIntentCreateParams{
		Asset:              pillar.String("asset_usdc"),
		Amount:             pillar.String("100.000000"),
		SourceHolding:      pillar.String("hld_source"),
		DestinationAccount: pillar.String("acct_destination"),
		ClientReferenceID:  pillar.String("order_6735"),
	}
	params.AddExpand("source_holding")
	params.AddExpand("ledger_trace")

	transfer, err := client.TransferIntents.Create(ctx, params,
		pillar.WithIdempotencyKey(uuid.NewString()),
	)
	if err != nil {
		if perr, ok := err.(*pillar.Error); ok {
			fmt.Println(perr.Code, perr.RequestID)
		}
		panic(err)
	}

	fmt.Println(transfer.ID, transfer.Status, transfer.LastResponse.RequestID)

	iter := client.Holdings.List(ctx, &pillar.HoldingListParams{
		Account: pillar.String("acct_treasury"),
		Limit:   pillar.Int64(100),
	})
	for iter.Next() {
		h := iter.Holding()
		fmt.Println(h.ID, h.Quantity.Available)
	}
	if err := iter.Err(); err != nil {
		panic(err)
	}
}
```

#### Java

```java
import com.pillar.PillarClient;
import com.pillar.model.TransferIntent;
import com.pillar.param.TransferIntentCreateParams;
import com.pillar.net.RequestOptions;

import java.util.UUID;

PillarClient pillar = PillarClient.builder()
    .apiKey(System.getenv("PILLAR_SECRET_KEY"))
    .apiVersion("2026-05-26")
    .maxNetworkRetries(2)
    .telemetry(false)
    .build();

TransferIntentCreateParams params = TransferIntentCreateParams.builder()
    .setAsset("asset_usdc")
    .setAmount("100.000000")
    .setSourceHolding("hld_source")
    .setDestinationAccount("acct_destination")
    .setClientReferenceId("order_6735")
    .addExpand("source_holding")
    .addExpand("ledger_trace")
    .build();

TransferIntent transfer = pillar.transferIntents().create(
    params,
    RequestOptions.builder()
        .setIdempotencyKey(UUID.randomUUID().toString())
        .build()
);

System.out.println(transfer.getId());
System.out.println(transfer.getLastResponse().getRequestId());

for (var holding : pillar.holdings()
    .list()
    .setAccount("acct_treasury")
    .setLimit(100L)
    .autoPagingIterable()) {
  System.out.println(holding.getId());
}
```

#### .NET

```csharp
using Pillar;
using Pillar.Models;
using Pillar.Params;

var client = new PillarClient(new PillarClientOptions
{
    ApiKey = Environment.GetEnvironmentVariable("PILLAR_SECRET_KEY"),
    ApiVersion = "2026-05-26",
    MaxNetworkRetries = 2,
    Telemetry = false
});

var transfer = await client.TransferIntents.CreateAsync(
    new TransferIntentCreateParams
    {
        Asset = "asset_usdc",
        Amount = "100.000000",
        SourceHolding = "hld_source",
        DestinationAccount = "acct_destination",
        ClientReferenceId = "order_6735",
        Expand = new[] { "source_holding", "ledger_trace" }
    },
    new RequestOptions
    {
        IdempotencyKey = Guid.NewGuid().ToString()
    }
);

Console.WriteLine($"{transfer.Id} {transfer.Status} {transfer.LastResponse.RequestId}");

await foreach (var holding in client.Holdings.ListAutoPagingAsync(
    new HoldingListParams
    {
        Account = "acct_treasury",
        Limit = 100
    }))
{
    Console.WriteLine($"{holding.Id} {holding.Quantity.Available}");
}
```

#### React

```tsx
import {
  PillarProvider,
  useHolding,
  useCreateTransferIntent,
} from "@pillar/react";

function TreasuryTransfer() {
  const { data: holding } = useHolding("hld_source", {
    expand: ["asset"],
  });

  const createTransfer = useCreateTransferIntent();

  return (
    <button
      disabled={!holding || createTransfer.isPending}
      onClick={() =>
        createTransfer.mutate({
          asset: "asset_usdc",
          amount: "100.000000",
          source_holding: "hld_source",
          destination_account: "acct_destination",
          client_reference_id: "order_6735",
        })
      }
    >
      Transfer 100 USDC
    </button>
  );
}

export function App() {
  return (
    <PillarProvider
      publishableKey={import.meta.env.VITE_PILLAR_PUBLISHABLE_KEY}
      clientTokenEndpoint="/api/pillar/client-token"
      apiVersion="2026-05-26"
      telemetry={false}
    >
      <TreasuryTransfer />
    </PillarProvider>
  );
}
```

React SDK constraints:

* Secret key 사용 금지.
* `clientTokenEndpoint`는 backend가 short-lived token을 발급한다.
* Hooks는 Pillar public API만 호출한다.
* Webhook verification은 browser SDK에 포함하지 않는다.

#### OpenAPI snippet

```yaml
openapi: 3.1.0
info:
  title: Pillar API
  version: 2026-05-26
servers:
  - url: https://api.pillar.dev
paths:
  /v1/transfer_intents:
    post:
      operationId: createTransferIntent
      tags: [TransferIntents]
      x-pillar-idempotent: true
      x-pillar-resource: transfer_intent
      parameters:
        - $ref: "#/components/parameters/PillarVersion"
        - $ref: "#/components/parameters/IdempotencyKey"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/TransferIntentCreateParams"
      responses:
        "200":
          description: Transfer intent created.
          headers:
            Pillar-Request-Id:
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/TransferIntent"
components:
  parameters:
    PillarVersion:
      name: Pillar-Version
      in: header
      schema:
        type: string
        example: "2026-05-26"
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      schema:
        type: string
        maxLength: 255
  schemas:
    ExpandableHolding:
      oneOf:
        - type: string
        - $ref: "#/components/schemas/Holding"
      x-pillar-expandable: true
webhooks:
  transfer_intent.succeeded:
    post:
      operationId: receiveTransferIntentSucceeded
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/EventTransferIntentSucceeded"
      responses:
        "200":
          description: Acknowledge event.
```

#### Postman pre-request script

```js
const apiVersion = pm.environment.get("pillar_api_version") || "2026-05-26";

pm.request.headers.upsert({
  key: "Pillar-Version",
  value: apiVersion,
});

if (!pm.request.headers.has("Idempotency-Key")) {
  const random = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  pm.request.headers.upsert({
    key: "Idempotency-Key",
    value: `postman-${random}`,
  });
}

pm.request.headers.upsert({
  key: "Authorization",
  value: `Bearer ${pm.environment.get("pillar_secret_key")}`,
});
```

Postman test script:

```js
const requestId = pm.response.headers.get("Pillar-Request-Id");
pm.environment.set("last_request_id", requestId);

pm.test("has request id", function () {
  pm.expect(requestId).to.not.be.empty;
});

pm.test("status is success", function () {
  pm.expect(pm.response.code).to.be.oneOf([200, 201, 202]);
});
```

#### Terraform

```hcl
terraform {
  required_providers {
    pillar = {
      source  = "pillarhq/pillar"
      version = "~> 1.0"
    }
  }
}

provider "pillar" {
  api_key     = var.pillar_secret_key
  api_version = "2026-05-26"
  telemetry   = false
}

resource "pillar_webhook_endpoint" "ops" {
  url = "https://ops.example.com/pillar/webhook"

  enabled_events = [
    "transfer_intent.succeeded",
    "transfer_intent.failed",
    "holding.updated",
    "balance.available",
  ]

  api_version = "2026-05-26"
  description = "Operations event receiver"
}

resource "pillar_asset" "fund_unit" {
  code       = "FUNDX"
  name       = "Fund X Unit"
  type       = "fund_unit"
  precision  = 6
  metadata = {
    isin = "XS0000000000"
  }
}

data "pillar_holding" "treasury_usdc" {
  account = "acct_treasury"
  asset   = "asset_usdc"
}
```

Terraform guardrail:

```hcl
# Not supported:
# resource "pillar_transfer_intent" "move_money" { ... }
```

---

## Internal Runtime

### 1. Runtime flow

```text
External SDK
  ↓
Pillar API Gateway
  - auth
  - API version negotiation
  - rate limit
  - request id
  ↓
Idempotency Layer
  - key scope
  - payload hash
  - replay / wait / mismatch
  ↓
Command Planner
  - public params → Daml command intent
  - deterministic command_id
  - workflow_id = public intent id
  ↓
Canton Ledger API Adapter
  - submit command
  - wait for completion when possible
  - record command audit
  ↓
Ledger Update Consumer
  - State Service bootstrap
  - Update Service stream
  - offset cursor
  ↓
Projection Builder
  - holdings
  - balances
  - movements
  - intents
  - ledger traces
  ↓
Webhook Outbox
  - event object materialization
  - endpoint filtering
  - delivery retries
  ↓
SDK / Customer Systems
```

### 2. Ledger-native mapping

| Public concept   | Internal Daml/Canton concept                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| `TransferIntent` | Daml command creating/exercising internal transfer workflow                    |
| `Holding`        | Projection of active ledger state for account + asset + party visibility       |
| `Movement`       | Projection of ledger transaction events affecting holdings                     |
| `Balance`        | Derived projection over holdings/movements                                     |
| `LedgerTrace`    | Audit join over request, command, completion, update, transaction              |
| `Event`          | Webhook-facing envelope emitted from projection/update, not from request alone |

### 3. Deterministic IDs

Pillar must generate public IDs before ledger submission, then include them in Daml payload/keys.

```text
intent_id      = "tin_" + ulid()
workflow_id    = intent_id
command_id     = "cmd_" + hash(tenant, mode, method, path, idempotency_key, body_hash)
submission_id  = "sub_" + ulid()
operation_id   = "op_" + ulid()
request_id     = "req_" + ulid()
```

The Daml workflow must enforce uniqueness using contract keys or equivalent business constraints:

```text
TransferIntentKey(tenant_id, intent_id)
ClientReferenceKey(tenant_id, client_reference_id) optional
IdempotencyCommandKey(tenant_id, command_id)
```

### 4. Projection strategy

Startup:

1. Read last processed `participant_offset` from `projection_cursors`.
2. If no cursor or cursor invalid, use State Service to bootstrap active contracts.
3. Subscribe to Update Service from cursor.
4. Apply events transactionally to projection tables.
5. Emit webhook events from committed projection changes.
6. Advance cursor only after projection + event outbox transaction commits.

Projection invariants:

| Invariant                              | Enforcement                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| No projection without ledger trace     | every projection row references `ledger_update_id`                                          |
| No event before projection             | event outbox created in same DB transaction as projection update                            |
| No cursor advance before durable write | cursor updated last                                                                         |
| Replay-safe projection                 | `(participant_id, offset, event_id)` unique                                                 |
| Multi-participant trace                | use transaction id for cross-participant correlation, offset for participant-local ordering |

### 5. Webhook event emission

Event source is projection, not API request. This avoids false-positive webhook success when command submission succeeds but ledger commit later fails.

Example sequence:

```text
POST /v1/transfer_intents
  → transfer_intent.created
  → transfer_intent.processing
  → holding.updated
  → movement.created
  → transfer_intent.succeeded
```

Delivery semantics:

| Item      | Policy                                                                      |
| --------- | --------------------------------------------------------------------------- |
| Delivery  | at-least-once                                                               |
| Event id  | globally unique, stable                                                     |
| Ordering  | best-effort per endpoint; strict ordering not guaranteed across event types |
| Retry     | exponential backoff up to 3 days default                                    |
| Disable   | endpoint disabled after repeated failure threshold                          |
| Replay    | Workbench/CLI/API can resend event                                          |
| Signature | per-delivery HMAC with active endpoint secret                               |

### 6. CLI / Workbench / Sandbox

#### Pillar CLI

Commands:

```bash
pillar login
pillar openapi pull --version 2026-05-26
pillar logs tail --request-id req_...
pillar events list --type transfer_intent.succeeded
pillar listen --forward-to localhost:4242/webhook
pillar trigger transfer_intent.succeeded
pillar sandboxes create treasury-dev
pillar sandboxes seed treasury-dev --fixture basic-assets
pillar request GET /v1/holdings --expand data.asset
```

#### Pillar Workbench

Must include:

* API request log explorer
* Request replay with idempotency warning
* Event explorer
* Webhook delivery log
* API version dashboard
* SDK code snippet generator
* Ledger trace viewer for audit users
* Projection lag dashboard
* Sandbox switcher
* CLI command copy

#### Pillar Sandbox

Modes:

| Mode               | Purpose                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| hosted sandbox     | Stripe-like isolated environment                                       |
| local sandbox      | Docker Compose: Pillar API + Postgres + Canton Sandbox + seed fixtures |
| CI sandbox         | ephemeral environment for SDK conformance tests                        |
| ledger-dev sandbox | Daml package testing with Pillar façade                                |

---

## DB Schema

Principle: **No table below is source of truth for asset ownership.** Projection tables are rebuildable from ledger updates plus retained audit/config. Audit/config tables are not ownership state.

### 1. Config tables

```sql
tenants (
  id text primary key,
  mode text not null check (mode in ('test', 'live')),
  default_api_version text not null,
  created_at timestamptz not null
);

api_keys (
  id text primary key,
  tenant_id text not null references tenants(id),
  key_hash bytea not null,
  key_prefix text not null,
  scopes text[] not null,
  livemode boolean not null,
  revoked_at timestamptz,
  created_at timestamptz not null
);

webhook_endpoints (
  id text primary key,
  tenant_id text not null references tenants(id),
  url text not null,
  enabled_events text[] not null,
  api_version text not null,
  status text not null,
  description text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

webhook_secrets (
  id text primary key,
  endpoint_id text not null references webhook_endpoints(id),
  secret_hash bytea not null,
  active_from timestamptz not null,
  active_until timestamptz
);
```

### 2. Idempotency / request audit

```sql
api_requests (
  id text primary key, -- req_
  tenant_id text not null,
  api_version text not null,
  method text not null,
  path text not null,
  status_code int,
  error_code text,
  idempotency_key text,
  operation_id text,
  request_body_hash bytea,
  response_body_hash bytea,
  created_at timestamptz not null,
  completed_at timestamptz
);

idempotency_keys (
  tenant_id text not null,
  mode text not null,
  method text not null,
  path text not null,
  key text not null,
  request_body_hash bytea not null,
  request_id text not null references api_requests(id),
  operation_id text not null,
  command_id text,
  status text not null check (status in ('in_progress', 'succeeded', 'failed')),
  response_status int,
  response_body jsonb,
  expires_at timestamptz not null,
  primary key (tenant_id, mode, method, path, key)
);
```

### 3. Ledger audit

```sql
ledger_commands (
  id text primary key, -- command audit id
  tenant_id text not null,
  operation_id text not null,
  request_id text not null references api_requests(id),
  participant_id text not null,
  act_as text[] not null,
  user_id text not null,
  command_id text not null,
  submission_id text not null,
  workflow_id text not null,
  deduplication_until timestamptz,
  status text not null check (status in ('submitted', 'completed', 'rejected', 'timed_out')),
  completion_status jsonb,
  created_at timestamptz not null,
  completed_at timestamptz
);

ledger_updates (
  id text primary key,
  tenant_id text not null,
  participant_id text not null,
  participant_offset text not null,
  update_id text not null,
  transaction_id text,
  workflow_id text,
  command_id text,
  event_id text,
  event_type text not null,
  template_id_hash text,
  contract_id_hash text,
  payload_hash bytea not null,
  ledger_effective_at timestamptz,
  ingested_at timestamptz not null,
  unique (participant_id, participant_offset, event_id)
);

projection_cursors (
  tenant_id text not null,
  participant_id text not null,
  stream_name text not null,
  participant_offset text not null,
  updated_at timestamptz not null,
  primary key (tenant_id, participant_id, stream_name)
);
```

### 4. Projection tables

```sql
asset_projection (
  id text primary key,
  tenant_id text not null,
  code text not null,
  name text not null,
  type text not null,
  precision int not null,
  status text not null,
  issuer_account_id text,
  ledger_update_id text not null references ledger_updates(id),
  metadata jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

holding_projection (
  id text primary key,
  tenant_id text not null,
  account_id text not null,
  asset_id text not null,
  status text not null,
  total numeric not null,
  available numeric not null,
  locked numeric not null,
  pending_inbound numeric not null,
  pending_outbound numeric not null,
  ledger_trace_id text not null,
  ledger_update_id text not null references ledger_updates(id),
  updated_at timestamptz not null,
  unique (tenant_id, account_id, asset_id)
);

movement_projection (
  id text primary key,
  tenant_id text not null,
  asset_id text not null,
  amount numeric not null,
  source_holding_id text,
  destination_holding_id text,
  intent_id text,
  transaction_id text,
  ledger_trace_id text not null,
  ledger_update_id text not null references ledger_updates(id),
  created_at timestamptz not null
);

intent_projection (
  id text primary key,
  tenant_id text not null,
  object_type text not null,
  status text not null,
  asset_id text not null,
  amount numeric not null,
  source_holding_id text,
  destination_account_id text,
  destination_holding_id text,
  client_reference_id text,
  ledger_trace_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

### 5. Event / webhook delivery

```sql
event_projection (
  id text primary key, -- evt_
  tenant_id text not null,
  type text not null,
  api_version text not null,
  object_id text not null,
  object_type text not null,
  request_id text,
  idempotency_key text,
  payload jsonb not null,
  ledger_update_id text references ledger_updates(id),
  created_at timestamptz not null
);

webhook_deliveries (
  id text primary key,
  event_id text not null references event_projection(id),
  endpoint_id text not null references webhook_endpoints(id),
  status text not null check (status in ('pending', 'delivered', 'failed', 'retrying')),
  attempt_count int not null default 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  response_status int,
  response_body_hash bytea,
  error text,
  created_at timestamptz not null
);
```

---

## Failure Modes

| Failure mode                         | Symptom                                           | SDK/API behavior                                                        | Internal mitigation                                     |
| ------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| Network timeout after mutation       | Client does not know whether transfer was created | SDK retries only with idempotency key; error exposes request id         | idempotency table + ledger command dedup                |
| Same idempotency key, different body | Accidental duplicate key reuse                    | `409 idempotency_error`                                                 | stored canonical body hash                              |
| Command accepted, completion delayed | API call times out but ledger may later commit    | return `202` or retry-safe response; webhook later resolves             | completion watcher + update stream                      |
| Command rejected                     | Intent fails                                      | error object or `transfer_intent.failed` event                          | ledger completion status stored                         |
| Projection lag                       | API retrieve shows stale holding                  | response includes `projection_lag_ms` in debug headers; webhook delayed | cursor monitoring, State Service rebuild                |
| Participant failover                 | Offset stream disconnect                          | SDK unaffected; API may return transient `ledger_unavailable`           | reconnect from durable cursor                           |
| Webhook endpoint down                | Customer misses event initially                   | at-least-once retry; Workbench replay                                   | delivery outbox with backoff                            |
| Duplicate webhook delivery           | Handler processes twice                           | event id stable; SDK docs require idempotent handlers                   | delivery attempts retain same event id                  |
| API version mismatch                 | SDK type does not match payload                   | strongly typed SDK pins version; webhook endpoint pins version          | immutable OpenAPI per version                           |
| Expand permission leak               | User expands unauthorized account/trace           | `authorization_error` on expand path                                    | field-level auth before serialization                   |
| Rate limit                           | 429                                               | SDK respects `Retry-After`                                              | tenant-level token bucket                               |
| Terraform drift                      | Config changed outside Terraform                  | plan shows diff                                                         | provider Read maps API state to Terraform state         |
| Sandbox/live confusion               | Test key used in live workflow                    | `livemode` on all objects; key prefix validation                        | separate tenants/modes/keyspaces                        |
| Ledger contention                    | Two workflows compete for same holding lock       | `ledger_error` or intent `failed`                                       | Daml locking pattern, retryable conflict classification |
| Webhook signature raw body mutation  | Verification fails                                | SDK verifier throws signature error                                     | docs and framework examples require raw body            |

---

## Security / Compliance

### 1. Auth model

| Credential      |                 Prefix | Use                              |
| --------------- | ---------------------: | -------------------------------- |
| Secret key      | `sk_test_`, `sk_live_` | Server SDK only                  |
| Restricted key  | `rk_test_`, `rk_live_` | Scoped server access             |
| Publishable key | `pk_test_`, `pk_live_` | Browser bootstrap                |
| Client token    |                  `ct_` | Short-lived React/browser access |
| Webhook secret  |               `whsec_` | HMAC verification                |

Rules:

* Secret keys never appear in React, Postman public workspaces, mobile, or logs.
* Restricted keys support scopes like `holdings:read`, `transfer_intents:write`, `webhook_endpoints:write`.
* API keys are stored as salted hashes.
* `metadata` is not a secret store.

### 2. Canton boundary

* Public API gateway never proxies raw Canton Ledger API.
* Canton gRPC Ledger API is internal-only, mTLS-protected.
* JSON Ledger API is dev/test/internal only; never public internet exposed.
* Internal ledger access uses party/user rights mapped from tenant/account policy.
* Ledger trace expansion requires `audit:read` scope.

### 3. Webhook security

* HMAC SHA-256 over timestamp + raw body.
* 5-minute replay tolerance by default.
* Constant-time signature comparison.
* Secret rotation with overlapping active secrets.
* Endpoint delivery uses HTTPS only in live mode.
* Failed endpoint auto-disable policy after threshold.
* Event replay requires explicit user action and audit log entry.

### 4. Data minimization

* SDK telemetry excludes payload, IDs, API keys, signatures, metadata values.
* Logs redact bearer tokens, idempotency keys after prefix, webhook secrets, account identifiers when configured.
* Ledger payload hashes may be stored for audit correlation; raw Daml payload is not stored in public projection tables unless compliance retention explicitly requires it.

### 5. Compliance hooks

Pillar must expose policy extension points:

| Policy hook               | Timing                               |
| ------------------------- | ------------------------------------ |
| Sanctions screening       | before `confirm`                     |
| Asset eligibility         | before issuance/transfer             |
| Holding lock/lien         | before available balance calculation |
| Travel-rule payload       | before settlement                    |
| KYC/KYB account state     | before movement                      |
| Jurisdiction restrictions | before command planning              |
| Audit export              | after ledger update projection       |

### 6. Audit chain

Every operation must be reconstructable:

```text
api_request.req_id
  → idempotency_key.operation_id
  → ledger_command.command_id / submission_id / workflow_id
  → ledger_update.transaction_id / offset / event_id
  → projection row
  → event_projection.evt_id
  → webhook_delivery attempts
```

---

## Implementation Plan

### Phase 0 — Spec foundation

Deliverables:

* `pillar-openapi` repository
* API style guide
* error taxonomy
* object prefix registry
* event type registry
* `x-pillar-*` OpenAPI extensions
* contract tests generated from OpenAPI
* mock server
* Postman collection generated from spec

Acceptance criteria:

* All resources include `id`, `object`, `livemode`, `created`, `metadata`.
* All mutation endpoints define idempotency behavior.
* All list endpoints share common pagination schema.
* All expandable fields are marked with `x-pillar-expandable`.
* Webhook schemas are included.

### Phase 1 — Core API + Node/TypeScript SDK

Deliverables:

* API gateway request id/idempotency/version middleware
* Node/TS SDK with:

  * resource clients
  * typed objects
  * `AsyncIterable` list
  * webhook verifier
  * typed event dispatch
  * retry policy
  * debug logging
  * telemetry opt-out
* Conformance suite

Why Node first:

* TypeScript type quality exposes API grammar defects fastest.
* React SDK can reuse types.

### Phase 2 — Python, Go, Java, .NET SDKs

Deliverables:

* Shared SDK generator config
* Language-specific overlay packages
* Webhook verifier in each language
* Error/request id parity
* Pagination parity
* API version pin parity
* Idempotency/retry parity

Acceptance criteria:

* Same example workflow runs in all server SDKs.
* Same OpenAPI fixtures pass in all SDKs.
* Same webhook event payload deserializes into typed object in all SDKs.

### Phase 3 — React, Postman, Terraform

Deliverables:

* `@pillar/react`

  * `PillarProvider`
  * hooks for holdings/balances/intents/events
  * client-token auth
  * cache invalidation on event stream
* Postman collection

  * environment templates
  * idempotency pre-request script
  * request id test script
* Terraform provider

  * `pillar_asset`
  * `pillar_webhook_endpoint`
  * `pillar_policy`
  * `pillar_sandbox`
  * data sources: `pillar_asset`, `pillar_holding`, `pillar_balance`
  * import support
  * documentation generation

### Phase 4 — CLI / Workbench / Sandbox

Deliverables:

* `pillar` CLI

  * `listen`, `trigger`, `logs tail`, `events resend`, `openapi pull`, `sandboxes`
* Pillar Workbench

  * request logs
  * event explorer
  * webhook delivery explorer
  * ledger trace viewer
  * API version dashboard
  * SDK snippet generator
* Local sandbox

  * Docker Compose
  * Canton Sandbox
  * Pillar API
  * Postgres
  * seed assets/accounts/holdings
  * webhook receiver sample

### Phase 5 — GA hardening

Deliverables:

* SDK semver policy
* API version deprecation policy
* release train
* security review
* SOC2 evidence hooks
* penetration test
* webhook replay load tests
* projection rebuild drill
* multi-participant failover tests
* Terraform acceptance tests
* SDK runtime support matrix

GA gates:

* p95 SDK request overhead below target.
* Projection replay is deterministic.
* Idempotency replay passes chaos tests.
* Webhook duplicate/retry behavior is documented and tested.
* API version rollback/upgrade path is validated.
* No public API leaks Daml template or contract identifiers by default.

---

## Open Questions

1. **API version naming**

   * Pure date: `2026-05-26`
   * Date + codename: `2026-05-26.cedar`
   * Recommendation: pure date for GA, codename only for previews.

2. **Event payload style**

   * Snapshot events: full object included.
   * Thin events: event contains object id, SDK retrieves latest.
   * Recommendation: default snapshot events for Stripe-like UX; optional thin events for high-volume tenants.

3. **Ledger trace exposure**

   * Should `transaction_id` be visible to customers by default?
   * Recommendation: expose `ledger_trace_id` by default; expand details only with `audit:read`.

4. **Idempotency retention**

   * 24h, 7d, 30d, or tenant-configurable?
   * Recommendation: 30d default for financial operations, with enterprise override.

5. **Read-after-write consistency**

   * Should API block until projection catches up?
   * Recommendation: mutation responses wait for ledger completion and projection within short timeout; otherwise return processing object and rely on webhook.

6. **Terraform scope**

   * Should Terraform manage asset definitions in live mode?
   * Recommendation: yes for config-like asset definitions; no for balances/movements/intents.

7. **React real-time updates**

   * Polling, SSE, or WebSocket?
   * Recommendation: SSE for event stream simplicity; WebSocket optional for Workbench.

8. **OpenAPI version target**

   * OAS 3.2 is current, but toolchains may lag.
   * Recommendation: author in 3.1-compatible form, maintain 3.2 validation track.

9. **Internal use of Canton JSON Ledger API**

   * Use gRPC directly or JSON API for some tools?
   * Recommendation: runtime uses gRPC; dev tools may use JSON API only inside sandbox.

10. **Multi-participant deployments**

    * How much cross-participant reconciliation should public API expose?
    * Recommendation: public API remains invariant; Workbench audit view can show participant-specific traces.

---

## Agent-ready Checklist

### API contract

* [ ] Define resource prefix registry.
* [ ] Define common object schema.
* [ ] Define list schema.
* [ ] Define error schema.
* [ ] Define event schema.
* [ ] Define `expand[]` grammar and max depth.
* [ ] Mark expandable fields with `x-pillar-expandable`.
* [ ] Add `Pillar-Version` header to every operation.
* [ ] Add `Pillar-Request-Id` response header to every operation.
* [ ] Add `Idempotency-Key` to every mutation operation.
* [ ] Add webhook schemas under OpenAPI `webhooks`.
* [ ] Generate immutable `/openapi/{version}.yaml`.

### SDK core

* [ ] Implement shared retry classifier.
* [ ] Implement idempotency request option.
* [ ] Implement request id capture.
* [ ] Implement API version pinning.
* [ ] Implement debug logger with redaction.
* [ ] Implement telemetry opt-out.
* [ ] Implement webhook HMAC verifier.
* [ ] Implement typed event registry.
* [ ] Implement auto-pagination abstraction.
* [ ] Implement expand typing.

### Node/TypeScript

* [ ] Generate base types from OpenAPI.
* [ ] Add `Expandable<T>` helpers.
* [ ] Add `AsyncIterable` list objects.
* [ ] Add discriminated union for events.
* [ ] Add Express/Fastify/Next.js webhook examples.
* [ ] Add ESM/CJS support.
* [ ] Add type tests.

### Python

* [ ] Generate typed models.
* [ ] Add sync and async clients.
* [ ] Add `auto_paging_iter()`.
* [ ] Add decorator-style event handlers.
* [ ] Add Flask/FastAPI webhook examples.
* [ ] Add mypy tests.

### Go

* [ ] Generate structs and params.
* [ ] Add context-aware services.
* [ ] Add iterator API.
* [ ] Add typed error with request id.
* [ ] Add webhook verifier.
* [ ] Add Terraform provider dependency integration.

### Java

* [ ] Generate immutable models.
* [ ] Add builder params.
* [ ] Add `autoPagingIterable()`.
* [ ] Add webhook event class hierarchy.
* [ ] Add Spring Boot webhook example.

### .NET

* [ ] Generate models/options.
* [ ] Add async services.
* [ ] Add `IAsyncEnumerable<T>`.
* [ ] Add typed exceptions with request id.
* [ ] Add ASP.NET Core webhook example.

### React

* [ ] Implement `PillarProvider`.
* [ ] Implement client token flow.
* [ ] Implement `useHolding`, `useBalance`, `useTransferIntent`.
* [ ] Implement mutation hooks.
* [ ] Implement SSE event invalidation.
* [ ] Ensure no secret-key path exists.

### Postman

* [ ] Generate collection from OpenAPI.
* [ ] Add environment template.
* [ ] Add idempotency pre-request script.
* [ ] Add request id tests.
* [ ] Add webhook signature verification example.
* [ ] Add sandbox fixture folder.

### Terraform

* [ ] Implement provider schema.
* [ ] Implement API client config.
* [ ] Implement `pillar_asset`.
* [ ] Implement `pillar_webhook_endpoint`.
* [ ] Implement policy/config resources.
* [ ] Implement read-only holding/balance data sources.
* [ ] Add import support.
* [ ] Add timeouts/retry.
* [ ] Block live financial movement resources.

### Internal runtime

* [ ] Implement request audit table.
* [ ] Implement idempotency table.
* [ ] Implement command planner.
* [ ] Implement Canton Ledger API adapter.
* [ ] Implement completion watcher.
* [ ] Implement update stream consumer.
* [ ] Implement projection builder.
* [ ] Implement projection cursor.
* [ ] Implement event outbox.
* [ ] Implement webhook dispatcher.
* [ ] Implement ledger trace join.

### Compliance / operations

* [ ] Redaction policy.
* [ ] Key hashing and rotation.
* [ ] Webhook secret rotation.
* [ ] Audit export.
* [ ] Projection rebuild runbook.
* [ ] Webhook replay runbook.
* [ ] API version migration guide.
* [ ] SDK release matrix.
* [ ] Sandbox/live isolation tests.
* [ ] Workbench request/event/trace views.

[1]: https://docs.stripe.com/api?utm_source=chatgpt.com "Stripe API Reference"
[2]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[3]: https://docs.stripe.com/api/expanding_objects "docs.stripe.com"
[4]: https://docs.stripe.com/webhooks/signature?utm_source=chatgpt.com "Resolve webhook signature verification errors"
[5]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[6]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html "JSON Ledger API Service V2 — Digital Asset’s platform documentation"
[7]: https://spec.openapis.org/oas/v3.2.0.html "OpenAPI Specification v3.2.0"
[8]: https://developer.hashicorp.com/terraform/tutorials/providers-plugin-framework/providers-plugin-framework-provider "Implement a provider with the Terraform Plugin Framework | Terraform | HashiCorp Developer"
