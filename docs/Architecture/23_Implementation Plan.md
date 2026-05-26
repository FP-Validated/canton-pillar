# 23. Pillar Complete Monorepo / Source Tree / Implementation Plan

## Executive Summary

Pillar는 **“Stripe for Canton-backed assets”**로 설계한다. 외부 개발자는 `Balance`, `Holding`, `TransferIntent`, `IssueIntent`, `RedeemIntent`, `Hold`, `Event`, `WebhookEndpoint`만 다룬다. `contractId`, `templateId`, `party`, `participant`, `DAR`, `commandId`는 기본 API에서 보이지 않는다. 반대로 내부 런타임은 완전히 Canton-native다. Daml 모델이 자산·보유·이전·예약·상환 워크플로의 원장 상태를 정의하고, Ledger API command/update stream, PQS, command deduplication, DAR 배포, participant authorization을 정식 운영 축으로 둔다.

핵심 아키텍처는 다음이다.

```text
External Stripe-like API
        ↓
Intent / Idempotency / Audit / Config DB
        ↓
Ledger Command Runtime
        ↓
Canton Ledger = Source of Truth
        ↓
Projection Worker / PQS
        ↓
Balance, Holding, Operation, Event Projections
        ↓
Webhook-first Async Workflow + SDK + CLI + Workbench
```

Pillar DB는 **Projection / Audit / Config**만 저장한다. 자산 상태의 진실은 오직 Canton Ledger다. DB의 `balances`, `holdings`, `transfers`, `events`는 언제든 재생성 가능해야 하며, `intents`, `operations`, `idempotency_keys`, `api_requests`, `webhook_deliveries`는 외부 API 안정성과 감사·운영 추적을 위한 보조 기록이다.

---

## Goals / Non-goals

### Goals

| Goal                                 | 설계 결정                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Canton Ledger is the source of truth | 모든 asset movement, holding lock, settlement, redemption은 Daml workflow로 확정         |
| Stripe-like external API             | `/v1/*`, object IDs, pagination, metadata, idempotency, events, webhooks, SDK, CLI |
| Canton-invisible API                 | public API에 `contractId`, `templateId`, `partyId`, `participantId` 노출 금지           |
| Canton-native runtime                | Daml, DAR, Ledger API, PQS, command deduplication, JWT/mTLS auth 사용                |
| Balance/Holding-first                | 외부 read model은 aggregate balance와 holding abstraction 중심                           |
| Intent-first                         | API mutation은 transaction 직접 실행이 아니라 intent 생성·진행                                  |
| Webhook-first                        | async 상태 변화는 event + webhook으로 통지                                                  |
| Ledger-traceable operations          | 모든 외부 intent는 `operation_id → command_id → update_id/offset`로 추적                   |
| Deployment portability               | hosted, customer-validator, self-hosted 모두 동일한 public API grammar 유지               |
| Agent-executable delivery            | 각 구현 단위를 path, output, acceptance criteria로 분해                                     |

### Non-goals

| Non-goal                         | 이유                                                                          |
| -------------------------------- | --------------------------------------------------------------------------- |
| Public API에서 Daml contract 직접 조작 | Stripe-like abstraction을 깨고 Canton coupling 발생                              |
| DB를 asset state source로 사용       | 원장과 DB divergence 위험                                                        |
| 모든 workflow를 동기 API로 완료          | Ledger API와 webhook-first 원칙에 반함                                            |
| 첫 버전부터 모든 자산 표준 지원               | 우선 Pillar-native asset + adapter boundary, 이후 CN Token Standard integration |
| UI를 핵심 source of truth로 사용       | Dashboard/Workbench는 운영 도구일 뿐 원천 아님                                         |

---

## Research Basis

### Stripe 공식 문서에서 가져온 API 설계 기준

Stripe의 API versioning은 계정 default API version과 SDK-pinned version, webhook endpoint version을 분리해서 다루며, Workbench에서 API version upgrade를 테스트할 수 있다. Pillar도 `Pillar-Version` header, account default version, webhook endpoint pinned version, SDK-pinned version을 분리해야 한다. ([Stripe 문서][1])

Stripe는 create/update request에 idempotency key를 사용해 네트워크 오류 후 안전하게 재시도할 수 있게 한다. Pillar의 모든 mutation endpoint는 `Idempotency-Key`를 요구하고, 동일 key + 동일 request hash는 동일 response를 반환하며, Canton command deduplication의 `command_id`와도 연결한다. ([Stripe 문서][2])

Stripe webhook은 HTTPS endpoint로 real-time event JSON payload를 push하고, Event object의 `data.object`, `api_version`, `request.idempotency_key` 같은 필드를 통해 비동기 상태 변화를 추적한다. Pillar도 `evt_*` event object를 API의 중심 객체로 두고, event replay와 webhook delivery log를 운영 핵심으로 둔다. ([Stripe 문서][3])

Stripe webhook 보안은 signature header 검증을 권장하고, undelivered webhook event는 자동 재전송 및 수동 처리 모델을 제공한다. Pillar는 `Pillar-Signature` HMAC, timestamp tolerance, endpoint secret rotation, retry/backoff, manual replay를 기본 기능으로 구현한다. ([Stripe 문서][4])

Stripe list API는 `limit`, `starting_after`, `ending_before` 기반 cursor pagination을 사용하고, conventional HTTP status code를 사용한다. Pillar의 모든 list endpoint는 동일한 grammar를 사용한다. ([Stripe 문서][5])

Stripe metadata는 object별 key-value extension으로 설계되어 있다. Pillar도 `metadata`를 모든 주요 public object에 제공하되, 민감정보는 metadata에 넣지 않는다는 정책을 API 문서와 validation에 포함한다. ([Stripe 문서][6])

Stripe는 서버 SDK를 Ruby, PHP, Java, Python, Node, .NET, Go 등으로 제공하고, CLI는 sandbox resource 관리, API 호출, webhook test, event trigger에 사용된다. Pillar는 1차로 Node, Python, Java SDK와 `pillar` CLI를 제공하고, webhook trigger와 local sandbox flow를 CLI의 핵심 기능으로 둔다. ([Stripe 문서][7])

Stripe Sandboxes는 live integration에 영향 없이 객체 생성과 기능 실험을 가능하게 하는 isolated test environment이고, Workbench는 API Explorer, Shell, event destination 관리, health insight를 제공한다. Pillar도 `apps/workbench`와 `pillar sandbox` CLI를 통해 API explorer, ledger trace, webhook inspector, projection lag, event replay를 제공한다. ([Stripe 문서][8])

### Canton / Daml 공식 문서에서 가져온 런타임 기준

Canton application architecture 문서는 frontend가 ledger와 직접 통신하지 않고 backend가 Ledger API를 통해 ledger에 command를 보낸다고 설명한다. Daml model은 cross-organization workflow와 API definition 역할을 하며 DAR로 compile되어 participant node에 업로드된다. Pillar도 public API backend와 ledger command runtime을 분리하고, Daml package를 source-of-truth workflow definition으로 둔다. ([Canton Network Docs][9])

Canton backend는 higher-level API provision, on-ledger workflow automation, off-ledger system integration을 담당할 수 있고, microservices 구조로 구현 가능하다. Pillar의 `api`, `ledger-command`, `projection-worker`, `workflow-orchestrator`, `webhook-dispatcher` 경계는 이 기준에 맞춘다. ([Canton Network Docs][9])

Canton read path는 Participant Query Store, 즉 PQS를 사용해 application-specific index와 SQL query로 scalable read model을 구성하는 것이 중요하다. Pillar의 balance/holding read API는 Ledger API raw stream이 아니라 PQS와 projection DB를 통해 제공한다. ([Canton Network Docs][9])

Ledger API는 command stream과 update/event stream으로 구성되며, command 결과는 제출 후 비동기로 관측된다. Pillar의 API가 intent-first, webhook-first여야 하는 핵심 이유다. ([Digital Asset][10])

Daml command deduplication은 `act_as`, `user_id`, `command_id`로 intended ledger change를 식별하고, application crash, participant crash, network loss, ledger slowness 같은 실패 구간을 견디기 위해 필요하다. Pillar는 `operation_id`와 stable `command_id`를 생성하고, 재시도 시 새 command가 아니라 동일 intended change를 재제출한다. ([Canton Network Docs][11])

Deployed participant node는 Ledger API request마다 sufficient access token을 검사하며, mTLS가 추가될 수 있다. JWT token에는 `canReadAs(p)`, `canActAs(p)` 같은 rights가 포함된다. Pillar 내부 ledger client는 tenant/party별 권한을 엄격히 분리한다. ([Canton Network Docs][12])

DPM은 `dpm build`로 Daml project를 compile해 DAR를 생성하고, `dpm test`로 Daml Script test를 실행한다. CI/CD에서는 Daml build, codegen, DAR artifact 저장, sandbox integration test, target validator DAR upload가 핵심 단계다. ([Digital Asset][13])

Daml Sandbox는 Daml code가 포함된 Canton ledger를 single participant + synchronizer topology로 실행하는 개발 도구이며, contract isolation test의 첫 단계로 사용된다. 기본 sandbox는 authorization 없이 valid Ledger API request를 허용할 수 있으므로, Pillar local dev는 no-auth profile과 JWT-auth profile을 모두 제공한다. ([Digital Asset][14])

CN Token Standard는 asset-generic DVP와 peer-to-peer transfer workflow 방향을 제공하며, Daml interfaces를 통해 upgrade consumption과 wallet interoperability를 쉽게 하는 장점이 있다. Pillar는 초기에는 Pillar-native asset model을 구현하되, `daml/pillar-token-adapter`와 `services/token-standard-adapter`를 별도 경계로 두어 CN Token Standard와 연결 가능하게 설계한다. ([Canton Network Docs][15])

---

## Architecture

### 1. System Architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│ External Developers / Customers                                    │
│ SDKs, CLI, Workbench, Dashboard, Webhook Consumers                  │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS /v1, API Keys, Idempotency-Key
┌──────────────────────────────▼─────────────────────────────────────┐
│ apps/api                                                           │
│ Stripe-like API grammar, auth, rate limit, versioning, idempotency │
│ Creates API request audit + intent + operation + command request   │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ internal gRPC/HTTP or queue
┌──────────────────────────────▼─────────────────────────────────────┐
│ services/ledger-command                                            │
│ Daml Java bindings, Ledger API command submission, dedup handling  │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ Canton Ledger API
┌──────────────────────────────▼─────────────────────────────────────┐
│ Canton Participant / Synchronizer                                  │
│ Daml contracts, choices, parties, DARs, command completions        │
│ SOURCE OF TRUTH                                                    │
└───────────────┬─────────────────────────────────────┬──────────────┘
                │ PQS / Ledger updates                │ automation
┌───────────────▼─────────────────┐     ┌────────────▼───────────────┐
│ services/projection-worker       │     │ services/workflow-orchestrator │
│ balances, holdings, events, ops  │     │ retries, time/state tasks      │
└───────────────┬─────────────────┘     └────────────────────────────┘
                │
┌───────────────▼────────────────────────────────────────────────────┐
│ Postgres: Projection / Audit / Config only                         │
│ balances, holdings, event_log, operation trace, idempotency, config│
└───────────────┬────────────────────────────────────────────────────┘
                │
┌───────────────▼────────────────────────────────────────────────────┐
│ services/webhook-dispatcher                                        │
│ signed delivery, retry, DLQ, replay, endpoint versioning            │
└────────────────────────────────────────────────────────────────────┘
```

### 2. Monorepo Source Tree

```text
pillar/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/v1/
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── api-version.ts
│   │   │   │   ├── idempotency.ts
│   │   │   │   └── rate-limit.ts
│   │   │   ├── controllers/
│   │   │   ├── presenters/
│   │   │   ├── errors/
│   │   │   └── server.ts
│   │   ├── openapi/
│   │   │   ├── pillar-v1.yaml
│   │   │   └── snapshots/
│   │   └── test/
│   ├── dashboard/
│   │   ├── src/
│   │   └── test/
│   ├── workbench/
│   │   ├── src/
│   │   │   ├── api-explorer/
│   │   │   ├── ledger-trace/
│   │   │   ├── webhook-inspector/
│   │   │   └── projection-health/
│   │   └── test/
│   └── docs/
│       ├── api/
│       ├── guides/
│       ├── changelog/
│       └── versioning/
│
├── services/
│   ├── ledger-command/
│   │   ├── src/main/kotlin/
│   │   │   ├── command/
│   │   │   ├── dedup/
│   │   │   ├── daml/
│   │   │   ├── auth/
│   │   │   └── Main.kt
│   │   ├── src/test/kotlin/
│   │   └── build.gradle.kts
│   ├── projection-worker/
│   │   ├── src/main/kotlin/
│   │   │   ├── pqs/
│   │   │   ├── ledger/
│   │   │   ├── projectors/
│   │   │   ├── reconciliation/
│   │   │   └── Main.kt
│   │   └── src/test/kotlin/
│   ├── workflow-orchestrator/
│   │   ├── src/main/kotlin/
│   │   │   ├── tasks/
│   │   │   ├── schedulers/
│   │   │   ├── retries/
│   │   │   └── Main.kt
│   │   └── src/test/kotlin/
│   ├── webhook-dispatcher/
│   │   ├── src/
│   │   │   ├── dispatcher/
│   │   │   ├── signer/
│   │   │   ├── retry/
│   │   │   ├── dlq/
│   │   │   └── main.ts
│   │   └── test/
│   ├── compliance-adapter/
│   │   ├── src/
│   │   └── test/
│   ├── token-standard-adapter/
│   │   ├── src/main/kotlin/
│   │   └── src/test/kotlin/
│   └── reconciler/
│       ├── src/main/kotlin/
│       └── src/test/kotlin/
│
├── packages/
│   ├── api-contracts/
│   │   ├── openapi/
│   │   ├── schemas/
│   │   ├── examples/
│   │   └── golden/
│   ├── domain/
│   │   ├── src/
│   │   │   ├── objects/
│   │   │   ├── ids/
│   │   │   ├── money/
│   │   │   ├── statuses/
│   │   │   └── metadata/
│   │   └── test/
│   ├── db/
│   │   ├── migrations/
│   │   │   ├── 0000_extensions/
│   │   │   ├── 0010_config/
│   │   │   ├── 0020_audit/
│   │   │   ├── 0030_idempotency/
│   │   │   ├── 0040_intents_operations/
│   │   │   ├── 0050_projections/
│   │   │   ├── 0060_events_webhooks/
│   │   │   ├── 0070_reconciliation/
│   │   │   └── repeatable/
│   │   ├── seeds/
│   │   ├── views/
│   │   ├── src/
│   │   └── test/
│   ├── idempotency/
│   │   ├── src/
│   │   └── test/
│   ├── ledger-types/
│   │   ├── generated/java/
│   │   ├── generated/typescript/
│   │   └── README.md
│   ├── observability/
│   │   ├── src/
│   │   └── dashboards/
│   ├── security/
│   │   ├── src/
│   │   └── test/
│   ├── testing/
│   │   ├── fixtures/
│   │   ├── sandbox/
│   │   ├── webhook-receiver/
│   │   ├── ledger-failure/
│   │   └── e2e/
│   ├── sdk-node/
│   ├── sdk-python/
│   ├── sdk-java/
│   └── sdk-go/
│
├── daml/
│   ├── multi-package.yaml
│   ├── pillar-core/
│   │   ├── daml.yaml
│   │   ├── daml/Pillar/Core/
│   │   └── test/
│   ├── pillar-assets/
│   │   ├── daml.yaml
│   │   ├── daml/Pillar/Assets/
│   │   └── test/
│   ├── pillar-intents/
│   │   ├── daml.yaml
│   │   ├── daml/Pillar/Intents/
│   │   └── test/
│   ├── pillar-ops/
│   │   ├── daml.yaml
│   │   ├── daml/Pillar/Ops/
│   │   └── test/
│   ├── pillar-token-adapter/
│   │   ├── daml.yaml
│   │   ├── daml/Pillar/TokenStandard/
│   │   └── test/
│   └── pillar-test/
│       ├── daml.yaml
│       ├── daml/Pillar/Test/
│       └── test/
│
├── infra/
│   ├── compose/
│   │   ├── local.yml
│   │   ├── local-auth.yml
│   │   ├── localnet.yml
│   │   └── webhook-test.yml
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   ├── ledger-command.Dockerfile
│   │   ├── projection-worker.Dockerfile
│   │   ├── workflow-orchestrator.Dockerfile
│   │   ├── webhook-dispatcher.Dockerfile
│   │   └── migrator.Dockerfile
│   ├── helm/
│   │   ├── pillar/
│   │   │   ├── Chart.yaml
│   │   │   ├── values.yaml
│   │   │   ├── values-dev.yaml
│   │   │   ├── values-testnet.yaml
│   │   │   ├── values-mainnet.yaml
│   │   │   └── templates/
│   │   │       ├── api-deployment.yaml
│   │   │       ├── ledger-command-deployment.yaml
│   │   │       ├── projection-worker-deployment.yaml
│   │   │       ├── workflow-orchestrator-deployment.yaml
│   │   │       ├── webhook-dispatcher-deployment.yaml
│   │   │       ├── migrator-job.yaml
│   │   │       ├── dar-upload-job.yaml
│   │   │       ├── configmap.yaml
│   │   │       ├── secret.yaml
│   │   │       ├── ingress.yaml
│   │   │       ├── service.yaml
│   │   │       ├── serviceaccount.yaml
│   │   │       ├── networkpolicy.yaml
│   │   │       ├── hpa.yaml
│   │   │       ├── pdb.yaml
│   │   │       └── servicemonitor.yaml
│   │   └── canton-local/
│   ├── k8s/
│   ├── terraform/
│   │   ├── aws/
│   │   ├── gcp/
│   │   └── azure/
│   ├── observability/
│   │   ├── grafana/
│   │   ├── prometheus/
│   │   ├── otel/
│   │   └── alerts/
│   └── policy/
│       ├── opa/
│       └── kyverno/
│
├── tools/
│   ├── cli/
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── login.ts
│   │   │   │   ├── sandbox.ts
│   │   │   │   ├── events.ts
│   │   │   │   ├── webhooks.ts
│   │   │   │   ├── balances.ts
│   │   │   │   └── traces.ts
│   │   │   └── main.ts
│   │   └── test/
│   ├── codegen/
│   │   ├── openapi-to-sdks/
│   │   ├── daml-codegen/
│   │   └── generate-all.sh
│   ├── migrator/
│   │   ├── src/
│   │   └── test/
│   ├── dev/
│   │   ├── up.sh
│   │   ├── down.sh
│   │   ├── reset-ledger.sh
│   │   ├── reset-db.sh
│   │   └── seed.sh
│   └── scripts/
│       ├── ci/
│       ├── release/
│       └── diagnostics/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── daml.yml
│       ├── integration.yml
│       ├── release.yml
│       ├── helm.yml
│       └── security.yml
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── settings.gradle.kts
├── build.gradle.kts
├── Makefile
├── README.md
└── RELEASE.md
```

### 3. Directory Responsibilities

| Directory                         | 책임                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`                        | Public Stripe-like REST API. Canton internals hiding, versioning, idempotency, auth, request validation, response shaping |
| `apps/dashboard`                  | 고객용 dashboard. balances, holdings, events, webhooks, API keys                                                             |
| `apps/workbench`                  | 개발자·운영자용 Workbench. API explorer, ledger trace, webhook inspector, event replay, projection lag                           |
| `apps/docs`                       | API docs, SDK docs, changelog, migration guide, versioning guide                                                          |
| `services/ledger-command`         | Canton command submission. Daml codegen bindings, command dedup, submission/completion correlation                        |
| `services/projection-worker`      | Ledger/PQS read path. balance, holding, transfer, event, operation projection materialization                             |
| `services/workflow-orchestrator`  | State-triggered/time-triggered automation. retries, expiry, release, settlement continuation                              |
| `services/webhook-dispatcher`     | Event delivery, signature, retry, DLQ, manual replay                                                                      |
| `services/compliance-adapter`     | KYC/AML/sanctions/risk integration. ledger workflow advancement only after policy result                                  |
| `services/token-standard-adapter` | CN Token Standard / Wallet SDK / external asset workflow adapter                                                          |
| `services/reconciler`             | Projection rebuild, balance reconciliation, ledger offset audit                                                           |
| `packages/api-contracts`          | OpenAPI, JSON Schema, examples, golden response snapshots                                                                 |
| `packages/domain`                 | Shared object IDs, status enum, amount/decimal handling, metadata rules                                                   |
| `packages/db`                     | SQL migrations, generated DB types, seed, views                                                                           |
| `packages/idempotency`            | Request hash, key state machine, replay response handling                                                                 |
| `packages/ledger-types`           | Generated Daml Java/TS bindings                                                                                           |
| `packages/observability`          | tracing, metrics, log conventions, Grafana dashboards                                                                     |
| `packages/security`               | API key hashing, webhook HMAC, JWT validation helpers                                                                     |
| `packages/testing`                | shared fixtures, sandbox harness, e2e helpers, mock webhook receiver                                                      |
| `packages/sdk-*`                  | Client SDKs generated from OpenAPI plus handwritten ergonomics                                                            |
| `daml/*`                          | On-ledger source-of-truth workflows                                                                                       |
| `infra/compose`                   | Local dev, auth dev, LocalNet, webhook test compose files                                                                 |
| `infra/helm`                      | Kubernetes deployment charts                                                                                              |
| `infra/terraform`                 | Cloud infra modules                                                                                                       |
| `tools/cli`                       | `pillar` CLI                                                                                                              |
| `tools/codegen`                   | OpenAPI SDK generation, Daml codegen, schema generation                                                                   |
| `tools/migrator`                  | DB migration runner                                                                                                       |
| `.github/workflows`               | CI/CD pipelines                                                                                                           |

---

## Language Selection

| Layer                      | Language / Tool                 | Rationale                                                                           |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| On-ledger model            | Daml                            | Canton-native workflow definition, DAR artifact, typed contracts/choices            |
| Ledger command runtime     | Kotlin/JVM                      | Strong typing, Daml Java codegen compatibility, gRPC ergonomics, robust concurrency |
| Projection / orchestration | Kotlin/JVM                      | Ledger/PQS integration, typed domain logic, offset/retry discipline                 |
| Public API                 | TypeScript + Fastify            | Stripe-like REST ergonomics, OpenAPI generation, fast iteration, SDK alignment      |
| Webhook dispatcher         | TypeScript                      | JSON/event-centric, HMAC, retry, API object versioning                              |
| Dashboard / Workbench      | TypeScript + Next.js            | Developer-facing UX, API explorer, event inspector                                  |
| SDK Node                   | TypeScript                      | First-class external developer experience                                           |
| SDK Python                 | Python                          | Data/fintech/common integration use case                                            |
| SDK Java                   | Java                            | Enterprise backend use case                                                         |
| DB                         | PostgreSQL + SQL migrations     | Projection/audit/config; strong transactional idempotency                           |
| Infra                      | Helm, Docker Compose, Terraform | Local-to-prod deployment consistency                                                |

**Decision:** Ledger-facing services stay JVM-first. Public API and developer tooling stay TypeScript-first. This avoids forcing Canton concerns into the public API while preserving typed Daml integration internally.

---

## Service Boundary

| Service                  | Owns                                                                    | Does not own                         | Critical invariant                                             |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| `apps/api`               | API auth, versioning, idempotency, validation, intent acceptance        | Ledger command construction details  | Never exposes Canton internals                                 |
| `ledger-command`         | Daml command creation/submission, command dedup, completion correlation | Public API grammar, webhook delivery | One external operation maps to stable command identity         |
| `projection-worker`      | Read model materialization from ledger/PQS                              | External mutation acceptance         | Projection must be rebuildable                                 |
| `workflow-orchestrator`  | Automated ledger workflow advancement                                   | Asset state source                   | Retry whole task from latest PQS state                         |
| `webhook-dispatcher`     | Signed event delivery and replay                                        | Event creation authority             | Sends only persisted `event_log` events                        |
| `compliance-adapter`     | Off-ledger policy result ingestion                                      | Direct asset mutation                | Policy result advances ledger workflow through command runtime |
| `token-standard-adapter` | Token standard interoperability                                         | Pillar public API semantics          | Adapter cannot leak contract-first semantics                   |
| `reconciler`             | Projection integrity, ledger/DB comparison                              | Business workflow mutation           | Emits alerts and rebuild tasks, not hidden corrections         |

---

## Dependency Graph

```mermaid
graph TD
  DamlCore[daml/pillar-core] --> DamlAssets[daml/pillar-assets]
  DamlCore --> DamlIntents[daml/pillar-intents]
  DamlAssets --> DamlIntents
  DamlIntents --> DamlOps[daml/pillar-ops]
  DamlAssets --> DamlTokenAdapter[daml/pillar-token-adapter]

  DamlOps --> LedgerTypes[packages/ledger-types]
  DamlIntents --> LedgerTypes

  ApiContracts[packages/api-contracts] --> Api[apps/api]
  Domain[packages/domain] --> Api
  DB[packages/db] --> Api
  Idempotency[packages/idempotency] --> Api

  LedgerTypes --> LedgerCommand[services/ledger-command]
  DB --> LedgerCommand

  LedgerTypes --> Projection[services/projection-worker]
  DB --> Projection

  LedgerTypes --> Orchestrator[services/workflow-orchestrator]
  DB --> Orchestrator
  LedgerCommand --> Orchestrator

  DB --> Webhook[services/webhook-dispatcher]
  Security[packages/security] --> Webhook

  ApiContracts --> SDKNode[packages/sdk-node]
  ApiContracts --> SDKPython[packages/sdk-python]
  ApiContracts --> SDKJava[packages/sdk-java]
  ApiContracts --> CLI[tools/cli]
  ApiContracts --> Workbench[apps/workbench]

  Canton[(Canton Ledger)] --> Projection
  LedgerCommand --> Canton
  Orchestrator --> LedgerCommand
  Projection --> Webhook
```

---

## API / Object Model

### 1. API Grammar

Pillar public API는 Stripe-style grammar를 따른다.

```http
POST   /v1/accounts
GET    /v1/accounts/:id
GET    /v1/accounts?limit=10&starting_after=acct_...

POST   /v1/assets
GET    /v1/assets/:id
GET    /v1/assets

GET    /v1/balances
GET    /v1/balances/:id
GET    /v1/holdings
GET    /v1/holdings/:id

POST   /v1/issue_intents
GET    /v1/issue_intents/:id
POST   /v1/redeem_intents
GET    /v1/redeem_intents/:id
POST   /v1/transfer_intents
GET    /v1/transfer_intents/:id

POST   /v1/holds
GET    /v1/holds/:id
POST   /v1/holds/:id/release

GET    /v1/operations/:id
GET    /v1/events
GET    /v1/events/:id

POST   /v1/webhook_endpoints
GET    /v1/webhook_endpoints/:id
POST   /v1/webhook_endpoints/:id/rotate_secret
```

Common request headers:

```http
Authorization: Bearer sk_live_...
Idempotency-Key: 9f2d1c8e-...
Pillar-Version: 2026-05-26
```

Common response shape:

```json
{
  "id": "trint_01HY...",
  "object": "transfer_intent",
  "created": 1779775200,
  "livemode": false,
  "status": "processing",
  "amount": "100.00",
  "asset": "asst_usdc",
  "from_account": "acct_sender",
  "to_account": "acct_receiver",
  "metadata": {
    "order_id": "ord_123"
  },
  "operation": "op_01HY...",
  "latest_event": "evt_01HY..."
}
```

List response:

```json
{
  "object": "list",
  "url": "/v1/holdings",
  "has_more": true,
  "data": [
    {
      "id": "hld_01HY...",
      "object": "holding"
    }
  ]
}
```

### 2. Public Objects

| Object             | ID prefix | Meaning                                              |
| ------------------ | --------: | ---------------------------------------------------- |
| `account`          |   `acct_` | Customer/sub-account abstraction                     |
| `asset`            |   `asst_` | Canton-backed asset configuration                    |
| `balance`          |    `bal_` | Aggregate balance by account + asset                 |
| `holding`          |    `hld_` | Granular position/lot abstraction, not contract ID   |
| `issue_intent`     | `issint_` | Mint/issue request lifecycle                         |
| `redeem_intent`    | `redint_` | Redemption/burn request lifecycle                    |
| `transfer_intent`  |  `trint_` | Transfer request lifecycle                           |
| `hold`             |   `hold_` | Reserved/locked amount with expiry/purpose           |
| `operation`        |     `op_` | Ledger-traceable internal operation                  |
| `event`            |    `evt_` | Immutable async event                                |
| `webhook_endpoint` |     `we_` | Event delivery target                                |
| `api_key`          |     `ak_` | Public key descriptor; secret key returned only once |

### 3. Status Model

#### Intent status

```text
requires_action
processing
succeeded
failed
canceled
expired
```

#### Operation status

```text
received
queued
submitted
in_flight
ledger_committed
projected
failed
unknown
reconciled
```

#### Webhook delivery status

```text
pending
delivered
failed
retrying
dead_lettered
manually_replayed
```

### 4. Balance / Holding Model

Balance is an API projection, not a ledger contract.

```json
{
  "id": "bal_01HY...",
  "object": "balance",
  "account": "acct_merchant",
  "asset": "asst_usdc",
  "available": "1000.00",
  "pending": "50.00",
  "reserved": "200.00",
  "settled": "1200.00",
  "as_of_ledger_offset": "000000000000123456",
  "as_of_ledger_time": "2026-05-26T08:10:00Z"
}
```

Holding is a granular position abstraction.

```json
{
  "id": "hld_01HY...",
  "object": "holding",
  "account": "acct_merchant",
  "asset": "asst_usdc",
  "amount": "500.00",
  "status": "active",
  "restrictions": [],
  "source_intent": "issint_01HY...",
  "metadata": {}
}
```

### 5. Operation Trace

Public `operation` exposes ledger trace without leaking contract-first details.

```json
{
  "id": "op_01HY...",
  "object": "operation",
  "intent": "trint_01HY...",
  "status": "ledger_committed",
  "ledger": {
    "backend": "canton",
    "command_id": "cmd_01HY...",
    "submission_id": "sub_01HY...",
    "update_id": "1220...",
    "offset": "000000000000123456",
    "participant_hint": "redacted"
  },
  "created": 1779775200
}
```

Default public API redacts `participant_id`, `party_id`, `package_id`, `contract_id`. Admin-scoped API can use `expand[]=ledger.debug` only in non-production or explicitly authorized operator contexts.

---

## Internal Runtime

### 1. Intent-first Write Path

```text
1. Client sends POST /v1/transfer_intents with Idempotency-Key.
2. apps/api authenticates, validates, resolves API version.
3. apps/api starts DB transaction:
   - insert api_requests
   - insert or lock idempotency_keys
   - insert intent audit row
   - insert operation row
   - insert ledger_command_requests row
   - commit
4. ledger-command polls or receives command request.
5. ledger-command builds Daml command via generated bindings.
6. ledger-command submits command to Canton Ledger API:
   - stable command_id
   - unique submission_id per attempt
   - act_as resolved from tenant party mapping
7. Canton commits or rejects.
8. projection-worker reads updates/PQS and materializes:
   - balances
   - holdings
   - transfers
   - operation status
   - event_log
9. webhook-dispatcher sends event to subscribed endpoints.
10. Client observes final state via webhook or GET /v1/transfer_intents/:id.
```

### 2. Command Identity

| Field                  | Pillar value                                  |
| ---------------------- | --------------------------------------------- |
| `operation_id`         | `op_*`, public-safe operation identifier      |
| `command_id`           | stable deterministic ID from operation        |
| `submission_id`        | unique per submission attempt                 |
| `user_id`              | internal ledger user mapped to service/tenant |
| `act_as`               | internal party from `party_mappings`          |
| `deduplication_period` | configured per participant capability         |

Rule:

```text
same external intended change
= same tenant + same endpoint + same idempotency key + same request hash
= same operation_id
= same command_id
```

`submission_id` must change on every attempt; `command_id` must not change for the same intended ledger change.

### 3. Projection-first Read Path

Read APIs never query Daml contracts directly from public request handlers. They read `balances`, `holdings`, `transfers`, `events`, `operations` projections with explicit `as_of_ledger_offset`.

Strong read option:

```http
GET /v1/balances?account=acct_...&asset=asst_...&consistency=wait_for_operation&operation=op_...
```

Behavior:

```text
- If projection offset >= operation commit offset: return current projection.
- If projection lag is within SLA: wait bounded time.
- If lag exceeds SLA: return 202-style object with projection_lag metadata or processing status.
```

### 4. Automation Runtime

Workflow automation is split into retriable tasks.

Examples:

| Task                              | Trigger                      | Action                                           |
| --------------------------------- | ---------------------------- | ------------------------------------------------ |
| `expire_hold`                     | time-based                   | exercise Daml choice to release expired hold     |
| `complete_issue_after_compliance` | off-ledger compliance result | advance issue intent                             |
| `settle_transfer`                 | state-based                  | exercise transfer settlement choice              |
| `reconcile_projection_gap`        | offset gap detected          | replay from checkpoint                           |
| `retry_unknown_command`           | operation unknown            | query completion/update state, then retry safely |

The orchestrator must always re-query latest PQS/projection state before submitting a command. It must never replay a stale decision blindly.

---

## DB Schema

### 1. Schema Groups

```text
config
  tenants
  accounts
  asset_configs
  party_mappings
  api_keys
  api_versions
  webhook_endpoints

audit
  api_requests
  idempotency_keys
  intents
  operations
  ledger_command_requests
  ledger_command_attempts
  audit_log

projection
  balances
  holdings
  transfers
  holds
  ledger_events
  projection_checkpoints
  operation_projection

webhook
  event_log
  webhook_deliveries
  webhook_attempts

reconciliation
  reconciliation_runs
  reconciliation_diffs
```

### 2. Core Table Sketch

```sql
create table tenants (
  id text primary key,
  livemode boolean not null default false,
  default_api_version text not null,
  created_at timestamptz not null default now()
);

create table accounts (
  id text primary key,
  tenant_id text not null references tenants(id),
  external_reference text,
  status text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table party_mappings (
  id text primary key,
  tenant_id text not null references tenants(id),
  account_id text references accounts(id),
  canton_party text not null,
  participant_alias text not null,
  purpose text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, account_id, purpose)
);

create table idempotency_keys (
  tenant_id text not null,
  key text not null,
  method text not null,
  path text not null,
  request_hash text not null,
  response_status int,
  response_body jsonb,
  operation_id text,
  status text not null,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

create table intents (
  id text primary key,
  tenant_id text not null references tenants(id),
  type text not null,
  status text not null,
  request_body jsonb not null,
  metadata jsonb not null default '{}',
  operation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table operations (
  id text primary key,
  tenant_id text not null references tenants(id),
  intent_id text references intents(id),
  status text not null,
  command_id text unique,
  latest_submission_id text,
  update_id text,
  ledger_offset text,
  ledger_time timestamptz,
  trace_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ledger_command_requests (
  id text primary key,
  tenant_id text not null references tenants(id),
  operation_id text not null references operations(id),
  command_type text not null,
  command_payload jsonb not null,
  status text not null,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table balances (
  id text primary key,
  tenant_id text not null references tenants(id),
  account_id text not null references accounts(id),
  asset_id text not null,
  available numeric(38, 18) not null,
  pending numeric(38, 18) not null,
  reserved numeric(38, 18) not null,
  settled numeric(38, 18) not null,
  as_of_ledger_offset text not null,
  as_of_ledger_time timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, account_id, asset_id)
);

create table holdings (
  id text primary key,
  tenant_id text not null references tenants(id),
  account_id text not null references accounts(id),
  asset_id text not null,
  amount numeric(38, 18) not null,
  status text not null,
  source_intent_id text,
  as_of_ledger_offset text not null,
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table event_log (
  id text primary key,
  tenant_id text not null references tenants(id),
  type text not null,
  api_version text not null,
  data_object jsonb not null,
  request_id text,
  idempotency_key text,
  operation_id text references operations(id),
  ledger_offset text,
  created_at timestamptz not null default now()
);

create table webhook_deliveries (
  id text primary key,
  tenant_id text not null references tenants(id),
  event_id text not null references event_log(id),
  endpoint_id text not null,
  status text not null,
  next_attempt_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 3. Migration Structure

```text
packages/db/migrations/
├── 0000_extensions/
│   ├── 0001_pgcrypto.sql
│   └── 0002_updated_at_trigger.sql
├── 0010_config/
│   ├── 0010_tenants.sql
│   ├── 0011_accounts.sql
│   ├── 0012_asset_configs.sql
│   ├── 0013_party_mappings.sql
│   └── 0014_api_versions.sql
├── 0020_audit/
│   ├── 0020_api_requests.sql
│   ├── 0021_audit_log.sql
│   └── 0022_trace_indices.sql
├── 0030_idempotency/
│   ├── 0030_idempotency_keys.sql
│   └── 0031_idempotency_gc.sql
├── 0040_intents_operations/
│   ├── 0040_intents.sql
│   ├── 0041_operations.sql
│   ├── 0042_ledger_command_requests.sql
│   └── 0043_ledger_command_attempts.sql
├── 0050_projections/
│   ├── 0050_balances.sql
│   ├── 0051_holdings.sql
│   ├── 0052_transfers.sql
│   ├── 0053_holds.sql
│   ├── 0054_projection_checkpoints.sql
│   └── 0055_projection_indices.sql
├── 0060_events_webhooks/
│   ├── 0060_event_log.sql
│   ├── 0061_webhook_endpoints.sql
│   ├── 0062_webhook_deliveries.sql
│   └── 0063_webhook_attempts.sql
├── 0070_reconciliation/
│   ├── 0070_reconciliation_runs.sql
│   └── 0071_reconciliation_diffs.sql
└── repeatable/
    ├── R__balance_summary_view.sql
    ├── R__operation_trace_view.sql
    └── R__webhook_health_view.sql
```

Migration rules:

1. **Forward-only.**
2. No migration may rewrite source-of-truth asset state.
3. Projection tables may be dropped/rebuilt by controlled reconciler.
4. Audit/config tables require expand-and-contract migrations.
5. Every migration has:

   * `up.sql`
   * optional `down.sql` only for local dev
   * `verify.sql`
   * owner service
   * rollback note
6. Helm deployment runs migrations as a pre-upgrade Job before application rollout.

---

## Failure Modes

| Failure mode                                       | Risk                             | Mitigation                                                                 |
| -------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| Duplicate POST request                             | Double issue/transfer/redeem     | `Idempotency-Key`, request hash, stable operation and command ID           |
| API timeout after DB commit                        | Client thinks request failed     | retry same idempotency key returns same accepted object                    |
| API timeout after ledger submission                | Unknown command state            | operation becomes `unknown`; query completion/update before retry          |
| Participant crash                                  | Command not completed or delayed | command dedup, bounded retry, health state `degraded`                      |
| Network loss between command submit and completion | Duplicate command risk           | reuse same command ID, new submission ID only                              |
| Projection lag                                     | stale balance                    | `as_of_ledger_offset`, lag metrics, optional bounded wait                  |
| Projection corruption                              | incorrect read model             | rebuild from ledger/PQS, reconciliation diffs                              |
| Webhook endpoint down                              | customer misses state change     | retry/backoff, manual replay, event listing                                |
| Webhook replay attack                              | forged/old delivery accepted     | HMAC signature, timestamp tolerance, endpoint secret rotation              |
| DB outage before ledger command                    | accepted request unavailable     | API does not submit ledger command before DB transaction commit            |
| DB outage after ledger commit                      | lost projection update           | replay from ledger offset/PQS checkpoint                                   |
| Daml package upgrade mismatch                      | command construction fails       | package version registry, DAR upload gate, compatibility tests             |
| Tenant/party mapping error                         | wrong party acts                 | party mapping validation, canActAs token scoping, dry-run tests            |
| Contract contention                                | failed transfer/hold             | intent remains processing/failed with retryable classification             |
| Compliance adapter unavailable                     | workflow stuck                   | intent `requires_action` or `processing`, automated retry, manual override |
| Rollback requested after ledger commit             | impossible rollback              | compensating intent, not DB rollback                                       |

---

## Security / Compliance

### 1. API Security

| Area        | Control                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| API keys    | Store only hashed secret keys; show secret once                            |
| Auth        | Bearer secret key for server API; scoped keys for restricted operations    |
| Versioning  | `Pillar-Version` header + tenant default version                           |
| Idempotency | mutation endpoints require `Idempotency-Key`                               |
| Rate limit  | tenant + key + endpoint buckets                                            |
| Metadata    | no PII/secrets; enforce size/key limits                                    |
| Audit       | every request has `request_id`, `trace_id`, `operation_id` when applicable |

### 2. Ledger Security

| Area                | Control                                                       |
| ------------------- | ------------------------------------------------------------- |
| Ledger API auth     | JWT access token per ledger client                            |
| Party rights        | `canReadAs` for projection, `canActAs` for command submission |
| mTLS                | enabled in staging/prod participant connections               |
| Party mapping       | tenant/account-to-party mapping stored in config schema       |
| Contract visibility | public API never exposes contract IDs                         |
| DAR deployment      | artifact versioning, checksum, environment promotion gate     |

### 3. Webhook Security

Webhook signature header:

```http
Pillar-Signature: t=1779775200,v1=base64_hmac_sha256(...)
```

Signed payload:

```text
timestamp + "." + raw_body
```

Controls:

1. HMAC-SHA256 with endpoint secret.
2. Timestamp tolerance.
3. Multiple active secrets during rotation.
4. Raw body verification.
5. Delivery attempt IDs.
6. Replay-safe event processing guidance.
7. Manual replay with same `event.id` and new delivery ID.

### 4. Compliance Posture

| Requirement              | Pillar implementation                                                     |
| ------------------------ | ------------------------------------------------------------------------- |
| KYC / AML                | off-ledger compliance adapter; result advances Daml workflow              |
| Auditability             | operation trace from API request to ledger update                         |
| Non-repudiation          | participant-scoped command submission and ledger record                   |
| Data minimization        | PII off-ledger only; no PII in metadata or Daml contracts unless required |
| Regulated asset controls | Daml-level transfer restrictions and hold/release workflows               |
| Environment separation   | test/live mode split, separate keys, separate ledger/DB configs           |

---

## Implementation Plan

### Phase 0 — Repository and Toolchain Foundation

Deliverables:

* `pnpm-workspace.yaml`
* Gradle multi-project setup
* `daml/multi-package.yaml`
* `Makefile`
* `tools/codegen/generate-all.sh`
* base Dockerfiles
* local compose skeleton

Commands:

```bash
make bootstrap
make daml-build
make codegen
make test
make dev-up
```

Acceptance:

* `dpm build` builds all Daml packages.
* `dpm test` runs Daml Script tests.
* `pnpm -w test` passes.
* `./gradlew test` passes.
* `docker compose -f infra/compose/local.yml up` starts Postgres, API, sandbox profile, webhook receiver.

---

### Phase 1 — Daml Source-of-Truth Model

Daml packages:

```text
daml/pillar-core
daml/pillar-assets
daml/pillar-intents
daml/pillar-ops
daml/pillar-token-adapter
daml/pillar-test
```

Core templates/interfaces:

```text
Pillar.Core.TenantConfig
Pillar.Core.AccountRef
Pillar.Assets.AssetRules
Pillar.Assets.Holding
Pillar.Assets.Hold
Pillar.Intents.IssueIntent
Pillar.Intents.RedeemIntent
Pillar.Intents.TransferIntent
Pillar.Ops.OperationTrace
Pillar.Ops.WorkflowTask
```

Acceptance:

* Daml Script tests cover issue, transfer, hold, release, redeem.
* No public object ID depends on Daml `ContractId`.
* Every intent creates or updates ledger-visible operation trace.
* DAR artifacts are versioned.

---

### Phase 2 — API Contract and Object Grammar

Deliverables:

```text
packages/api-contracts/openapi/pillar-v1.yaml
packages/api-contracts/examples/*.json
packages/api-contracts/golden/*.json
apps/api/src/routes/v1/*
apps/api/src/presenters/*
```

Acceptance:

* OpenAPI validates every route.
* All list endpoints implement cursor pagination.
* All mutation endpoints require `Idempotency-Key`.
* All public objects include `id`, `object`, `created`, `livemode`, `metadata`.
* No public response includes `contractId`, `templateId`, `partyId`.

---

### Phase 3 — DB Migrations and Idempotency

Deliverables:

```text
packages/db/migrations/*
packages/idempotency/src/*
tools/migrator/src/*
```

Acceptance:

* Migration runner applies all migrations from empty DB.
* Idempotency replay returns original response.
* Same key with different request hash returns conflict.
* API crash during in-flight idempotent request is recoverable.
* `api_requests`, `operations`, `ledger_command_requests` are trace-linked.

---

### Phase 4 — Ledger Command Runtime

Deliverables:

```text
services/ledger-command/src/main/kotlin/*
packages/ledger-types/generated/java/*
```

Acceptance:

* Command runtime submits issue, transfer, hold, release, redeem.
* Uses stable `command_id` per operation.
* Uses unique `submission_id` per attempt.
* Handles duplicate/in-flight/failed command outcomes.
* Writes command attempt audit.
* Integration tests pass against `dpm sandbox`.

---

### Phase 5 — Projection Worker and Reconciliation

Deliverables:

```text
services/projection-worker/src/main/kotlin/*
services/reconciler/src/main/kotlin/*
packages/db/migrations/0050_projections/*
```

Acceptance:

* Projection worker materializes balances and holdings from ledger/PQS.
* Every projection row has `as_of_ledger_offset`.
* Rebuild from empty projection tables yields same balances.
* Reconciler detects offset gaps and balance mismatch.
* API exposes projection lag.

---

### Phase 6 — Webhook-first Event System

Deliverables:

```text
services/webhook-dispatcher/src/*
packages/security/src/webhook-signature/*
apps/api/src/routes/v1/events*
apps/api/src/routes/v1/webhook_endpoints*
```

Acceptance:

* `event_log` created from projected ledger changes.
* Webhook endpoint version pins event payload shape.
* Dispatcher signs payloads.
* Retry/backoff and DLQ work.
* CLI can trigger test events and replay real events.
* Workbench shows delivery attempts.

---

### Phase 7 — SDK, CLI, Workbench

Deliverables:

```text
packages/sdk-node
packages/sdk-python
packages/sdk-java
tools/cli
apps/workbench
apps/docs
```

Acceptance:

* SDKs generated from OpenAPI with handwritten convenience wrappers.
* CLI supports:

  * `pillar login`
  * `pillar sandbox up`
  * `pillar events list`
  * `pillar events replay`
  * `pillar webhooks listen`
  * `pillar traces get op_...`
* Workbench supports:

  * API Explorer
  * Event inspector
  * Webhook delivery viewer
  * Ledger trace viewer
  * Projection health

---

### Phase 8 — CI/CD and Helm Deployment

Deliverables:

```text
.github/workflows/*.yml
infra/helm/pillar/*
infra/docker/*
infra/terraform/*
```

Acceptance:

* CI builds Daml, JVM, TS, Docker images.
* CI stores DAR artifacts with checksum/version.
* Integration tests start sandbox.
* Optional LocalNet tests cover cross-participant scenarios.
* Helm chart deploys all services.
* Helm pre-upgrade Job applies migrations.
* Helm Job uploads DAR to target participant.
* Deployment supports `sandbox`, `validator`, `customer-hosted`, `self-hosted`.

---

## Local Dev Compose

`infra/compose/local.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: pillar
      POSTGRES_PASSWORD: pillar
      POSTGRES_DB: pillar
    ports:
      - "5432:5432"
    volumes:
      - pillar_pg:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  webhook-receiver:
    build:
      context: ../../
      dockerfile: infra/docker/webhook-receiver.Dockerfile
    ports:
      - "9090:9090"

  canton-sandbox:
    image: pillar/dpm-sandbox:local
    command:
      - "dpm"
      - "sandbox"
      - "--port"
      - "6865"
      - "--json-api-port"
      - "7575"
      - "--dar"
      - "/daml/pillar.dar"
    volumes:
      - ../../daml/.daml/dist:/daml
    ports:
      - "6865:6865"
      - "7575:7575"

  migrator:
    build:
      context: ../../
      dockerfile: infra/docker/migrator.Dockerfile
    depends_on:
      - postgres
    environment:
      DATABASE_URL: postgres://pillar:pillar@postgres:5432/pillar
    command: ["migrate", "up"]

  api:
    build:
      context: ../../
      dockerfile: infra/docker/api.Dockerfile
    depends_on:
      - postgres
      - migrator
    environment:
      DATABASE_URL: postgres://pillar:pillar@postgres:5432/pillar
      PILLAR_MODE: sandbox
      LEDGER_API_HOST: canton-sandbox
      LEDGER_API_PORT: "6865"
    ports:
      - "8080:8080"

  ledger-command:
    build:
      context: ../../
      dockerfile: infra/docker/ledger-command.Dockerfile
    depends_on:
      - postgres
      - canton-sandbox
    environment:
      DATABASE_URL: postgres://pillar:pillar@postgres:5432/pillar
      LEDGER_API_HOST: canton-sandbox
      LEDGER_API_PORT: "6865"

  projection-worker:
    build:
      context: ../../
      dockerfile: infra/docker/projection-worker.Dockerfile
    depends_on:
      - postgres
      - canton-sandbox
    environment:
      DATABASE_URL: postgres://pillar:pillar@postgres:5432/pillar
      LEDGER_API_HOST: canton-sandbox
      LEDGER_API_PORT: "6865"
      PQS_JDBC_URL: jdbc:postgresql://postgres:5432/pillar_pqs

  webhook-dispatcher:
    build:
      context: ../../
      dockerfile: infra/docker/webhook-dispatcher.Dockerfile
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgres://pillar:pillar@postgres:5432/pillar
      REDIS_URL: redis://redis:6379

volumes:
  pillar_pg:
```

Profiles:

```text
local.yml          # fastest local loop
local-auth.yml     # JWT/mTLS-like auth simulation
localnet.yml       # multi-validator / cross-party scenario
webhook-test.yml   # webhook receiver, replay, retry chaos tests
```

---

## Helm Deployment

### Chart Structure

```text
infra/helm/pillar/
├── Chart.yaml
├── values.yaml
├── values-dev.yaml
├── values-testnet.yaml
├── values-mainnet.yaml
└── templates/
    ├── api-deployment.yaml
    ├── ledger-command-deployment.yaml
    ├── projection-worker-deployment.yaml
    ├── workflow-orchestrator-deployment.yaml
    ├── webhook-dispatcher-deployment.yaml
    ├── migrator-job.yaml
    ├── dar-upload-job.yaml
    ├── configmap.yaml
    ├── secret.yaml
    ├── ingress.yaml
    ├── service.yaml
    ├── serviceaccount.yaml
    ├── networkpolicy.yaml
    ├── hpa.yaml
    ├── pdb.yaml
    └── servicemonitor.yaml
```

### Values Model

```yaml
global:
  environment: dev
  deploymentMode: hosted-validator
  apiVersionDefault: "2026-05-26"

images:
  api: ghcr.io/pillar/api:0.1.0
  ledgerCommand: ghcr.io/pillar/ledger-command:0.1.0
  projectionWorker: ghcr.io/pillar/projection-worker:0.1.0
  webhookDispatcher: ghcr.io/pillar/webhook-dispatcher:0.1.0
  workflowOrchestrator: ghcr.io/pillar/workflow-orchestrator:0.1.0
  migrator: ghcr.io/pillar/migrator:0.1.0

database:
  urlSecretRef:
    name: pillar-db
    key: url

ledger:
  mode: canton
  participant:
    ledgerApiHost: participant.example.internal
    ledgerApiPort: 6865
    jsonApiHost: participant-json.example.internal
    jsonApiPort: 7575
  auth:
    jwtIssuer: pillar-ledger-client
    tokenSecretRef:
      name: pillar-ledger-token
      key: token
  tls:
    enabled: true
    secretRef: pillar-ledger-mtls

dar:
  upload:
    enabled: true
    artifactRef: s3://pillar-artifacts/dar/pillar-0.1.0.dar
    checksum: sha256:...

api:
  publicBaseUrl: https://api.pillar.example
  ingress:
    enabled: true
  rateLimit:
    enabled: true

webhooks:
  maxAttempts: 12
  baseBackoffSeconds: 30
  signingSecretKmsKey: projects/.../keys/...

observability:
  otel:
    enabled: true
  prometheus:
    enabled: true
```

Deployment invariants:

1. `migrator-job` runs before app rollout.
2. `dar-upload-job` runs before ledger-command accepts work.
3. API pods start even if participant is temporarily degraded, but mutation endpoint returns controlled degraded errors.
4. Projection worker exposes `projection_lag_seconds`, `ledger_offset_gap`, `last_projected_offset`.
5. `deploymentMode` changes infrastructure wiring only; `/v1` API grammar does not change.

---

## Test Strategy

### Test Pyramid

| Layer              | Tests                                            | Tools                                                  |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------ |
| Daml unit          | templates, choices, invariants, negative cases   | `dpm test`, Daml Script                                |
| Domain unit        | IDs, amount math, metadata, status transitions   | Vitest/Jest, JUnit                                     |
| API contract       | OpenAPI validation, golden response snapshots    | Schemathesis/Dredd-style runner, custom snapshot tests |
| Idempotency        | replay, conflict, crash recovery                 | API integration tests                                  |
| Ledger integration | issue/transfer/hold/redeem through sandbox       | `dpm sandbox`, JUnit                                   |
| Projection         | replay, rebuild, offset checkpoint, lag          | projection test harness                                |
| Webhook            | signing, retry, DLQ, replay, endpoint versioning | mock receiver                                          |
| E2E                | SDK → API → ledger → projection → webhook        | compose                                                |
| Multi-participant  | cross-validator workflows                        | LocalNet profile                                       |
| Chaos              | participant restart, network loss, DB restart    | failure harness                                        |
| Performance        | throughput, projection lag, webhook retry volume | k6/JMeter/custom                                       |

### Required E2E Scenarios

1. Create asset.
2. Create account.
3. Issue asset to account.
4. Observe `issue_intent.processing`.
5. Projection updates `balance.available`.
6. Event `issue_intent.succeeded` created.
7. Webhook delivered and signed.
8. Create transfer intent.
9. Hold amount.
10. Release hold.
11. Redeem amount.
12. Rebuild projections from ledger and compare.

---

## CI/CD

### CI Stages

```text
1. lint
2. Daml build/test
3. Daml codegen Java/TS
4. TS build/test
5. JVM build/test
6. DB migration verify
7. API contract tests
8. Docker build
9. Sandbox integration tests
10. LocalNet integration tests
11. Security scan
12. Package artifacts
13. Helm template/lint
14. Deploy dev
15. Promote testnet
16. Promote mainnet
```

### GitHub Workflow Sketch

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  daml:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install DPM
        run: tools/scripts/ci/install-dpm.sh
      - name: Build Daml
        run: dpm build
      - name: Test Daml
        run: dpm test
      - name: Generate bindings
        run: tools/codegen/daml-codegen/generate.sh
      - name: Upload DAR
        uses: actions/upload-artifact@v4
        with:
          name: pillar-dar
          path: daml/**/.daml/dist/*.dar

  app:
    runs-on: ubuntu-latest
    needs: [daml]
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm -w lint
      - run: pnpm -w test
      - run: ./gradlew test
      - run: tools/migrator/bin/migrator verify

  integration:
    runs-on: ubuntu-latest
    needs: [app]
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f infra/compose/local.yml up -d
      - run: pnpm test:e2e
      - run: docker compose -f infra/compose/local.yml down -v

  helm:
    runs-on: ubuntu-latest
    needs: [integration]
    steps:
      - uses: actions/checkout@v4
      - run: helm lint infra/helm/pillar
      - run: helm template pillar infra/helm/pillar -f infra/helm/pillar/values-dev.yaml
```

---

## Milestone Plan

| Milestone                        | Duration | Scope                                                    | Exit Criteria                            |
| -------------------------------- | -------: | -------------------------------------------------------- | ---------------------------------------- |
| M0 Architecture Freeze           |   1 week | API grammar, service boundaries, Daml package boundaries | Design approved, OpenAPI skeleton merged |
| M1 Monorepo Bootstrap            |   1 week | pnpm, Gradle, DPM, compose, CI skeleton                  | all build commands pass                  |
| M2 Daml MVP                      |  2 weeks | asset, holding, issue, transfer, hold, redeem            | Daml Script tests pass                   |
| M3 Public API MVP                |  2 weeks | `/v1/assets`, `/accounts`, `/balances`, intents          | OpenAPI + golden tests pass              |
| M4 Idempotency + Command Runtime |  2 weeks | operation, command requests, sandbox submit              | duplicate-safe write path                |
| M5 Projection + Reconciliation   |  2 weeks | balances, holdings, events, offset checkpoints           | projection rebuild works                 |
| M6 Webhook-first Workflow        |  2 weeks | event log, dispatcher, signatures, replay                | webhook e2e pass                         |
| M7 SDK / CLI / Workbench         |  3 weeks | Node/Python/Java SDK, CLI, Workbench                     | developer sandbox flow works             |
| M8 Security / Auth / Compliance  |  2 weeks | API keys, JWT/mTLS, audit, compliance adapter            | staging auth profile pass                |
| M9 Helm / CI/CD / Release        |  2 weeks | charts, DAR upload, promotion gates                      | dev/testnet deploy successful            |
| M10 GA Hardening                 |  3 weeks | chaos, perf, docs, runbooks                              | SLO and recovery tests pass              |

---

## Agent-executable Task Breakdown

### A. Repository Foundation

| Task                        | Path                | Output                                              | Acceptance                          |
| --------------------------- | ------------------- | --------------------------------------------------- | ----------------------------------- |
| A01 Create workspace        | root                | `package.json`, `pnpm-workspace.yaml`, `turbo.json` | `pnpm install` succeeds             |
| A02 Create Gradle workspace | root                | `settings.gradle.kts`, `build.gradle.kts`           | `./gradlew projects` lists services |
| A03 Create Daml workspace   | `daml/`             | `multi-package.yaml`, package dirs                  | `dpm build` succeeds                |
| A04 Add Make targets        | root                | `Makefile`                                          | `make bootstrap`, `make test` work  |
| A05 Add CI skeleton         | `.github/workflows` | `ci.yml`, `daml.yml`                                | PR triggers workflows               |

### B. Daml Model

| Task                       | Path                        | Output                                          | Acceptance                           |
| -------------------------- | --------------------------- | ----------------------------------------------- | ------------------------------------ |
| B01 Core package           | `daml/pillar-core`          | tenant/account refs, shared types               | Daml compiles                        |
| B02 Asset package          | `daml/pillar-assets`        | `AssetRules`, `Holding`, `Hold`                 | issue/hold/release script passes     |
| B03 Intent package         | `daml/pillar-intents`       | issue/redeem/transfer intents                   | lifecycle scripts pass               |
| B04 Ops package            | `daml/pillar-ops`           | operation trace/task templates                  | command trace visible in tests       |
| B05 Token adapter boundary | `daml/pillar-token-adapter` | adapter interfaces                              | compiles without coupling public API |
| B06 Daml negative tests    | `daml/pillar-test`          | invalid transfer, over-hold, unauthorized actor | tests fail correctly                 |

### C. API Contract

| Task                   | Path                                     | Output                                          | Acceptance                          |
| ---------------------- | ---------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| C01 OpenAPI base       | `packages/api-contracts/openapi`         | `pillar-v1.yaml`                                | schema validates                    |
| C02 Object schemas     | `packages/api-contracts/schemas`         | account, asset, balance, holding, intent, event | examples validate                   |
| C03 Golden examples    | `packages/api-contracts/golden`          | snapshot JSON                                   | test runner passes                  |
| C04 Error model        | `apps/api/src/errors`                    | typed errors                                    | 4xx/5xx responses match schema      |
| C05 Version middleware | `apps/api/src/middleware/api-version.ts` | version resolver                                | account default + header tests pass |

### D. DB and Idempotency

| Task                            | Path                                             | Output                            | Acceptance                   |
| ------------------------------- | ------------------------------------------------ | --------------------------------- | ---------------------------- |
| D01 Config migrations           | `packages/db/migrations/0010_config`             | tenant/account/party tables       | empty DB migration succeeds  |
| D02 Audit migrations            | `packages/db/migrations/0020_audit`              | request/audit tables              | trace index present          |
| D03 Idempotency migrations      | `packages/db/migrations/0030_idempotency`        | idempotency table                 | conflict/replay tests pass   |
| D04 Intent/operation migrations | `packages/db/migrations/0040_intents_operations` | intent, operation, command queue  | operation trace query works  |
| D05 Projection migrations       | `packages/db/migrations/0050_projections`        | balance/holding/checkpoint tables | projection upsert tests pass |
| D06 Webhook migrations          | `packages/db/migrations/0060_events_webhooks`    | events/delivery tables            | retry state machine persists |
| D07 Migrator CLI                | `tools/migrator`                                 | `migrator up/verify`              | CI migration verify passes   |

### E. Public API

| Task                       | Path                                     | Output                   | Acceptance                          |
| -------------------------- | ---------------------------------------- | ------------------------ | ----------------------------------- |
| E01 API server             | `apps/api`                               | Fastify server           | health endpoint passes              |
| E02 Auth middleware        | `apps/api/src/middleware/auth.ts`        | API key validation       | hashed key auth passes              |
| E03 Idempotency middleware | `apps/api/src/middleware/idempotency.ts` | key lock/replay/conflict | duplicate POST test passes          |
| E04 Account routes         | `apps/api/src/routes/v1/accounts`        | CRUD-lite                | OpenAPI tests pass                  |
| E05 Asset routes           | `apps/api/src/routes/v1/assets`          | create/retrieve/list     | no ledger internals exposed         |
| E06 Intent routes          | `apps/api/src/routes/v1/*_intents`       | issue/redeem/transfer    | creates operation + command request |
| E07 Balance/holding routes | `apps/api/src/routes/v1/balances`        | projection reads         | cursor pagination tests pass        |
| E08 Event routes           | `apps/api/src/routes/v1/events`          | event list/retrieve      | event versioning tests pass         |

### F. Ledger Runtime

| Task                       | Path                      | Output                              | Acceptance                            |
| -------------------------- | ------------------------- | ----------------------------------- | ------------------------------------- |
| F01 Daml Java codegen      | `packages/ledger-types`   | generated bindings                  | Gradle compiles                       |
| F02 Ledger client          | `services/ledger-command` | gRPC client + auth                  | connects to sandbox                   |
| F03 Command builder        | `services/ledger-command` | issue/transfer/hold/redeem builders | unit tests pass                       |
| F04 Dedup handler          | `services/ledger-command` | duplicate/in-flight handling        | retry tests pass                      |
| F05 Completion correlation | `services/ledger-command` | operation update                    | operation reaches submitted/committed |
| F06 Failure classifier     | `services/ledger-command` | retryable/final error mapping       | chaos tests pass                      |

### G. Projection and Reconciliation

| Task                      | Path                                                    | Output                   | Acceptance                      |
| ------------------------- | ------------------------------------------------------- | ------------------------ | ------------------------------- |
| G01 PQS connector         | `services/projection-worker/src/main/kotlin/pqs`        | SQL/PQS client           | integration connects            |
| G02 Update stream reader  | `services/projection-worker/src/main/kotlin/ledger`     | offset reader            | checkpoint persists             |
| G03 Balance projector     | `services/projection-worker/src/main/kotlin/projectors` | balance materialization  | issue/transfer changes balance  |
| G04 Holding projector     | same                                                    | holdings materialization | hold/release updates status     |
| G05 Event projector       | same                                                    | event log creation       | `evt_*` created on state change |
| G06 Rebuild command       | `services/reconciler`                                   | projection rebuild       | rebuild equals original         |
| G07 Reconciliation alerts | `services/reconciler`                                   | diffs + metrics          | mismatch emits alert            |

### H. Webhooks

| Task                  | Path                                       | Output               | Acceptance                    |
| --------------------- | ------------------------------------------ | -------------------- | ----------------------------- |
| H01 Endpoint API      | `apps/api/src/routes/v1/webhook_endpoints` | create/list/rotate   | endpoint version pinned       |
| H02 Signer            | `packages/security/src/webhook`            | HMAC signer/verifier | test vectors pass             |
| H03 Dispatcher        | `services/webhook-dispatcher`              | delivery loop        | mock receiver gets event      |
| H04 Retry policy      | `services/webhook-dispatcher/src/retry`    | backoff/DLQ          | 500 receiver retries          |
| H05 Manual replay     | API + CLI                                  | replay by event ID   | new delivery created          |
| H06 Webhook inspector | `apps/workbench`                           | attempts UI          | shows status/timing/signature |

### I. SDK / CLI / Workbench

| Task                   | Path                  | Output                        | Acceptance                |
| ---------------------- | --------------------- | ----------------------------- | ------------------------- |
| I01 Node SDK           | `packages/sdk-node`   | generated + wrapper           | sample transfer works     |
| I02 Python SDK         | `packages/sdk-python` | generated + wrapper           | sample transfer works     |
| I03 Java SDK           | `packages/sdk-java`   | generated + wrapper           | sample transfer works     |
| I04 CLI base           | `tools/cli`           | `pillar` binary               | `pillar --help` works     |
| I05 CLI webhooks       | `tools/cli`           | `listen`, `trigger`, `replay` | local webhook test passes |
| I06 CLI traces         | `tools/cli`           | `traces get op_...`           | operation trace shown     |
| I07 Workbench explorer | `apps/workbench`      | API explorer                  | can create intent         |
| I08 Workbench trace    | `apps/workbench`      | ledger trace panel            | op → event chain visible  |

### J. Infra / Release

| Task                 | Path                            | Output               | Acceptance                 |
| -------------------- | ------------------------------- | -------------------- | -------------------------- |
| J01 Compose local    | `infra/compose/local.yml`       | local stack          | e2e passes                 |
| J02 Compose auth     | `infra/compose/local-auth.yml`  | JWT profile          | auth tests pass            |
| J03 Dockerfiles      | `infra/docker`                  | service images       | images build               |
| J04 Helm chart       | `infra/helm/pillar`             | chart templates      | `helm lint` passes         |
| J05 Migration Job    | helm templates                  | pre-upgrade job      | migration runs before pods |
| J06 DAR upload Job   | helm templates                  | package upload job   | validator has DAR          |
| J07 Observability    | `infra/observability`           | dashboards/alerts    | metrics visible            |
| J08 Release workflow | `.github/workflows/release.yml` | images + DAR + chart | tagged release created     |

---

## Open Questions

1. **Asset standard strategy:** Pillar-native assets first, CN Token Standard first, or dual-mode from day one?
2. **Custody model:** Pillar omnibus party, tenant-specific party, account-specific party, or customer-hosted parties?
3. **External signing:** Which workflows require customer-controlled signing rather than Pillar backend submission?
4. **Settlement finality SLA:** What exact states should be exposed as `processing`, `succeeded`, `settled`, or `final`?
5. **Webhook retention:** 30 days like Stripe-style event listing, or longer audit retention for regulated assets?
6. **Projection consistency:** Should high-value reads support `consistency=strong` with bounded wait?
7. **Metadata policy:** Hard validation against PII/secrets or documentation-only guidance?
8. **Compliance hooks:** KYC/AML required before issue only, before transfer too, or asset-configurable?
9. **Multi-tenant isolation:** Separate DB schema per tenant, shared schema with tenant ID, or separate deployment for regulated tenants?
10. **Deployment target:** Hosted validator, customer validator, or fully self-hosted first?

---

## Agent-ready Checklist

### Architecture

* [ ] Public API contains no Canton contract-first fields.
* [ ] Every mutation creates an intent and operation.
* [ ] Every operation has stable command identity.
* [ ] DB asset state is projection only.
* [ ] Projection can be rebuilt from ledger/PQS.
* [ ] Events are created from projected ledger state, not optimistic API state.
* [ ] Webhook delivery is signed, retryable, and replayable.
* [ ] API version and webhook endpoint version are separately pinned.
* [ ] SDK version maps to API version.
* [ ] Deployment mode does not change `/v1` grammar.

### Source Tree

* [ ] `apps/api` implemented.
* [ ] `apps/workbench` implemented.
* [ ] `services/ledger-command` implemented.
* [ ] `services/projection-worker` implemented.
* [ ] `services/workflow-orchestrator` implemented.
* [ ] `services/webhook-dispatcher` implemented.
* [ ] `packages/api-contracts` owns OpenAPI.
* [ ] `packages/db` owns migrations.
* [ ] `daml/*` owns source-of-truth workflows.
* [ ] `infra/compose` runs local dev.
* [ ] `infra/helm/pillar` deploys production stack.
* [ ] `tools/cli` supports sandbox, events, webhooks, traces.

### Testing

* [ ] Daml Script tests pass.
* [ ] API contract tests pass.
* [ ] Idempotency replay/conflict tests pass.
* [ ] Sandbox ledger integration tests pass.
* [ ] Projection rebuild test passes.
* [ ] Webhook signature/retry/replay tests pass.
* [ ] Local compose E2E passes.
* [ ] LocalNet cross-participant test passes.
* [ ] Chaos tests cover participant crash, network loss, DB restart.
* [ ] Helm template/lint passes.

### Release

* [ ] DAR artifacts versioned and checksummed.
* [ ] Docker images built and signed.
* [ ] DB migrations verified.
* [ ] Helm migration Job runs before rollout.
* [ ] DAR upload Job completes before command runtime processes work.
* [ ] Observability dashboards installed.
* [ ] Runbooks published.
* [ ] API changelog published.
* [ ] SDKs published.
* [ ] CLI published.

[1]: https://docs.stripe.com/api/versioning "https://docs.stripe.com/api/versioning"
[2]: https://docs.stripe.com/api/idempotent_requests "https://docs.stripe.com/api/idempotent_requests"
[3]: https://docs.stripe.com/webhooks "https://docs.stripe.com/webhooks"
[4]: https://docs.stripe.com/webhooks/signature "https://docs.stripe.com/webhooks/signature"
[5]: https://docs.stripe.com/api/pagination "https://docs.stripe.com/api/pagination"
[6]: https://docs.stripe.com/metadata "https://docs.stripe.com/metadata"
[7]: https://docs.stripe.com/sdks/server-side "https://docs.stripe.com/sdks/server-side"
[8]: https://docs.stripe.com/testing-use-cases "https://docs.stripe.com/testing-use-cases"
[9]: https://docs.canton.network/appdev/deep-dives/app-architecture-design "https://docs.canton.network/appdev/deep-dives/app-architecture-design"
[10]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html"
[11]: https://docs.canton.network/appdev/deep-dives/command-deduplication "https://docs.canton.network/appdev/deep-dives/command-deduplication"
[12]: https://docs.canton.network/appdev/deep-dives/authorization "https://docs.canton.network/appdev/deep-dives/authorization"
[13]: https://docs.digitalasset.com/build/3.5/dpm/dpm.html "https://docs.digitalasset.com/build/3.5/dpm/dpm.html"
[14]: https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html "https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html"
[15]: https://docs.canton.network/sdks-tools/api-reference/splice-architecture "https://docs.canton.network/sdks-tools/api-reference/splice-architecture"
