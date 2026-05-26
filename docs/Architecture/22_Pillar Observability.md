# 22. Pillar Observability / SRE / Runbooks 설계

## Executive Summary

Pillar 운영/SRE 설계의 핵심은 **“Ledger-traceable Stripe-grade operations”**이다. 고객은 Stripe처럼 `balance`, `holding`, `intent`, `event`, `webhook` 중심으로 운영하지만, 내부 런타임은 Canton-native하게 `command → completion → update stream → projection → webhook`을 추적한다.

가장 중요한 운영 불변식은 다음이다.

1. **Canton Ledger가 최종 진실이다.** Pillar DB의 balance/holding은 재구성 가능한 projection이다.
2. **외부 API는 Canton-invisible이다.** 고객에게 participant, synchronizer, contract id, offset을 기본 노출하지 않는다.
3. **모든 운영 이벤트는 ledger trace를 가진다.** API request, idempotency key, intent, command id, completion, update id, projection offset, webhook event가 하나의 trace로 연결된다.
4. **SRE 지표는 contract-first가 아니라 balance/holding-first다.** “특정 contract가 왜 보이지 않는가?”보다 “고객의 available/locked/pending balance가 ledger 기준으로 신선하고 정확한가?”를 본다.
5. **비동기 워크플로는 webhook-first다.** API는 intent 접수와 조회를 제공하고, 결과 전달은 event/webhook을 1급 객체로 운영한다.

### 공식 문서 근거 요약

| 영역                                | 공식 문서에서 확인한 사항                                                                                                                                                                                                                                              | Pillar 설계 반영                                                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe API grammar                | Stripe API는 REST, resource-oriented URL, standard HTTP status/auth/verbs, form-encoded request body, JSON response를 사용하며, sandbox는 live data에 영향 없이 API key로 구분된다. ([Stripe 문서][1])                                                                         | Pillar도 `/v1/*` resource API, predictable object IDs, standard error object, live/sandbox API key 분리를 채택한다.                                               |
| Stripe API v2 / idempotency       | Stripe v2는 JSON request/response, v1/v2 namespace, SDK/CLI 지원, POST/DELETE idempotency를 제공하며, v2 idempotency key는 30일 보존된다. ([Stripe 문서][2])                                                                                                                | Pillar는 `Idempotency-Key`를 모든 state-changing POST에 요구하고, 기본 보존 기간을 **30일**로 둔다.                                                                           |
| Stripe idempotent requests        | Stripe는 idempotency key로 create/update retry를 안전하게 처리하고, 첫 요청의 status/body를 저장하며, UUID v4 같은 고유 키를 권장한다. ([Stripe 문서][3])                                                                                                                                   | Pillar는 동일 account/API version/method/path/normalized params/idempotency key에 대해 동일 결과를 반환한다.                                                             |
| Stripe API versioning / Workbench | Stripe는 major release, monthly backward-compatible release, account default API version, request-level `Stripe-Version`, webhook endpoint API version, Workbench 기반 upgrade/test workflow를 제공한다. 현재 문서상 API version은 `2026-04-22.dahlia`다. ([Stripe 문서][4]) | Pillar는 `Pillar-Version`, account default version, webhook endpoint version, Workbench-style upgrade diff/test를 제공한다.                                     |
| Stripe webhooks                   | Stripe webhook은 HTTPS POST JSON Event를 전송하며, endpoint는 빠르게 2xx를 반환하고 복잡한 처리는 비동기화해야 한다. Stripe CLI로 local webhook testing도 지원한다. ([Stripe 문서][5])                                                                                                           | Pillar webhook도 `event` object를 POST하고, HMAC signature, retry, DLQ, replay, local forwarding CLI를 제공한다.                                                   |
| Stripe CLI / Sandbox              | Stripe CLI는 sandbox resource 생성/조회/수정/삭제, real-time request/event streaming, webhook event triggering을 지원한다. Sandbox는 live integration/payment에 영향 없는 isolated test environment다. ([Stripe 문서][6])                                                          | Pillar CLI는 `listen`, `trigger`, `events`, `logs`, `replay`, `health`를 제공하고, sandbox는 live ledger와 분리된 Canton-backed test network로 운영한다.                  |
| Stripe SDK                        | Stripe는 공식 SDK를 여러 언어에 제공하고, semantic versioning과 release-date API version을 사용한다. ([Stripe 문서][7])                                                                                                                                                          | Pillar는 고객용 SDK와 내부 Canton/Daml SDK를 분리한다. 고객 SDK는 Canton 개념을 숨긴다.                                                                                        |
| Canton/Daml Ledger API            | Ledger API command submission은 비동기이며, command submission accept와 on-ledger effect는 분리된다. Completion Service와 Update Service로 결과를 추적해야 한다. ([Digital Asset][8])                                                                                              | Pillar의 intent는 즉시 `processing`이 될 수 있고, ledger completion/update 수신 후 `succeeded` 또는 `failed`가 된다.                                                       |
| Canton command deduplication      | Daml command dedupe는 `act_as`, user id, command id, dedup period 등을 사용하며, 같은 participant에서 의도대로 동작한다. Submission id는 재사용하지 않아야 한다. ([Canton Network Docs][9])                                                                                               | Pillar는 command routing을 participant-sticky하게 설계하고, `command_id`는 semantic idempotency, `submission_id`는 attempt identity로 분리한다.                          |
| Canton metrics / health           | Canton participant는 HTTP endpoint로 Prometheus/OpenMetrics metrics를 노출할 수 있고, `health.status`는 participant id, uptime, ports, connected/unhealthy synchronizers, component status 등을 보여준다. ([Digital Asset][10])                                             | Pillar는 participant health를 SLO 구성요소로 삼고, Canton metrics와 Pillar custom metrics를 같은 Prometheus plane에서 수집한다.                                              |
| Canton tracing                    | Canton은 Ledger API client와 Canton 간 distributed tracing을 지원하며 OpenTelemetry, Jaeger, Zipkin, OTLP 설정을 사용할 수 있다. ([Canton Network Docs][11])                                                                                                                 | Pillar는 API request trace를 gRPC Ledger API command submission까지 전파한다.                                                                                     |
| Canton HA / scaling               | Participant HA는 여러 participant replica와 shared DB로 구성할 수 있고, Canton scaling은 participants/synchronizers의 horizontal scaling, party/workflow sharding에 영향을 받는다. ([Digital Asset][12])                                                                        | Pillar는 deployment model에 따라 active/passive participant, sticky routing, account/party/workflow sharding을 운영한다.                                           |
| Daml SDK / Sandbox / PQS          | Daml SDK는 compiler, codegen, sandbox, test tooling을 포함하며, Ledger API는 command submission/transaction stream/ACS 등을 제공한다. PQS는 ledger transaction stream을 PostgreSQL로 project하고 propagation delay가 있다. ([Canton Network Docs][13])                           | Pillar 내부 개발은 Daml SDK와 sandbox를 사용하고, 고객-facing projection은 Pillar projection DB로 일원화한다. PQS는 internal diagnostics 또는 specific query acceleration로 제한한다. |
| Canton observability guidance     | Production은 structured JSON logs, command id/party MDC, command submissions/completions, PQS slow queries, auth events logging을 권장하며 contract payload는 production log에 남기지 않아야 한다. ([Canton Network Docs][14])                                              | Pillar logging은 structured JSON, trace metadata, redaction-first, no raw contract payload 원칙을 따른다.                                                        |
| SRE SLO model                     | Google SRE는 error budget을 `1 - SLO`로 정의하며, 100% SLO는 현실적이지도 바람직하지도 않다고 설명한다. ([Google SRE][15])                                                                                                                                                             | Pillar는 30일 rolling SLO와 error budget burn alert를 사용하고, SLA는 SLO보다 낮게 계약화한다.                                                                              |

### Pillar 운영 SLO / SLA 초안

| 사용자 여정 / 시스템 영역                     |                                                                    SLI |                         Internal SLO |          External SLA 제안 | 비고                                                               |
| ----------------------------------- | ---------------------------------------------------------------------: | -----------------------------------: | -----------------------: | ---------------------------------------------------------------- |
| Public API availability             |                                   유효 요청 중 Pillar platform error가 아닌 비율 |                         99.95% / 30일 |              99.9% / 30일 | 고객 4xx, auth failure, quota 429는 availability error에서 제외하되 별도 추적 |
| API latency: create intent          |                                  `POST /v1/intents/*` accepted latency |                p95 < 300ms, p99 < 1s |              p95 < 750ms | Ledger completion이 아니라 intent 접수 기준                              |
| API latency: read balance/holding   |                                 `GET /v1/balances`, `GET /v1/holdings` |             p95 < 200ms, p99 < 800ms |                 p95 < 1s | Projection DB 기준                                                 |
| Ledger command completion freshness | accepted command가 terminal completion 또는 timeout classification을 받는 시간 |                 p95 < 10s, p99 < 60s | 계약 대상 아님 또는 premium-only | Canton network/synchronizer 통제 범위에 따라 달라짐                        |
| Projection freshness                |                    ledger update가 customer-visible projection에 반영되는 시간 |      p95 < 5s, p99 < 30s, max < 120s |   status page disclosure | Balance/holding-first 핵심 SLO                                     |
| Webhook first attempt               |                                        event 생성 후 첫 delivery attempt까지 |                 p95 < 10s, p99 < 60s |                p95 < 60s | 고객 endpoint 장애 제외                                                |
| Webhook eventual delivery           |                       deliverable event가 2xx 또는 DLQ classification에 도달 |            99.9% < 5분, 99.99% < 24시간 |       at-least-once only | exactly-once 미보장, event idempotency 제공                           |
| Participant health                  |                      deployment boundary당 active participant available |                                99.9% |                   내부 SLO | external API는 degraded/read-only 가능                              |
| Command failure rate                |                          ledger-rejected 또는 platform-failed command 비율 | < 1% rolling 10분, < 0.1% rolling 24h |                   내부 SLO | business validation failure 제외                                   |
| Webhook failure rate                |                                           endpoint별 non-2xx attempt 비율 |                     < 5% rolling 10분 |    고객 endpoint별 advisory | platform-origin failure는 별도                                      |
| Rate limit pressure                 |                                     tenant quota 사용률 / bucket pressure |            p95 < 80%, 429 ratio < 2% |       quota contract에 따름 | burst abuse와 organic growth 분리                                   |

**Error budget policy:** 30일 rolling 기준으로 budget 50% 소진 시 risky deploy 제한, 75% 소진 시 non-critical release freeze, 100% 소진 시 incident review 전까지 production-affecting change 중단.

---

## Goals / Non-goals

### Goals

1. **Stripe-grade 운영 경험**

   * API request logs, webhook event logs, idempotency replay, version upgrade diff, sandbox fixture, CLI local forwarding을 제공한다.
   * 고객은 Canton을 몰라도 integration debugging이 가능해야 한다.

2. **Ledger-traceable operations**

   * 모든 customer-visible object transition은 `request_id → idempotency_key_hash → intent_id → command_id → completion → update_id → projection_offset → event_id → webhook_delivery_id`로 추적된다.

3. **Projection correctness**

   * Balance/Holding projection은 Canton Ledger에서 재생성 가능해야 한다.
   * Projection lag, reconciliation mismatch, partial replay, cursor corruption을 모두 감지한다.

4. **Webhook-first async workflow**

   * `intent.processing → intent.succeeded/failed`, `holding.updated`, `balance.available`, `transfer.settled` 같은 상태 전환은 event와 webhook으로 전달한다.

5. **Deployment-invariant API**

   * single participant, HA participant, multi-region, sandbox/localnet, enterprise dedicated Canton network 등 deployment model이 바뀌어도 API grammar와 object model은 동일해야 한다.

6. **Runbook-driven SRE**

   * P0/P1/P2 incidents는 사람이 즉시 실행할 수 있는 runbook을 가진다.
   * 모든 incident action은 audit log와 ledger trace context를 남긴다.

### Non-goals

1. **Pillar DB를 ledger 대체물로 만들지 않는다.**

   * DB는 Projection / Audit / Config만 저장한다.
   * DB balance가 ledger와 충돌하면 ledger가 이긴다.

2. **외부 API에서 Canton contract model을 노출하지 않는다.**

   * contract id, template id, choice, synchronizer id, participant offset은 기본 API 응답에 포함하지 않는다.
   * support/admin endpoint에서는 제한적으로 redacted trace만 제공한다.

3. **Webhook exactly-once delivery를 약속하지 않는다.**

   * Pillar는 at-least-once delivery, deterministic `event.id`, replay API, HMAC signature를 제공한다.
   * 수신자는 `event.id` 기반 idempotency를 구현해야 한다.

4. **Command completion latency를 무조건 고객 SLA로 계약하지 않는다.**

   * Canton participant/synchronizer/validator 운영 주체에 따라 통제 범위가 다르다.
   * API acceptance와 projection/webhook freshness를 기본 SLA로 둔다.

5. **Production logs에 raw contract payload를 남기지 않는다.**

   * 민감한 asset, party, holding detail은 redaction 또는 hash 처리한다.

---

## Architecture

### 1. Operating planes

```text
Customer / SDK / CLI
        |
        v
+-------------------------+
| External API Plane      |
| - API Gateway           |
| - AuthN/AuthZ           |
| - Versioning            |
| - Idempotency           |
| - Rate limiting         |
+------------+------------+
             |
             v
+-------------------------+
| Intent Plane            |
| - Intent validation     |
| - Balance/Holding view  |
| - Command plan builder  |
| - Audit envelope        |
+------------+------------+
             |
             v
+-------------------------+        +---------------------------+
| Canton Command Plane    |<------>| Canton Participant(s)     |
| - Ledger API client     |        | - Ledger API              |
| - command_id mapping    |        | - Admin / Health / Metrics|
| - completion listener   |        | - Synchronizer connection |
+------------+------------+        +---------------------------+
             |
             v
+-------------------------+
| Projection Plane        |
| - Update stream reader  |
| - Cursor manager        |
| - Balance/Holding proj. |
| - Reconciliation        |
+------------+------------+
             |
             v
+-------------------------+
| Webhook/Event Plane     |
| - Event builder         |
| - Outbox                |
| - Delivery worker       |
| - Retry / DLQ / Replay  |
+------------+------------+
             |
             v
+-------------------------+
| Observability/SRE Plane |
| - Metrics               |
| - Logs                  |
| - Traces                |
| - Dashboards            |
| - Alerts                |
| - Runbooks              |
| - DR / backups          |
+-------------------------+
```

### 2. Core runtime invariant

Pillar의 상태 전이는 다음 순서를 따른다.

```text
External API request
  -> idempotency reservation
  -> intent created
  -> Canton command submitted
  -> command completion observed
  -> ledger update observed
  -> projection updated
  -> event created
  -> webhook delivered
```

Ledger API command submission은 비동기이므로, submission response를 ledger finality로 취급하지 않는다. Canton/Daml 문서도 command submission accept와 ledger effect/completion이 분리되어 있으며, Completion Service와 Update Service로 결과를 추적해야 한다고 설명한다. ([Digital Asset][8])

### 3. SRE control surfaces

| Control surface            | 목적                                 | 핵심 지표                                                                    |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| API Gateway                | 고객 요청 접수, auth, version, quota     | request rate, latency, 4xx/5xx, 429, version distribution                |
| Idempotency Store          | 안전한 retry, duplicate suppression   | key hit/miss, param mismatch, replay latency, storage age                |
| Command Router             | participant-sticky command routing | command submissions, completions, timeout, duplicate, in-flight          |
| Participant Health Monitor | Canton participant 상태 판단           | active/passive, synchronizer connectivity, health.status, metrics scrape |
| Projection Engine          | ledger → DB projection freshness   | projection lag, cursor age, replay backlog, reconciliation mismatch      |
| Webhook Dispatcher         | async delivery                     | first-attempt latency, success rate, retry depth, DLQ                    |
| Audit Trail                | 운영 추적성과 compliance                 | append-only events, hash chain gap, retention status                     |
| Workbench / CLI            | integration debugging              | request logs, event logs, endpoint failure, replay, sandbox fixtures     |

### 4. Health checks

| Endpoint                               | Scope                           | 반환 조건                                                                                                                           | 사용처                            |
| -------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `GET /health/live`                     | process liveness                | process event loop alive, no fatal shutdown flag                                                                                | Kubernetes liveness            |
| `GET /health/ready`                    | traffic readiness               | API config loaded, DB reachable, idempotency store reachable, queue writable, at least one required participant route available | Kubernetes readiness           |
| `GET /health/deep`                     | dependency health               | participant health, synchronizer connectivity, projection lag, webhook outbox depth, backup freshness                           | operator, Workbench            |
| `GET /v1/status`                       | customer-facing platform status | degraded/read-only/normal plus high-level impacted components                                                                   | public or authenticated status |
| `GET /v1/ops/participants/{id}/health` | admin-only participant health   | Canton health.status, metrics scrape status, last command completion, active/passive state                                      | SRE admin                      |

Canton `health.status`는 participant id, uptime, ports, connected synchronizers, unhealthy synchronizers, component status 등을 제공하므로, Pillar participant health snapshot의 기본 입력으로 사용한다. ([Digital Asset][16])

### 5. Participant health model

Pillar는 participant 상태를 다음 enum으로 정규화한다.

| State         | 의미                                                                              | API 영향                                    |
| ------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| `healthy`     | active participant, Ledger API reachable, synchronizer connected, metrics fresh | normal                                    |
| `degraded`    | 일부 synchronizer unhealthy, completion latency 상승, metrics scrape partial        | writes throttled 가능                       |
| `read_only`   | command submission blocked, projection/read path 정상                             | write APIs return `503` 또는 intent delayed |
| `passive`     | HA standby participant                                                          | direct command routing 금지                 |
| `isolated`    | network partition 또는 synchronizer disconnect                                    | writes disabled for affected parties      |
| `unavailable` | health check failure, gRPC unavailable, process down                            | failover 또는 incident                      |

Participant HA는 shared DB를 쓰는 multiple participant replicas로 구성할 수 있으므로, Pillar는 deployment별로 active/passive 또는 active/active-read topology를 지원한다. 단, command dedupe의 의미가 participant에 의존하므로 command retry는 가능한 한 동일 participant로 sticky하게 유지한다. ([Digital Asset][12])

### 6. Projection lag design

Projection lag는 세 가지로 분리한다.

| Lag type                   | 정의                                                                                   | 운영 의미                      |
| -------------------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| `stream_lag_seconds`       | participant update stream의 latest observed update와 projection-applied update 간 시간 차이 | projection worker backlog  |
| `cursor_lag_seconds`       | stored cursor의 last applied time과 wall clock 간 차이                                    | stale balance/holding risk |
| `object_freshness_seconds` | 특정 balance/holding이 마지막 ledger update를 반영한 뒤 경과 시간                                   | customer-visible freshness |

Projection DB cursor는 opaque ledger offset을 저장하되, lag 계산은 ledger effective time, record time, applied time을 함께 사용한다. Ledger API Update Service는 offset부터 update stream을 구독할 수 있고 State Service는 bootstrapping에 사용할 수 있으므로, projection rebuild와 cursor recovery의 근거가 된다. ([Digital Asset][8])

### 7. Webhook failure rate design

Webhook failure rate는 두 개로 본다.

```text
attempt_failure_rate =
  non_2xx_attempts / total_attempts

event_delivery_failure_rate =
  events_in_dlq_or_expired / deliverable_events
```

운영 판단은 endpoint 단위와 platform 단위로 분리한다.

| 구분                        | 예시                                                       | 책임                            |
| ------------------------- | -------------------------------------------------------- | ----------------------------- |
| Customer endpoint failure | customer endpoint 500/timeout/TLS error                  | customer advisory, retry, DLQ |
| Pillar platform failure   | dispatcher crash, signing failure, queue stuck           | Pillar incident               |
| Network transient         | connect timeout, DNS failure                             | retry/backoff                 |
| Config failure            | invalid URL, disabled endpoint, secret rotation mismatch | Workbench warning             |

Webhook event는 projection 결과에서 생성한다. 즉, ledger update가 projection에 반영되지 않은 상태에서 고객 webhook을 먼저 보내지 않는다.

### 8. Command failure rate design

Command failure는 다음처럼 분류한다.

| Class                     | 예시                                            | 고객 노출                            | SRE 의미                     |
| ------------------------- | --------------------------------------------- | -------------------------------- | -------------------------- |
| `validation_error`        | insufficient available balance, invalid asset | 4xx or `intent.failed`           | SLO error 아님               |
| `idempotency_conflict`    | same key, different params                    | 409                              | client integration issue   |
| `duplicate_command`       | Canton dedupe duplicate                       | usually safe replay              | retry/idempotency 검증       |
| `participant_unavailable` | Ledger API unreachable                        | 503 or delayed intent            | infra incident             |
| `completion_rejected`     | ledger-level rejection                        | `intent.failed`                  | template/party/state issue |
| `timeout_pending`         | no completion within threshold                | `processing` with delayed status | async tracking incident    |
| `projection_not_observed` | completion observed but update not projected  | no final event yet               | projection incident        |

Daml command dedupe는 duplicate outcome이 Completion Service 또는 Command Service 경로로 나타날 수 있으므로, Pillar는 command attempt와 semantic command를 분리해서 기록한다. ([Canton Network Docs][9])

### 9. Rate limit pressure design

Pillar는 quota를 단순 429 카운트가 아니라 **pressure**로 운영한다.

```text
rate_limit_pressure =
  max(
    observed_rps / sustained_quota_rps,
    burst_tokens_used / burst_token_capacity,
    concurrent_requests / concurrency_limit
  )
```

|         Pressure | 상태                 | 조치                                      |
| ---------------: | ------------------ | --------------------------------------- |
|         `< 0.60` | normal             | no action                               |
|    `0.60 - 0.80` | warm               | dashboard only                          |
|    `0.80 - 0.95` | hot                | customer advisory, autoscale check      |
|         `> 0.95` | saturated          | alert, dynamic throttling, abuse review |
| `429 ratio > 5%` | customer-impacting | quota review or traffic mitigation      |

---

## API / Object Model

### 1. External API principles

Pillar API는 Stripe-like grammar를 따른다.

```http
POST /v1/intents/transfers
GET  /v1/intents/{id}
GET  /v1/balances
GET  /v1/holdings
GET  /v1/events
POST /v1/webhook_endpoints
POST /v1/webhook_endpoints/{id}/replay
GET  /v1/request_logs/{id}
```

공통 헤더:

| Header                                               | 설명                                 |
| ---------------------------------------------------- | ---------------------------------- |
| `Authorization: Bearer pk_live_...` 또는 `sk_live_...` | live/sandbox key 분리                |
| `Idempotency-Key`                                    | state-changing request 안전한 retry   |
| `Pillar-Version`                                     | request-level API version override |
| `Pillar-Account`                                     | platform/connected account context |
| `Pillar-Request-Id`                                  | response header로 반환되는 trace anchor |

Stripe 문서의 API versioning model처럼 Pillar도 account default version과 request override를 지원하고, webhook endpoint별 API version을 고정한다. ([Stripe 문서][4])

### 2. Public objects

#### `balance`

```json
{
  "id": "bal_acct_123_usdc",
  "object": "balance",
  "account": "acct_123",
  "asset": "asset_usdc",
  "available": "1000.00",
  "locked": "50.00",
  "pending": "25.00",
  "as_of": "2026-05-26T09:00:00Z",
  "livemode": true
}
```

운영 원칙:

* `available`, `locked`, `pending`은 projection 값이다.
* 고객 응답에는 contract id를 노출하지 않는다.
* 내부적으로는 `source_update_id`, `projection_cursor`, `reconciliation_status`를 가진다.

#### `holding`

```json
{
  "id": "hld_01J...",
  "object": "holding",
  "account": "acct_123",
  "asset": "asset_usdc",
  "status": "active",
  "quantity": "100.00",
  "available_quantity": "80.00",
  "locked_quantity": "20.00",
  "created": 1779776400,
  "updated": 1779776500,
  "livemode": true
}
```

#### `intent`

```json
{
  "id": "int_01J...",
  "object": "intent",
  "type": "transfer",
  "status": "processing",
  "amount": "100.00",
  "asset": "asset_usdc",
  "source": "acct_A",
  "destination": "acct_B",
  "created": 1779776400,
  "updated": 1779776401,
  "last_error": null,
  "livemode": true
}
```

Intent status:

| Status                  | 의미                                           |
| ----------------------- | -------------------------------------------- |
| `requires_confirmation` | customer confirmation 필요                     |
| `processing`            | command submitted or pending completion      |
| `succeeded`             | ledger update projected                      |
| `failed`                | validation 또는 ledger rejection               |
| `canceled`              | submission 전 취소                              |
| `expired`               | confirmation 또는 processing timeout policy 도달 |

#### `event`

```json
{
  "id": "evt_01J...",
  "object": "event",
  "type": "intent.succeeded",
  "api_version": "2026-05-26",
  "created": 1779776502,
  "data": {
    "object": {
      "id": "int_01J...",
      "object": "intent",
      "status": "succeeded"
    }
  },
  "request": {
    "id": "req_01J...",
    "idempotency_key_hash": "ik_hash_..."
  },
  "livemode": true
}
```

이벤트 타입 예시:

```text
intent.created
intent.processing
intent.succeeded
intent.failed
holding.created
holding.updated
balance.updated
webhook_endpoint.disabled
rate_limit.near_limit
participant.degraded       # admin-only
projection.lagged          # admin-only
```

#### `webhook_endpoint`

```json
{
  "id": "whend_01J...",
  "object": "webhook_endpoint",
  "url": "https://example.com/pillar/webhook",
  "enabled_events": ["intent.succeeded", "intent.failed", "balance.updated"],
  "api_version": "2026-05-26",
  "status": "enabled",
  "created": 1779776400,
  "livemode": true
}
```

### 3. Admin / Workbench objects

| Object                      | 목적                                                      | 노출 범위               |
| --------------------------- | ------------------------------------------------------- | ------------------- |
| `request_log`               | API request/response metadata, status, latency, version | customer + support  |
| `idempotency_record`        | replay status, key hash, params hash                    | support only        |
| `ledger_trace`              | request → command → update → projection chain           | internal/admin only |
| `participant_health_report` | participant/synchronizer health                         | internal/admin      |
| `projection_status`         | cursor, lag, replay status                              | internal/admin      |
| `webhook_delivery`          | attempts, response code, retry schedule                 | customer + support  |
| `rate_limit_status`         | quota, pressure, remaining tokens                       | customer + support  |
| `incident`                  | incident timeline and affected resources                | support/admin       |

### 4. Error object

```json
{
  "error": {
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded",
    "message": "Too many requests for this account.",
    "request_id": "req_01J...",
    "retry_after": 2
  }
}
```

Error types:

```text
api_error
authentication_error
authorization_error
idempotency_error
invalid_request_error
rate_limit_error
ledger_unavailable_error
projection_stale_error
webhook_error
```

---

## Internal Runtime

### 1. Command identity model

Pillar는 세 가지 ID를 분리한다.

| ID              | 생성 기준                       |                재사용 여부 | 목적                       |
| --------------- | --------------------------- | --------------------: | ------------------------ |
| `intent_id`     | customer-visible operation  |                재사용 없음 | external object identity |
| `command_id`    | semantic ledger change      | idempotent retry에서 동일 | Canton dedupe / trace    |
| `submission_id` | physical submission attempt |       매 attempt마다 새 값 | retry attempt tracking   |

```text
command_id =
  hash(account_id, intent_id, normalized_operation, api_version, ledger_template_version)

submission_id =
  uuid_v7()
```

Daml command dedupe에서 submission id는 재사용하지 않아야 하며, duplicate command handling은 command id와 deduplication period에 의해 결정된다. ([Canton Network Docs][9])

### 2. Idempotency runtime

State-changing POST 처리:

```text
1. Normalize request body by API version.
2. Hash params without secrets.
3. Reserve idempotency key:
   unique(account_id, livemode, method, path, idempotency_key_hash).
4. If key exists:
   - same params hash: return stored response or current object state.
   - different params hash: 409 idempotency_error.
5. Create intent in audit/config boundary.
6. Submit Canton command.
7. Store response envelope.
```

Retention:

* 기본 30일.
* enterprise tier는 90일 옵션.
* key 원문은 저장하지 않고 hash 저장.
* response body는 민감 필드를 제거한 canonical response snapshot만 저장.

Stripe v2 idempotency가 POST/DELETE에서 30일 보존을 제공하므로, Pillar는 Stripe-grade retry UX를 맞추기 위해 30일을 기본값으로 채택한다. ([Stripe 문서][2])

### 3. Ledger API integration

Pillar command plane은 gRPC Ledger API를 1차 경로로 사용한다.

```text
submit command
  -> command submission accepted
  -> completion stream observes success/failure
  -> update stream observes transaction/update
  -> projection maps update to objects
```

Ledger API는 command submission, completion, update stream, state service, package/user management 등을 제공한다. ([Digital Asset][8]) JSON API는 HTTP prototype 또는 low-throughput integration에 적합하지만, Pillar runtime의 high-throughput path는 gRPC가 기본이다. ([Canton Network Docs][13])

### 4. Projection runtime

Projection worker responsibilities:

1. Subscribe to Update Service from stored offset.
2. Decode ledger update into domain delta.
3. Apply delta to holding/balance/intent projection transactionally.
4. Update projection cursor.
5. Emit internal event candidate.
6. Persist customer event and enqueue webhook.

Projection transaction invariant:

```text
projection row update
+ cursor advancement
+ event creation
+ webhook outbox enqueue
= one DB transaction
```

이렇게 해야 projection은 갱신되었는데 webhook event가 없는 상태, 또는 event는 있는데 projection이 없는 상태를 방지할 수 있다.

### 5. Reconciliation runtime

Reconciliation jobs:

| Job                              |  주기 | 목적                                                  |
| -------------------------------- | --: | --------------------------------------------------- |
| `balance_reconcile_sample`       |  5분 | high-value accounts sample check                    |
| `holding_reconcile_full`         | 1시간 | active holdings against ledger-derived state        |
| `projection_cursor_audit`        |  1분 | cursor monotonicity and gap detection               |
| `webhook_event_projection_audit` | 10분 | event corresponds to projected object               |
| `idempotency_command_audit`      | 10분 | idempotent request has exactly one semantic command |
| `audit_hash_chain_verify`        | 1시간 | append-only audit tamper evidence                   |

### 6. Webhook runtime

Delivery policy:

| Parameter           |                                             Default |
| ------------------- | --------------------------------------------------: |
| first attempt delay |                         immediate, target p95 < 10s |
| timeout             |                                                 10s |
| retry schedule      |                     exponential backoff with jitter |
| max retry period    |                         72h default, 30d replayable |
| signature           | `Pillar-Signature: t=timestamp,v1=hmac_sha256(...)` |
| replay window       |                                      5분 recommended |
| DLQ                 |                after max retry or endpoint disabled |
| ordering            |         best-effort per endpoint/object, not global |

Event dispatch flow:

```text
event_outbox.pending
  -> delivery_attempt.started
  -> HTTPS POST
  -> 2xx: delivered
  -> non-2xx/timeout: retry_scheduled
  -> exhausted: dlq
```

고객 endpoint는 빠르게 2xx를 반환하고 자체 비동기 처리해야 한다. 이는 Stripe webhook 운영 지침과 같은 방식이다. ([Stripe 문서][5])

### 7. Logs

Production log format은 structured JSON이다.

필수 fields:

```json
{
  "timestamp": "2026-05-26T09:00:00.000Z",
  "level": "INFO",
  "service": "pillar-command-plane",
  "environment": "prod",
  "livemode": true,
  "trace_id": "trc_...",
  "span_id": "spn_...",
  "request_id": "req_...",
  "account_id": "acct_...",
  "api_version": "2026-05-26",
  "idempotency_key_hash": "ik_hash_...",
  "intent_id": "int_...",
  "command_id": "cmd_hash_...",
  "submission_id": "sub_...",
  "workflow_id": "wf_int_...",
  "update_id": "upd_...",
  "projection_offset_hash": "off_hash_...",
  "participant_id": "participant-prod-a",
  "synchronizer_id_hash": "sync_hash_...",
  "event_id": "evt_...",
  "webhook_endpoint_id": "whend_...",
  "message": "command completion observed"
}
```

Logging rules:

* 원문 API key, webhook secret, private key, raw contract payload 저장 금지.
* party id는 운영 필요 시 hash 또는 alias 사용.
* amount/asset은 compliance policy에 따라 masked 가능.
* `ERROR` log는 반드시 `request_id` 또는 `trace_id`를 포함한다.
* audit log와 application log는 분리한다.

Canton observability guidance도 production에서 structured JSON log, command id/party context, command submission/completion logging, contract payload logging 금지를 권장한다. ([Canton Network Docs][14])

### 8. Traces

Trace span hierarchy:

```text
HTTP POST /v1/intents/transfers
  idempotency.reserve
  intent.validate
  command.plan
  ledger.command.submit
  ledger.command.completion_wait
  projection.apply_update
  event.create
  webhook.enqueue
  webhook.deliver
```

Trace propagation:

* HTTP: W3C trace context.
* gRPC Ledger API: OpenTelemetry gRPC interceptor.
* DB: query spans with table and operation, no PII.
* Webhook: `Pillar-Request-Id`, `Pillar-Event-Id`, optional trace context for enterprise customers.

Canton tracing supports OpenTelemetry/Jaeger/Zipkin/OTLP and Ledger API client-to-Canton span continuation, so Pillar should propagate trace context through command submission. ([Canton Network Docs][11])

### 9. Metrics

#### API metrics

```text
pillar_api_requests_total{method,path,status,api_version,livemode}
pillar_api_request_duration_seconds_bucket{method,path,api_version}
pillar_api_errors_total{type,code,path}
pillar_api_inflight_requests{path}
pillar_api_idempotency_total{outcome=hit|miss|conflict|expired}
pillar_api_version_requests_total{api_version}
```

#### Canton command metrics

```text
pillar_command_submissions_total{intent_type,participant_id,status}
pillar_command_completions_total{intent_type,participant_id,status,completion_code}
pillar_command_latency_seconds_bucket{intent_type,participant_id}
pillar_command_inflight{participant_id}
pillar_command_timeout_total{participant_id}
pillar_command_failure_rate{participant_id,intent_type}
pillar_command_duplicate_total{participant_id}
```

Canton 자체 metrics도 함께 수집한다. 공식 observability guide는 `daml_commands_submissions_total`, `daml_commands_completions_total`, delayed submissions, execution total, sequencer client sequencing time 같은 지표를 핵심으로 제시한다. ([Canton Network Docs][14])

#### Projection metrics

```text
pillar_projection_lag_seconds{participant_id,stream}
pillar_projection_cursor_age_seconds{participant_id,stream}
pillar_projection_events_applied_total{participant_id,template,operation}
pillar_projection_replay_events_total{reason}
pillar_projection_apply_duration_seconds_bucket{stream}
pillar_projection_backlog_events{stream}
pillar_projection_reconciliation_mismatch_total{asset,account_tier}
pillar_projection_stale_objects{object_type}
```

#### Webhook metrics

```text
pillar_webhook_events_created_total{type,api_version}
pillar_webhook_delivery_attempts_total{endpoint_id,status_code_class}
pillar_webhook_attempt_failure_rate{endpoint_id}
pillar_webhook_event_delivery_failure_rate{endpoint_id}
pillar_webhook_first_attempt_latency_seconds_bucket{type}
pillar_webhook_delivery_latency_seconds_bucket{type}
pillar_webhook_outbox_depth{endpoint_id}
pillar_webhook_dlq_total{endpoint_id,reason}
pillar_webhook_signature_failures_total{endpoint_id}
```

#### Participant health metrics

```text
pillar_participant_health{participant_id,state}
pillar_participant_synchronizer_connected{participant_id,synchronizer_id}
pillar_participant_synchronizer_unhealthy{participant_id,synchronizer_id}
pillar_participant_metrics_scrape_success{participant_id}
pillar_participant_ledger_api_latency_seconds_bucket{participant_id}
pillar_participant_command_route_failover_total{from_participant,to_participant,reason}
```

Canton participant metrics can be exposed through a Prometheus/OpenMetrics HTTP endpoint, with a default OpenMetrics reporter endpoint documented at port 9464 when configured. ([Digital Asset][10])

#### Rate limit metrics

```text
pillar_rate_limit_pressure{account_id,scope}
pillar_rate_limit_tokens_remaining{account_id,scope}
pillar_rate_limit_429_total{account_id,scope,reason}
pillar_rate_limit_burst_exhaustions_total{account_id,scope}
pillar_rate_limit_concurrent_requests{account_id}
```

#### DR / backup metrics

```text
pillar_backup_last_success_age_seconds{system=db|audit|config}
pillar_backup_restore_drill_last_success_age_seconds
pillar_backup_pitr_lag_seconds
pillar_audit_hash_chain_gap_total
pillar_dr_replication_lag_seconds{region}
```

### 10. Alerts

| Severity | Alert                           | Condition                                          | Primary runbook      |
| -------- | ------------------------------- | -------------------------------------------------- | -------------------- |
| P0       | API unavailable                 | 5xx ratio > 5% for 5m or availability burn > 10x   | API outage           |
| P0       | No active participant           | all write-capable participants unavailable > 2m    | Participant failover |
| P0       | Balance reconciliation mismatch | confirmed mismatch in customer-visible balance     | Balance mismatch     |
| P0       | Projection stopped              | projection lag > 5m or cursor not moving > 3m      | Projection lag       |
| P1       | Command failure spike           | platform command failure > 5% for 10m              | Command failure      |
| P1       | Webhook platform failure        | dispatcher failure or outbox depth growing for 10m | Webhook failure      |
| P1       | Rate limit saturation           | global pressure > 95% or 429 ratio > 10% for 10m   | Rate pressure        |
| P1       | Audit gap                       | audit hash chain gap or missing event envelope     | Audit integrity      |
| P2       | Participant degraded            | synchronizer unhealthy or metrics scrape partial   | Participant degraded |
| P2       | Backup stale                    | last successful backup older than policy           | Backup               |
| P2       | Webhook endpoint noisy          | endpoint failure > 50% for 30m                     | Customer advisory    |

### 11. Dashboards

#### Executive SLO dashboard

Panels:

* API availability, error budget remaining.
* Intent success rate.
* Projection freshness p50/p95/p99.
* Webhook delivery p95/p99 and DLQ count.
* Participant health state.
* Current incidents and customer impact.

#### API / Integration dashboard

Panels:

* Requests by API version, endpoint, account tier.
* Latency p50/p95/p99.
* 4xx/5xx breakdown.
* Idempotency hits/conflicts.
* Rate limit pressure and 429 ratio.
* Top integration errors.

Stripe Workbench exposes API versions, integration errors grouped by endpoint/type, API request logs, events, and workflow/extension run details; Pillar Workbench should mirror this operational surface for Canton-backed assets. ([Stripe 문서][17])

#### Canton command dashboard

Panels:

* Submissions/completions by participant.
* Completion latency.
* Failure code distribution.
* Duplicate command count.
* In-flight commands.
* Sequencer submission latency.
* Participant route failovers.

#### Projection dashboard

Panels:

* Projection lag by stream.
* Cursor movement.
* Applied events/sec.
* Replay backlog.
* Reconciliation mismatch count.
* Stale balance/holding objects.

#### Webhook dashboard

Panels:

* Events created by type.
* First-attempt latency.
* Delivery latency.
* Attempt failure rate by endpoint.
* DLQ by reason.
* Retry queue depth.
* Signature failures.

#### Participant health dashboard

Panels:

* Participant state.
* Synchronizer connected/unhealthy.
* Ledger API latency.
* JVM heap/GC.
* DB pool utilization.
* Canton metrics scrape success.
* HA active/passive status.

#### DR / Backup dashboard

Panels:

* Last backup age.
* PITR lag.
* Restore drill last success.
* Audit hash chain status.
* Cross-region replication lag.
* Projection rebuild ETA.

---

## DB Schema

Pillar DB는 **Projection / Audit / Config**만 저장한다.

### 1. Projection tables

| Table                         | 주요 columns                                                                                                                              | 설명                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `projection_cursors`          | `stream_name`, `participant_id`, `party_scope_hash`, `offset_opaque`, `last_update_id`, `last_ledger_time`, `applied_at`, `checksum`    | update stream cursor   |
| `balance_projection`          | `account_id`, `asset_id`, `available`, `locked`, `pending`, `as_of_update_id`, `as_of_offset_hash`, `projection_version`, `updated_at`  | customer balance view  |
| `holding_projection`          | `holding_id`, `account_id`, `asset_id`, `quantity`, `available_quantity`, `locked_quantity`, `status`, `source_update_id`, `updated_at` | customer holding view  |
| `intent_projection`           | `intent_id`, `account_id`, `type`, `status`, `amount`, `asset_id`, `last_error_code`, `source_update_id`, `updated_at`                  | intent current view    |
| `event_projection`            | `event_id`, `account_id`, `type`, `object_id`, `api_version`, `created_at`, `source_update_id`                                          | event list/read model  |
| `participant_health_snapshot` | `participant_id`, `state`, `active`, `connected_synchronizers`, `unhealthy_synchronizers`, `observed_at`                                | latest health view     |
| `projection_lag_snapshot`     | `stream_name`, `lag_seconds`, `cursor_age_seconds`, `backlog_events`, `observed_at`                                                     | dashboard acceleration |

### 2. Audit tables

| Table                            | 주요 columns                                                                                                                               | 설명                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `api_request_audit`              | `request_id`, `account_id`, `method`, `path`, `api_version`, `status`, `latency_ms`, `idempotency_key_hash`, `created_at`                | request log              |
| `idempotency_audit`              | `account_id`, `livemode`, `method`, `path`, `key_hash`, `params_hash`, `status`, `response_snapshot`, `expires_at`                       | idempotency replay       |
| `intent_audit`                   | `intent_id`, `account_id`, `type`, `requested_params_hash`, `status`, `request_id`, `created_at`                                         | immutable intent history |
| `command_audit`                  | `command_id`, `submission_id`, `intent_id`, `participant_id`, `workflow_id`, `status`, `completion_code`, `submitted_at`, `completed_at` | command lifecycle        |
| `ledger_update_audit`            | `update_id`, `workflow_id`, `command_id`, `offset_hash`, `participant_id`, `observed_at`                                                 | ledger trace             |
| `webhook_event_audit`            | `event_id`, `account_id`, `type`, `api_version`, `source_update_id`, `created_at`                                                        | immutable event          |
| `webhook_delivery_attempt_audit` | `delivery_id`, `event_id`, `endpoint_id`, `attempt_no`, `status`, `status_code`, `latency_ms`, `next_retry_at`                           | delivery history         |
| `security_audit`                 | `actor_id`, `action`, `resource_type`, `resource_id`, `ip_hash`, `user_agent_hash`, `created_at`                                         | auth/config/security     |
| `audit_hash_chain`               | `sequence_no`, `prev_hash`, `entry_hash`, `created_at`                                                                                   | tamper-evident audit     |
| `incident_timeline`              | `incident_id`, `severity`, `action`, `actor`, `evidence_ref`, `created_at`                                                               | incident evidence        |
| `backup_restore_drill_audit`     | `drill_id`, `target`, `rpo_seconds`, `rto_seconds`, `result`, `created_at`                                                               | DR evidence              |

### 3. Config tables

| Table                  | 주요 columns                                                                                                   | 설명               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------- |
| `accounts`             | `account_id`, `status`, `default_api_version`, `livemode_enabled`, `created_at`                              | tenant           |
| `api_keys`             | `key_id`, `account_id`, `mode`, `scope`, `key_hash`, `last_used_at`, `revoked_at`                            | auth             |
| `rate_limit_policies`  | `account_id`, `scope`, `sustained_rps`, `burst_capacity`, `concurrency_limit`                                | quota            |
| `webhook_endpoints`    | `endpoint_id`, `account_id`, `url_encrypted`, `enabled_events`, `api_version`, `secret_ref`, `status`        | webhook config   |
| `participant_registry` | `participant_id`, `deployment_id`, `role`, `health_endpoint`, `metrics_endpoint`, `routing_weight`, `status` | Canton routing   |
| `party_routes`         | `account_id`, `party_alias`, `participant_id`, `synchronizer_scope`, `sticky_until`                          | command routing  |
| `asset_registry`       | `asset_id`, `symbol`, `daml_package_ref`, `status`, `precision`, `compliance_policy_ref`                     | asset config     |
| `package_registry`     | `package_id`, `version`, `dar_ref`, `vetting_status`, `activated_at`                                         | Daml package ops |
| `api_version_registry` | `version`, `release_type`, `status`, `changelog_ref`, `sunset_at`                                            | versioning       |
| `sandbox_fixtures`     | `fixture_id`, `account_id`, `asset_id`, `scenario`, `created_at`                                             | sandbox          |

### 4. Constraints

```sql
-- idempotency
UNIQUE(account_id, livemode, method, path, key_hash)

-- one event per projected ledger update/object/type/version
UNIQUE(account_id, type, object_id, source_update_id, api_version)

-- one active webhook endpoint URL per account when required
UNIQUE(account_id, url_hash) WHERE status = 'enabled'

-- command attempt uniqueness
UNIQUE(submission_id)

-- semantic command uniqueness
UNIQUE(command_id)
```

Critical rule:

```text
No table may store raw Canton contract payload as source-of-truth state.
```

Denormalized projection fields are allowed only when they are:

1. customer-facing,
2. derived from ledger,
3. linked to `source_update_id`,
4. rebuildable.

---

## Failure Modes

| Failure mode                     | Detection                                           | Immediate mitigation                                                    | Recovery                                                | Invariant                                 |
| -------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| API 5xx spike                    | API 5xx alert, burn-rate alert                      | rollback recent deploy, enable degraded mode, shed non-critical traffic | replay failed idempotent requests where safe            | no duplicate ledger command               |
| Participant down                 | health.status unavailable, command submissions fail | route to healthy active participant if dedupe-safe, otherwise read-only | restore participant, reconcile command completions      | ledger remains source of truth            |
| Synchronizer disconnected        | participant health shows unhealthy synchronizer     | disable writes for affected asset/party scope                           | reconnect, verify pending commands                      | no command into isolated route            |
| Command failure spike            | `pillar_command_failure_rate`                       | pause affected intent type, inspect completion codes                    | fix template/config, replay safe intents                | failed intents are terminal and auditable |
| Duplicate command / dedupe issue | duplicate completion, ALREADY_EXISTS                | return idempotent result or keep processing                             | verify command id generation and participant stickiness | one semantic operation                    |
| Projection lag                   | lag alert, cursor not moving                        | stop webhook final events, mark reads stale if threshold exceeded       | restart/replay projection from cursor                   | no stale data silently presented          |
| Projection corruption            | reconciliation mismatch                             | freeze affected balance/holding reads/writes                            | rebuild from ledger/state service                       | ledger wins                               |
| Webhook dispatcher stuck         | outbox depth increasing, no attempts                | restart workers, isolate bad endpoint batch                             | replay from outbox                                      | events not lost                           |
| Customer endpoint failing        | endpoint failure > threshold                        | retry/backoff, notify customer, DLQ after policy                        | customer replay API                                     | at-least-once delivery                    |
| Rate limit saturation            | pressure > 95%, 429 spike                           | enforce quota, autoscale, customer advisory                             | capacity/quota adjustment                               | protect platform                          |
| DB primary failure               | DB health alert                                     | failover DB, API read/write degraded                                    | restore PITR if needed                                  | projection rebuildable                    |
| Audit gap                        | hash chain verification fails                       | freeze admin mutations, preserve evidence                               | investigate, reconstruct where possible                 | operations traceable                      |
| Backup stale                     | backup age alert                                    | trigger manual backup, block risky deploy                               | restore drill                                           | RPO policy maintained                     |
| Package/version mismatch         | command rejected, package registry drift            | stop affected routes                                                    | redeploy/vet package                                    | API version stable                        |
| Webhook secret compromise        | security alert/customer report                      | rotate secret, disable endpoint if needed                               | replay signed events                                    | no unsigned event trusted                 |
| KMS unavailable                  | signing/decryption failure                          | degraded mode, stop secret operations                                   | restore KMS path                                        | secrets never logged                      |

---

## Security / Compliance

### 1. Authentication and authorization

* Live and sandbox API keys are separate.
* API keys are stored as hashes only.
* Admin APIs require scoped roles.
* Support access is just-in-time, audited, and least-privilege.
* Canton party identity is mapped internally and not exposed as customer auth identity.

### 2. Secrets

| Secret                        | Storage                            | Rotation                       |
| ----------------------------- | ---------------------------------- | ------------------------------ |
| API keys                      | hash only                          | customer-initiated or incident |
| Webhook signing secret        | KMS-encrypted reference            | endpoint-level rotation        |
| Ledger API credentials        | secret manager / workload identity | deployment policy              |
| DB credentials                | secret manager                     | automated rotation             |
| Daml package signing metadata | artifact registry                  | release process                |

### 3. Webhook security

Webhook headers:

```text
Pillar-Event-Id: evt_...
Pillar-Request-Id: req_...
Pillar-Signature: t=1779776502,v1=...
Pillar-Version: 2026-05-26
```

Verification:

```text
signed_payload = timestamp + "." + raw_body
expected = HMAC_SHA256(endpoint_secret, signed_payload)
reject if timestamp skew > 5 minutes
reject if signature mismatch
dedupe by event_id
```

### 4. Data protection

* Production logs do not contain raw contract payloads.
* PII and sensitive asset metadata are redacted or tokenized.
* Audit logs are append-only with hash-chain verification.
* Backups are encrypted at rest and in transit.
* Restore access is audited.

### 5. Compliance evidence

Pillar should continuously generate:

| Evidence                           | Source                       |
| ---------------------------------- | ---------------------------- |
| API availability and SLO history   | metrics                      |
| Incident timeline                  | `incident_timeline`          |
| Webhook delivery history           | webhook audit                |
| Balance reconciliation reports     | reconciliation jobs          |
| Backup/restore drill results       | DR audit                     |
| API version upgrade history        | version registry + Workbench |
| Admin access logs                  | security audit               |
| Package deployment/vetting history | package registry             |

### 6. Ledger traceability

Every externally visible object transition must support an internal trace query:

```text
GET /v1/ops/ledger_traces/{object_id}
```

Internal response shape:

```json
{
  "object_id": "int_01J...",
  "request_id": "req_01J...",
  "idempotency_key_hash": "ik_hash_...",
  "command_id": "cmd_hash_...",
  "submission_ids": ["sub_01J..."],
  "workflow_id": "wf_int_01J...",
  "completion": {
    "status": "succeeded",
    "observed_at": "2026-05-26T09:00:05Z"
  },
  "ledger_update": {
    "update_id": "upd_...",
    "offset_hash": "off_hash_..."
  },
  "projection": {
    "cursor": "cursor_hash_...",
    "applied_at": "2026-05-26T09:00:06Z"
  },
  "events": ["evt_01J..."],
  "webhook_deliveries": ["whdel_01J..."]
}
```

외부 고객에게는 Canton-specific detail을 숨기고, support-grade `request_id`, `event_id`, `intent_id`만 제공한다.

---

## Implementation Plan

### Phase 0 — Baseline research and SLO contract

Deliverables:

* SLO/SLA document approved.
* Error budget policy approved.
* Deployment topology inventory: sandbox, staging, production, enterprise dedicated.
* Canton participant health contract defined.
* API versioning policy and webhook versioning policy defined.

Acceptance criteria:

* Every SLO has SLI, owner, dashboard, alert, runbook.
* SLA excludes/defines customer-caused failures and third-party Canton network dependency.

### Phase 1 — Observability foundation

Deliverables:

* Prometheus/OpenMetrics scrape for Pillar services and Canton participants.
* Structured JSON logging with trace context.
* OpenTelemetry traces from API to Ledger API client.
* Core dashboards:

  * API
  * command
  * participant health
  * projection
  * webhook
  * rate limit
* `request_id`, `intent_id`, `command_id`, `event_id` correlation.

Acceptance criteria:

* A single `request_id` can be followed from API request to webhook attempt.
* No raw API keys, webhook secrets, or raw contract payloads appear in logs.

### Phase 2 — Projection and webhook SRE

Deliverables:

* Projection cursor table.
* Projection lag metrics.
* Reconciliation jobs.
* Webhook outbox, retry, DLQ, replay.
* Webhook delivery dashboard.
* Customer-facing event log.

Acceptance criteria:

* Projection DB can be dropped and rebuilt in staging from ledger stream.
* Webhook event replay is deterministic by `event_id`.
* A projection lag incident prevents premature final-state webhooks.

### Phase 3 — Workbench / CLI / Sandbox

Deliverables:

* Pillar Workbench:

  * API request logs
  * integration errors
  * event logs
  * webhook delivery attempts
  * idempotency records
  * API version upgrade diff
  * rate limit pressure
* Pillar CLI:

  * `pillar listen`
  * `pillar trigger`
  * `pillar events list`
  * `pillar webhooks replay`
  * `pillar logs tail`
  * `pillar health`
* Sandbox:

  * isolated accounts
  * fixture assets
  * test participants
  * deterministic webhook trigger scenarios

Acceptance criteria:

* A developer can test an intent lifecycle locally using CLI and sandbox without live ledger impact.
* Workbench shows request logs, events, webhook failures, API versions, and integration errors similarly to Stripe’s developer workflow. ([Stripe 문서][17])

### Phase 4 — Incident runbooks and DR

Deliverables:

* P0/P1 runbooks.
* On-call escalation matrix.
* Backup policy.
* Restore drill automation.
* Read-only/degraded mode.
* Participant failover drill.
* Projection rebuild drill.

Acceptance criteria:

* Quarterly restore drill passes RPO/RTO targets.
* Monthly projection rebuild drill passes.
* Participant failover drill proves no duplicate semantic ledger operation.

### Phase 5 — Capacity and resilience

Deliverables:

* Load test model.
* Capacity dashboard.
* Autoscaling policies.
* Queue/backpressure policies.
* Chaos testing:

  * participant down
  * synchronizer disconnect
  * projection worker stopped
  * webhook endpoint 500
  * DB failover
  * KMS unavailable
* Customer quota forecasting.

Acceptance criteria:

* p95 utilization < 60% and p99 < 80% under forecasted peak.
* Webhook retry storm cannot starve API or projection workers.
* Rate limit enforcement protects participant command capacity.

---

## Incident Runbooks

### Runbook 1 — API 5xx / latency surge

| Step           | Action                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Detect         | Check API dashboard: 5xx by endpoint, latency p95/p99, recent deploy, DB latency, rate limit saturation.    |
| Classify       | Determine whether errors are auth/client-driven, DB-driven, participant-driven, or deploy regression.       |
| Mitigate       | Roll back latest deploy, enable degraded mode, shed low-priority traffic, raise autoscale floor.            |
| Protect ledger | Ensure no retry loop is generating duplicate commands. Check idempotency conflicts and command submissions. |
| Communicate    | Update status page if customer-visible for > 5 minutes.                                                     |
| Recover        | Re-enable normal traffic after 15 minutes stable SLO.                                                       |
| Verify         | Compare API request audit, idempotency audit, command audit for gaps.                                       |

### Runbook 2 — Participant unavailable

| Step         | Action                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Detect       | `pillar_participant_health=unavailable`, Canton health.status failure, command submission failures.                    |
| Scope        | Identify affected parties/accounts/assets/synchronizers.                                                               |
| Mitigate     | If HA route exists and dedupe-safe, fail over. Otherwise put affected writes into `read_only` or `delayed_processing`. |
| Check dedupe | Do not resubmit with a different semantic command id. Do not reuse submission id.                                      |
| Recover      | Restart participant or promote standby according to topology.                                                          |
| Reconcile    | Query completions/update stream for commands submitted before failure.                                                 |
| Exit         | Projection lag normal, command completions normal, no unknown in-flight commands above threshold.                      |

### Runbook 3 — Projection lag

| Step      | Action                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| Detect    | `pillar_projection_lag_seconds` exceeds threshold or cursor not moving.                                              |
| Scope     | Identify stream, participant, party scope, object type.                                                              |
| Mitigate  | Stop final-state webhooks for affected scope. Mark balance/holding reads as stale if lag exceeds customer threshold. |
| Diagnose  | Check DB locks, worker crash, update stream connectivity, malformed event, package decoder mismatch.                 |
| Recover   | Restart worker, skip only with formal exception, or replay from previous safe cursor.                                |
| Reconcile | Run affected balance/holding reconciliation.                                                                         |
| Exit      | Lag under p95 target and no reconciliation mismatch.                                                                 |

### Runbook 4 — Command failure spike

| Step     | Action                                                                                     |
| -------- | ------------------------------------------------------------------------------------------ |
| Detect   | command failure rate > threshold, completion rejection spike.                              |
| Scope    | Split by intent type, package version, participant, asset, account.                        |
| Mitigate | Pause affected intent type or package route. Keep reads and unrelated writes online.       |
| Diagnose | Inspect completion codes, recent package/config change, party route change, balance state. |
| Recover  | Roll back config/package or fix validation.                                                |
| Replay   | Only replay intents that are safe under idempotency and command dedupe policy.             |
| Exit     | Failure rate below threshold for 30 minutes.                                               |

### Runbook 5 — Webhook delivery failure

| Step     | Action                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Detect   | DLQ increase, outbox depth growth, platform delivery failure.                                                                                    |
| Scope    | Endpoint-specific vs platform-wide.                                                                                                              |
| Mitigate | For platform issue, pause retries to avoid storm, restart workers, verify signing/KMS. For endpoint issue, continue backoff and notify customer. |
| Recover  | Replay from outbox or DLQ.                                                                                                                       |
| Verify   | Check event count equals delivery lifecycle count.                                                                                               |
| Exit     | Outbox depth decreasing, first-attempt latency normal, no unsigned events.                                                                       |

### Runbook 6 — Rate limit pressure / traffic surge

| Step            | Action                                                                               |
| --------------- | ------------------------------------------------------------------------------------ |
| Detect          | pressure > 95%, 429 ratio spike, participant command queue rising.                   |
| Scope           | Account, endpoint, API key, IP, SDK version.                                         |
| Mitigate        | Enforce token bucket, reduce burst, enable adaptive throttling, isolate abusive key. |
| Protect         | Reserve capacity for webhook delivery and projection.                                |
| Customer action | Notify top affected accounts with quota/upgrade guidance.                            |
| Exit            | pressure < 80% for 30 minutes, command queue normal.                                 |

### Runbook 7 — Balance / holding mismatch

| Step            | Action                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| Detect          | reconciliation mismatch, customer report, projection checksum failure.    |
| Severity        | Treat as P0 if customer-visible balance can be wrong.                     |
| Mitigate        | Freeze affected account/asset writes and mark reads stale or unavailable. |
| Source of truth | Reconstruct from Canton Ledger, not DB.                                   |
| Recover         | Rebuild projection for affected scope.                                    |
| Audit           | Preserve before/after projection snapshots and ledger trace.              |
| Exit            | Reconciliation passes twice and no related command pending unknown.       |

### Runbook 8 — Backup / restore failure

| Step     | Action                                                                                    |
| -------- | ----------------------------------------------------------------------------------------- |
| Detect   | stale backup alert or failed restore drill.                                               |
| Mitigate | Trigger manual backup, block risky deploys, increase replica retention.                   |
| Diagnose | Check WAL archiving, object storage, KMS, retention policy.                               |
| Recover  | Restore to isolated environment and verify schema, audit hash chain, idempotency records. |
| Exit     | Backup success and restore drill success recorded.                                        |

---

## Disaster Recovery

### 1. DR principles

1. **Ledger-first recovery**

   * Balance/holding projection is rebuilt from Canton Ledger.
   * DB projection loss is not data loss if audit/config/idempotency/outbox are intact or reconstructible.

2. **Config and audit are critical**

   * API keys, account config, webhook endpoints, rate limits, package registry, participant routing, idempotency records, audit chain, webhook outbox are not fully reconstructible from ledger.
   * These require strong backup and PITR.

3. **Projection is rebuildable but operationally expensive**

   * Projection backup is retained for fast recovery.
   * Ledger replay is the correctness path.

### 2. RPO / RTO targets

| Component           |                 RPO |                    RTO | Recovery method                     |
| ------------------- | ------------------: | ---------------------: | ----------------------------------- |
| Config DB           |                ≤ 5분 |                  ≤ 30분 | PITR restore                        |
| Audit DB            |                ≤ 5분 |                  ≤ 60분 | PITR + hash verification            |
| Idempotency records |                ≤ 5분 |                  ≤ 30분 | PITR restore                        |
| Webhook outbox      |                ≤ 5분 |                  ≤ 60분 | PITR + replay                       |
| Projection DB       |  0 ledger data loss |          ≤ 2시간 typical | restore snapshot then replay ledger |
| Participant node    | deployment-specific | ≤ 15분 HA, ≤ 2시간 non-HA | HA failover or rebuild              |
| Workbench/CLI       |              ≤ 24시간 |                  ≤ 4시간 | stateless redeploy                  |
| Logs/traces         |               ≤ 15분 |                  ≤ 4시간 | object storage/index restore        |

### 3. Backup policy

| Asset                      | Backup type                      |                  Frequency |               Retention |
| -------------------------- | -------------------------------- | -------------------------: | ----------------------: |
| Config/audit/projection DB | full + incremental + WAL/PITR    | continuous WAL, daily full |             35일 default |
| Audit hash chain           | append-only object storage       |                 continuous | 7년 or compliance policy |
| Webhook event/outbox       | DB PITR + object archive         |                 continuous |             90일 default |
| DAR/package artifacts      | artifact registry immutable copy |                per release |              indefinite |
| API schemas / SDK versions | release registry                 |                per release |              indefinite |
| Runbooks / dashboards      | IaC repository                   |                 per change |              indefinite |
| KMS metadata               | provider-native backup           |            provider policy |       compliance policy |

### 4. Restore order

```text
1. Freeze writes or route to DR region.
2. Restore config DB.
3. Restore audit/idempotency/webhook outbox.
4. Restore projection snapshot.
5. Reconnect participant or promote standby.
6. Verify ledger stream connectivity.
7. Replay projection from stored cursor.
8. Verify reconciliation.
9. Resume webhook dispatch.
10. Resume writes.
```

### 5. DR drills

| Drill                |  Frequency | Pass condition                                  |
| -------------------- | ---------: | ----------------------------------------------- |
| DB PITR restore      |    monthly | restore within RTO and audit hash chain valid   |
| Projection rebuild   |    monthly | balances/holdings match ledger-derived result   |
| Participant failover |  quarterly | no duplicate semantic commands                  |
| Webhook replay       |    monthly | DLQ replay succeeds and event idempotency holds |
| Region failover      | semiannual | API, projection, webhook operating in DR region |
| KMS secret rotation  |  quarterly | webhook signatures and API auth remain valid    |

---

## Backup/Restore

### Backup verification

Every backup must be verified with:

```text
backup_exists
+ checksum_valid
+ decryptable
+ schema_migration_compatible
+ restore_tested
+ audit_hash_chain_valid
```

### Restore verification queries

Minimum restore checks:

```text
1. Count accounts, API keys, webhook endpoints.
2. Verify latest idempotency records.
3. Verify projection cursor continuity.
4. Verify no webhook event without delivery lifecycle.
5. Verify audit hash chain.
6. Run sample balance reconciliation.
7. Submit sandbox canary command.
8. Deliver sandbox webhook.
```

### Projection rebuild strategy

```text
Input:
  ledger update stream
  package registry
  projection schema version
  target account/party/asset scope

Process:
  truncate affected projection scope
  replay updates from checkpoint or genesis
  rebuild balance_projection
  rebuild holding_projection
  rebuild intent_projection
  recreate missing event_projection if necessary
  compare checksums
```

Rebuild must not emit customer webhooks by default. Webhook re-emission requires explicit replay command.

---

## Capacity Planning

### 1. Capacity dimensions

| Dimension               |                       Symbol | Notes                              |
| ----------------------- | ---------------------------: | ---------------------------------- |
| API requests/sec        |                    `api_rps` | split read/write                   |
| Intent creation/sec     |                 `intent_rps` | state-changing load                |
| Commands/sec            |                    `cmd_rps` | Canton participant capacity driver |
| Updates/sec             |                    `upd_rps` | projection capacity driver         |
| Events/update           |          `events_per_update` | webhook amplification              |
| Webhook endpoints/event |        `endpoints_per_event` | fanout                             |
| Retry multiplier        |           `retry_multiplier` | failure-driven amplification       |
| Projection rows/update  | `projection_rows_per_update` | DB write capacity                  |
| Accounts                |                   `accounts` | rate limit/account scale           |
| Holdings/account        |       `holdings_per_account` | query/storage scale                |

### 2. Sizing formulas

```text
command_capacity_required =
  intent_rps * avg_commands_per_intent * peak_factor

projection_write_qps =
  upd_rps * projection_rows_per_update * peak_factor

webhook_attempt_qps =
  upd_rps
  * events_per_update
  * endpoints_per_event
  * retry_multiplier
  * peak_factor

audit_write_qps =
  api_rps
  + command_attempts_per_sec
  + ledger_updates_per_sec
  + webhook_attempt_qps

storage_per_day =
  api_audit_bytes
  + command_audit_bytes
  + projection_change_bytes
  + webhook_attempt_bytes
  + log_bytes
```

### 3. Headroom policy

| Resource                     | Target steady-state |        Alert |
| ---------------------------- | ------------------: | -----------: |
| API CPU                      |           < 60% p95 |    > 80% p95 |
| DB CPU                       |           < 50% p95 |    > 75% p95 |
| DB connections               |               < 60% |        > 80% |
| Command queue                |      < 30% capacity |        > 70% |
| Projection backlog           |           < 10s p95 |        > 30s |
| Webhook queue                |    drains within 5분 | drains > 15분 |
| Participant command capacity |           < 60% p95 |        > 80% |
| Rate limit pressure          |           < 80% p95 |        > 95% |

### 4. Scaling levers

| Bottleneck           | Scale lever                                                       |
| -------------------- | ----------------------------------------------------------------- |
| API CPU              | stateless horizontal scaling                                      |
| Auth/idempotency DB  | partition by account/livemode                                     |
| Command throughput   | participant sharding by account/party/workflow                    |
| Synchronizer latency | workflow/asset routing, synchronizer capacity review              |
| Projection lag       | partition streams by participant/party/template, increase workers |
| Webhook fanout       | endpoint-sharded workers, retry isolation, DLQ                    |
| Audit write load     | append-only partitioned tables, cold archive                      |
| Balance query load   | projection read replicas, account/asset indexes                   |
| Rate limit spikes    | token bucket, concurrency limits, customer quotas                 |

Canton’s own scaling guidance emphasizes distributed architecture, participant/synchronizer horizontal scaling, and party/workflow sharding. Pillar capacity planning should align with those levers rather than assuming a single global ledger bottleneck. ([Digital Asset][18])

### 5. Load testing

Test tiers:

| Tier          | Environment                         | Purpose                  |
| ------------- | ----------------------------------- | ------------------------ |
| Unit          | local Daml sandbox                  | command semantics        |
| Integration   | Pillar sandbox                      | API/idempotency/webhook  |
| Local network | Canton LocalNet-style setup         | multi-component dev/test |
| Staging       | production-like participant/network | SLO validation           |
| Game day      | controlled prod or prod-shadow      | incident readiness       |

Canton LocalNet is a Docker Compose local network with multiple validators, wallet services, PQS, and Canton components for development/testing, not production. ([Canton Network Docs][19])

---

## Open Questions

1. **Customer SLA boundary**

   * Canton participant and synchronizer를 Pillar가 직접 운영하지 않는 enterprise deployment에서 어떤 latency/availability를 SLA에 포함할 것인가?

2. **Webhook retention**

   * 기본 replay window를 30일로 둘지, enterprise tier에서 90일/1년까지 확장할지 결정해야 한다.

3. **Ledger trace 노출 수준**

   * 고객 support API에 `ledger_trace_id`만 노출할지, redacted participant/update metadata까지 제공할지 결정해야 한다.

4. **Projection rebuild RTO**

   * asset/account 규모별로 full rebuild 목표 시간을 별도 tier로 나눌 필요가 있다.

5. **PQS 사용 범위**

   * Pillar projection DB가 primary read model이지만, PQS를 diagnostics/query acceleration에 사용할지 명확히 해야 한다.

6. **Daml package upgrade governance**

   * package registry, vetting, customer API version, event schema version을 어떤 release train으로 묶을지 필요하다.

7. **Multi-region command routing**

   * active-active API와 participant-sticky command dedupe를 어떻게 동시에 만족할지 구체 topology가 필요하다.

8. **Balance reconciliation source**

   * Ledger stream replay만 사용할지, 별도 canonical reconciliation service를 둘지 결정해야 한다.

9. **Incident customer comms**

   * projection stale, webhook delayed, participant degraded를 status page에 어떤 granularity로 공개할지 정해야 한다.

10. **Regulated asset compliance**

* 특정 asset의 holding/balance log redaction, retention, jurisdictional data residency 요구사항을 asset registry에 어떻게 반영할지 결정해야 한다.

---

## Agent-ready Checklist

### SLO / SLA

* [ ] 30일 rolling SLO 정의
* [ ] API availability SLO/SLA 확정
* [ ] API latency SLO 확정
* [ ] Projection freshness SLO 확정
* [ ] Webhook delivery SLO 확정
* [ ] Participant health SLO 확정
* [ ] Command failure rate SLO 확정
* [ ] Rate limit pressure SLO 확정
* [ ] Error budget burn alert 구현
* [ ] SLA exclusion policy 작성

### Metrics

* [ ] `pillar_api_requests_total`
* [ ] `pillar_api_request_duration_seconds`
* [ ] `pillar_api_idempotency_total`
* [ ] `pillar_command_submissions_total`
* [ ] `pillar_command_completions_total`
* [ ] `pillar_command_latency_seconds`
* [ ] `pillar_projection_lag_seconds`
* [ ] `pillar_projection_reconciliation_mismatch_total`
* [ ] `pillar_webhook_delivery_attempts_total`
* [ ] `pillar_webhook_outbox_depth`
* [ ] `pillar_webhook_dlq_total`
* [ ] `pillar_rate_limit_pressure`
* [ ] `pillar_participant_health`
* [ ] Canton participant Prometheus scrape
* [ ] Backup/restore metrics

### Logs

* [ ] Structured JSON log format
* [ ] `request_id` propagation
* [ ] `trace_id` / `span_id` propagation
* [ ] `intent_id`, `command_id`, `submission_id`, `update_id`, `event_id` fields
* [ ] API key redaction
* [ ] Webhook secret redaction
* [ ] Raw contract payload logging 금지
* [ ] Audit log and app log separation
* [ ] Audit hash chain

### Traces

* [ ] HTTP trace context
* [ ] gRPC Ledger API OpenTelemetry interceptor
* [ ] DB spans
* [ ] Webhook delivery spans
* [ ] Trace-to-ledger correlation view
* [ ] Workbench trace viewer

### Alerts

* [ ] API 5xx P0
* [ ] API latency P1
* [ ] No active participant P0
* [ ] Participant degraded P2
* [ ] Projection lag P0/P1
* [ ] Command failure spike P1
* [ ] Webhook platform failure P1
* [ ] Webhook DLQ spike P1
* [ ] Rate limit saturation P1
* [ ] Balance mismatch P0
* [ ] Audit gap P0/P1
* [ ] Backup stale P2

### Dashboards

* [ ] Executive SLO dashboard
* [ ] API dashboard
* [ ] Integration errors dashboard
* [ ] Command dashboard
* [ ] Participant health dashboard
* [ ] Projection freshness dashboard
* [ ] Webhook delivery dashboard
* [ ] Rate limit dashboard
* [ ] DB/infra dashboard
* [ ] DR/backup dashboard
* [ ] Security/audit dashboard

### Health Checks

* [ ] `/health/live`
* [ ] `/health/ready`
* [ ] `/health/deep`
* [ ] `/v1/status`
* [ ] Participant health collector
* [ ] Synchronizer connectivity check
* [ ] Metrics scrape freshness check
* [ ] Projection lag readiness gate
* [ ] Webhook queue health check

### Runbooks

* [ ] API outage
* [ ] Participant unavailable
* [ ] Synchronizer disconnected
* [ ] Projection lag
* [ ] Command failure spike
* [ ] Webhook failure
* [ ] Rate limit saturation
* [ ] Balance mismatch
* [ ] DB failover
* [ ] Backup restore failure
* [ ] Audit integrity failure
* [ ] KMS/secrets failure

### Disaster Recovery

* [ ] RPO/RTO matrix approved
* [ ] DB PITR enabled
* [ ] Backup encryption enabled
* [ ] Backup restore automation
* [ ] Monthly restore drill
* [ ] Monthly projection rebuild drill
* [ ] Quarterly participant failover drill
* [ ] Webhook replay drill
* [ ] Audit hash verification
* [ ] DAR/package artifact backup

### API / Workbench / CLI / Sandbox

* [ ] `Pillar-Version` header
* [ ] Account default API version
* [ ] Webhook endpoint API version
* [ ] Idempotency retention 30일
* [ ] Request log object
* [ ] Event log object
* [ ] Webhook delivery object
* [ ] Workbench API version view
* [ ] Workbench integration errors
* [ ] Workbench webhook replay
* [ ] CLI `listen`
* [ ] CLI `trigger`
* [ ] CLI `events`
* [ ] CLI `webhooks replay`
* [ ] Sandbox isolated accounts
* [ ] Sandbox fixture assets
* [ ] Sandbox webhook event trigger

### Capacity

* [ ] Capacity model spreadsheet
* [ ] Peak factor definition
* [ ] API autoscaling policy
* [ ] Projection worker scaling policy
* [ ] Webhook worker scaling policy
* [ ] Participant command capacity baseline
* [ ] Rate limit quota model
* [ ] Queue backpressure policy
* [ ] Load test scenarios
* [ ] Chaos/game day scenarios

[1]: https://docs.stripe.com/api "docs.stripe.com"
[2]: https://docs.stripe.com/api-v2-overview "docs.stripe.com"
[3]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[4]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[5]: https://docs.stripe.com/webhooks "docs.stripe.com"
[6]: https://docs.stripe.com/stripe-cli "docs.stripe.com"
[7]: https://docs.stripe.com/sdks "docs.stripe.com"
[8]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[9]: https://docs.canton.network/appdev/deep-dives/command-deduplication "Command Deduplication - Canton Network Docs"
[10]: https://docs.digitalasset.com/operate/3.5/howtos/observe/metrics.html "Configure Metrics — Digital Asset’s platform documentation"
[11]: https://docs.canton.network/appdev/deep-dives/open-tracing "Open Tracing in Ledger API Client Applications - Canton Network Docs"
[12]: https://docs.digitalasset.com/operate/3.5/howtos/operate/ha/ha.html "High Availability Usage — Digital Asset’s platform documentation"
[13]: https://docs.canton.network/appdev/modules/m4-sdks-apis "SDKs and APIs - Canton Network Docs"
[14]: https://docs.canton.network/appdev/modules/m4-observability "Observability - Canton Network Docs"
[15]: https://sre.google/workbook/error-budget-policy/?utm_source=chatgpt.com "Error Budget Policy for Service Reliability"
[16]: https://docs.digitalasset.com/operate/3.5/tutorials/getting_started.html "Getting Started — Digital Asset’s platform documentation"
[17]: https://docs.stripe.com/workbench/guides "docs.stripe.com"
[18]: https://docs.digitalasset.com/operate/3.5/howtos/optimize/performance.html "Scaling and Performance — Digital Asset’s platform documentation"
[19]: https://docs.canton.network/appdev/modules/m5-localnet-development "LocalNet Development - Canton Network Docs"
