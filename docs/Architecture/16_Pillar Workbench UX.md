# Executive Summary

## 공식 문서 리서치 요약 — 2026-05-26 기준

Stripe의 최신 개발자 경험은 **Workbench 중심**이다. Workbench는 API Explorer, Shell, event destination 관리, health insight를 제공하며, 요청 로그·이벤트·웹훅 delivery를 한 곳에서 디버깅하도록 설계되어 있다. Stripe 문서는 Workbench가 기존 Developers Dashboard를 대체하며, API keys, API versions, API requests, Webhooks 그래프를 통합한다고 설명한다. Stripe API는 resource-oriented REST, 표준 HTTP 상태 코드, 인증, verb, JSON/form 인코딩을 기반으로 하며, sandbox는 live data에 영향 없이 테스트하는 격리 환경이다. ([Stripe Docs][1])

Stripe의 API versioning은 **날짜 기반 버전**과 SDK/CLI pinning을 결합한다. 공식 문서상 현재 API 버전은 `2026-04-22.dahlia`이고, webhook event는 endpoint 생성 시 지정된 API version을 사용하거나 account default version을 사용한다. SDK는 각 라이브러리 릴리스 시점의 API version과 정렬되며, SDK는 semver를 사용한다. ([Stripe Docs][2])

Stripe idempotency는 Pillar가 그대로 모방해야 할 핵심 UX다. Stripe v1은 idempotency key별 최초 응답의 status/body를 저장하고 재시도 시 같은 결과를 반환하며, v2는 같은 account/sandbox·same API·30일 범위에서 POST/DELETE idempotency를 지원하고 실패 요청 재실행을 더 명시적으로 다룬다. ([Stripe Docs][3])

Stripe webhook UX는 Workbench·CLI·Dashboard가 결합된 운영 모델이다. Stripe는 HTTPS endpoint로 Event object JSON payload를 push하며, 개발자는 Stripe CLI로 로컬 webhook을 테스트한다. Endpoint 장애 시 자동 재전송이 최대 3일 지속되고, 미전달 이벤트는 event list API와 `delivery_success=false`로 수동 처리할 수 있다. CLI의 `events resend`는 최근 30일 event 재전송을 지원한다. Webhook signature 검증은 raw request body, signature header, endpoint secret 조합이 핵심이다. ([Stripe Docs][4])

Canton/Daml 쪽에서 가장 중요한 제약은 **Ledger API가 비동기 command/update 모델**이라는 점이다. 공식 문서는 application이 ledger state를 바꾸는 유일한 방법은 command이고, state change를 읽는 메커니즘은 event이며, command outcome은 제출 이후 completion/update stream을 통해 비동기로 알려진다고 설명한다. Command Submission Service는 command를 ledger에 제출하고, Command Completion Service는 completion status를 추적하며, Update Service와 State Service는 committed transaction·active contract state를 읽는다. ([Digital Asset Documentation][5])

Canton runtime은 participant, sequencer, mediator의 역할 분리가 핵심이다. Canton protocol은 smart contract validation과 ordering consensus를 분리하고, participant node는 party를 host하고 ACS를 유지하며 Ledger API를 제공한다. Participant는 Daml smart contract execution과 privacy/authorization model을 적용하고, 글로벌 ledger full copy가 아니라 party-specific local/private view를 유지한다. ([Canton Network Docs][6])

Canton party/user 모델도 Pillar UX에 직접 반영해야 한다. Parties는 Canton network 전체에서 unique하고 Daml code에서 사용되는 built-in concept이며, users는 participant-local이고 human-readable user ID를 가진다. 공식 문서는 party ID를 opaque identifier로 취급하고 format을 parse하지 말라고 명시한다. ([Digital Asset Documentation][7])

Canton Network Token Standard인 CIP-0056은 Pillar의 asset UX에 매우 중요하다. CIP-0056은 Final 상태의 Standards Track CIP이며, metadata, holdings, transfer instruction, allocation, allocation request, allocation instruction의 6개 API를 정의한다. 이 표준은 portfolio view, P2P/FOP transfer, DvP settlement를 지원하고, Canton의 UTXO/privacy architecture에 맞춰 설계되었다. DvP는 필요한 allocation이 모두 준비되면 하나의 Daml transaction으로 all-or-nothing settlement를 수행한다. ([GitHub][8])

Canton sandbox와 JSON Ledger API는 Pillar의 developer sandbox UX 기준점이다. Daml Sandbox는 single Participant Node와 Synchronizer Node로 Canton ledger를 실행하며, `dpm sandbox`로 로컬 in-memory Canton instance를 시작할 수 있다. JSON Ledger API는 HTTP/JSON으로 Ledger API 기능 대부분을 제공하고 OpenAPI/AsyncAPI 기반 client generation을 권장하지만, production에서는 JSON Ledger API를 인터넷에 직접 노출하지 말아야 한다. ([Digital Asset Documentation][9])

## 제품 결론

**Pillar Workbench는 “Stripe Workbench + Canton Ledger Trace Console + Tokenized Asset Operations Desk”** 로 설계한다.

핵심 UX 원칙은 다음이다.

1. 외부 사용자는 Canton contract, command, participant topology를 몰라도 된다.
2. 내부 운영자는 모든 external API request를 **intent → Canton command → completion → ledger update → projection → webhook delivery** 경로로 추적할 수 있어야 한다.
3. Workbench의 기본 탐색 단위는 contract가 아니라 **Balance / Holding / Intent / Settlement / Event** 다.
4. 모든 mutating API는 idempotency-first다.
5. 모든 async workflow는 webhook-first다.
6. API Explorer, SDK snippet, CLI generator는 모든 resource detail 화면에 붙는다.
7. Request replay와 webhook replay는 운영 기능이지만, sandbox-first, audit-required, permission-gated로 설계한다.
8. Ledger trace viewer는 Pillar의 차별화 기능이다. Stripe의 request/event log UX에 Canton의 command ID, submission ID, transaction/update ID, offset, trace ID를 결합한다.

---

# Goals / Non-goals

## Goals

| 목표                             | 설계 결정                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Stripe-grade external API      | REST/JSON, predictable object URLs, stable IDs, metadata, pagination, idempotency, API version pinning, webhook events             |
| Canton-invisible developer UX  | Public API에 contract ID, template ID, exercise choice 노출 금지                                                                        |
| Canton-native internal runtime | Internal command compiler는 Daml template/choice, Ledger API command/completion/update stream을 직접 다룸                                |
| Balance/Holding-first          | UX의 기본 화면은 Holdings/Balances. Raw contracts는 Ledger Trace advanced tab에서만 표시                                                       |
| Intent-first                   | Transfer, settlement, lock, redemption은 모두 intent object로 생성되고 ledger outcome은 async로 귀결                                           |
| Ledger-traceable operations    | 모든 API request는 request ID, idempotency key, intent ID, command ID, submission ID, workflow ID, update/transaction ID, offset으로 연결 |
| Webhook-first async workflow   | 상태 변경은 event object로 publish, endpoint별 delivery/retry/replay 관리                                                                   |
| Sandbox와 live의 API 경험 동일       | environment selector만 바뀌고 API path, SDK, CLI grammar는 동일                                                                           |
| 운영 가능한 Workbench               | replay, trace, health, logs, webhook delivery, request inspection을 한 UX에 통합                                                        |

## Non-goals

| 비목표                                             | 이유                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| Pillar DB를 ledger state의 source of truth로 사용    | 원칙 위반. DB는 projection/audit/config만 저장                                                  |
| Public API에서 Canton contract lifecycle 노출       | “Stripe for Canton-backed assets” 방향과 충돌                                                |
| Workbench에서 임의 Daml command authoring 허용        | 운영 위험. API Explorer는 Pillar API만 실행                                                     |
| 모든 Canton topology operation을 Workbench MVP에 포함 | Participants/Parties는 관리하되, sequencer/mediator topology deep admin은 별도 admin console 영역 |
| Ledger projection lag를 숨김                       | 오히려 모든 화면에 `ledger_offset`, `projection_lag`, `last_indexed_at` 표시                      |

---

# Architecture

## 1. Product Architecture

```text
External user / SDK / CLI / Workbench
        |
        v
Pillar Public API Gateway
  - auth
  - API version resolution
  - idempotency
  - request logging
  - validation
        |
        v
Intent Service
  - transfer_intent
  - settlement
  - lock
  - redemption
        |
        v
Canton Runtime Adapter
  - party resolver
  - participant router
  - command compiler
  - command submission
  - completion watcher
  - update/event indexer
        |
        v
Canton Ledger
  - source of truth
        |
        v
Projection + Audit + Config DB
  - holdings projection
  - balances projection
  - intent state
  - events
  - request logs
  - webhook delivery logs
  - ledger trace edges
        |
        v
Webhook Dispatcher / Workbench / Search
```

Canton Ledger API의 비동기 구조 때문에 Pillar의 external API는 “synchronous creation of intent, asynchronous fulfillment of ledger outcome” 구조여야 한다. 즉 `POST /transfer_intents`는 ledger finality를 보장하지 않고, `transfer_intent.created` 또는 `transfer_intent.processing` 상태를 반환한 뒤 completion/update stream 결과로 `succeeded`, `failed`, `expired` 같은 최종 상태를 projection한다. ([Digital Asset Documentation][5])

## 2. Workbench Information Architecture

왼쪽 navigation은 기능이 아니라 **운영 사고방식** 기준으로 묶는다.

| 그룹                | 화면                                                               |
| ----------------- | ---------------------------------------------------------------- |
| Home              | Overview, Search                                                 |
| Build             | Projects, Environments, API Keys, Templates, Files, Test Helpers |
| Identity / Access | Accounts, Participants, Parties, Capabilities                    |
| Assets            | Asset Classes, Assets, Holdings, Balances                        |
| Workflows         | Transfer Intents, Settlements, Locks, Redemptions                |
| Events / Webhooks | Events, Webhook Endpoints, Webhook Deliveries                    |
| Observability     | Request Logs, Ledger Trace, Health                               |
| Admin             | Settings                                                         |

상단 global shell은 항상 다음을 제공한다.

| 영역                   | 기능                                                                    |
| -------------------- | --------------------------------------------------------------------- |
| Project selector     | `project_id` 기준 scope 전환                                              |
| Environment selector | sandbox / test / staging / live                                       |
| API version badge    | 현재 Workbench 실행 version, endpoint default version                     |
| Search bar           | object ID, metadata, account, party alias, request ID, trace ID 검색    |
| Command palette      | `⌘K`: create transfer, open request log, replay webhook, generate CLI |
| Mode badge           | Sandbox / Live 강한 시각 구분                                               |
| Projection status    | latest ledger offset, indexing lag, webhook backlog                   |
| Quick tools          | API Explorer, CLI, Docs, Health, Logs                                 |

## 3. 공통 Detail 화면 패턴

모든 resource detail 화면은 동일한 layout을 쓴다.

```text
Header
  object id / status / livemode / created / updated / metadata quick view

Primary tabs
  Overview
  Activity
  Events
  Request logs
  Ledger trace
  Webhooks
  API
  Audit

Right action rail
  Copy ID
  Open in API Explorer
  Generate SDK snippet
  Generate CLI command
  Replay request      -- request log에서만
  Replay webhook      -- event/delivery에서만
  Open ledger trace
```

**중요:** `Ledger trace` tab은 모든 ledger-derived object에 붙인다. Holdings, Balances, Transfer Intents, Settlements, Locks, Redemptions, Events, Request Logs 모두 같은 trace graph로 이동해야 한다.

---

## 4. 화면별 UX 설계

| 화면                     | 목적                                                     | 주요 테이블 컬럼                                                                                                                            | 필터                                                                  | 상세 화면                                                                                              |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Overview**           | 현재 project/environment의 운영 상태 요약                       | KPI cards: API requests, failed requests, webhook failures, ledger lag, pending intents, settlement failures, balance projection lag | time range, environment, livemode, asset class                      | 최근 장애, top failed endpoints, webhook backlog, ledger offset timeline, “needs attention” list       |
| **Projects**           | 조직 내 product/workspace 분리                              | project ID, name, owner, environments, default API version, live enabled, health, created                                            | owner, live enabled, health, created range                          | project settings, environments, members, audit, default metadata schema                            |
| **Environments**       | sandbox/test/staging/live runtime 분리                   | env ID, mode, deployment model, API version, ledger connection, latest indexed offset, status, created                               | mode, status, deployment model, region                              | API keys, ledger endpoints, webhook endpoints, projection status, purge/reset controls for sandbox |
| **API Keys**           | secret/restricted/publishable key 관리                   | key ID, name, prefix, type, scopes, restricted IPs, last used, expires, rotated from                                                 | type, scope, last used, expired, restricted                         | one-time reveal, rotate, expire, restore, request logs by key, scope diff                          |
| **Accounts**           | 고객/법인/지갑/운영 계정 추상화                                     | account ID, name, type, status, default party, KYC/KYB status, balances count, created                                               | status, type, KYC/KYB, party, metadata                              | linked parties, holdings, balances, transfer intents, compliance notes, audit                      |
| **Participants**       | Canton participant 연결/hosting 상태 관리                    | participant ID, alias, endpoint, region, hosted parties, synchronizers, health, last seen                                            | health, region, synchronizer, hosting permission                    | Ledger API config, party hosting, health dump refs, offsets, trace/log links                       |
| **Parties**            | Canton party를 외부 account alias로 안전하게 매핑                | party alias, opaque party ID, account, participant, permission, primary user, status                                                 | account, participant, permission, status                            | account mapping, hosted participant, actAs/readAs policy, related holdings, ledger trace           |
| **Capabilities**       | runtime/asset/workflow 기능 플래그                          | capability code, name, status, asset classes, required packages, environments, version                                               | enabled, asset class, env, version                                  | requirements, dependencies, rollout, affected APIs                                                 |
| **Asset Classes**      | asset taxonomy와 token standard capability 정의           | asset class ID, symbol, name, type, decimals, registry, standard, transfer enabled, settlement enabled                               | type, standard, registry, capability                                | metadata, supported workflows, fee/precision policy, templates, assets                             |
| **Assets**             | 실제 발행 asset 또는 registry-backed asset 관리                | asset ID, class, issuer, registry, status, total supply projection, synchronizer, metadata                                           | asset class, issuer, status, synchronizer                           | metadata, supply projection, holdings, balances, events, registry capabilities                     |
| **Holdings**           | ledger-derived holding 단위 조회                           | holding ID, account/party, asset, quantity, available, locked, status, source offset, updated                                        | account, party, asset, status, locked, offset                       | holding movements, locks, source ledger event, token standard metadata, trace                      |
| **Balances**           | account/party/asset별 집계 view                           | balance ID, account/party, asset, available, locked, pending inbound, pending outbound, settled, ledger offset                       | account, party, asset, non-zero, stale, negative check              | balance breakdown, holdings list, pending intents, reconciliation, trace                           |
| **Transfer Intents**   | P2P/FOP transfer 의도 생성·추적                              | intent ID, from, to, asset, amount, status, idempotency key, deadline, created                                                       | status, asset, account, party, deadline, idempotency key            | timeline, validation, command submission, events, webhook deliveries, replay-safe API              |
| **Settlements**        | DvP/multi-leg settlement orchestration                 | settlement ID, type, legs, status, required allocations, ready count, deadline, created                                              | status, asset pair, party, account, deadline, failed reason         | legs, allocations, locks, execution command, all-or-nothing result, trace graph                    |
| **Locks**              | holding/balance lock lifecycle 관리                      | lock ID, account/party, asset, amount, reason, status, expires, settlement/intent                                                    | status, reason, asset, expires, account                             | lock context, source holding, release/consume path, settlement links, trace                        |
| **Redemptions**        | off-ledger redemption / withdrawal workflow            | redemption ID, account, asset, amount, destination type, status, provider, created                                                   | status, asset, provider, destination type, account                  | compliance checks, external destination, ledger burn/redeem command, webhook history               |
| **Events**             | Pillar event object 조회                                 | event ID, type, resource, API version, created, delivery success, pending webhooks                                                   | event type, resource ID, delivery success, API version              | event payload, thin/snapshot mode, related requests, deliveries, replay                            |
| **Webhook Endpoints**  | endpoint config, signing secret, event subscription 관리 | endpoint ID, URL, enabled events, status, API version, secret age, failure rate                                                      | status, event type, API version, failing                            | endpoint config, secret rotation, recent deliveries, test event, replay event                      |
| **Webhook Deliveries** | endpoint별 delivery attempt 관찰                          | delivery ID, event ID, endpoint, status, attempts, response code, latency, next retry                                                | status, endpoint, event type, response code, attempt count          | request/response headers, payload hash, retry schedule, replay delivery                            |
| **Request Logs**       | 모든 API request inspection                              | request ID, method, path, status, API key, source, idempotency key, resource, latency, version                                       | status, method, endpoint, API key, resource ID, idempotency, source | request body, response body, headers, auth context, replay, trace                                  |
| **Ledger Trace**       | external request부터 Canton ledger outcome까지 graph 추적    | trace ID, request ID, intent ID, command ID, submission ID, update/transaction ID, offset, status                                    | object ID, command ID, transaction ID, offset, party, status        | DAG viewer, raw IDs, spans/log links, projection edges, webhook edges                              |
| **Templates**          | prebuilt workflow/API payload templates                | template ID, name, type, version, asset class, active, owner, updated                                                                | type, asset class, active, owner                                    | payload schema, example values, SDK/CLI generation, sandbox run                                    |
| **Files**              | evidence, reports, generated artifacts 저장              | file ID, name, type, size, linked resource, status, uploaded by, created                                                             | type, resource, uploader, status                                    | preview, signed download, virus scan, linked audit/resource                                        |
| **Search**             | 전역 object/resource lookup                              | result type, ID, title, snippet, project, environment, updated                                                                       | object type, environment, date, status                              | result deep-link, saved query, export                                                              |
| **Test Helpers**       | sandbox-only scenario generation                       | helper ID, scenario, target resource, last run, status, created objects                                                              | scenario, asset, status, environment                                | run helper, generated objects, cleanup, generated CLI/SDK                                          |
| **Health**             | platform + ledger + webhook + projection health        | component, status, region, lag, error rate, last check, owner                                                                        | component, status, region, severity                                 | component diagnostics, logs, trace samples, runbook                                                |
| **Settings**           | org/project/env-wide config                            | category, setting, value, scope, updated by, updated at                                                                              | category, scope, changed recently                                   | API version default, retention, RBAC, webhook retry policy, ledger config, audit export            |

---

## 5. API Explorer

API Explorer는 Workbench의 핵심 개발자 도구다.

| 영역                   | 설계                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Endpoint tree        | `/v1/accounts`, `/v1/assets`, `/v1/transfer_intents`, `/v1/settlements`, `/v1/webhook_endpoints`, `/v1/events` |
| Environment binding  | 선택된 environment의 base URL, API key, API version 자동 반영                                                          |
| Auth panel           | secret key 선택, restricted key scope 표시, live mode warning                                                      |
| Header panel         | `Pillar-Version`, `Idempotency-Key`, `Pillar-Account`, `Pillar-Environment`                                    |
| Body builder         | schema-driven form + raw JSON editor                                                                           |
| Response pane        | status, headers, body, request ID, created resource                                                            |
| Side effects preview | mutating API는 “creates intent”, “submits command”, “emits event”를 사전 표시                                        |
| Run modes            | sandbox run, dry-run, live run with confirmation                                                               |
| Output               | SDK snippet, CLI command, cURL, saved template                                                                 |
| Trace                | 실행 후 request log와 ledger trace 자동 링크                                                                           |

API Explorer는 Canton JSON Ledger API Explorer가 아니다. Pillar Public API만 실행한다. Canton Ledger API는 내부 runtime tool이며, trace viewer에서만 운영자가 관찰한다.

---

## 6. SDK Snippet Generator

지원 언어는 1차로 **Node.js / Python / Go / Java**. 이후 .NET, Ruby를 추가한다.

Snippet은 다음을 항상 포함한다.

```ts
const pillar = new Pillar(process.env.PILLAR_SECRET_KEY, {
  apiVersion: "2026-05-26",
});

const transferIntent = await pillar.transferIntents.create({
  from_account: "acct_...",
  to_account: "acct_...",
  asset: "ast_...",
  amount: "100.00",
  metadata: {
    order_id: "ord_123",
  },
}, {
  idempotencyKey: "0f1f5f5e-...",
});
```

생성 규칙:

| 항목              | 규칙                                                                |
| --------------- | ----------------------------------------------------------------- |
| API version     | Workbench-selected version을 snippet에 고정                           |
| Idempotency     | 모든 POST/DELETE snippet에 포함                                        |
| Metadata        | user-provided key-value 예제 포함                                     |
| Expand/include  | 무거운 subresource는 `include[]`로 선택                                  |
| Webhook handler | event type별 switch, signature verification, duplicate event 방어 포함 |
| Error handling  | `request_id`, `idempotency_key`, `object_id`, `retryable` 표시      |

---

## 7. CLI Command Generator

Workbench의 모든 create/update/action 화면은 CLI command를 생성한다.

```bash
pillar transfer-intents create \
  --from-account acct_123 \
  --to-account acct_456 \
  --asset ast_usdc \
  --amount 100.00 \
  --idempotency-key 0f1f5f5e-...

pillar transfer-intents confirm tint_123

pillar settlements retrieve stl_123 --include legs,allocations

pillar events resend evt_123 --webhook-endpoint we_123

pillar logs tail --status failed --endpoint /v1/transfer_intents

pillar ledger trace req_123
```

CLI는 Stripe CLI처럼 object CRUD, request log tail, webhook listen/replay, event trigger/test helper를 지원한다. Stripe CLI가 API object CRUD, real-time request log tail, webhook local testing을 지원하는 점을 Pillar CLI의 직접 벤치마크로 삼는다. ([Stripe Docs][10])

---

## 8. Request Replay

Request replay는 **Request Logs detail**에서만 제공한다.

| 모드                | 설명                                              | 안전장치                             |
| ----------------- | ----------------------------------------------- | -------------------------------- |
| Replay exact      | 같은 method/path/body/header/idempotency key로 재시도 | 원 요청이 idempotent window 내에 있을 때만 |
| Clone and edit    | body/header 수정 후 새 request 실행                   | 새 idempotency key 자동 생성          |
| Replay in sandbox | live request를 sandbox data로 변환해 테스트             | live secret/data 사용 금지           |
| Dry-run           | validation과 command compile만 수행                 | ledger submit 없음                 |

Replay UX는 다음을 강제한다.

1. Live mutating replay는 `Admin` 또는 `Developer + elevated` 권한 필요.
2. 같은 idempotency key를 쓸지, 새 key를 만들지 명시해야 한다.
3. Replay 결과는 새 `req_`를 생성하되 `replayed_from_request_id`를 저장한다.
4. Ledger command가 이미 성공한 request는 “new side effect 가능성” 경고를 띄운다.
5. Workbench replay는 audit event를 반드시 남긴다.

---

## 9. Webhook Replay

Webhook replay는 **Events** 또는 **Webhook Deliveries**에서 제공한다.

| 기능                       | 설계                                                        |
| ------------------------ | --------------------------------------------------------- |
| Replay event             | 특정 `evt_`를 endpoint 하나 또는 전체 endpoint에 재전송                |
| Replay failed deliveries | 실패한 `wdel_`만 선택 재전송                                       |
| Test event               | endpoint config 화면에서 synthetic event 전송                   |
| Payload version          | event 생성 시점의 API version payload 유지                       |
| Signature                | 현재 endpoint secret으로 새 signature 생성                       |
| Delivery identity        | 새 `wdel_` 생성, 원 delivery는 `replayed_from_delivery_id`로 연결 |
| Audit                    | actor, reason, endpoint, event, payload hash 저장           |

Stripe CLI의 `events resend`가 최근 event를 webhook endpoint로 다시 전송하는 방식을 참고하되, Pillar는 ledger-backed asset workflow 특성상 replay reason, actor, payload hash, endpoint secret version을 더 강하게 audit한다. ([Stripe Docs][11])

---

## 10. Ledger Trace Viewer

Ledger Trace Viewer는 Pillar의 핵심 차별화 기능이다.

```text
req_123
  |
  +-- idempotency_key: 0f1...
  |
  +-- transfer_intent tint_123
        |
        +-- internal command cmd_abc
              |
              +-- Canton command_id
              +-- Canton submission_id
              +-- Canton workflow_id
              |
              +-- completion: OK / FAILED
                    |
                    +-- update_id / transaction_id
                    +-- ledger offset
                    +-- created/archived/exercised events
                          |
                          +-- holding_projection hld_...
                          +-- balance_projection bal_...
                          +-- pillar event evt_...
                                |
                                +-- webhook delivery wdel_...
```

Viewer tabs:

| Tab          | 내용                                                                    |
| ------------ | --------------------------------------------------------------------- |
| Graph        | request → intent → command → ledger update → projection → webhook DAG |
| Timeline     | wall-clock timestamp와 ledger offset을 함께 표시                            |
| Canton IDs   | command ID, submission ID, workflow ID, update/transaction ID, offset |
| Projection   | 어떤 ledger event가 어떤 Pillar object를 갱신했는지                              |
| Logs         | app trace ID, runtime span, participant log link                      |
| Raw advanced | 권한 있는 운영자만 redacted Canton event/contract metadata 확인                 |

Digital Asset의 observability 문서는 command ID, ledger offset, transaction ID, submission ID, trace ID를 함께 사용해 distributed operation을 추적하고, Tempo/logs와 연결하는 방식을 설명한다. Pillar Ledger Trace는 이 방식을 productized UI로 만든다. ([Digital Asset Documentation][12])

---

# API / Object Model

## 1. Public Object ID Prefix

| Object           | Prefix    |
| ---------------- | --------- |
| Project          | `prj_`    |
| Environment      | `env_`    |
| API Key          | `key_`    |
| Account          | `acct_`   |
| Participant      | `part_`   |
| Party            | `pty_`    |
| Capability       | `cap_`    |
| Asset Class      | `aclass_` |
| Asset            | `ast_`    |
| Holding          | `hld_`    |
| Balance          | `bal_`    |
| Transfer Intent  | `tint_`   |
| Settlement       | `stl_`    |
| Lock             | `lock_`   |
| Redemption       | `red_`    |
| Event            | `evt_`    |
| Webhook Endpoint | `we_`     |
| Webhook Delivery | `wdel_`   |
| Request Log      | `req_`    |
| Ledger Trace     | `ltr_`    |
| Template         | `tmpl_`   |
| File             | `file_`   |

Canton party IDs, contract IDs, template IDs는 public API object ID로 쓰지 않는다. Party ID는 opaque internal mapping으로만 유지한다.

## 2. Common Object Shape

```json
{
  "id": "tint_123",
  "object": "transfer_intent",
  "livemode": false,
  "status": "processing",
  "created": "2026-05-26T10:12:30Z",
  "updated": "2026-05-26T10:12:31Z",
  "metadata": {
    "order_id": "ord_123"
  }
}
```

## 3. Common API Grammar

| Grammar     | Pillar 설계                                             |
| ----------- | ----------------------------------------------------- |
| List        | `GET /v1/{resources}?limit=20&starting_after=...`     |
| Retrieve    | `GET /v1/{resources}/{id}`                            |
| Create      | `POST /v1/{resources}`                                |
| Update      | `POST /v1/{resources}/{id}`                           |
| Action      | `POST /v1/{resources}/{id}/{action}`                  |
| Cancel      | `POST /v1/{resources}/{id}/cancel`                    |
| Include     | `include[]=ledger_trace&include[]=webhook_deliveries` |
| Metadata    | 모든 mutable business object에 `metadata` 지원             |
| Version     | `Pillar-Version: 2026-05-26`                          |
| Idempotency | `Idempotency-Key: <uuid>`                             |
| Request ID  | 모든 response header에 `Request-Id: req_...`             |
| Pagination  | cursor-based, stable ordering by `created desc`       |

## 4. Core Endpoints

```text
POST   /v1/accounts
GET    /v1/accounts/{id}
GET    /v1/accounts/{id}/balances
GET    /v1/accounts/{id}/holdings

POST   /v1/asset_classes
GET    /v1/asset_classes
POST   /v1/assets
GET    /v1/assets/{id}

POST   /v1/transfer_intents
POST   /v1/transfer_intents/{id}/confirm
POST   /v1/transfer_intents/{id}/cancel
GET    /v1/transfer_intents/{id}

POST   /v1/settlements
POST   /v1/settlements/{id}/confirm
POST   /v1/settlements/{id}/cancel
GET    /v1/settlements/{id}

POST   /v1/locks
POST   /v1/locks/{id}/release
GET    /v1/locks/{id}

POST   /v1/redemptions
POST   /v1/redemptions/{id}/cancel
GET    /v1/redemptions/{id}

GET    /v1/events
GET    /v1/events/{id}
POST   /v1/events/{id}/replay

POST   /v1/webhook_endpoints
POST   /v1/webhook_endpoints/{id}
POST   /v1/webhook_endpoints/{id}/rotate_secret
GET    /v1/webhook_deliveries

GET    /v1/request_logs
GET    /v1/request_logs/{id}
POST   /v1/request_logs/{id}/replay

GET    /v1/ledger_traces/{id}
```

## 5. State Machines

### Transfer Intent

```text
requires_confirmation
  -> queued
  -> submitted
  -> processing
  -> succeeded
  -> failed
  -> canceled
  -> expired
```

### Settlement

```text
draft
  -> requires_allocations
  -> allocating
  -> ready
  -> submitted
  -> settling
  -> settled
  -> failed
  -> expired
  -> canceled
```

### Lock

```text
active
  -> consumed
  -> released
  -> expired
  -> failed
```

### Redemption

```text
requires_approval
  -> queued
  -> submitted
  -> processing
  -> completed
  -> failed
  -> canceled
```

### Webhook Delivery

```text
pending
  -> delivering
  -> delivered
  -> retry_scheduled
  -> failed
```

## 6. Event Types

```text
account.created
account.updated

asset.created
asset.updated

holding.created
holding.updated
holding.locked
holding.released

balance.updated

transfer_intent.created
transfer_intent.processing
transfer_intent.succeeded
transfer_intent.failed
transfer_intent.canceled
transfer_intent.expired

settlement.created
settlement.requires_allocations
settlement.ready
settlement.settled
settlement.failed
settlement.expired

lock.created
lock.released
lock.consumed
lock.expired

redemption.created
redemption.processing
redemption.completed
redemption.failed

webhook_endpoint.created
webhook_endpoint.updated

request.failed
projection.lagged
ledger_trace.completed
```

Webhook event payload는 default로 thin event를 권장한다.

```json
{
  "id": "evt_123",
  "object": "event",
  "type": "transfer_intent.succeeded",
  "api_version": "2026-05-26",
  "created": "2026-05-26T10:13:00Z",
  "data": {
    "object": {
      "id": "tint_123",
      "object": "transfer_intent"
    }
  },
  "request": {
    "id": "req_123",
    "idempotency_key": "0f1f..."
  }
}
```

---

# Internal Runtime

## 1. Core Services

| Service                | 책임                                                              |
| ---------------------- | --------------------------------------------------------------- |
| API Gateway            | auth, API version, request validation, request logs             |
| Idempotency Service    | mutating request deduplication, replay semantics                |
| Intent Service         | external object state machine                                   |
| Account/Party Resolver | `acct_` → party alias → opaque Canton party ID                  |
| Participant Router     | party hosting, participant endpoint, synchronizer strategy      |
| Command Compiler       | intent를 Daml command/create/exercise로 변환                        |
| Command Dispatcher     | Ledger API command submission                                   |
| Completion Watcher     | command completion correlation                                  |
| Ledger Indexer         | Update Service/State Service에서 events/ACS indexing              |
| Projection Engine      | holdings, balances, intents, events projection                  |
| Event Outbox           | internal event 생성, webhook enqueue                              |
| Webhook Dispatcher     | signing, retry, delivery logging                                |
| Trace Correlator       | request/intent/command/update/projection/webhook edge 생성        |
| Search Indexer         | object ID, metadata, request, event, trace search               |
| Health Monitor         | ledger lag, completion lag, webhook backlog, participant health |

## 2. Canton Command Correlation

Pillar는 모든 ledger-changing request에 다음 correlation IDs를 생성한다.

| ID                         | 출처                  | 용도                                     |
| -------------------------- | ------------------- | -------------------------------------- |
| `req_id`                   | API Gateway         | external request trace                 |
| `idempotency_key`          | client or generated | safe retry                             |
| `intent_id`                | Intent Service      | business state machine                 |
| `command_id`               | Command Compiler    | Canton completion correlation          |
| `submission_id`            | Command Dispatcher  | submission-specific correlation        |
| `workflow_id`              | Intent Service      | multi-transaction workflow correlation |
| `trace_id`                 | runtime             | distributed tracing                    |
| `update_id/transaction_id` | Canton Ledger API   | ledger result                          |
| `offset`                   | Canton Ledger API   | projection ordering                    |

Canton Ledger API는 change ID를 submitting parties, user ID, command ID로 식별하고, submission ID, command ID, workflow ID 같은 application-specific ID를 completion/update correlation에 사용할 수 있다. ([Digital Asset Documentation][5])

## 3. Projection Rules

| Projection         | Source                                         | Rule                                             |
| ------------------ | ---------------------------------------------- | ------------------------------------------------ |
| Holdings           | ledger active contracts / token holding events | latest offset 기준으로 active quantity 계산            |
| Balances           | holdings + locks + pending intents             | account/party/asset별 available/locked/pending 집계 |
| Intent state       | command completion + ledger update             | ledger outcome 우선, API state는 보조                 |
| Events             | projection state transition                    | exactly-once outbox key로 생성                      |
| Request logs       | API Gateway                                    | immutable audit                                  |
| Webhook deliveries | dispatcher attempts                            | endpoint별 independent retry state                |
| Trace              | all services                                   | edge append-only                                 |

Projection은 stale할 수 있다. 따라서 모든 projection object는 다음을 가진다.

```json
{
  "ledger_offset": "000000000000000088",
  "projected_at": "2026-05-26T10:13:00Z",
  "projection_status": "current"
}
```

---

# DB Schema

원칙: **Pillar DB는 Projection / Audit / Config만 저장한다.** Ledger-derived 값은 source of truth가 아니며, 항상 `ledger_offset`, `source_update_id`, `projection_version`을 가진다.

## 1. Config Tables

```text
organizations
  id, name, status, created_at

projects
  id, org_id, name, default_api_version, live_enabled, created_at

environments
  id, project_id, mode, deployment_model, api_version,
  ledger_connection_id, latest_indexed_offset, status, created_at

api_keys
  id, env_id, name, key_hash, key_prefix, type, scopes,
  restricted_ips, expires_at, rotated_from_id, last_used_at, created_at

webhook_endpoints
  id, env_id, url, enabled_events, api_version, status,
  secret_hash, secret_version, created_at, updated_at

settings
  id, scope_type, scope_id, key, value_json, updated_by, updated_at
```

## 2. Identity / Mapping Tables

```text
accounts
  id, env_id, type, name, status, compliance_status,
  default_party_id, metadata_json, created_at, updated_at

participants
  id, env_id, alias, endpoint_ref, region, status,
  latest_health_json, created_at, updated_at

parties
  id, env_id, account_id, participant_id, party_alias,
  canton_party_id_encrypted, permission, status,
  metadata_json, created_at, updated_at

capabilities
  id, env_id, code, status, required_packages_json,
  supported_asset_classes_json, version, created_at
```

## 3. Asset Projection Tables

```text
asset_classes
  id, env_id, symbol, name, type, decimals, standard,
  registry_party_id, metadata_json, status, created_at

assets
  id, env_id, asset_class_id, issuer_account_id, registry_party_id,
  status, total_supply_projected, synchronizer_id, metadata_json,
  ledger_offset, projected_at

holding_projections
  id, env_id, account_id, party_id, asset_id,
  quantity, available_quantity, locked_quantity, status,
  source_contract_hash, source_update_id, ledger_offset, projected_at

balance_projections
  id, env_id, account_id, party_id, asset_id,
  available, locked, pending_inbound, pending_outbound, settled,
  ledger_offset, projected_at
```

`source_contract_hash`는 debugging과 reconciliation용이다. Public API에는 contract ID를 노출하지 않는다.

## 4. Workflow Tables

```text
transfer_intents
  id, env_id, from_account_id, to_account_id, asset_id, amount,
  status, deadline_at, idempotency_record_id, command_id,
  failure_code, metadata_json, ledger_offset, created_at, updated_at

settlements
  id, env_id, type, status, deadline_at, command_id,
  failure_code, metadata_json, ledger_offset, created_at, updated_at

settlement_legs
  id, settlement_id, leg_type, from_account_id, to_account_id,
  asset_id, amount, allocation_status, lock_id, created_at

locks
  id, env_id, account_id, party_id, asset_id, amount,
  status, reason, expires_at, source_holding_id,
  settlement_id, transfer_intent_id, ledger_offset, created_at

redemptions
  id, env_id, account_id, asset_id, amount, destination_json,
  status, provider_ref, command_id, failure_code,
  metadata_json, ledger_offset, created_at
```

## 5. Audit / Observability Tables

```text
request_logs
  id, env_id, api_key_id, actor_id, source,
  method, path, status_code, request_headers_redacted,
  request_body_redacted, response_body_redacted,
  idempotency_key, resource_type, resource_id,
  api_version, latency_ms, ip_address, user_agent,
  replayed_from_request_id, created_at

idempotency_records
  id, env_id, scope_hash, idempotency_key,
  method, path, request_fingerprint,
  first_request_id, status, response_fingerprint,
  expires_at, created_at

ledger_commands
  id, env_id, intent_type, intent_id,
  command_id, submission_id, workflow_id,
  act_as_party_ids, participant_id, status,
  submitted_at, completed_at, completion_status_json

ledger_updates
  id, env_id, update_id, transaction_id, offset,
  workflow_id, command_id, participant_id,
  event_count, redacted_payload_hash, observed_at

ledger_trace_edges
  id, env_id, trace_id, from_type, from_id,
  to_type, to_id, edge_type, created_at

events
  id, env_id, type, resource_type, resource_id,
  api_version, payload_json, request_id,
  ledger_update_id, created_at

webhook_deliveries
  id, env_id, event_id, endpoint_id, status,
  attempt_count, last_response_code, last_response_body_redacted,
  next_retry_at, latency_ms, replayed_from_delivery_id, created_at
```

---

# Failure Modes

| Failure mode                              | 원인                                                                  | Workbench UX                                                     | Runtime 대응                                                                |
| ----------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Request accepted but ledger command fails | authorization, contract visibility, invalid state, expired deadline | Transfer/Settlement detail에 `failed`와 Canton completion error 표시 | completion watcher가 intent state 갱신, event emit                           |
| Projection lag                            | indexer delay, participant unavailable                              | Overview/Health에 `projection_lag` 경고                             | backfill, offset checkpoint, lag alert                                    |
| Duplicate API request                     | client retry, network timeout                                       | Request Logs에서 same idempotency key grouping                     | idempotency record로 same response 또는 safe replay                          |
| Idempotency conflict                      | same key + different body                                           | 409 error, original request link                                 | request fingerprint 비교                                                    |
| Webhook endpoint down                     | 5xx/timeout                                                         | Webhook Deliveries retry timeline                                | exponential backoff, replay support                                       |
| Webhook duplicate processing by customer  | customer endpoint retry race                                        | docs/snippet에 event ID dedupe code 제공                            | delivery ID/event ID stable                                               |
| Settlement cannot execute                 | missing allocation, expired lock, synchronizer mismatch             | Settlement detail에 missing legs 표시                               | deadline handling, partial lock release                                   |
| Party mapping invalid                     | account-party unlinked, participant missing party                   | Accounts/Parties detail warning                                  | resolver validation before command compile                                |
| Participant unavailable                   | Ledger API failure                                                  | Participants/Health red                                          | command queue pause, failover if configured                               |
| Canton privacy visibility mismatch        | participant lacks required UTXO/contract                            | Ledger Trace advanced에 visibility error                          | route to correct participant, off-ledger registry API fetch if applicable |
| API version mismatch                      | old SDK/webhook endpoint                                            | Request Log에 version badge, upgrade suggestion                   | versioned serializers                                                     |
| Live/sandbox confusion                    | wrong environment key                                               | strong UI mode badge, key prefix                                 | environment-scoped keys, no cross-env IDs                                 |
| Request replay causes unintended action   | operator misuse                                                     | replay confirmation + diff + new idempotency key default         | permission gate, audit                                                    |
| Webhook signature verification failure    | wrong secret, mutated body                                          | Delivery detail에 signature docs and raw payload hash             | signing secret versioning, raw body preservation                          |
| Ledger trace incomplete                   | log retention/pruning/projection gap                                | trace node marked “missing due to retention/pruning”             | retain trace edges independent of raw payload                             |

Canton Token Standard의 DvP settlement는 필요한 allocation이 모두 준비된 뒤 하나의 Daml transaction으로 all-or-nothing 실행되는 구조이므로, deadline expiry, allocation absence, synchronizer/UTXO access 문제는 Settlements UX의 최우선 failure mode다. CIP-0056은 settlement transaction의 input contracts가 같은 synchronizer에 assigned되어야 한다고 설명한다. ([GitHub][8])

---

# Security / Compliance

## 1. API Key Security

| 기능                    | 설계                                                            |
| --------------------- | ------------------------------------------------------------- |
| Secret storage        | key hash만 저장, secret은 one-time reveal                         |
| Key types             | secret, restricted, publishable, CLI-generated                |
| Scopes                | resource/action 단위: `transfer_intents:write`, `balances:read` |
| Environment isolation | sandbox key로 live 접근 불가                                       |
| Rotation              | immediate or scheduled rotation                               |
| Last used             | request log와 연결                                               |
| IP allowlist          | restricted key에 적용                                            |
| Expiry                | key-level expiry 지원                                           |

Stripe API key UX처럼 rotate, expire, request logs by key를 제공한다. ([Stripe Docs][13])

## 2. Webhook Security

| 항목                 | 설계                                      |
| ------------------ | --------------------------------------- |
| Signature          | `Pillar-Signature` HMAC                 |
| Raw body           | signature verification은 raw body 기준     |
| Secret rotation    | active + previous secret grace period   |
| Replay attack 방지   | timestamp tolerance, event ID dedupe 권장 |
| Delivery audit     | payload hash, response code, latency 저장 |
| Endpoint ownership | create/update 권한 분리                     |

Webhook signature verification에서 raw body mutation이 실패 원인이 되는 점은 Stripe 공식 문서와 동일하게 Pillar docs/snippet에 강하게 반영한다. ([Stripe Docs][14])

## 3. Ledger API / Canton Runtime Security

| 항목                    | 설계                                               |
| --------------------- | ------------------------------------------------ |
| Ledger API exposure   | public internet 노출 금지. Pillar runtime 내부망에서만 접근  |
| Auth                  | JWT/mTLS, participant별 credential vault          |
| Party authorization   | account-party mapping과 actAs/readAs 정책 분리        |
| Canton IDs            | public API에 raw party/contract/template ID 노출 금지 |
| External signing      | future option: interactive submission flow       |
| Participant isolation | environment별 participant routing                 |
| Raw payload retention | 최소화, redaction, hash-first audit                 |

Digital Asset 문서는 JSON Ledger API request가 access token을 포함해야 하며, production에서는 JSON Ledger API를 인터넷에 직접 노출하지 말고 reverse proxy 뒤에 두어야 한다고 설명한다. Pillar는 더 강하게 public API와 Ledger API를 분리한다. ([Digital Asset Documentation][15])

## 4. Compliance Controls

| 영역                    | 설계                                                           |
| --------------------- | ------------------------------------------------------------ |
| Accounts              | KYC/KYB/compliance status field                              |
| Transfers             | policy hook before command compile                           |
| Redemptions           | destination verification, approval workflow                  |
| Audit                 | request, replay, webhook replay, settings change append-only |
| Data retention        | raw request/response retention configurable                  |
| PII                   | metadata PII warning, redaction rules                        |
| Live elevated actions | 4-eyes approval option                                       |
| Evidence files        | linked files, immutable hash, scan status                    |

---

# Implementation Plan

## Phase 0 — Product/API Grammar Freeze

**목표:** Stripe-grade external grammar 확정.

Deliverables:

* Object prefix registry
* API version policy
* idempotency semantics
* pagination/include/error format
* webhook event envelope
* SDK/CLI command grammar
* Workbench IA wireframe

Definition of done:

* `POST /transfer_intents`, `GET /balances`, `GET /events`, `POST /webhook_endpoints` OpenAPI 초안 완료
* error object와 request ID 규격 완료
* sandbox/live environment model 확정

## Phase 1 — Core Workbench Shell + Logs

**목표:** 개발자가 API를 실행하고 요청을 볼 수 있는 최소 Workbench.

Deliverables:

* Overview
* Projects
* Environments
* API Keys
* Request Logs
* API Explorer
* SDK snippet generator v0
* CLI generator v0
* idempotency store

Definition of done:

* API Explorer에서 sandbox request 실행
* 모든 request가 `req_`로 기록
* request log detail에서 snippet/CLI 생성

## Phase 2 — Canton Runtime + Projection

**목표:** Ledger source of truth와 Workbench projection 연결.

Deliverables:

* Participant Router
* Party Resolver
* Command Compiler
* Command Dispatcher
* Completion Watcher
* Ledger Indexer
* Holdings/Balances Projection
* Ledger Trace v0

Definition of done:

* ledger command → completion → update → projection → trace graph 연결
* Holdings/Balances 화면에 `ledger_offset` 표시
* projection lag health check

## Phase 3 — Asset Workflows

**목표:** Balance/Holding-first asset operations 완성.

Deliverables:

* Asset Classes
* Assets
* Holdings
* Balances
* Transfer Intents
* Settlements
* Locks
* Redemptions

Definition of done:

* transfer intent 생성 후 async succeeded/failed lifecycle
* DvP settlement legs/allocation 상태 UI
* lock/release/consume lifecycle
* redemption approval + ledger action path

## Phase 4 — Webhooks + Replay

**목표:** webhook-first async workflow 완성.

Deliverables:

* Events
* Webhook Endpoints
* Webhook Deliveries
* webhook signing
* retry scheduler
* webhook replay
* request replay
* CLI `listen`, `events resend`, `logs tail`

Definition of done:

* event generated exactly once per state transition
* failed delivery retry/replay 가능
* webhook handler snippets generated

## Phase 5 — Developer Productivity

**목표:** Stripe-like 개발자 경험 완성.

Deliverables:

* Templates
* Files
* Search
* Test Helpers
* sandbox scenario runner
* docs integration
* saved API Explorer requests

Definition of done:

* template에서 SDK/CLI/API Explorer payload 생성
* sandbox에서 synthetic account/asset/holding/transfer 생성
* global search로 object/request/event/trace lookup

## Phase 6 — Enterprise Operations

**목표:** production-grade 운영, 보안, compliance.

Deliverables:

* Health deep diagnostics
* RBAC/elevated action approval
* audit export
* retention policy
* participant health runbooks
* ledger trace log integration
* webhook secret rotation policy
* API version upgrade assistant

Definition of done:

* live environment에서 all elevated actions audited
* API version upgrade test report
* projection/reconciliation dashboard
* compliance evidence export

---

# Open Questions

| 질문                                                                                            | 영향                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Pillar가 자체 Daml asset registry를 운영하는가, 아니면 외부 registries의 Token Standard API를 aggregate하는가?   | Asset Classes, Registry, Capabilities 설계      |
| External signing을 MVP에 포함하는가?                                                                 | Parties, Participants, command preparation UX |
| DvP settlement는 Global Synchronizer 우선인가, private synchronizer도 first-class인가?                | Settlement feasibility, synchronizer routing  |
| Account와 Party의 cardinality는 1:1, 1:N, N:N 중 무엇인가?                                            | Accounts/Parties UX, RBAC                     |
| Holdings API는 Canton Token Standard를 그대로 따르는가, Pillar canonical holding projection을 별도 정의하는가? | Assets/Holdings/Balances API                  |
| Redemption은 on-ledger burn만 의미하는가, off-ledger rail까지 포함하는가?                                   | Redemptions object model                      |
| API version upgrade는 project 단위인가 environment 단위인가?                                           | Workbench versioning UX                       |
| Webhook event payload는 thin-only인가, snapshot option도 제공하는가?                                   | event storage, replay semantics               |
| Request replay 보존 기간은 얼마인가?                                                                   | audit retention, compliance cost              |
| Raw ledger event payload를 DB에 저장할 수 있는가, 아니면 hash/refetch-only인가?                             | privacy/compliance posture                    |
| Test Helpers는 sandbox 전용인가 staging에서도 허용되는가?                                                  | safety UX                                     |
| Capabilities taxonomy는 product feature flag인가, ledger package capability인가, 둘 다인가?            | Capabilities screen semantics                 |

---

# Agent-ready Checklist

## UX / IA

* [ ] Left navigation group을 Home / Build / Identity / Assets / Workflows / Events / Observability / Admin으로 구성한다.
* [ ] 모든 화면에 project/environment selector를 적용한다.
* [ ] live mode badge와 destructive action confirmation을 전역 컴포넌트화한다.
* [ ] 모든 detail 화면에 Activity, Events, Request logs, Ledger trace, API, Audit tab을 공통 적용한다.
* [ ] Holdings/Balances 화면을 Assets 그룹의 기본 landing으로 만든다.

## API

* [ ] Object ID prefix registry를 코드 상수로 정의한다.
* [ ] 모든 response에 `id`, `object`, `livemode`, `created`, `metadata`를 포함한다.
* [ ] 모든 mutating endpoint에 `Idempotency-Key` 처리를 적용한다.
* [ ] 모든 response header에 `Request-Id`를 반환한다.
* [ ] `Pillar-Version` header와 environment default API version resolution을 구현한다.
* [ ] Webhook event envelope를 고정한다.
* [ ] Error object에 `type`, `code`, `message`, `request_id`, `resource_id`, `retryable`을 포함한다.

## Runtime

* [ ] `req_id → intent_id → command_id → submission_id → update_id/transaction_id → offset` correlation을 강제한다.
* [ ] Command Compiler는 public object만 입력받고 Canton IDs는 resolver에서만 사용한다.
* [ ] Completion Watcher와 Ledger Indexer를 분리한다.
* [ ] Projection Engine은 offset-ordered, idempotent upsert로 구현한다.
* [ ] Event Outbox는 state transition 기준으로 exactly-once key를 사용한다.
* [ ] Webhook Dispatcher는 endpoint별 delivery state를 독립 관리한다.

## DB

* [ ] Config, Projection, Audit table을 명확히 분리한다.
* [ ] 모든 projection table에 `ledger_offset`, `projected_at`, `source_update_id`를 둔다.
* [ ] Raw contract ID는 public API response에 포함하지 않는다.
* [ ] Request/response body는 redaction 후 저장한다.
* [ ] Idempotency record는 request fingerprint를 저장한다.
* [ ] Trace edge table은 append-only로 구현한다.

## Workbench Tools

* [ ] API Explorer는 selected environment와 API version을 자동 주입한다.
* [ ] SDK snippet generator는 idempotency key와 error handling을 포함한다.
* [ ] CLI generator는 create/retrieve/list/action/replay 명령을 생성한다.
* [ ] Request replay는 exact/clone/sandbox/dry-run 모드를 구분한다.
* [ ] Webhook replay는 event replay와 delivery replay를 구분한다.
* [ ] Ledger trace viewer는 graph/timeline/raw advanced tab을 제공한다.

## Security

* [ ] API key secret은 one-time reveal만 허용한다.
* [ ] Key hash와 prefix만 저장한다.
* [ ] Webhook signing secret rotation을 구현한다.
* [ ] Replay action은 elevated permission과 audit reason을 요구한다.
* [ ] Ledger API endpoint는 public internet에 노출하지 않는다.
* [ ] Party ID는 opaque identifier로 취급하고 parse하지 않는다.
* [ ] Live environment destructive operation은 optional 4-eyes approval을 지원한다.

## Testing / Sandbox

* [ ] Sandbox environment reset/purge 기능을 live와 물리적으로 분리한다.
* [ ] Test Helpers는 synthetic account/party/asset/holding/transfer/settlement를 생성한다.
* [ ] CLI `logs tail`, `events resend`, `webhooks listen`을 sandbox에서 먼저 구현한다.
* [ ] Projection lag, webhook failure, command failure simulation을 제공한다.
* [ ] API Explorer saved template을 sandbox에서 재실행할 수 있게 한다.

## Documentation

* [ ] “Canton-invisible API” 원칙을 docs 첫 페이지에 명시한다.
* [ ] Ledger trace glossary를 작성한다: command ID, submission ID, workflow ID, update ID, transaction ID, offset.
* [ ] Webhook signature verification guide를 제공한다.
* [ ] Idempotency retry guide를 제공한다.
* [ ] API version upgrade guide를 제공한다.
* [ ] SDK snippets와 CLI examples를 모든 API reference에 자동 포함한다.

[1]: https://docs.stripe.com/workbench "docs.stripe.com"
[2]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[3]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[4]: https://docs.stripe.com/webhooks "docs.stripe.com"
[5]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[6]: https://docs.canton.network/overview/reference/canton-protocol-specification "Canton Protocol Specification - Canton Network Docs"
[7]: https://docs.digitalasset.com/build/3.5/explanations/parties-users.html "Parties and users on a Canton ledger — Digital Asset’s platform documentation"
[8]: https://github.com/global-synchronizer-foundation/cips/blob/main/cip-0056/cip-0056.md "cips/cip-0056/cip-0056.md at main · canton-foundation/cips · GitHub"
[9]: https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html "Sandbox — Digital Asset’s platform documentation"
[10]: https://docs.stripe.com/cli "docs.stripe.com"
[11]: https://docs.stripe.com/cli/events/resend "docs.stripe.com"
[12]: https://docs.digitalasset.com/build/3.5/quickstart/observe/observability-troubleshooting-overview.html "Canton Network Quickstart observability & troubleshooting overview — Digital Asset’s platform documentation"
[13]: https://docs.stripe.com/keys "docs.stripe.com"
[14]: https://docs.stripe.com/webhooks/signature "docs.stripe.com"
[15]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html "JSON Ledger API Service V2 — Digital Asset’s platform documentation"
