# 18. Deployment / Enterprise Architecture — Pillar

## Executive Summary

Pillar는 **“Stripe for Canton-backed assets”**로 설계한다. 외부 사용자는 Stripe 수준의 REST API, SDK, idempotency, webhook, Workbench, CLI, sandbox 경험만 본다. 내부 런타임은 Canton-native로 동작하며, 모든 자산 상태의 최종 진실은 **Canton Ledger**다. Pillar DB는 절대 원장을 대체하지 않는다. DB는 오직 **Projection / Audit / Config**만 저장한다.

핵심 배포 원칙은 다음이다.

> **Deployment model changes. API experience does not.**

Hosted, Dedicated, Hybrid, Fully self-hosted 모두 동일한 `/v1` API 문법, 동일한 object model, 동일한 SDK, 동일한 webhook contract, 동일한 idempotency semantics를 제공한다. 차이는 **control plane과 data plane의 위치, 운영 책임, 네트워크 경계, DR 책임**뿐이다.

공식 문서 리서치 기준으로, Stripe는 REST, 예측 가능한 resource URL, JSON/form payload, 표준 HTTP semantics, sandbox와 live API key 분리를 API 설계의 기본으로 삼는다. Pillar도 이 문법을 따른다. ([Stripe Docs][1]) Stripe는 idempotency key를 사용해 재시도 안전성을 제공하고, 최초 요청의 status/body를 저장해 같은 key의 후속 요청에 동일 결과를 반환한다. Pillar도 이 패턴을 채택하되, ledger command trace와 결합한다. ([Stripe Docs][2]) Stripe webhook은 HTTPS endpoint에 JSON Event object를 push하고, handler는 복잡한 처리 전에 빠르게 2xx를 반환해야 한다. Pillar webhook dispatcher도 동일하게 설계한다. ([Stripe Docs][3])

Canton 쪽에서는 participant node가 parties를 호스팅하고 ACS를 유지하며 Ledger API를 제공한다. Sequencer는 authenticated event-ordering multicast를 제공하고, mediator는 transaction mediation을 담당한다. Pillar의 data plane은 이 Canton participant / Ledger API 경계를 중심으로 구성된다. ([Canton Network Docs][4]) Canton JSON Ledger API V2는 HTTP/JSON으로 ledger 접근을 제공하지만, 공식 문서는 인터넷에 직접 노출하지 말고 reverse proxy 뒤에 두라고 명시한다. Pillar는 외부 API와 Ledger API를 절대 같은 노출면에 두지 않는다. ([Digital Asset Documentation][5])

---

## Goals / Non-goals

### Goals

| Goal                                              | Design Commitment                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Canton Ledger is source of truth                  | 모든 balance, holding, settlement 상태는 ledger transaction에서 projection된다.                                                                    |
| Pillar DB stores only Projection / Audit / Config | DB에는 비즈니스 상태의 원본을 저장하지 않는다. Projection은 언제든 ledger에서 재생성 가능해야 한다.                                                                         |
| Stripe-like API                                   | `/v1/*`, object IDs, idempotency, versioned API, webhook-first async UX, SDK, CLI, sandbox, Workbench 제공.                                 |
| Canton-invisible external API                     | 외부 API에는 Canton `contract_id`, `party_id`, `template_id`, `command_id`를 기본 노출하지 않는다. 필요 시 privileged trace field로만 노출한다.                  |
| Canton-native runtime                             | 내부적으로 Daml command, workflow id, command id, participant affinity, Ledger API completion, PQS/projection 기반으로 동작한다.                       |
| Ledger-traceable operations                       | 모든 외부 request는 `request_id → idempotency_key → workflow_id → command_id → transaction_id → ledger_offset → webhook_event_id`로 추적 가능해야 한다. |
| Balance/Holding-first                             | API의 기본 단위는 contract가 아니라 `balance`, `holding`, `asset`, `account`, `transfer_intent`다.                                                   |
| Intent-first                                      | 외부 사용자는 transaction을 직접 만들지 않고 intent를 생성한다. Runtime이 ledger transaction을 조립한다.                                                           |
| Webhook-first                                     | 상태 변화는 polling보다 webhook/event stream 중심으로 전달한다.                                                                                          |
| Deployment-neutral UX                             | Hosted, Dedicated, Hybrid, Fully self-hosted 모두 동일한 API grammar와 SDK behavior를 보장한다.                                                      |

### Non-goals

| Non-goal                                | Rationale                                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| External API에서 Canton contract 직접 조작    | Pillar는 Canton abstraction layer다. Contract-first API는 금지한다.                                                                 |
| Pillar DB를 ledger replica로 사용           | DB는 projection/cache/audit/config다. Ledger 재생성 가능성이 핵심이다.                                                                    |
| 모든 배포 모델에서 동일한 운영 책임                    | API UX는 같지만 운영 책임은 모델별로 다르다.                                                                                                 |
| Control plane을 transaction hot path에 포함 | Hybrid/Fully self-hosted에서는 control plane 장애 중에도 local transaction path가 독립적으로 동작해야 한다.                                      |
| Webhook 순서 보장                           | Stripe도 webhook ordering을 보장하지 않는다. Pillar도 event ordering은 `created`, `ledger_offset`, `sequence`로 보정한다. ([Stripe Docs][3]) |

---

## Architecture

### 1. Deployment Model Matrix

| Model                 | Control Plane                           | Data Plane                                       | Canton Participant                            | Primary Use Case                              | Hot Path Independence                                            |
| --------------------- | --------------------------------------- | ------------------------------------------------ | --------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| **Hosted**            | Pillar Cloud                            | Pillar Cloud, multi-tenant 또는 tenant-partitioned | Pillar-operated                               | 빠른 온보딩, SaaS형 고객                              | Control plane과 data plane이 같은 운영권 안에 있으나 logical separation 유지   |
| **Dedicated**         | Pillar Cloud 또는 dedicated control plane | Pillar-managed single-tenant VPC/account         | Dedicated participant                         | 규제기관, 은행, 고립된 런타임 필요 고객                       | Data plane은 tenant-isolated, control plane 장애 시 기존 config로 계속 처리 |
| **Hybrid**            | Pillar Cloud                            | Institution VPC                                  | Institution 또는 Pillar-managed participant     | 기관 VPC 내 transaction locality, 데이터 주권         | **필수**. Local API, DB, queue, participant만으로 transaction 처리      |
| **Fully self-hosted** | Institution VPC                         | Institution VPC                                  | Institution-operated participant/synchronizer | 최고 수준의 통제, air-gapped 또는 sovereign deployment | **필수**. Update/license channel 외부 의존 없음                          |

---

### 2. Control Plane / Data Plane Separation

#### Control Plane

Control plane은 **운영·구성·릴리즈·관리 plane**이다. Transaction hot path에 들어가지 않는다.

Control plane components:

| Component             | Responsibility                                                                      |
| --------------------- | ----------------------------------------------------------------------------------- |
| Tenant Registry       | institution, environment, region, deployment model 등록                               |
| Config Registry       | API version, feature flag, rate limit, webhook endpoint policy, participant binding |
| Release Registry      | Helm chart version, image digest, Daml package/DAR version, migration policy        |
| Policy Registry       | RBAC, API key scope, mTLS policy, network policy templates                          |
| Workbench             | API explorer, request logs, webhook replay, version preview, ledger trace viewer    |
| Fleet Manager         | Hybrid/self-hosted data plane agent 상태, drift, health 확인                            |
| License / Entitlement | self-hosted 기능, SDK access, package entitlement                                     |
| Audit Console         | config change, admin action, deployment action audit                                |

Stripe Workbench는 API version 관리와 테스트 흐름의 중심 도구다. Stripe 공식 문서는 Workbench에서 default API version을 업그레이드하고, 테스트 후 commit하는 흐름을 설명한다. Pillar Workbench도 동일하게 API version preview와 upgrade workflow를 제공한다. ([Stripe Docs][6]) Stripe Workbench Shell/API Explorer는 sandbox에서 create/modify/delete 명령을 실행하고 SDK code를 생성할 수 있다. Pillar Workbench도 API Explorer, SDK snippet, webhook replay, ledger trace를 제공한다. ([Stripe Docs][7])

#### Data Plane

Data plane은 **local transaction execution plane**이다.

Data plane components:

| Component           | Responsibility                                                   |
| ------------------- | ---------------------------------------------------------------- |
| API Gateway         | TLS termination, WAF, rate limit, request routing                |
| API Service         | Stripe-like REST API, object translation, authz, idempotency     |
| Intent Orchestrator | `transfer_intent`, `allocation`, `settlement` lifecycle          |
| Ledger Executor     | Daml command build/submit, participant affinity, command dedupe  |
| Canton Adapter      | Ledger API client, package/template registry, participant health |
| Projection Worker   | Ledger/PQS events → balance/holding/intent projections           |
| Webhook Dispatcher  | durable event outbox, HMAC signing, retry, DLQ                   |
| Config Agent        | signed config bundle pull/apply/rollback                         |
| Postgres            | projection, audit, config, idempotency, outbox                   |
| Redis               | ephemeral cache, rate limit counters, short lock acceleration    |
| Queue               | command queue, projection jobs, webhook jobs, config sync jobs   |
| Observability Stack | metrics, logs, traces, audit correlation                         |

Canton Ledger API command deduplication is based on change ID, and dedupe guarantees depend on commands being submitted to the same participant node. Pillar therefore enforces **participant affinity** for each account/party binding and derives stable `command_id` from the Pillar idempotency record. ([Digital Asset Documentation][8])

---

### 3. Local Transaction Path Independence

Hybrid와 Fully self-hosted에서 가장 중요한 invariant다.

#### Local hot path

```text
Client
  → Institution-local API Gateway
  → Pillar API Service
  → Postgres idempotency + audit write
  → Intent Orchestrator
  → Queue / Outbox
  → Ledger Executor
  → Local Canton Participant / Ledger API
  → Canton Synchronizer
  → PQS / Ledger Event Reader
  → Projection Worker
  → Webhook Event Outbox
  → Webhook Dispatcher
```

#### Control plane is not required for

| Function                      |                      Local-only? |
| ----------------------------- | -------------------------------: |
| Existing API key validation   | Yes, using locally synced config |
| New transfer intent creation  |                              Yes |
| Ledger command submission     |                              Yes |
| Balance/holding projection    |                              Yes |
| Webhook delivery              |                              Yes |
| Retry/idempotency             |                              Yes |
| Request audit logging         |                              Yes |
| Existing API version behavior |                              Yes |

#### Control plane required for

| Function                        |                                                 Required? |
| ------------------------------- | --------------------------------------------------------: |
| New environment creation        |                                                       Yes |
| New API key issuance            | Usually yes, except fully self-hosted local control plane |
| New feature flag/config rollout |                                                       Yes |
| New Helm/DAR release discovery  |                                                       Yes |
| Global fleet visibility         |                                                       Yes |
| License entitlement refresh     |                  Yes, unless offline license is installed |

If the control plane is unreachable, the data plane continues using the last valid signed config bundle until `config.expires_at`. After expiry, behavior is policy-driven: read-only mode, degraded write mode, or full stop. Regulated institutions usually choose explicit expiry windows.

---

### 4. Config Sync

Config sync is **pull-based, signed, versioned, replay-protected**.

```text
Control Plane Config Registry
  → signed config bundle
  → mTLS pull by data-plane config-agent
  → signature / sequence / compatibility verification
  → local config DB apply
  → runtime hot reload
```

#### Config bundle schema

```json
{
  "bundle_id": "cfgb_01HX...",
  "tenant_id": "inst_...",
  "environment": "prod",
  "deployment_model": "hybrid",
  "sequence": 1842,
  "schema_version": "2026-05-01",
  "api_default_version": "2026-05-01",
  "not_before": "2026-05-26T00:00:00Z",
  "expires_at": "2026-06-26T00:00:00Z",
  "resources_sha256": "...",
  "dependencies": {
    "helm_chart_min": "2.4.0",
    "daml_package_set": "pkgset_..."
  },
  "signature": "ed25519:..."
}
```

#### Config categories

| Category        | Example                                                   | Apply Method                               |
| --------------- | --------------------------------------------------------- | ------------------------------------------ |
| Runtime config  | API version, rate limit, webhook endpoint, API key scopes | DB apply + hot reload                      |
| Security policy | allowed issuer, mTLS SANs, RBAC policy                    | DB apply + sidecar reload                  |
| Ledger binding  | account → participant ref, package set, party alias       | DB apply                                   |
| Static infra    | service replicas, storage class, ingress class            | Helm/Terraform/GitOps                      |
| Secrets         | KMS key alias, secret reference                           | External Secrets / customer secret manager |

No raw secrets are transported inside config bundles. Kubernetes Secrets should be treated carefully because they are stored in the API server’s etcd unless encryption and access controls are configured; Pillar should use external secret stores and encrypted Kubernetes secrets. ([Kubernetes][9])

---

### 5. Kubernetes Architecture

#### Namespaces

| Namespace              | Contents                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- |
| `pillar-system`        | config-agent, cert-manager/SPIRE integration, secret sync, admission policies |
| `pillar-runtime`       | api-service, intent-orchestrator, ledger-executor, webhook-dispatcher         |
| `pillar-ledger`        | canton-adapter, PQS, optional Canton participant                              |
| `pillar-data`          | optional in-cluster Postgres/Redis/Queue for non-managed deployments          |
| `pillar-observability` | OpenTelemetry Collector, Prometheus, Grafana, Loki, Tempo, Alertmanager       |

#### Workloads

| Workload             | Kubernetes Kind                              | Notes                                                     |
| -------------------- | -------------------------------------------- | --------------------------------------------------------- |
| API Service          | Deployment                                   | Horizontal scale, stateless                               |
| Intent Orchestrator  | Deployment                                   | Consumes local DB/queue                                   |
| Ledger Executor      | Deployment                                   | Partitioned by participant/account affinity               |
| Projection Worker    | Deployment                                   | Consumes PQS/Ledger API offsets                           |
| Webhook Dispatcher   | Deployment                                   | Queue-backed, retry-safe                                  |
| Config Agent         | Deployment                                   | Pulls signed bundles                                      |
| Canton Participant   | StatefulSet, when embedded                   | Stable identity and persistent storage                    |
| Postgres/Redis/Queue | Managed preferred; StatefulSet if in-cluster | Production should prefer managed services where available |

Kubernetes StatefulSets provide stable identities and persistent storage for stateful applications, which is why embedded Canton participant or in-cluster state stores use StatefulSet rather than ordinary Deployment. ([Kubernetes][10]) PodDisruptionBudgets limit concurrent voluntary disruptions and are required for API, executor, projector, webhook dispatcher, and stateful services. ([Kubernetes][11])

#### Network policy

Default stance:

```text
deny all ingress
deny all egress
allow explicitly required service-to-service traffic
```

Required flows:

| Source                | Destination                   | Port / Protocol          |
| --------------------- | ----------------------------- | ------------------------ |
| ingress / API gateway | api-service                   | HTTPS                    |
| api-service           | Postgres                      | 5432                     |
| api-service           | Redis                         | 6379                     |
| api-service           | Queue                         | broker-specific          |
| ledger-executor       | Canton Ledger API             | gRPC/TLS                 |
| projection-worker     | PQS / Ledger API              | Postgres or gRPC/TLS     |
| webhook-dispatcher    | customer webhook endpoints    | HTTPS via egress proxy   |
| config-agent          | control plane config endpoint | HTTPS/mTLS outbound      |
| participant           | synchronizer / sequencer      | TLS, usually egress-only |

Kubernetes NetworkPolicies define how pods communicate with other pods and network endpoints at IP/port level, assuming the cluster uses a network plugin that enforces them. ([Kubernetes][12])

---

### 6. Helm Chart

Pillar ships an umbrella chart:

```text
pillar-platform/
  Chart.yaml
  values.schema.json
  values.yaml
  charts/
    api-gateway/
    api-service/
    intent-orchestrator/
    ledger-executor/
    projection-worker/
    webhook-dispatcher/
    config-agent/
    canton-adapter/
    pqs/
    workbench/
    observability/
    network-policy/
    postgres/       # optional
    redis/          # optional
    queue/          # optional
```

Helm charts template Kubernetes objects using chart templates and values files; user-supplied values override defaults. Pillar uses this model to provide one chart with deployment-model-specific values. ([Helm][13])

Example values:

```yaml
global:
  deploymentModel: hybrid
  environment: prod
  apiDefaultVersion: "2026-05-01"
  region: ap-northeast-2

controlPlane:
  enabled: false
  configEndpoint: "https://config.pillar.example"

dataPlane:
  enabled: true

canton:
  participant:
    mode: external
    ledgerApi:
      host: participant.internal
      port: 6865
      tls: true
  jsonLedgerApi:
    enabled: false

pqs:
  enabled: true
  postgresRef: pillar-pqs

postgres:
  mode: managed
  appDatabase: pillar_app
  pqsDatabase: pillar_pqs

redis:
  mode: managed

queue:
  type: kafka
  durable: true

mtls:
  enabled: true
  provider: spire

networkPolicy:
  enabled: true
  defaultDeny: true

observability:
  opentelemetry: true
  prometheus: true
  grafana: true
  loki: true
  tempo: true
```

---

### 7. Terraform

Terraform modules:

```text
terraform/
  modules/
    pillar-network/
    pillar-kubernetes/
    pillar-data-services/
    pillar-security/
    pillar-canton-connectivity/
    pillar-observability/
    pillar-helm-release/
```

| Module                       | Responsibility                                                     |
| ---------------------------- | ------------------------------------------------------------------ |
| `pillar-network`             | VPC, subnets, private endpoints, egress proxy, security groups     |
| `pillar-kubernetes`          | EKS/AKS/GKE/on-prem Kubernetes bootstrap                           |
| `pillar-data-services`       | Postgres, Redis, queue, backup policy                              |
| `pillar-security`            | KMS/HSM, IAM, secret manager, cert issuer                          |
| `pillar-canton-connectivity` | participant endpoint, synchronizer endpoint, PrivateLink/VPN rules |
| `pillar-observability`       | metrics/logs/traces storage, alert routing                         |
| `pillar-helm-release`        | install/upgrade Pillar Helm chart                                  |

Terraform’s Helm provider can provision Kubernetes infrastructure and deploy Helm charts in the same apply flow, using Terraform dependency graph ordering. Pillar uses that to guarantee network, KMS, databases, and cluster primitives exist before the Helm release is installed. ([HashiCorp Developer][14])

---

### 8. Postgres / Redis / Queue 구성

#### Postgres databases

| Database             | Owner                     | Purpose                                                |
| -------------------- | ------------------------- | ------------------------------------------------------ |
| `pillar_app`         | Pillar data plane         | projection, audit, config, idempotency, webhook outbox |
| `pillar_pqs`         | PQS                       | ledger data export / active contracts / history        |
| `canton_participant` | Canton participant        | participant state, ACS, ledger storage                 |
| `canton_sequencer`   | private synchronizer only | sequencer state                                        |
| `canton_mediator`    | private synchronizer only | mediator state                                         |

Canton PQS can continuously export ledger data to Postgres and is designed around a pipeline from ledger to Postgres; it can restart after crashes and keep active contract and historical data according to configuration. Pillar uses PQS or a Ledger API reader as the source for projection workers. ([Digital Asset Documentation][15])

#### Redis

Redis is never authoritative.

Allowed uses:

* rate limit counters
* short-lived distributed lock acceleration
* API response cache for safe reads
* webhook delivery dedupe window
* Workbench session cache

Not allowed:

* canonical idempotency state
* canonical balance
* canonical holding
* command completion source of truth

#### Queue

Queue is durable and replayable.

Topics / streams:

| Topic                        | Purpose                               |
| ---------------------------- | ------------------------------------- |
| `pillar.commands.submit`     | ledger command submission requests    |
| `pillar.commands.completion` | completion events                     |
| `pillar.projection.jobs`     | projection update work                |
| `pillar.events.outbox`       | event creation and webhook scheduling |
| `pillar.webhooks.delivery`   | webhook delivery attempts             |
| `pillar.config.apply`        | config bundle application             |
| `pillar.audit.export`        | compliance archive export             |

Postgres outbox remains the transactional handoff mechanism. Queue provides scale and retry, not truth.

---

### 9. HA / DR

#### High availability

| Layer              | HA Design                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------- |
| API                | multi-replica Deployment, HPA, PDB, readiness/liveness                                       |
| Ledger Executor    | sharded by participant/account affinity, active-active workers                               |
| Projection Worker  | partitioned by ledger offset / tenant / account shard                                        |
| Webhook Dispatcher | queue-backed active-active                                                                   |
| Postgres           | managed multi-AZ primary/standby with PITR                                                   |
| Redis              | HA cluster, cache-only                                                                       |
| Queue              | replicated broker or managed queue                                                           |
| Canton Participant | managed HA pattern where supported; otherwise fast failover with durable storage and backups |
| Observability      | replicated collectors, external durable storage                                              |

#### Disaster recovery

| Target        | Design                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| RPO           | Default Pillar-managed target: ≤ 5 minutes for `pillar_app`; customer-defined for self-hosted             |
| RTO           | Default Pillar-managed target: 30–60 minutes for application data plane; customer-defined for self-hosted |
| Ledger state  | Restore participant DB and identities; replay projections from ledger/PQS                                 |
| Projection DB | Restore PITR, then reconcile from latest committed ledger offset                                          |
| Config        | Last signed config bundle stored locally and in backup                                                    |
| Webhooks      | Durable outbox restored; dispatcher resumes undelivered events                                            |
| Audit         | Immutable append-only export to compliance archive                                                        |

Canton validator backup guidance emphasizes backing up node identities and Postgres databases, storing sensitive node identities securely, and backing up Postgres at regular intervals. It also notes ordering constraints between validator app DB and participant DB backups. Pillar’s DR runbook must encode those ordering constraints. ([Canton Network Docs][16])

---

### 10. Backup / Restore

#### Backup scope

| Item                          | Backup Method                                  |
| ----------------------------- | ---------------------------------------------- |
| `pillar_app` Postgres         | PITR + daily logical dump                      |
| `pillar_pqs` Postgres         | PITR or rebuildable depending retention policy |
| Canton participant DB         | PITR / snapshot according to Canton runbook    |
| Node identities               | encrypted secret manager / HSM-backed escrow   |
| Config bundles                | immutable object storage                       |
| Helm values / Terraform state | encrypted state backend                        |
| Webhook signing secrets       | secret manager versioned backup                |
| Audit export                  | WORM-compatible storage where required         |

#### Restore sequence

```text
1. Restore network / cluster / KMS / secret manager.
2. Restore node identities.
3. Restore Canton participant DB.
4. Restore Pillar app DB to a timestamp compatible with participant backup.
5. Restore PQS DB or rebuild from participant / ledger.
6. Start participant.
7. Start Pillar data plane in projection-reconcile mode.
8. Compare projection_cursors with ledger offsets.
9. Resume API writes.
10. Resume webhook delivery.
```

If projection data is behind the ledger, Pillar replays ledger events to regenerate balances and holdings. If the ledger history has been pruned past the required offset, restore must use retained historical backups.

---

### 11. Observability Stack

Pillar uses OpenTelemetry-first instrumentation.

| Layer      | Tooling                             |
| ---------- | ----------------------------------- |
| Metrics    | Prometheus                          |
| Dashboards | Grafana                             |
| Logs       | Loki or customer SIEM               |
| Traces     | Tempo / Jaeger-compatible tracing   |
| Collection | OpenTelemetry Collector             |
| Alerts     | Alertmanager / PagerDuty / Opsgenie |
| Audit      | append-only audit DB + export sink  |

#### Required correlation fields

Every operation must carry:

```text
request_id
idempotency_key
tenant_id
environment
api_version
intent_id
workflow_id
command_id
submission_id
transaction_id
ledger_offset
webhook_event_id
trace_id
span_id
```

Canton observability documentation identifies correlation identifiers such as `ApplicationId`, `WorkflowId`, `CommandId`, `SubmissionId`, `TransactionId`, `Trace/SpanId`, `LedgerOffset`, `ContractId`, `TemplateId`, and `PartyId`. Pillar maps these to external request and object traces. ([Digital Asset Documentation][17]) Canton support guidance also highlights `trace-id` in logs, health dumps, health status checks, and WARN/ERROR monitoring; Pillar runbooks must include those diagnostics. ([Canton Network Docs][18])

#### Critical alerts

| Alert                       | Severity |
| --------------------------- | -------- |
| Ledger API unavailable      | critical |
| Projection lag above SLO    | critical |
| Webhook DLQ growth          | high     |
| Idempotency conflict spike  | high     |
| Queue depth growth          | high     |
| Postgres replication lag    | critical |
| Config drift detected       | high     |
| mTLS cert expiry < 14 days  | high     |
| Backup job failed           | critical |
| Participant health degraded | critical |

---

### 12. mTLS

mTLS is mandatory for service-to-service traffic in Dedicated, Hybrid, and Fully self-hosted deployments.

#### Internal mTLS

Options:

* SPIRE/SPIFFE
* Istio
* Linkerd
* Consul Connect
* cert-manager with internal CA

Identity format:

```text
spiffe://pillar/{environment}/{namespace}/{service}
```

Example:

```text
spiffe://pillar/prod/pillar-runtime/ledger-executor
```

#### External mTLS

Supported for:

* institution API clients
* admin / Workbench access
* config-agent ↔ control plane
* private webhook endpoint delivery
* participant / synchronizer connectivity where applicable

Canton private synchronizer deployment guidance includes TLS and network policy considerations for production, and private synchronizer deployment uses Helm and Kubernetes with separate Postgres stores for sequencer and mediator. Pillar follows that model where it deploys a private synchronizer. ([Canton Network Docs][19])

---

### 13. Upgrade Strategy

#### API upgrade strategy

Pillar mirrors Stripe’s API version discipline.

| Mechanism                   | Pillar Design                              |
| --------------------------- | ------------------------------------------ |
| Account default API version | Stored in config registry                  |
| Per-request override        | `Pillar-Version: 2026-05-01`               |
| SDK pinned version          | SDK major/minor maps to supported API date |
| Webhook endpoint version    | Each endpoint pins event object schema     |
| Workbench preview           | Test new version before committing         |
| Breaking change policy      | No silent breaking changes                 |

Stripe API versioning documentation states that SDKs can pin or align to API versions, webhook events use the API version associated with endpoint creation or account default, and Workbench is used to upgrade/test API versions. Pillar adopts this as a first-class platform contract. ([Stripe Docs][6])

#### Runtime upgrade strategy

```text
1. Preflight:
   - chart compatibility
   - DB migration dry run
   - Canton participant health
   - package compatibility
   - projection lag check

2. Deploy:
   - helm upgrade --atomic
   - image digest pinning
   - canary API pods
   - canary ledger executor shard

3. Migrate:
   - expand DB schema
   - dual-write projection fields if needed
   - deploy new Daml package/DAR
   - update package routing config

4. Verify:
   - sandbox smoke test
   - ledger ping
   - transfer_intent canary
   - webhook delivery canary

5. Commit:
   - config bundle sequence advance
   - Workbench version enablement
   - old path deprecation timer

6. Rollback / fix-forward:
   - Helm rollback for application runtime
   - DB contract-first rollback only if safe
   - Daml package remains installed; disable new writes to bad package and migrate/fix forward
```

Daml workflows are built and packaged as DAR files, which are then deployed to a ledger or used for development. Pillar release management treats DARs as immutable runtime artifacts and gates new writes by package set. ([Digital Asset Documentation][20])

---

## API / Object Model

### 1. API Grammar

Pillar external API:

```text
https://api.pillar.example/v1/*
```

Common headers:

```http
Authorization: Bearer sk_live_...
Idempotency-Key: 9b3b6f53-...
Pillar-Version: 2026-05-01
Pillar-Account: acct_...
```

Common object shape:

```json
{
  "id": "tint_01HX...",
  "object": "transfer_intent",
  "livemode": true,
  "created": 1770000000,
  "updated": 1770000009,
  "status": "processing",
  "metadata": {},
  "ledger_trace": {
    "workflow_id": "tint_01HX...",
    "command_id": "cmd_01HX...",
    "transaction_id": null,
    "ledger_offset": null
  }
}
```

`ledger_trace` is non-sensitive by default. `contract_id`, `template_id`, and internal `party_id` remain hidden unless explicitly enabled for privileged admin/debug API.

---

### 2. Object IDs

| Object               | Prefix   |
| -------------------- | -------- |
| Account              | `acct_`  |
| Asset                | `asset_` |
| Balance              | `bal_`   |
| Holding              | `hld_`   |
| Transfer Intent      | `tint_`  |
| Allocation           | `alloc_` |
| Settlement           | `setl_`  |
| Event                | `evt_`   |
| Webhook Endpoint     | `wh_`    |
| Request              | `req_`   |
| Ledger Command Trace | `cmd_`   |

---

### 3. Core Resources

#### `asset`

Represents a Canton-backed asset externally.

```json
{
  "id": "asset_usdc_canton",
  "object": "asset",
  "code": "USDC",
  "network": "canton",
  "precision": 6,
  "status": "active"
}
```

#### `account`

External account abstraction mapped internally to Canton parties and participant bindings.

```json
{
  "id": "acct_01HX...",
  "object": "account",
  "type": "institution_customer",
  "status": "active",
  "metadata": {
    "customer_ref": "C-10042"
  }
}
```

#### `balance`

Projection by account and asset.

```json
{
  "id": "bal_01HX...",
  "object": "balance",
  "account": "acct_01HX...",
  "asset": "asset_usdc_canton",
  "available": "1000.000000",
  "pending": "20.000000",
  "locked": "50.000000",
  "settled": "1000.000000",
  "ledger_offset": "00000000000042ab"
}
```

#### `holding`

Projection of on-ledger holding state.

```json
{
  "id": "hld_01HX...",
  "object": "holding",
  "account": "acct_01HX...",
  "asset": "asset_usdc_canton",
  "amount": "100.000000",
  "status": "active"
}
```

#### `transfer_intent`

Intent-first transfer object.

```json
{
  "id": "tint_01HX...",
  "object": "transfer_intent",
  "asset": "asset_usdc_canton",
  "amount": "25.000000",
  "from": "acct_sender",
  "to": "acct_receiver",
  "status": "processing",
  "metadata": {
    "invoice_id": "inv-8841"
  }
}
```

Lifecycle:

```text
requires_confirmation
  → processing
  → succeeded | failed | canceled
```

#### `event`

Webhook/event retrieval object.

```json
{
  "id": "evt_01HX...",
  "object": "event",
  "type": "transfer_intent.succeeded",
  "api_version": "2026-05-01",
  "created": 1770000012,
  "data": {
    "object": {
      "id": "tint_01HX...",
      "object": "transfer_intent",
      "status": "succeeded"
    }
  },
  "request": {
    "id": "req_01HX...",
    "idempotency_key": "9b3b6f53-..."
  }
}
```

---

### 4. Endpoints

```http
POST   /v1/transfer_intents
POST   /v1/transfer_intents/{id}/confirm
POST   /v1/transfer_intents/{id}/cancel
GET    /v1/transfer_intents/{id}

GET    /v1/balances
GET    /v1/holdings
GET    /v1/holdings/{id}

POST   /v1/allocations
POST   /v1/allocations/{id}/release

GET    /v1/events
GET    /v1/events/{id}

POST   /v1/webhook_endpoints
GET    /v1/webhook_endpoints
POST   /v1/webhook_endpoints/{id}/rotate_secret
```

---

### 5. Idempotency

Mutating API calls require `Idempotency-Key`.

Pillar behavior:

| Case                                       | Result                                                           |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Same key, same method/path/body hash       | return original response                                         |
| Same key, different body hash              | `409 idempotency_error`                                          |
| Concurrent same key                        | one request wins lock, others wait or receive retryable response |
| Ledger command submitted but response lost | response is reconstructed from command/projection state          |
| Command rejected                           | original rejection response is replayed                          |

Stripe persists the status code and body of the first request for a given idempotency key, including failures, and returns that result for subsequent matching requests. Stripe also recommends high-entropy keys such as UUIDs and allows keys up to 255 characters. Pillar uses the same external behavior, but stores additional ledger trace fields. ([Stripe Docs][2])

---

### 6. Webhooks

Webhook signing:

```http
Pillar-Signature: t=1770000012,v1=...
```

Webhook event types:

```text
transfer_intent.created
transfer_intent.processing
transfer_intent.succeeded
transfer_intent.failed
allocation.created
allocation.released
holding.updated
balance.updated
settlement.succeeded
```

Webhook delivery rules:

| Rule              | Design                                                           |
| ----------------- | ---------------------------------------------------------------- |
| Retry             | exponential backoff                                              |
| DLQ               | failed deliveries stored and replayable                          |
| Ordering          | not guaranteed; use `created`, `event.sequence`, `ledger_offset` |
| Signature         | HMAC-SHA256 with endpoint secret                                 |
| Replay protection | timestamp tolerance                                              |
| Event retrieval   | `/v1/events/{id}`                                                |

Stripe webhook security documentation recommends signature verification using the raw request body, `Stripe-Signature` header, and endpoint secret; it also describes HMAC SHA-256 signatures and timestamp-based replay protection. Pillar implements the same class of webhook security. ([Stripe Docs][3]) Stripe also documents that webhook event ordering is not guaranteed and that automatic retries occur for failed deliveries; Pillar explicitly designs around non-ordered delivery. ([Stripe Docs][3])

---

### 7. SDK / CLI / Sandbox / Workbench

| Surface   | Pillar Design                                                                                |
| --------- | -------------------------------------------------------------------------------------------- |
| SDK       | TypeScript, Python, Go, Java, .NET; generated from OpenAPI plus hand-authored ergonomics     |
| CLI       | login, sandbox, trigger webhook, replay event, inspect request, submit test transfer         |
| Sandbox   | isolated test environment with no real asset movement                                        |
| Workbench | API Explorer, request log, version preview, webhook delivery log, event replay, ledger trace |
| Local dev | `pillar sandbox up`, local Canton sandbox, local webhook forwarder                           |

Stripe provides official SDKs across server, web, and mobile platforms and uses API-versioned behavior. Pillar follows this with SDKs pinned to Pillar API versions. ([Stripe Docs][21]) Stripe CLI supports sandbox resource management, API testing, webhook testing, and integration workflows; Pillar CLI mirrors those operational primitives. ([Stripe Docs][22]) Stripe sandbox is isolated from live data and real money movement; Pillar sandbox is likewise isolated from live ledger-backed asset movement. ([Stripe Docs][23]) Daml/Canton docs show local development via Daml package build and Canton sandbox with JSON API, which Pillar uses for local sandbox architecture. ([Digital Asset Documentation][24])

---

## Internal Runtime

### 1. Runtime Flow

```text
1. API request arrives.
2. API service authenticates client and resolves tenant/environment.
3. API version is selected from header or account default.
4. Idempotency row is inserted or loaded.
5. Request is normalized and audited.
6. Intent object is created in projection/audit DB as pending local object.
7. Intent orchestrator builds ledger command plan.
8. Ledger executor submits Daml command to assigned Canton participant.
9. Completion/projection worker observes committed ledger transaction.
10. Projection tables update balances, holdings, intent status.
11. Event object is created.
12. Webhook dispatcher delivers signed event.
13. Workbench trace links request → ledger → webhook.
```

### 2. Command Identity

Pillar maps external request identity to Canton runtime identity.

| Pillar Field      | Canton / Runtime Mapping              |
| ----------------- | ------------------------------------- |
| `request_id`      | API audit ID                          |
| `idempotency_key` | stable retry key                      |
| `intent_id`       | business workflow identifier          |
| `workflow_id`     | set to `intent_id`                    |
| `command_id`      | deterministic from idempotency record |
| `submission_id`   | unique per submit attempt             |
| `transaction_id`  | filled after completion               |
| `ledger_offset`   | filled after projection               |
| `trace_id`        | OpenTelemetry trace                   |

This gives precise causality without exposing Canton-native internals to normal API consumers.

### 3. Participant Affinity

For each account/party binding:

```text
account_id
  → internal party binding
  → participant_id
  → ledger_api_endpoint
  → package_set
```

Rules:

1. Mutating commands for the same account/party binding go to the same participant.
2. Retry uses the same participant while the dedupe window is active.
3. Failover requires explicit participant rebinding procedure.
4. Rebinding is an audited config event and may require ledger topology operation.

### 4. Projection Model

Projection workers consume ledger events and update:

```text
projection.assets
projection.accounts
projection.holdings
projection.balances
projection.transfer_intents
projection.allocations
projection.settlements
projection.ledger_events
projection.projection_cursors
```

Each projection row includes:

```text
tenant_id
environment
external_object_id
ledger_offset
transaction_id
source_template
source_contract_id_encrypted
observed_at
projection_version
is_current
```

The external API never depends on `source_contract_id` for object grammar.

---

## DB Schema

### 1. Schema Namespaces

```text
config.*
audit.*
projection.*
ops.*
```

### 2. Config Tables

```sql
CREATE TABLE config.environments (
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  deployment_model       text NOT NULL,
  api_default_version    text NOT NULL,
  status                 text NOT NULL,
  created_at             timestamptz NOT NULL,
  updated_at             timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, environment)
);

CREATE TABLE config.api_keys (
  api_key_id             text PRIMARY KEY,
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  key_hash               text NOT NULL,
  scopes                 jsonb NOT NULL,
  status                 text NOT NULL,
  created_at             timestamptz NOT NULL,
  revoked_at             timestamptz
);

CREATE TABLE config.webhook_endpoints (
  webhook_endpoint_id    text PRIMARY KEY,
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  url                    text NOT NULL,
  api_version            text NOT NULL,
  secret_ref             text NOT NULL,
  enabled_events         text[] NOT NULL,
  status                 text NOT NULL,
  created_at             timestamptz NOT NULL
);

CREATE TABLE config.party_bindings (
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  account_id             text NOT NULL,
  participant_ref        text NOT NULL,
  party_fingerprint      text NOT NULL,
  package_set_id         text NOT NULL,
  custody_model          text NOT NULL,
  created_at             timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, environment, account_id)
);

CREATE TABLE config.sync_bundles (
  bundle_id              text PRIMARY KEY,
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  sequence               bigint NOT NULL,
  schema_version         text NOT NULL,
  payload_hash           text NOT NULL,
  signature              text NOT NULL,
  applied_at             timestamptz,
  status                 text NOT NULL
);
```

### 3. Audit Tables

```sql
CREATE TABLE audit.api_requests (
  request_id             text PRIMARY KEY,
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  method                 text NOT NULL,
  path                   text NOT NULL,
  api_version            text NOT NULL,
  idempotency_key        text,
  request_hash           text NOT NULL,
  response_status        int,
  response_hash          text,
  trace_id               text,
  created_at             timestamptz NOT NULL,
  completed_at           timestamptz
);

CREATE TABLE audit.idempotency_keys (
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  idempotency_key        text NOT NULL,
  method                 text NOT NULL,
  path                   text NOT NULL,
  params_hash            text NOT NULL,
  first_request_id       text NOT NULL,
  response_status        int,
  response_body          jsonb,
  ledger_command_id      text,
  locked_until           timestamptz,
  expires_at             timestamptz NOT NULL,
  created_at             timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, environment, idempotency_key)
);

CREATE TABLE audit.ledger_commands (
  command_id             text PRIMARY KEY,
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  workflow_id            text NOT NULL,
  submission_id          text,
  participant_ref        text NOT NULL,
  status                 text NOT NULL,
  error_code             text,
  error_message          text,
  transaction_id         text,
  ledger_offset          text,
  trace_id               text,
  created_at             timestamptz NOT NULL,
  completed_at           timestamptz
);

CREATE TABLE audit.webhook_deliveries (
  delivery_id            text PRIMARY KEY,
  event_id               text NOT NULL,
  webhook_endpoint_id    text NOT NULL,
  attempt                int NOT NULL,
  status                 text NOT NULL,
  response_status        int,
  response_body_hash     text,
  delivered_at           timestamptz,
  created_at             timestamptz NOT NULL
);
```

### 4. Projection Tables

```sql
CREATE TABLE projection.balances (
  balance_id             text PRIMARY KEY,
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  account_id             text NOT NULL,
  asset_id               text NOT NULL,
  available              numeric(38, 18) NOT NULL,
  pending                numeric(38, 18) NOT NULL,
  locked                 numeric(38, 18) NOT NULL,
  settled                numeric(38, 18) NOT NULL,
  ledger_offset          text NOT NULL,
  transaction_id         text NOT NULL,
  observed_at            timestamptz NOT NULL,
  projection_version     bigint NOT NULL,
  UNIQUE (tenant_id, environment, account_id, asset_id)
);

CREATE TABLE projection.holdings (
  holding_id             text PRIMARY KEY,
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  account_id             text NOT NULL,
  asset_id               text NOT NULL,
  amount                 numeric(38, 18) NOT NULL,
  status                 text NOT NULL,
  source_template        text NOT NULL,
  source_contract_id_enc text NOT NULL,
  ledger_offset          text NOT NULL,
  transaction_id         text NOT NULL,
  observed_at            timestamptz NOT NULL,
  projection_version     bigint NOT NULL
);

CREATE TABLE projection.transfer_intents (
  transfer_intent_id     text PRIMARY KEY,
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  asset_id               text NOT NULL,
  amount                 numeric(38, 18) NOT NULL,
  from_account_id        text NOT NULL,
  to_account_id          text NOT NULL,
  status                 text NOT NULL,
  metadata               jsonb NOT NULL,
  workflow_id            text NOT NULL,
  command_id             text,
  ledger_offset          text,
  transaction_id         text,
  created_at             timestamptz NOT NULL,
  updated_at             timestamptz NOT NULL
);

CREATE TABLE projection.projection_cursors (
  tenant_id              text NOT NULL,
  environment            text NOT NULL,
  source                 text NOT NULL,
  last_ledger_offset     text NOT NULL,
  updated_at             timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, environment, source)
);
```

### 5. DB Invariants

| Invariant                         | Enforcement                                               |
| --------------------------------- | --------------------------------------------------------- |
| Balance cannot be manually edited | projection worker only; no admin mutation API             |
| Projection is monotonic           | `ledger_offset` cursor and transaction ordering           |
| Idempotency is durable            | Postgres primary key, not Redis                           |
| Audit is append-oriented          | no destructive update except controlled status completion |
| Config is versioned               | signed bundle sequence                                    |
| Canton internals are hidden       | encrypted contract IDs, privileged debug only             |
| Rebuild is possible               | projection cursors and ledger/PQS replay                  |

---

## Failure Modes

| Failure Mode                  | Impact                                  | Pillar Behavior                                                                       |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| Control plane outage          | No new remote config, no fleet update   | Data plane continues using last signed config bundle                                  |
| Config bundle invalid         | Potential misconfiguration              | Reject bundle, keep previous config, emit `config_sync.failed`                        |
| API Postgres unavailable      | Cannot persist idempotency/audit        | Mutating requests return `503`; no fake success                                       |
| Redis unavailable             | Cache/rate-limit degradation            | Fall back to Postgres locks where possible                                            |
| Queue unavailable             | Async processing stalls                 | Use DB outbox until threshold; then backpressure with `503`                           |
| Canton Ledger API unavailable | Cannot submit commands                  | Return retryable error or keep intent `processing` if already queued                  |
| Participant failover          | Dedupe risk if wrong participant        | Enforce participant affinity; failover only through audited rebinding                 |
| Synchronizer unavailable      | Commands cannot finalize                | Intent remains `processing` or fails based on Canton result                           |
| Projection lag                | Reads may be stale                      | Expose `projection_lag`; webhook emitted only after projection update                 |
| Webhook endpoint down         | Customer misses async event             | Retry, DLQ, event retrieval API, manual replay                                        |
| Idempotency mismatch          | Client reused key with different params | Return `409 idempotency_error`                                                        |
| Ledger command rejected       | Business operation failed               | Map to API error and emit `transfer_intent.failed`                                    |
| DR restore offset gap         | Projection cannot fully replay          | Restore historical backup or rebuild from retained PQS/ledger window                  |
| Bad application upgrade       | Runtime regression                      | Helm rollback; Daml package write-disable; fix-forward if ledger package already used |
| Bad Daml package              | Ledger semantics risk                   | Disable new writes to package set, migrate/fix via new package                        |

---

## Security / Compliance

### 1. Authentication

| Surface            | AuthN                                        |
| ------------------ | -------------------------------------------- |
| Public API         | API keys, optional client mTLS               |
| Admin / Workbench  | OIDC/SAML SSO, MFA, RBAC                     |
| Config agent       | mTLS + signed bundle verification            |
| Service-to-service | mTLS with workload identity                  |
| Webhook delivery   | HMAC signature with rotating endpoint secret |

### 2. Authorization

* Environment-level scopes: `test`, `live`, `prod`
* API scopes: `balances.read`, `transfer_intents.write`, `webhooks.write`
* Account-level authorization: client key can access only permitted account set
* Admin RBAC: viewer, operator, security admin, release admin
* Maker-checker for production config changes

### 3. Network Security

* No public Ledger API.
* No public Canton admin API.
* JSON Ledger API, if enabled, is internal-only behind reverse proxy.
* Default-deny Kubernetes NetworkPolicy.
* Egress proxy for webhook delivery.
* PrivateLink/VPN for institution connectivity.
* mTLS for all internal service calls.

Canton JSON Ledger API documentation explicitly says the JSON API should never be exposed to the internet and should be behind a reverse proxy. Pillar’s external API is therefore a separate façade, never a pass-through Ledger API. ([Digital Asset Documentation][5])

### 4. Data Protection

| Data            | Control                                      |
| --------------- | -------------------------------------------- |
| API keys        | hashed, prefix visible only                  |
| Webhook secrets | secret manager, rotation                     |
| Contract IDs    | encrypted in projection/debug tables         |
| PII metadata    | field-level encryption where needed          |
| Backups         | encrypted, access-controlled, restore-tested |
| Terraform state | encrypted remote backend                     |
| Logs            | PII redaction and retention policy           |

### 5. Compliance Traceability

Every production mutation has an immutable chain:

```text
admin/user identity
  → API request
  → idempotency key
  → intent object
  → ledger command
  → Canton transaction
  → projection update
  → webhook event
  → webhook delivery attempts
```

This satisfies the Pillar principle: **Operations must be ledger-traceable.**

### 6. Supply Chain

Required controls:

* image digest pinning
* signed container images
* SBOM generation
* vulnerability scanning
* signed Helm charts
* signed config bundles
* signed Daml package set metadata
* release provenance
* admission controller policy

---

## Implementation Plan

### Phase 0 — Architecture Contract

Deliverables:

* Canonical object model
* OpenAPI spec for `/v1`
* AsyncAPI spec for webhooks
* Ledger trace model
* API versioning policy
* Idempotency spec
* Daml package boundary
* Deployment model contract

Exit criteria:

* Hosted/Dedicated/Hybrid/Fully self-hosted all map to the same API grammar.
* Canton-native fields are internally traceable but externally hidden.

---

### Phase 1 — Hosted MVP

Deliverables:

* Hosted control plane
* Hosted data plane
* Postgres/Redis/Queue
* Transfer intent flow
* Balance/holding projection
* Webhook dispatcher
* Sandbox environment
* CLI alpha
* Workbench request log

Exit criteria:

* `POST /v1/transfer_intents` works end-to-end.
* Duplicate idempotency key returns identical response.
* Ledger transaction updates projection.
* Webhook emits `transfer_intent.succeeded`.

---

### Phase 2 — Dedicated

Deliverables:

* Single-tenant runtime isolation
* Dedicated Postgres/Redis/Queue
* Dedicated participant binding
* Dedicated KMS/secret namespace
* Terraform module v1
* HA/DR runbook
* Backup/restore drill

Exit criteria:

* Tenant data plane can be deployed in isolated cloud account/VPC.
* Restore drill proves projection reconstruction from ledger/PQS.

---

### Phase 3 — Hybrid

Deliverables:

* Institution VPC deployment
* Config agent
* Signed config bundles
* Local transaction path independence
* Egress-only control plane sync
* mTLS bootstrap
* NetworkPolicy baseline
* Helm chart GA

Exit criteria:

* Control plane can be disconnected and existing local transaction flow still succeeds.
* Config sync rollback works.
* No inbound access from Pillar Cloud is required.

---

### Phase 4 — Fully Self-hosted

Deliverables:

* Local control plane
* Local Workbench
* Offline license/config bundle import
* Air-gapped install mode
* Customer-operated upgrade path
* Local sandbox/dev tooling

Exit criteria:

* Institution can operate Pillar without Pillar Cloud dependency.
* API, SDK, webhook, object model remain identical to Hosted.

---

### Phase 5 — Enterprise Hardening

Deliverables:

* Multi-region DR
* Chaos testing
* Performance/load testing
* Security audit
* Compliance evidence pack
* SLO dashboards
* Customer runbooks
* Support bundle generator

Exit criteria:

* Production readiness review passed for regulated institution deployment.
* DR, backup, failover, upgrade, rollback, and webhook replay are tested.

---

## Open Questions

1. **Synchronizer model**
   Will Pillar use existing Canton synchronizers, institution private synchronizers, or Pillar-managed private synchronizers per tenant?

2. **Custody model**
   Is the default model Pillar participant custody, institution participant custody, or externally signed topology/transaction flows?

3. **Party binding policy**
   Should one external account map to one Canton party, multiple parties, or a pooled party model?

4. **Token standard scope**
   Which Daml/Canton asset package set is canonical for the first production release?

5. **API trace exposure**
   Should `ledger_trace` be visible to all API users, or only admin/debug clients?

6. **Idempotency retention**
   Stripe documents pruning after at least 24 hours; Pillar likely needs longer retention for regulated asset workflows. Final policy: 7 days, 30 days, or customer-configurable? ([Stripe Docs][2])

7. **Projection consistency SLA**
   What is the maximum acceptable projection lag for `GET /v1/balances`?

8. **Webhook retention**
   How long should events remain replayable: 30, 90, 365 days?

9. **Self-hosted support boundary**
   What diagnostics can Pillar receive from air-gapped deployments?

10. **Upgrade authority**
    In Hybrid, who approves Daml package activation: Pillar, institution, or both?

---

## Agent-ready Checklist

### Architecture

* [ ] Define canonical `/v1` OpenAPI object model.
* [ ] Define AsyncAPI webhook event schema.
* [ ] Define `ledger_trace` schema and visibility rules.
* [ ] Define deployment model matrix and responsibility split.
* [ ] Define local transaction path independence contract.

### API / SDK

* [ ] Implement `Pillar-Version` API versioning.
* [ ] Implement durable `Idempotency-Key` behavior.
* [ ] Implement object ID prefixes.
* [ ] Implement `transfer_intent` lifecycle.
* [ ] Implement `/v1/balances` and `/v1/holdings`.
* [ ] Generate TypeScript, Python, Go, Java, and .NET SDKs.
* [ ] Implement CLI: login, sandbox, webhook listen, event replay, test transfer.
* [ ] Implement Workbench API Explorer and request log.

### Ledger Runtime

* [ ] Implement participant affinity resolver.
* [ ] Implement command builder for transfer intent.
* [ ] Set `workflow_id = intent_id`.
* [ ] Derive stable `command_id` from idempotency record.
* [ ] Store command lifecycle in `audit.ledger_commands`.
* [ ] Implement Ledger API completion handling.
* [ ] Implement rejection-to-API-error mapping.

### Projection

* [ ] Deploy PQS or Ledger API event reader.
* [ ] Implement projection cursor table.
* [ ] Implement balance projection.
* [ ] Implement holding projection.
* [ ] Implement transfer intent status projection.
* [ ] Implement projection rebuild job.
* [ ] Add projection lag metric and alert.

### Webhooks

* [ ] Implement event outbox.
* [ ] Implement HMAC-SHA256 webhook signing.
* [ ] Implement timestamp replay protection.
* [ ] Implement retry/backoff.
* [ ] Implement DLQ.
* [ ] Implement manual event replay.
* [ ] Implement webhook endpoint API version pinning.

### Config Sync

* [ ] Implement signed config bundle schema.
* [ ] Implement config-agent pull over mTLS.
* [ ] Verify signature, sequence, expiry, and compatibility.
* [ ] Implement local config apply.
* [ ] Implement config rollback.
* [ ] Emit config audit events.
* [ ] Prove data plane continues during control plane outage.

### Kubernetes / Helm

* [ ] Build `pillar-platform` umbrella Helm chart.
* [ ] Add `values.schema.json`.
* [ ] Add subcharts for API, executor, projector, webhook dispatcher, config agent.
* [ ] Add optional subcharts for Postgres, Redis, queue.
* [ ] Add NetworkPolicy templates.
* [ ] Add PDB templates.
* [ ] Add mTLS sidecar or mesh configuration.
* [ ] Add observability chart integration.

### Terraform

* [ ] Build `pillar-network` module.
* [ ] Build `pillar-kubernetes` module.
* [ ] Build `pillar-data-services` module.
* [ ] Build `pillar-security` module.
* [ ] Build `pillar-canton-connectivity` module.
* [ ] Build `pillar-helm-release` module.
* [ ] Validate Hosted, Dedicated, Hybrid deployment plans.

### Security

* [ ] Enforce no public Ledger API.
* [ ] Enforce default-deny NetworkPolicy.
* [ ] Enforce service-to-service mTLS.
* [ ] Store secrets via external secret manager.
* [ ] Hash API keys.
* [ ] Encrypt sensitive projection internals.
* [ ] Implement RBAC and maker-checker.
* [ ] Sign images, charts, config bundles, and package set metadata.

### HA / DR

* [ ] Configure Postgres PITR.
* [ ] Configure participant DB backup.
* [ ] Back up node identities securely.
* [ ] Implement projection rebuild from ledger/PQS.
* [ ] Test restore to new environment.
* [ ] Test webhook outbox recovery.
* [ ] Define RPO/RTO per deployment model.
* [ ] Implement DR runbook.

### Observability

* [ ] Instrument API with OpenTelemetry.
* [ ] Add Prometheus metrics.
* [ ] Add Grafana dashboards.
* [ ] Add Loki log correlation.
* [ ] Add Tempo trace correlation.
* [ ] Add alerts for ledger API, projection lag, queue depth, webhook DLQ, cert expiry.
* [ ] Implement support bundle with health, logs, config version, trace IDs.

### Upgrade

* [ ] Implement `helm upgrade --atomic` release flow.
* [ ] Implement preflight checks.
* [ ] Implement canary transfer intent.
* [ ] Implement DB expand-contract migration pattern.
* [ ] Implement DAR/package set rollout policy.
* [ ] Implement package write-disable switch.
* [ ] Implement rollback/fix-forward runbook.
* [ ] Implement API version preview in Workbench.

[1]: https://docs.stripe.com/api "docs.stripe.com"
[2]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[3]: https://docs.stripe.com/webhooks "docs.stripe.com"
[4]: https://docs.canton.network/overview/reference/canton-protocol-specification "Canton Protocol Specification - Canton Network Docs"
[5]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html "JSON Ledger API Service V2 — Digital Asset’s platform documentation"
[6]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[7]: https://docs.stripe.com/workbench/shell "docs.stripe.com"
[8]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html?utm_source=chatgpt.com "The gRPC Ledger API Services"
[9]: https://kubernetes.io/docs/concepts/configuration/secret/ "Secrets | Kubernetes"
[10]: https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/ "StatefulSets | Kubernetes"
[11]: https://kubernetes.io/docs/tasks/run-application/configure-pdb/ "Specifying a Disruption Budget for your Application | Kubernetes"
[12]: https://kubernetes.io/docs/concepts/services-networking/network-policies/ "Network Policies | Kubernetes"
[13]: https://helm.sh/docs/topics/charts "Charts | Helm"
[14]: https://developer.hashicorp.com/terraform/tutorials/kubernetes/helm-provider "Deploy applications with the Helm provider | Terraform | HashiCorp Developer"
[15]: https://docs.digitalasset.com/build/3.5/component-howtos/pqs/operate.html "Operate — Digital Asset’s platform documentation"
[16]: https://docs.canton.network/global-synchronizer/production-operations/validator-backups "Validator Backups - Canton Network Docs"
[17]: https://docs.digitalasset.com/build/3.5/quickstart/observe/observability-troubleshooting-overview.html "Canton Network Quickstart observability & troubleshooting overview — Digital Asset’s platform documentation"
[18]: https://docs.canton.network/shared/support-checklist "Support Checklist - Canton Network Docs"
[19]: https://docs.canton.network/global-synchronizer/extension-synchronizers/deployment "Deploying a Private Synchronizer - Canton Network Docs"
[20]: https://docs.digitalasset.com/build/3.5/sdlc-howtos/smart-contracts/build/how-to-build-dar-files.html?utm_source=chatgpt.com "How to build Daml Archive (.dar) files"
[21]: https://docs.stripe.com/sdks "docs.stripe.com"
[22]: https://docs.stripe.com/stripe-cli "docs.stripe.com"
[23]: https://docs.stripe.com/sandboxes "docs.stripe.com"
[24]: https://docs.digitalasset.com/build/3.5/tutorials/json-api/canton_and_the_json_ledger_api.html?utm_source=chatgpt.com "Get started with Canton and the JSON Ledger API"
