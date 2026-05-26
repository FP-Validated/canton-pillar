# Phase 09 — CI/CD, Helm, and Deployment

> Ship Pillar as a reproducible, signed, deployment-mode-neutral release that installs the same `/v1` experience into hosted, customer-validator, and self-hosted environments.

## 1. Executive Summary

Phase 09 implements M9 from the implementation plan: Helm / CI/CD / Release. It turns the Phase 0–8 product into deployable infrastructure without changing the API grammar or ledger-source-of-truth invariants.

Source documents:

| Architecture source                                                         | Phase usage                                                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [18 Deployment / Enterprise Architecture](../Architecture/18_Deployment.md) | Deployment models, control/data plane split, Kubernetes, Helm, Terraform, secret policy                  |
| [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)       | Phase 8 implementation deliverables, Helm chart structure, CI/CD stages, J01–J08 tasks, M9 exit criteria |

Core principles embedded in this phase:

| Principle                                             | Phase 09 enforcement                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Canton Ledger is the source of truth                  | Helm wiring points services at a participant; deployment never creates API-side business truth.                      |
| Pillar DB stores only Projection / Audit / Config     | Migrator applies `packages/db` migrations only; no deployment-owned business tables.                                 |
| External API must be developer-friendly and Canton-invisible | Deployment mode does not expose `contract_id`, `template_id`, `party_id`, or participant internals.                  |
| Internal runtime must be Canton-native                | DAR upload, participant connectivity, command runtime, and projection workers are first-class release gates.         |
| Operations must be ledger-traceable                   | Release metadata, image digest, chart version, DAR checksum, migration version, and operation IDs remain correlated. |
| Balance/Holding-first, not contract-first             | Health and rollout checks verify projection readiness, not contract-first user APIs.                                 |
| Intent-first, not transaction-first                   | Deployment supports the services that convert external intents into ledger commands.                                 |
| Webhook-first for async workflow                      | Webhook dispatcher, signing keys, outbox dependencies, and retry configuration are deployed with the platform.       |
| API grammar must be polished from day one         | `/v1/health`, `/v1/operations/:id`, object errors, idempotency, and SDK behavior are deployment-neutral.             |
| Deployment model changes, API experience does not     | Hosted, customer-validator, and self-hosted differ only in ownership, network, and secret references.                |

Phase output:

```text
.github/workflows/*.yml
infra/compose/local.yml
infra/compose/local-auth.yml
infra/docker/*
infra/helm/pillar/*
infra/terraform/*
infra/observability/*
```

Milestone mapping:

| Milestone                 | Scope                               | Exit criteria                 |
| ------------------------- | ----------------------------------- | ----------------------------- |
| M9 Helm / CI/CD / Release | charts, DAR upload, promotion gates | dev/testnet deploy successful |

## 2. Goals / Non-goals

### Goals

| Goal                                          | Implementation commitment                                                                                           | Acceptance signal                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Build all release artifacts in CI             | Daml, JVM, TS, Docker images, Helm chart, DAR artifact                                                              | CI stages complete on PR/main.                             |
| Store DAR artifacts with version and checksum | Artifact upload includes digest used by Helm `dar.upload.checksum`                                                  | Release metadata references immutable DAR.                 |
| Run integration tests against sandbox profile | CI starts local sandbox profile before e2e                                                                          | Sandbox e2e green before Helm packaging.                   |
| Package Docker images for runtime services    | `infra/docker` includes app, ledger-command, projection-worker, webhook-dispatcher, workflow-orchestrator, migrator | Images build and are signed.                               |
| Install all runtime services with Helm        | `infra/helm/pillar` renders Deployments, Jobs, policies, metrics resources                                          | `helm lint` and `helm template -f values-dev.yaml` clean.  |
| Apply migrations before app rollout           | `migrator-job` runs as Helm pre-upgrade/pre-install hook                                                            | Pods do not roll until migration succeeds.                 |
| Upload DAR before ledger-command accepts work | `dar-upload-job` runs before ledger-command readiness                                                               | Target participant has the expected DAR checksum/version.  |
| Support deployment modes                      | hosted, customer-validator, self-hosted                                                                             | Same `/v1` grammar and SDK behavior in all modes.          |
| Provide Terraform modules                     | network, Kubernetes, data services, security, Canton connectivity, observability, Helm release                      | Terraform graph orders prerequisites before chart install. |
| Release with provenance                       | cosign signatures, SBOM, immutable tags/digests                                                                     | Tagged release signs images and DAR.                       |

### Non-goals

| Non-goal                                         | Reason                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| New public API endpoints                         | Phase 09 deploys existing API; it does not expand `/v1`.                                                                                    |
| New DB tables                                    | Deployment does not define product state; migrator applies existing `packages/db` migrations.                                               |
| Changing object model per deployment mode        | Invariant 8 requires identical API grammar across modes.                                                                                    |
| Exposing Canton Ledger API directly to customers | Pillar API remains the only public app surface.                                                                                             |
| Inline secrets in Helm values                    | Values carry secret references only.                                                                                                        |
| Making Redis/queue authoritative                 | Durable truth remains ledger plus Postgres projection/audit/config/outbox.                                                                  |
| Replacing customer infrastructure policy         | Terraform modules are reference modules; customer-validator and self-hosted may bind to existing networks, KMS, clusters, and participants. |
| Deploying Ledger API JSON as a public endpoint   | Canton JSON Ledger API must remain internal/reverse-proxied only where needed.                                                              |

## 3. Architecture

### 3.1 Deployment-mode invariant

All modes expose the same external contract:

```text
Client / SDK / CLI / Workbench
  -> https://api.<env>.pillar.example/v1/*
  -> Pillar API grammar
  -> operations, intents, balances, holdings, events, webhooks
```

Deployment mode changes ownership and wiring only:

| Mode                 | Pillar responsibility                                                                                                                                         | Customer responsibility                                                                            | Canton participant                                      | Public API grammar | Runtime notes                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `hosted`             | Runs API, workflow services, DB/Redis/queue, webhook dispatcher, observability, Helm release, Terraform-managed cloud, and validator/participant connectivity | Consumes `/v1` and webhook delivery; manages business integration                                  | Pillar-operated participant/validator                   | Identical `/v1`    | Fastest onboarding; Pillar owns deploy and operational recovery.                                            |
| `customer-validator` | Runs Pillar API and services; points ledger-command/projection at customer-owned participant                                                                  | Owns participant, party hosting, participant auth material, ledger endpoint availability           | Customer-operated participant                           | Identical `/v1`    | Customer controls validator/participant; Pillar services must degrade cleanly when participant unavailable. |
| `self-hosted`        | Provides chart, images, DAR, Terraform modules, release workflow, and upgrade policy                                                                          | Runs full stack: API, services, data stores, secrets, participant, observability, admission policy | Customer-operated participant/synchronizer connectivity | Identical `/v1`    | No Pillar control plane dependency in transaction hot path; customer owns operations and DR.                |

Resolution note: [18 Deployment](../Architecture/18_Deployment.md) uses Hosted, Dedicated, Hybrid, Fully self-hosted. [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) uses `sandbox`, `validator`, `customer-hosted`, `self-hosted`. This phase uses the assigned product names and maps them as follows:

| Phase 09 canonical mode | 18 Deployment concept                            | 23 Implementation Plan wording                            | Aliases (historical)            |
| ----------------------- | ------------------------------------------------ | --------------------------------------------------------- | ------------------------------- |
| `hosted`                | Hosted / Pillar-operated participant             | `validator` / hosted validator                            | `hosted-validator`, `validator` |
| `customer-validator`    | Hybrid customer participant with Pillar services | `customer-hosted` with external participant               |                                 |
| `self-hosted`           | Fully self-hosted                                | `self-hosted`                                             |                                 |
| `sandbox`               | Local developer profile                          | Compose and CI integration profile, not a production mode |                                 |

### 3.2 Control plane / data plane

| Plane         | Components                                                                                                                      | Deployment rule                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Control plane | release registry, config registry, policy registry, fleet visibility, license/entitlement                                       | Never sits in the transaction hot path.                |
| Data plane    | API, workflow-orchestrator, ledger-command, projection-worker, webhook-dispatcher, Postgres, Redis, queue, participant endpoint | Must process existing configured transactions locally. |

Data-plane hot path:

```text
Client
  -> API gateway / ingress
  -> api-service
  -> Postgres idempotency + audit write
  -> workflow-orchestrator
  -> queue / outbox
  -> ledger-command
  -> Canton participant Ledger API
  -> PQS / Ledger event reader
  -> projection-worker
  -> events + webhook outbox
  -> webhook-dispatcher
```

### 3.3 Kubernetes namespaces

| Namespace              | Contents                                                                                 | Required in mode                                               |
| ---------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pillar-system`        | service accounts, config-agent where used, external-secrets bindings, admission policies | all modes except minimal local sandbox                         |
| `pillar-runtime`       | api, workflow-orchestrator, ledger-command, projection-worker, webhook-dispatcher        | all modes                                                      |
| `pillar-ledger`        | canton-adapter, optional embedded participant, PQS wiring                                | hosted; optional in customer-validator/self-hosted             |
| `pillar-data`          | optional in-cluster Postgres/Redis/queue                                                 | dev/sandbox; production only when managed services unavailable |
| `pillar-observability` | ServiceMonitor, dashboards, alerts, OpenTelemetry collector bindings                     | all production modes                                           |

### 3.4 Terraform modules

Canonical modules from [18 Deployment](../Architecture/18_Deployment.md):

```text
infra/terraform/
  modules/
    pillar-network/
    pillar-kubernetes/
    pillar-data-services/
    pillar-security/
    pillar-canton-connectivity/
    pillar-observability/
    pillar-helm-release/
```

| Module                       | Responsibility                                             | Inputs                                                                | Outputs                                       |
| ---------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------- |
| `pillar-network`             | VPC/subnets/private endpoints/egress proxy/security groups | region, CIDRs, ingress policy, egress policy                          | network IDs, endpoint DNS names               |
| `pillar-kubernetes`          | EKS/AKS/GKE/on-prem bootstrap                              | cluster version, node pools, OIDC, namespaces                         | kubeconfig ref, cluster identity              |
| `pillar-data-services`       | Postgres, Redis, queue, backups                            | engine mode, HA, backup retention, encryption refs                    | secret refs, endpoints, database names        |
| `pillar-security`            | KMS/HSM/IAM/secret manager/cert issuer                     | key aliases, workload identities, mTLS provider                       | KMS refs, service accounts, secret store refs |
| `pillar-canton-connectivity` | participant/synchronizer endpoint access                   | participant DNS, ports, TLS refs, PrivateLink/VPN                     | ledger API endpoint refs                      |
| `pillar-observability`       | metrics/logs/traces storage and alert routing              | sinks, retention, PagerDuty/webhook refs                              | ServiceMonitor labels, OTLP endpoints         |
| `pillar-helm-release`        | install/upgrade Pillar chart after prerequisites           | chart version, values files, secret refs, image digests, DAR checksum | Helm release status                           |

Terraform ordering:

```text
network
  -> kubernetes
  -> security
  -> data-services
  -> canton-connectivity
  -> observability
  -> helm-release
```

## 4. API / Object Model

No new public API surface is introduced in Phase 09.

### 4.1 Deployment-neutral endpoints

| Endpoint                            | Required behavior across modes                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/health`                    | Same response shape. May include component readiness/degraded status, but does not reveal Canton contract-first internals. |
| `GET /v1/operations/:id`            | Same operation object, status grammar, error grammar, and trace correlation semantics regardless of participant ownership. |
| Existing `/v1/*` resource endpoints | Same request/response schemas, idempotency semantics, pagination grammar, and API-version behavior.                        |
| Webhook deliveries                  | Same event object grammar, signature verification flow, retry semantics, and replay behavior.                              |

### 4.2 Allowed deployment metadata

Deployment metadata may appear only in operational channels:

| Surface                                    | Allowed                                                                                                         | Not allowed                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Health payload                             | service status, dependency readiness, version, chart version, image digest short form, degraded component names | contract IDs, template IDs, party IDs as user-facing object fields                    |
| Operation trace for privileged admin/debug | operation ID, command ID, workflow ID, transaction ID, ledger offset when authorized                            | default public object model fields that force Canton concepts into customer workflows |
| Logs/metrics                               | deployment mode label, release version, participant endpoint alias                                              | raw secrets, JWTs, API keys, webhook signing secrets                                  |

Example health shape constraint:

```json
{
  "object": "health",
  "status": "degraded",
  "mode": "customer-validator",
  "version": "0.1.0",
  "components": {
    "api": "ready",
    "database": "ready",
    "ledger_command": "degraded",
    "projection_worker": "ready",
    "webhook_dispatcher": "ready"
  }
}
```

The `mode` value is operational metadata. It must not change route names, object names, error codes, idempotency behavior, webhook event names, or SDK method names.

### 4.3 Object-model invariants

| Invariant                                            | Deployment enforcement                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Public resources remain balance/holding/intent-first | Helm and Terraform do not enable contract-first routes.                        |
| Operations remain stable                             | Release restarts must not regenerate operation IDs or command IDs.             |
| Idempotency survives deploys                         | Postgres idempotency records persist across pod replacement and image rollout. |
| Projection is rebuildable                            | Projection workers can restart from checkpoint/ledger source.                  |
| Webhook delivery is replayable                       | Outbox and delivery attempts persist through deploy.                           |

## 5. Internal Runtime

### 5.1 Helm chart structure

Canonical chart structure from [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md):

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

Required chart files:

| File                  | Purpose                                   | Acceptance                                                                |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| `Chart.yaml`          | Chart identity, app version, dependencies | Versioned and packageable.                                                |
| `values.yaml`         | Safe defaults with secret refs only       | No inline secret values.                                                  |
| `values-dev.yaml`     | CI/dev deploy profile                     | `helm template -f values-dev.yaml` clean.                                 |
| `values-testnet.yaml` | testnet promotion profile                 | Uses immutable image digests and DAR checksum.                            |
| `values-mainnet.yaml` | mainnet promotion profile                 | Requires production secret refs, PDB, HPA, NetworkPolicy, ServiceMonitor. |
| `templates/*.yaml`    | Kubernetes resources                      | `helm lint` clean.                                                        |

### 5.2 Helm values excerpt

The implementation plan defines this values model:

```yaml
global:
  environment: dev
  deploymentMode: hosted
  apiVersionDefault: '2026-05-26'

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

Phase 09 additions must preserve this shape and may only extend it where architecture already defines the concept:

```yaml
global:
  deploymentMode: hosted # hosted | customer-validator | self-hosted
  environment: dev # dev | testnet | mainnet

release:
  imagePullPolicy: IfNotPresent
  imagePullSecrets:
    - name: ghcr-pillar
  imageDigestRequired: true

jobs:
  migrator:
    enabled: true
    hook: pre-install,pre-upgrade
    backoffLimit: 1
  darUpload:
    enabled: true
    hook: pre-install,pre-upgrade
    waitForParticipant: true

policy:
  networkPolicy:
    enabled: true
    defaultDeny: true
  podDisruptionBudget:
    enabled: true
  hpa:
    enabled: true
  serviceMonitor:
    enabled: true

secrets:
  provider: external-secrets
  refs:
    databaseUrl: pillar-db/url
    ledgerToken: pillar-ledger-token/token
    ledgerMtls: pillar-ledger-mtls
    webhookSigningKmsKey: pillar-webhook-signing-key
```

### 5.3 Hook ordering

Required install/upgrade order:

```text
1. Render chart.
2. Validate secret refs exist or are provisioned by External Secrets.
3. Run migrator-job as pre-install/pre-upgrade hook.
4. Run dar-upload-job before ledger-command becomes ready.
5. Roll api-service, workflow-orchestrator, projection-worker, webhook-dispatcher.
6. Roll ledger-command only after DAR availability check passes.
7. Expose readiness after database, config, and required runtime checks pass.
8. ServiceMonitor starts scraping release metrics.
```

`services/workflow-orchestrator` is stubbed in P0.J03 (image) and built to MVP in P6.H07 (workflow/outbox coordinator). P9 only packages the image; it does not introduce business logic for the orchestrator.

Hook table:

| Resource                             | Hook                                                                             | Blocks                         | Success criterion                                        | Failure behavior                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `migrator-job.yaml`                  | `pre-install,pre-upgrade`                                                        | app rollout                    | `tools/migrator migrate up` exits 0 against app database | Helm release fails; no new pods become ready.                        |
| `dar-upload-job.yaml`                | `pre-install,pre-upgrade` or explicit dependency before ledger-command readiness | ledger-command work acceptance | participant reports package/DAR matching checksum        | Helm release fails or ledger-command stays not-ready.                |
| `api-deployment.yaml`                | normal rollout                                                                   | ingress readiness              | `/v1/health` ready/degraded according to dependencies    | Degraded response for participant-only failure.                      |
| `ledger-command-deployment.yaml`     | normal rollout with readiness gate                                               | command processing             | participant reachable and DAR uploaded                   | Not ready; API mutation endpoints return controlled degraded errors. |
| `projection-worker-deployment.yaml`  | normal rollout                                                                   | projection freshness           | checkpoint can be read/written                           | Alert on lag; no API grammar change.                                 |
| `webhook-dispatcher-deployment.yaml` | normal rollout                                                                   | webhook delivery               | outbox connection and signing key ref valid              | Delivery paused/retried; events remain durable.                      |

### 5.4 Required Kubernetes resources

| Resource                          | Requirement                                                                       | Notes                                       |
| --------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| Deployment                        | api, workflow-orchestrator, ledger-command, projection-worker, webhook-dispatcher | Stateless app pods; no local durable state. |
| Job                               | migrator, DAR upload                                                              | Hooked, idempotent, checksum-aware.         |
| ConfigMap                         | non-secret runtime config                                                         | No raw credentials.                         |
| Secret reference / ExternalSecret | database URL, ledger token, mTLS certs, webhook signing key refs                  | No inline values in `values*.yaml`.         |
| Ingress / Service                 | API ingress and internal services                                                 | Ledger API remains internal.                |
| ServiceAccount                    | per workload                                                                      | Bound to minimal IAM/KMS/secret access.     |
| NetworkPolicy                     | default deny plus explicit flows                                                  | Required for production.                    |
| PodDisruptionBudget               | API and workers                                                                   | Required for high availability.             |
| HPA                               | stateless services                                                                | CPU/request/queue/lag metrics.              |
| ServiceMonitor                    | metrics scraping                                                                  | Required for observability acceptance.      |

### 5.5 NetworkPolicy flows

Default posture:

```text
deny all ingress
deny all egress
allow explicitly required service-to-service traffic
```

Required flows:

| Source                | Destination                                      | Port/protocol                           | Mode                                 |
| --------------------- | ------------------------------------------------ | --------------------------------------- | ------------------------------------ |
| ingress controller    | api-service                                      | HTTPS                                   | all                                  |
| api-service           | Postgres                                         | 5432/TCP                                | all                                  |
| api-service           | Redis                                            | 6379/TCP where enabled                  | all                                  |
| api-service           | queue                                            | broker-specific                         | all                                  |
| workflow-orchestrator | Postgres/queue                                   | 5432 + broker                           | all                                  |
| ledger-command        | Canton Ledger API                                | gRPC/TLS 6865 or configured             | all                                  |
| projection-worker     | PQS / Ledger API                                 | Postgres or gRPC/TLS                    | all                                  |
| webhook-dispatcher    | customer webhook endpoints                       | HTTPS via egress proxy where configured | all                                  |
| jobs.migrator         | Postgres                                         | 5432/TCP                                | all                                  |
| jobs.dar-upload       | participant Ledger API / package upload endpoint | gRPC/TLS / configured                   | all                                  |
| config-agent          | control plane config endpoint                    | HTTPS/mTLS outbound                     | hosted/customer-validator where used |
| participant           | synchronizer/sequencer                           | TLS                                     | hosted/self-hosted when embedded     |

### 5.6 Docker images

| Image                                  | Dockerfile                                                       | Runtime contents                                 | Must not contain                   |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------- |
| `ghcr.io/pillar/api`                   | `infra/docker/api.Dockerfile`                                    | API server, OpenAPI metadata, health routes      | build credentials, raw secrets     |
| `ghcr.io/pillar/ledger-command`        | `infra/docker/ledger-command.Dockerfile`                         | ledger client, generated types, command builders | DAR upload token baked into image  |
| `ghcr.io/pillar/projection-worker`     | `infra/docker/projection-worker.Dockerfile`                      | PQS/Ledger reader, projection code               | database password baked into image |
| `ghcr.io/pillar/webhook-dispatcher`    | `infra/docker/webhook-dispatcher.Dockerfile`                     | dispatcher, signer integration, retry loop       | webhook signing secret material    |
| `ghcr.io/pillar/workflow-orchestrator` | `infra/docker/workflow-orchestrator.Dockerfile`                  | intent orchestration worker                      | ledger admin credentials           |
| `ghcr.io/pillar/migrator`              | `infra/docker/migrator.Dockerfile`                               | migration CLI and `packages/db/migrations`       | app runtime server                 |
| `ghcr.io/pillar/dar-uploader`          | `infra/docker/dar-uploader.Dockerfile` or migrator/tooling image | DAR fetch, checksum verify, upload command       | long-lived participant admin token |

Image rules:

```text
- Use immutable digests in release values.
- Tag semver and git SHA.
- Sign each image with cosign.
- Emit SBOM per image.
- Scan before release promotion.
- Store provenance linking image digest -> commit -> DAR checksum -> chart version.
```

### 5.7 CI/CD workflow

Canonical CI stages from [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md):

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

Workflow files:

| Workflow                                | Trigger                                         | Jobs                                                                          | Release effect                                  |
| --------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| `.github/workflows/ci.yml`              | pull request, push to main                      | lint, Daml build/test, codegen, TS/JVM tests, migrator verify, contract tests | PR safety only.                                 |
| `.github/workflows/integration.yml`     | PR/main after app build                         | compose sandbox profile, e2e, optional LocalNet                               | Blocks packaging.                               |
| `.github/workflows/docker.yml`          | main/tags                                       | build images, SBOM, scan, cosign sign                                         | Pushes signed images.                           |
| `.github/workflows/helm.yml`            | PR/main/tags                                    | `helm lint`, `helm template`, chart package                                   | Publishes chart on tag.                         |
| `.github/workflows/release.yml`         | version tag                                     | collect DAR, checksum, images, SBOM, chart, signatures                        | Creates tagged release and promotion artifacts. |
| `.github/workflows/deploy-dev.yml`      | main or release candidate                       | install/upgrade dev                                                           | Dev deploy success.                             |
| `.github/workflows/promote-testnet.yml` | manual approval after dev                       | promote immutable digests and DAR checksum to testnet                         | Testnet deploy success.                         |
| `.github/workflows/promote-mainnet.yml` | manual approval after testnet and security gate | promote immutable release                                                     | Mainnet release candidate.                      |

GitHub workflow sketch to preserve:

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

### 5.8 Compose profiles

| Profile      | File                             | Purpose                                | Acceptance                             |
| ------------ | -------------------------------- | -------------------------------------- | -------------------------------------- |
| local        | `infra/compose/local.yml`        | fastest dev stack with sandbox         | e2e passes.                            |
| auth         | `infra/compose/local-auth.yml`   | JWT/mTLS-like auth simulation          | auth tests pass.                       |
| localnet     | `infra/compose/localnet.yml`     | multi-validator / cross-party scenario | optional cross-participant tests pass. |
| webhook-test | `infra/compose/webhook-test.yml` | receiver, retry, replay chaos tests    | webhook retry/replay tests pass.       |

## 6. DB Schema

No new tables are introduced in Phase 09.

### 6.1 Migration rule

The Helm `migrator-job` applies all migrations from `packages/db` before runtime pods roll:

```text
packages/db/migrations/
  0010_config/
  0020_audit/
  0030_idempotency/
  0040_intents_operations/
  0050_projections/
  0060_events_webhooks/
```

Deployment-owned DB behavior:

| Item             | Rule                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Migration source | `packages/db` only.                                                                                           |
| Runner           | `tools/migrator` packaged into migrator image.                                                                |
| Helm timing      | pre-install/pre-upgrade hook.                                                                                 |
| Idempotency      | Re-running the Job after a failed Helm attempt must be safe.                                                  |
| Locking          | Migrator must take a migration lock so concurrent upgrades cannot interleave.                                 |
| Rollback         | Schema rollback is not automatic unless explicit reversible migration exists; failed migration stops rollout. |
| Verification     | CI runs `tools/migrator/bin/migrator verify`; deploy runs `migrator up`.                                      |

### 6.2 DB invariant by table class

| Table class                        | Authoritative?                                              | Phase 09 handling                            |
| ---------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| Config                             | Yes for local config, not business ledger truth             | Migrated before apps; secret refs external.  |
| Audit                              | Durable audit trail                                         | Migrated before API writes.                  |
| Idempotency                        | Canonical API retry state                                   | Persisted across deploys.                    |
| Operations / command queue         | Canonical operation workflow state linked to ledger command | Persisted across deploys.                    |
| Projection                         | Rebuildable from ledger                                     | Persisted for serving reads; can be rebuilt. |
| Webhook events / delivery attempts | Durable async delivery state                                | Persisted across webhook-dispatcher rollout. |

### 6.3 Database wiring by mode

| Mode               | Database mode                                                  | Requirements                                                                |
| ------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| hosted             | Pillar-managed Postgres preferred                              | encrypted, backed up, secret ref via cloud secret manager/external-secrets. |
| customer-validator | Pillar-managed or customer-managed Postgres depending contract | network path from Pillar services, no inline credentials.                   |
| self-hosted        | customer-managed Postgres                                      | chart consumes secret refs; Terraform module optional.                      |
| sandbox            | compose Postgres                                               | local credentials only for dev; not release values.                         |

### 6.4 Migration failure policy

```text
If migrator-job fails:
  - Helm release fails.
  - New application pods must not become ready.
  - Existing release remains serving if Kubernetes rollout strategy permits it.
  - Operator checks migrator logs, migration lock, DB backup, and failed migration version.
  - Retry only after source fix or explicit operator decision.
```

## 7. Failure Modes

| Failure                               | Detection                                                                               | Required behavior                                                                                                                                   | Recovery                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Failed migration rollback             | `migrator-job` exits non-zero; Helm hook failure; migration version mismatch            | Stop rollout. Do not mark new release ready. Do not run app pods against unknown schema.                                                            | Restore DB backup if migration partially mutated irreversible state; otherwise fix migration and rerun Helm upgrade. Record failed version in release notes. |
| Partial DAR upload                    | `dar-upload-job` upload times out or checksum/package query does not match expected DAR | Ledger-command stays not-ready; mutation endpoints return controlled degraded errors instead of accepting work.                                     | Re-run DAR upload Job after verifying participant connectivity and package list. Job must be checksum/idempotency aware.                                     |
| Image pull failure                    | Pod `ImagePullBackOff`; admission or registry errors                                    | Rollout stalls; existing pods continue if rolling strategy allows.                                                                                  | Verify image digest, registry credentials, cosign policy, and imagePullSecrets; republish only immutable/correct artifact.                                   |
| Secret rotation during deploy         | Pods receive mixed old/new secret versions; auth failures; readiness probes fail        | Workloads must reload where supported or restart safely; no secret values logged.                                                                   | Rotate via external secret versioning; restart dependent deployments after secret sync; verify ledger, DB, webhook signing, API key validation.              |
| Participant unavailable at boot       | ledger-command readiness fails; API dependency check degraded                           | API may start and serve safe reads/health; mutation endpoints return controlled degraded errors; no command accepted without participant readiness. | Restore participant endpoint/TLS/auth; DAR upload check reruns; ledger-command readiness becomes ready.                                                      |
| Helm template regression              | `helm lint` or `helm template` fails                                                    | CI blocks merge/release.                                                                                                                            | Fix chart templates/values schema.                                                                                                                           |
| NetworkPolicy blocks required flow    | readiness failures, connection timeouts, metrics/logs                                   | Fail closed. Do not disable NetworkPolicy globally.                                                                                                 | Add the minimal explicit egress/ingress rule matching the required flow.                                                                                     |
| PDB prevents node drain               | Kubernetes drain blocked                                                                | Protect availability over drain speed.                                                                                                              | Temporarily scale replicas or use approved maintenance window.                                                                                               |
| HPA scales worker too low             | queue lag/projection lag increases                                                      | Min replicas must preserve processing capacity.                                                                                                     | Adjust min replicas and metric targets.                                                                                                                      |
| ServiceMonitor missing                | metrics absent after deploy                                                             | Observability gate fails.                                                                                                                           | Fix labels/selectors before promotion.                                                                                                                       |
| Release workflow signs wrong artifact | signature/provenance check mismatch                                                     | Release cannot be promoted.                                                                                                                         | Rebuild release from source tag; never mutate existing tag artifact silently.                                                                                |
| Terraform prerequisite missing        | Helm cannot connect to DB/KMS/participant                                               | Terraform apply or Helm release fails before readiness                                                                                              | Fix dependency output, secret ref, IAM, network path.                                                                                                        |

Failure response invariant:

```text
No failure mode may make the external API switch to a different grammar.
No failure mode may store ledger truth in Pillar DB as a workaround.
No failure mode may bypass idempotency or command trace correlation.
```

## 8. Security / Compliance

### 8.1 Release artifact integrity

| Control              | Requirement                                                            | Gate                                            |
| -------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| Cosign image signing | Every release image is signed by CI identity                           | Admission policy verifies signatures.           |
| SBOM                 | Each image emits SBOM artifact                                         | Release includes SBOM links/checksums.          |
| DAR checksum         | DAR artifact has checksum recorded in release metadata and Helm values | DAR upload Job verifies checksum before upload. |
| Chart provenance     | Helm chart packaged with version and digest                            | Promotion uses immutable chart version.         |
| Immutable images     | testnet/mainnet values use digests, not mutable tags                   | Helm template audit.                            |
| Build provenance     | Release maps git tag -> commit -> images -> DAR -> chart               | Release workflow output.                        |

### 8.2 Secret handling

No inline secrets in values files.

| Secret               | Helm values representation                   | Backing system                                                    |
| -------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Database URL         | `database.urlSecretRef.name/key`             | External Secrets / cloud secret manager / customer secret manager |
| Ledger token         | `ledger.auth.tokenSecretRef.name/key`        | External Secrets / participant-specific secret store              |
| Ledger mTLS cert/key | `ledger.tls.secretRef`                       | Kubernetes TLS Secret synced from secret manager or cert issuer   |
| Registry credentials | `release.imagePullSecrets[]`                 | Kubernetes Secret managed outside chart values                    |
| Webhook signing key  | `webhooks.signingSecretKmsKey` or key ref    | KMS/HSM; raw key not in values                                    |
| API keys/JWT issuers | config DB or secret refs from security phase | No inline static keys                                             |

Secret rotation requirements:

```text
- Rotation must be deploy-safe.
- Secret values must not appear in logs, metrics, Helm output, Terraform output, or release notes.
- Workloads must expose readiness failures instead of silently using invalid credentials.
- KMS/HSM key references are preferred over raw signing material.
```

### 8.3 Admission policies

OPA/Kyverno policies must enforce at least:

| Policy                                   | Enforcement                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Signed images only                       | Reject unsigned or untrusted cosign signatures.                                |
| No mutable tags in production            | Reject `:latest` and tag-only images in testnet/mainnet.                       |
| Required resource limits                 | Reject pods without CPU/memory requests and limits.                            |
| Required NetworkPolicy                   | Production namespaces must have default deny and explicit allows.              |
| No privileged containers                 | Reject privileged, hostNetwork, hostPID, unnecessary capabilities.             |
| Read-only root filesystem where possible | Enforce for runtime services.                                                  |
| Secret refs only                         | Reject inline secret-like values in ConfigMaps where possible.                 |
| Required ServiceAccount                  | Reject default service account use by runtime workloads.                       |
| Required PDB                             | Production deployments must define PDB.                                        |
| Required labels                          | release, app, component, deploymentMode, environment labels for audit/metrics. |

### 8.4 Network and participant security

| Boundary                       | Rule                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Public internet                | Only API ingress and approved webhook egress are public-facing.                       |
| Ledger API                     | Internal only; TLS required outside local sandbox.                                    |
| JSON Ledger API                | Not public; reverse proxy/internal only if enabled.                                   |
| Customer-validator participant | Access through customer-approved private network, VPN, PrivateLink, or mTLS endpoint. |
| Self-hosted                    | Customer controls network; chart still defaults to least privilege.                   |

### 8.5 Compliance evidence

Release evidence to retain:

```text
- GitHub workflow run IDs
- git tag and commit SHA
- image digests and cosign signatures
- SBOM artifact digests
- DAR artifact path and checksum
- Helm chart version and digest
- migration version applied
- Terraform plan/apply output references with secrets redacted
- deployment mode and environment
- approval record for testnet/mainnet promotion
```

## 9. Implementation Plan

Area letter: J = Infra / release.

| ID     | Title                                     | Path                                                                                                                                                                                                                     | Output                                                                                                                                       | Deps                                                                                   | Acceptance                                                                                                                                                                                                                | Risk   |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P9.J01 | Compose local                             | `infra/compose/local.yml`                                                                                                                                                                                                | local stack with Postgres, Redis, webhook receiver, Canton sandbox, migrator, api, ledger-command, projection-worker, webhook-dispatcher     | P0.J01, P0.J03, P3.D07, P4.E06, P4.F02, P5.E07, P5.G01, P6.E08, P6.H03, P8.K01         | e2e passes against sandbox profile                                                                                                                                                                                        | medium |
| P9.J02 | Compose auth                              | `infra/compose/local-auth.yml`                                                                                                                                                                                           | JWT/mTLS-like local auth profile                                                                                                             | P8.K01, P8.K02, P8.K03, P8.K06                                                         | auth tests pass and local API rejects unauthenticated requests                                                                                                                                                            | medium |
| P9.J03 | Dockerfiles                               | `infra/docker`                                                                                                                                                                                                           | service images for api, ledger-command, projection-worker, webhook-dispatcher, workflow-orchestrator, migrator, DAR uploader as needed       | P0.J03, P1.B01, P1.B02, P1.B03, P1.B04, P1.B05, P3.D07, P4.F02, P5.G01, P6.H03, P8.K01 | images build, contain no raw secrets, expose expected entrypoints                                                                                                                                                         | medium |
| P9.J04 | Helm chart                                | `infra/helm/pillar`                                                                                                                                                                                                      | `Chart.yaml`, values files, templates for Deployments, Services, Ingress, ConfigMap, ServiceAccount, NetworkPolicy, HPA, PDB, ServiceMonitor | P9.J03                                                                                 | `helm lint infra/helm/pillar` passes                                                                                                                                                                                      | high   |
| P9.J05 | Migration Job                             | `infra/helm/pillar/templates/migrator-job.yaml`                                                                                                                                                                          | pre-install/pre-upgrade migrator Job using `packages/db` migrations                                                                          | P9.J04, P3.D07                                                                         | migration runs before app pods and failed migration blocks rollout                                                                                                                                                        | high   |
| P9.J06 | DAR upload Job                            | `infra/helm/pillar/templates/dar-upload-job.yaml`                                                                                                                                                                        | checksum-aware DAR upload Job for target participant                                                                                         | P9.J04, P1.B01, P1.B02, P1.B03, P1.B04, P1.B05, P4.F02                                 | validator/participant has expected DAR before ledger-command readiness                                                                                                                                                    | high   |
| P9.J07 | Observability                             | `infra/observability` and Helm `servicemonitor.yaml`                                                                                                                                                                     | dashboards, alerts, metrics wiring for runtime, projection lag, ledger readiness, webhook delivery, migrations                               | P9.J04, P6.H03, P5.G07                                                                 | metrics visible after dev deploy; ServiceMonitor rendered                                                                                                                                                                 | medium |
| P9.J08 | Release workflow                          | `.github/workflows/release.yml`                                                                                                                                                                                          | tagged release with images, DAR, chart, SBOM, cosign signatures, provenance                                                                  | P9.J03, P9.J04, P9.J05, P9.J06, P9.J07                                                 | tagged release created; images and DAR signed; promotion artifacts immutable                                                                                                                                              | high   |
| P9.J09 | Per-service Dockerfile reviews            | `infra/docker`, `apps/api`, `services/{ledger-command,projection-worker,workflow-orchestrator,webhook-dispatcher,compliance-adapter,template-registry,usage-meter,reconciler,search-indexer,export-worker,dar-uploader}` | Dockerfile review checklist and fixes for each runtime image boundary                                                                        | P9.J03, P8.K07, P11.M02, P11.M04, P12.N03, P14.Q03                                     | each listed service image has a reviewed Dockerfile or documented image ownership, no raw secrets, minimal copy context, non-root runtime where supported, expected health/entrypoint                                     | medium |
| P9.J10 | Multi-arch image build                    | `.github/workflows/docker.yml` and `infra/docker`                                                                                                                                                                        | amd64 + arm64 buildx pipeline for all release images                                                                                         | P9.J03, P9.J09                                                                         | CI builds and pushes signed linux/amd64 and linux/arm64 image manifests for every release image                                                                                                                           | medium |
| P9.J11 | Helm unit tests                           | `infra/helm/pillar/tests`                                                                                                                                                                                                | helm-unittest suite for deployments, jobs, hooks, policies, and values modes                                                                 | P9.J04, P9.J05, P9.J06                                                                 | `helm unittest infra/helm/pillar` passes and covers dev/testnet/mainnet plus hosted/customer-validator/self-hosted render branches                                                                                        | medium |
| P9.J12 | Canary deployment strategy                | `infra/helm/pillar/templates` and `infra/helm/pillar/values*.yaml`                                                                                                                                                       | canary values and rollout resources for controlled traffic shift                                                                             | P9.J04, P9.J07, P10.L01                                                                | canary render includes traffic weight, health metric checks, rollback trigger, and no `/v1` grammar difference between baseline and canary                                                                                | high   |
| P9.J13 | Blue/green stateless services             | `infra/helm/pillar/templates` and `infra/helm/pillar/values*.yaml`                                                                                                                                                       | blue/green deployment switch for api and webhook-dispatcher                                                                                  | P9.J04, P9.J07, P9.J12                                                                 | api and webhook-dispatcher can render blue and green ReplicaSets/Services with explicit active color and rollback switch                                                                                                  | high   |
| P9.J14 | PDB/HPA tuning per service                | `infra/helm/pillar/templates/{pdb,hpa}.yaml` and `infra/helm/pillar/values*.yaml`                                                                                                                                        | service-specific disruption and autoscaling defaults                                                                                         | P9.J04, P9.J07                                                                         | production values render PDB and HPA for api, ledger-command, projection-worker, workflow-orchestrator, webhook-dispatcher, compliance-adapter, reconciler, search-indexer, export-worker, template-registry, usage-meter | medium |
| P9.J15 | Namespace NetworkPolicies                 | `infra/helm/pillar/templates/networkpolicy.yaml`                                                                                                                                                                         | default-deny and explicit allow policies for pillar-runtime, pillar-ledger, pillar-data, pillar-observability, pillar-system                 | P9.J04, P8.K07                                                                         | production render creates namespace-scoped default deny plus required ingress/egress flows for runtime, ledger, data, observability, and system namespaces                                                                | high   |
| P9.J16 | ServiceAccount and RBAC scoping           | `infra/helm/pillar/templates/{serviceaccount,rbac}.yaml`                                                                                                                                                                 | per-service ServiceAccount, Role, RoleBinding, and cloud workload identity annotations                                                       | P9.J04, P8.K03, P8.K07                                                                 | no runtime workload uses default ServiceAccount; each service has minimal secret/KMS/config access and helm-unittest asserts RBAC names per service                                                                       | high   |
| P9.J17 | ExternalSecrets integration               | `infra/helm/pillar/templates/externalsecret.yaml` and `infra/helm/pillar/values*.yaml`                                                                                                                                   | ExternalSecret resources for DB, ledger token, ledger mTLS, webhook signing, registry credentials, API key issuer refs                       | P9.J04, P8.K01, P8.K06                                                                 | `values*.yaml` contain secret refs only; rendered manifests include ExternalSecret mappings and no inline secret-like values                                                                                              | high   |
| P9.J18 | Air-gapped install bundle                 | `tools/release/airgap` and `.github/workflows/release.yml`                                                                                                                                                               | chart + images + DAR + dependencies tarball with manifest, checksums, and offline install instructions                                       | P9.J08, P9.J10, P9.J17                                                                 | release workflow emits an air-gapped tarball that can load images, verify signatures/checksums, install chart, and upload DAR without internet access                                                                     | high   |
| P9.J19 | OCI registry mirror policy                | `infra/helm/pillar/values*.yaml` and release docs                                                                                                                                                                        | image registry mirror values and promotion policy for self-hosted/offline installs                                                           | P9.J10, P9.J18                                                                         | chart values can rewrite image registry prefixes to an approved mirror while preserving immutable digests and cosign verification                                                                                         | medium |
| P9.J20 | Helm values schema                        | `infra/helm/pillar/values.schema.json` and `.github/workflows/helm.yml`                                                                                                                                                  | JSON schema for chart values with CI validation                                                                                              | P9.J04, P9.J11, P9.J17                                                                 | CI validates all values files against `values.schema.json` and rejects invalid deploymentMode, environment, image digest, secret ref, and rollout policy values                                                           | medium |
| P9.J21 | GitHub Actions release workflow hardening | `.github/workflows/release.yml`                                                                                                                                                                                          | release workflow with cosign, SBOM, provenance, immutable tag, DAR checksum, chart package, and attestation                                  | P9.J08, P9.J10, P9.J18, P9.J20                                                         | version tag creates signed images, SBOMs, SLSA/provenance attestations, signed/checksummed DAR, packaged chart, and immutable release manifest                                                                            | high   |
| P9.J22 | Multi-env promotion workflow              | `.github/workflows/{deploy-dev,promote-testnet,promote-mainnet}.yml`                                                                                                                                                     | dev -> testnet -> mainnet promotion with immutable artifacts and manual approvals                                                            | P9.J12, P9.J13, P9.J15, P9.J16, P9.J17, P9.J21                                         | dev deploy succeeds automatically; testnet and mainnet require manual approval, invariant evidence, signed artifacts, and environment-specific values with identical `/v1` grammar                                        | high   |

### 9.1 Ticket details

#### P9.J01 Compose local

| Item              | Detail                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Required services | postgres, redis, webhook-receiver, canton-sandbox, migrator, api, ledger-command, projection-worker, webhook-dispatcher |
| Required env      | `DATABASE_URL`, `PILLAR_MODE=sandbox`, `LEDGER_API_HOST`, `LEDGER_API_PORT`, `PQS_JDBC_URL`, `REDIS_URL`                |
| Exit              | SDK/API e2e creates asset/account/intent, projects balance, emits signed webhook                                        |

#### P9.J02 Compose auth

| Item         | Detail                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Auth profile | JWT/mTLS-like local auth simulation from security phase                                             |
| Exit         | Unauthenticated request rejected; authenticated request succeeds; ledger client auth path exercised |
| Invariant    | Auth mode does not change `/v1` grammar                                                             |

#### P9.J03 Dockerfiles

| Item            | Detail                                    |
| --------------- | ----------------------------------------- |
| Build contexts  | repo root with narrow copy per service    |
| Required labels | source commit, version, service, SBOM ref |
| Exit            | image build and scan pass                 |

#### P9.J04 Helm chart

| Item               | Detail                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Values files       | `values.yaml`, `values-dev.yaml`, `values-testnet.yaml`, `values-mainnet.yaml`                                                                                                                                     |
| Required templates | API, ledger-command, projection-worker, workflow-orchestrator, webhook-dispatcher, migrator job, DAR upload job, configmap, secret refs, ingress, service, serviceaccount, networkpolicy, hpa, pdb, servicemonitor |
| Exit               | lint/template clean                                                                                                                                                                                                |

#### P9.J05 Migration Job

| Item    | Detail                                                  |
| ------- | ------------------------------------------------------- |
| Command | `migrator up` against `DATABASE_URL` from secret ref    |
| Hook    | pre-install/pre-upgrade                                 |
| Exit    | all `packages/db` migrations applied; app rollout waits |

#### P9.J06 DAR upload Job

| Item     | Detail                                                                  |
| -------- | ----------------------------------------------------------------------- |
| Inputs   | DAR artifact ref, checksum, participant endpoint, ledger auth/mTLS refs |
| Behavior | fetch DAR, verify checksum, upload if missing, verify package visible   |
| Exit     | ledger-command readiness gate passes                                    |

#### P9.J07 Observability

| Item      | Detail                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metrics   | `projection_lag_seconds`, `ledger_offset_gap`, `last_projected_offset`, webhook delivery counts, migration status, ledger readiness, pod restarts |
| Resources | ServiceMonitor, dashboards, alerts                                                                                                                |
| Exit      | metrics visible after dev deploy                                                                                                                  |

#### P9.J08 Release workflow

| Item      | Detail                                                              |
| --------- | ------------------------------------------------------------------- |
| Artifacts | images, DAR, chart, SBOM, checksums, signatures                     |
| Tags      | semver and git SHA image tags; immutable digests in promoted values |
| Exit      | release tag creates signed release bundle                           |

#### P9.J09 Per-service Dockerfile reviews

| Item          | Detail                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Services      | api, ledger-command, projection-worker, workflow-orchestrator, webhook-dispatcher, compliance-adapter, template-registry, usage-meter, reconciler, search-indexer, export-worker, dar-uploader |
| Review points | base image pinning, multi-stage copy boundaries, non-root runtime, read-only filesystem compatibility, health/entrypoint, SBOM labels, no raw secrets, no build credentials in final layer     |
| Exit          | each release service has a reviewed image boundary or explicit shared image decision                                                                                                           |

#### P9.J10 Multi-arch image build

| Item      | Detail                                                                                   |
| --------- | ---------------------------------------------------------------------------------------- |
| Platforms | linux/amd64 and linux/arm64                                                              |
| Tooling   | Docker Buildx or equivalent GitHub Actions builder with cache isolation per architecture |
| Exit      | release manifest lists both architectures for every image digest                         |

#### P9.J11 Helm unit tests

| Item     | Detail                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool     | helm-unittest                                                                                                                                |
| Coverage | Deployments, Jobs, hooks, ServiceAccounts, RBAC, NetworkPolicy, PDB, HPA, ExternalSecrets, values modes                                      |
| Exit     | chart unit tests fail on missing hooks, default ServiceAccount usage, inline secrets, invalid deploymentMode, or omitted production policies |

#### P9.J12 Canary deployment strategy

| Item     | Detail                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope    | api, workflow-orchestrator, ledger-command, projection-worker, webhook-dispatcher where traffic or work-queue semantics allow safe partial rollout |
| Controls | traffic weight, replica percentage, metric window, rollback threshold, projection/webhook lag guardrails                                           |
| Exit     | canary uses identical `/v1` grammar and rolls back on health, error-rate, projection lag, or webhook delivery regressions                          |

#### P9.J13 Blue/green stateless services

| Item     | Detail                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Services | api and webhook-dispatcher                                                                              |
| Switch   | active color selector controls Service target; inactive color remains warm until verification completes |
| Exit     | blue/green switch preserves idempotency records, webhook event identity, and public route grammar       |

#### P9.J14 PDB/HPA tuning per service

| Item     | Detail                                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Services | api, ledger-command, projection-worker, workflow-orchestrator, webhook-dispatcher, compliance-adapter, reconciler, search-indexer, export-worker, template-registry, usage-meter |
| Metrics  | CPU/memory for API-like services; queue lag, projection lag, webhook backlog, reconciliation backlog, export queue depth where applicable                                        |
| Exit     | production values render safe min replicas, PDB maxUnavailable/minAvailable, HPA bounds, and service-specific metric targets                                                     |

#### P9.J15 Namespace NetworkPolicies

| Item       | Detail                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Namespaces | pillar-runtime, pillar-ledger, pillar-data, pillar-observability, pillar-system                                                              |
| Posture    | default deny ingress and egress; explicit flows only                                                                                         |
| Exit       | policies allow required runtime, ledger, data, observability, secret sync, and webhook egress paths without broad namespace-wide allow rules |

#### P9.J16 ServiceAccount and RBAC scoping

| Item        | Detail                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Workloads   | every Deployment and Job, including migrator and DAR uploader                                                               |
| Permissions | least privilege for config reads, secret refs, KMS/workload identity, leader election where used, and Kubernetes API access |
| Exit        | rendered manifests contain no `default` ServiceAccount and no wildcard Role rules for runtime services                      |

#### P9.J17 ExternalSecrets integration

| Item      | Detail                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Secrets   | database URL, ledger token, ledger mTLS, webhook signing key ref, registry credentials, API key/JWT issuer refs             |
| Providers | External Secrets over cloud secret manager, Vault, or customer secret manager; chart values select provider and remote refs |
| Exit      | Helm values and rendered ConfigMaps contain no inline credential material                                                   |

#### P9.J18 Air-gapped install bundle

| Item         | Detail                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundle       | Helm chart, image archive or OCI layout, Pillar DAR, chart dependencies, CRDs required by selected profile, manifest, checksums, signatures |
| Verification | offline checksum and cosign verification path with preloaded trust roots                                                                    |
| Exit         | self-hosted operator can install from tarball without contacting public registries or artifact stores                                       |

#### P9.J19 OCI registry mirror policy

| Item   | Detail                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| Policy | mirror registry prefix is configurable; image digest remains canonical; tag-only promotion remains forbidden   |
| Modes  | self-hosted and air-gapped installs can use customer registry mirrors; hosted may use Pillar registry directly |
| Exit   | rendered image references point to the mirror while preserving digest pinning and provenance evidence          |

#### P9.J20 Helm values schema

| Item   | Detail                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema | `values.schema.json` covers deploymentMode, environment, images, secret refs, rollout policy, HPA/PDB, NetworkPolicy, ExternalSecrets, DAR upload, registry mirror |
| CI     | `helm lint` and schema validation run against `values.yaml`, `values-dev.yaml`, `values-testnet.yaml`, and `values-mainnet.yaml`                                   |
| Exit   | invalid modes, inline secrets, missing production policies, mutable production images, and malformed refs fail CI                                                  |

#### P9.J21 GitHub Actions release workflow hardening

| Item      | Detail                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Artifacts | images, SBOMs, provenance attestations, DAR, Helm chart, release manifest, checksums, cosign signatures                        |
| Trigger   | protected semver tag only                                                                                                      |
| Exit      | release manifest maps git tag, commit SHA, image digests, DAR checksum, chart version, workflow run IDs, and approval evidence |

#### P9.J22 Multi-env promotion workflow

| Item  | Detail                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flow  | dev -> testnet -> mainnet                                                                                                                                      |
| Gates | dev automated deploy; testnet manual approval after signed release evidence; mainnet manual approval after invariant, security, rollback, and runbook evidence |
| Exit  | promoted environments consume the same immutable artifact set and differ only by values, secrets, network, scale, and operational policy                       |

### 9.2 Implementation order

```text
1. Compose local baseline (P9.J01)
2. Compose auth profile (P9.J02)
3. Dockerfiles and image build (P9.J03)
4. Per-service Dockerfile reviews and multi-arch build (P9.J09, P9.J10)
5. Helm chart skeleton and baseline templates (P9.J04)
6. Migrator hook and DAR upload hook/readiness gate (P9.J05, P9.J06)
7. Helm unit tests and values schema (P9.J11, P9.J20)
8. Security policies: NetworkPolicy, RBAC, ExternalSecrets (P9.J15, P9.J16, P9.J17)
9. Availability and rollout controls: PDB/HPA, canary, blue/green (P9.J14, P9.J12, P9.J13)
10. Observability resources (P9.J07)
11. Release workflow, air-gapped bundle, registry mirror, signing, SBOM, provenance (P9.J08, P9.J18, P9.J19, P9.J21)
12. Multi-environment promotion (P9.J22)
```

### 9.3 Promotion gates

| Gate            | Required evidence                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR gate         | lint, Daml build/test, TS/JVM tests, migrator verify, API contract tests, Helm template/lint, helm-unittest, values schema validation for P9.J04/P9.J11/P9.J20                                                                            |
| Main gate       | Docker images built for amd64/arm64, per-service Dockerfile review complete, sandbox integration green, chart package created, ExternalSecrets/RBAC/NetworkPolicy rendered for P9.J09/P9.J10/P9.J15/P9.J16/P9.J17                         |
| Dev deploy      | Helm install/upgrade with `values-dev.yaml`, migrations applied, DAR uploaded, `/v1/health` ready or expected degraded only, canary/blue-green disabled or explicitly tested for P9.J12/P9.J13                                            |
| Testnet promote | immutable images, signed DAR, SBOM, security scan, ServiceMonitor visible, PDB/HPA tuned, canary or blue/green rollout evidence, registry mirror policy validated for P9.J14/P9.J19/P9.J21                                                |
| Mainnet promote | manual approval, signed artifacts, no mutable tags, OPA/Kyverno pass, rollback/runbook evidence, air-gapped bundle generated when self-hosted/offline profile is in scope, dev -> testnet -> mainnet promotion evidence for P9.J18/P9.J22 |

## 10. Open Questions

| Question                                                                                           | Context                                                                                                                                                                                                                             | Phase 09 handling until resolved                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First deployment target: hosted or customer-validator?                                             | M9 exit says dev/testnet deploy successful; assigned scope asks hosted/customer-validator/self-hosted. Hosted validates the full Pillar-owned stack; customer-validator validates the most important external participant boundary. | Build chart values for both. Use hosted for first dev deploy if no customer participant exists; run customer-validator as the first testnet target once a customer-owned participant endpoint is available. |
| Exact name mapping for `validator` / `customer-hosted` / `hosted-validator` / `customer-validator` | Architecture docs use related but not identical names.                                                                                                                                                                              | Use Phase 09 canonical names in values; document mapping in section 3.                                                                                                                                      |
| DAR uploader implementation image                                                                  | Impl plan names the job, not whether it uses `migrator`, `ledger-command`, or a dedicated image.                                                                                                                                    | Prefer a dedicated minimal DAR uploader image if service images would otherwise need extra admin tooling; do not add public API.                                                                            |
| Terraform provider targets                                                                         | Architecture lists modules but not cloud-specific provider implementation.                                                                                                                                                          | Keep module interfaces cloud-portable; implement provider-specific examples without changing chart contract.                                                                                                |
| Production DB migration rollback policy                                                            | Impl plan requires pre-upgrade migrations but does not define automated down migrations.                                                                                                                                            | Fail closed on migration error; require backup/restore or explicit reversible migration.                                                                                                                    |
| Admission policy engine                                                                            | Scope allows OPA/Kyverno; architecture does not choose one.                                                                                                                                                                         | Provide policy manifests compatible with one selected engine per environment; chart should not require both.                                                                                                |

## 11. Agent-ready Checklist

### Build gate

- [ ] `dpm build` produces the Pillar DAR.
- [ ] `dpm test` passes for Daml packages.
- [ ] `tools/codegen/daml-codegen/generate.sh` updates Java/TS bindings reproducibly.
- [ ] `pnpm install --frozen-lockfile` succeeds.
- [ ] `pnpm -w lint` succeeds.
- [ ] `pnpm -w test` succeeds.
- [ ] `./gradlew test` succeeds.
- [ ] `tools/migrator/bin/migrator verify` succeeds.
- [ ] Docker images for api, ledger-command, projection-worker, webhook-dispatcher, workflow-orchestrator, migrator, compliance-adapter, template-registry, usage-meter, reconciler, search-indexer, export-worker, and DAR uploader build for amd64 and arm64 (`P9.J03`, `P9.J09`, `P9.J10`).
- [ ] `helm lint infra/helm/pillar` is clean (`P9.J04`, `P9.J20`).
- [ ] `helm template pillar infra/helm/pillar -f infra/helm/pillar/values-dev.yaml` is clean (`P9.J04`, `P9.J20`).
- [ ] `helm unittest infra/helm/pillar` passes (`P9.J11`).
- [ ] all Helm values files validate against `infra/helm/pillar/values.schema.json` (`P9.J20`).

### Verify gate

- [ ] Integration tests run the sandbox profile via `docker compose -f infra/compose/local.yml up -d`.
- [ ] Sandbox e2e covers asset/account/intent, ledger command, projection update, event creation, signed webhook delivery.
- [ ] `migrator-job` runs before app rollout in rendered hooks.
- [ ] `dar-upload-job` runs before `ledger-command` becomes ready.
- [ ] `/v1/health` works identically in hosted, customer-validator, and self-hosted values renderings.
- [ ] `/v1/operations/:id` works identically in hosted, customer-validator, and self-hosted values renderings.
- [ ] NetworkPolicy, PDB, HPA, and ServiceMonitor render for production values.
- [ ] Canary rollout resources render and include health, projection lag, webhook lag, and rollback checks (`P9.J12`).
- [ ] Blue/green resources render for api and webhook-dispatcher with explicit active color switch (`P9.J13`).
- [ ] PDB and HPA render with service-specific defaults for each production runtime service (`P9.J14`).
- [ ] NetworkPolicy renders default deny and explicit flows for pillar-runtime, pillar-ledger, pillar-data, pillar-observability, and pillar-system (`P9.J15`).
- [ ] ServiceAccount and RBAC manifests render per service and no workload uses the default ServiceAccount (`P9.J16`).
- [ ] ExternalSecret manifests render for every required secret ref and values/rendered ConfigMaps contain no inline secrets (`P9.J17`).
- [ ] Release workflow tags images, signs images with cosign, emits SBOM, signs/checksums DAR, packages chart, records provenance, and publishes immutable release manifest (`P9.J21`).
- [ ] Air-gapped bundle contains chart, images, DAR, dependencies, manifest, signatures, and checksums (`P9.J18`).
- [ ] Registry mirror values preserve immutable digests while rewriting registry prefixes for self-hosted/offline installs (`P9.J19`).
- [ ] Dev deploy succeeds (`P9.J22`).
- [ ] Testnet deploy succeeds or is blocked only by missing external participant target documented in release evidence (`P9.J22`).
- [ ] Mainnet promotion requires manual approval and consumes the same immutable artifact set as dev/testnet (`P9.J22`).

### Invariant gate

- [ ] Public API exposes no Canton contract-first fields.
- [ ] DB asset state is projection only.
- [ ] Every mutation has stable operation_id and command_id.
- [ ] Projection is rebuildable.
- [ ] Webhook deliveries are signed and replayable.
- [ ] Deployment mode does not change `/v1` grammar.
