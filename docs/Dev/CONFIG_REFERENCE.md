# Pillar Configuration Reference

This reference is the canonical implementation catalog for configuration consumed by Pillar services. It complements [Phase 09 CI/CD, Helm, and Deployment](./Phase_09_CICD_Helm_Deployment.md), [Phase 07 SDK / CLI / Workbench](./Phase_07_SDK_CLI_Workbench.md), [SLO Catalog](./SLO_CATALOG.md), and the deployment-mode invariant from [18 Deployment](../Architecture/18_Deployment.md).

## 1. Configuration sources and precedence

Configuration MUST resolve in one deterministic order for every process:

```text
environment variable
  > CLI flag
  > explicit config file
  > Helm value rendered into ConfigMap/SecretRef
  > compiled default
```

| Source               | Scope                                                          | Mutability      | Required behavior                                                                   |
| -------------------- | -------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| Environment variable | Container runtime, CI jobs, local compose                      | Runtime restart | Highest precedence; names use `PILLAR_` prefix and snake case.                      |
| CLI flag             | Tools and job entrypoints                                      | Invocation      | Overrides config file for a single command; names use kebab-case.                   |
| Config file          | Local CLI profiles, migrator manifests, mounted service config | File deploy     | Must be parsed before service start and redacted in diagnostics.                    |
| Helm value           | Kubernetes release                                             | Chart upgrade   | Values carry non-secret values and secret references, never raw production secrets. |
| Default              | Code                                                           | Release         | Only safe operational defaults; no production credential or endpoint default.       |

Deployment-mode awareness:

| Mode                 | Config resolver rule                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hosted`             | Pillar-owned defaults may select managed Postgres, Redis, object storage, KMS, OIDC, OTel, and participant references from the hosted control-plane registry. |
| `customer-validator` | Pillar services run with customer participant endpoint and customer-owned ledger auth material; API grammar and field names remain identical.                 |
| `self-hosted`        | All external dependency refs are customer-supplied; defaults may support local bootstrap only and must fail closed when production refs are absent.           |

## 2. Naming convention

| Surface      | Convention                             | Example                     | Notes                                                                                                 |
| ------------ | -------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Environment  | Upper snake case with `PILLAR_` prefix | `PILLAR_DATABASE_URL`       | Secrets use `_SECRET_REF`, `_TOKEN_SECRET_REF`, `_KMS_REF`, `_CERT_SECRET_REF`, or `_KEY_SECRET_REF`. |
| CLI flag     | kebab-case                             | `--database-url`            | Tool flags mirror env names without `PILLAR_` and with dashes.                                        |
| Helm values  | camelCase under service chart path     | `api.database.urlSecretRef` | Secret-bearing Helm paths end in `SecretRef` or `KmsRef`.                                             |
| Config file  | camelCase JSON/YAML keys               | `databaseUrl`               | Config file keys match health schema keys.                                                            |
| Feature flag | lower snake case                       | `projection_backfill_v2`    | Runtime flags live in flag registry; build-time flags are release metadata.                           |

## 3. Per-service config

Table columns use `env / Helm path / CLI flag` as the field identity. `Required` means required after source precedence and deployment-mode expansion.

### 3.1 apps/api

| Field                                                                                                 | Type       | Default                         | Required? | Description                                                                     | Owning ticket |
| ----------------------------------------------------------------------------------------------------- | ---------- | ------------------------------- | --------- | ------------------------------------------------------------------------------- | ------------- |
| `PILLAR_DATABASE_URL` / `api.database.urlSecretRef` / `--database-url`                                | Secret ref | none                            | Yes       | Postgres DSN for idempotency, audit, config, projection reads.                  | `P3.D01`      |
| `PILLAR_REDIS_URL` / `api.redis.urlSecretRef` / `--redis-url`                                         | Secret ref | none                            | Yes       | Redis endpoint for rate limits, short-lived locks, cache coordination.          | `P3.D04`      |
| `PILLAR_LEDGER_API_HOST` / `api.ledger.host` / `--ledger-api-host`                                    | string     | none                            | Yes       | Internal participant Ledger API host for status and trace lookup.               | `P4.F01`      |
| `PILLAR_LEDGER_API_PORT` / `api.ledger.port` / `--ledger-api-port`                                    | integer    | `6865`                          | Yes       | Internal Ledger API port.                                                       | `P4.F01`      |
| `PILLAR_PARTICIPANT_JWT_SECRET_REF` / `api.ledger.jwtSecretRef` / `--participant-jwt-secret-ref`      | Secret ref | none                            | Mode      | JWT secret reference for participant access in hosted/customer-validator.       | `P8.K02`      |
| `PILLAR_API_VERSION_DEFAULT` / `api.version.default` / `--api-version-default`                        | string     | `2026-05-26`                    | Yes       | Default `Pillar-Version` when caller omits explicit version.                    | `P2.C02`      |
| `PILLAR_RATE_LIMIT_GLOBAL_RPS` / `api.rateLimit.globalRps` / `--rate-limit-global-rps`                | integer    | `5000`                          | Yes       | Global accepted request budget per second.                                      | `P8.K05`      |
| `PILLAR_RATE_LIMIT_TENANT_RPS` / `api.rateLimit.tenantRps` / `--rate-limit-tenant-rps`                | integer    | `100`                           | Yes       | Default tenant request budget per second.                                       | `P8.K05`      |
| `PILLAR_RATE_LIMIT_BURST` / `api.rateLimit.burst` / `--rate-limit-burst`                              | integer    | `200`                           | Yes       | Token-bucket burst allowance per tenant/key.                                    | `P8.K05`      |
| `PILLAR_RATE_LIMIT_REDIS_PREFIX` / `api.rateLimit.redisPrefix` / `--rate-limit-redis-prefix`          | string     | `pillar:rl`                     | Yes       | Redis key prefix for rate-limit counters.                                       | `P8.K05`      |
| `PILLAR_IDEMPOTENCY_TTL_HOURS` / `api.idempotency.ttlHours` / `--idempotency-ttl-hours`               | integer    | `72`                            | Yes       | Retention for idempotency key replay records.                                   | `P3.D03`      |
| `PILLAR_REQUEST_BODY_MAX_BYTES` / `api.request.bodyMaxBytes` / `--request-body-max-bytes`             | integer    | `1048576`                       | Yes       | Maximum public API request body size.                                           | `P2.C05`      |
| `PILLAR_METADATA_PII_PATTERNS_PATH` / `api.metadata.piiPatternsPath` / `--metadata-pii-patterns-path` | path       | `/etc/pillar/pii-patterns.yaml` | Yes       | Pattern file for metadata PII detection and redaction.                          | `P8.K04`      |
| `PILLAR_OPENAPI_VERSION` / `api.openapi.version` / `--openapi-version`                                | string     | chart appVersion                | Yes       | OpenAPI bundle version served by docs and health metadata.                      | `P2.C01`      |
| `PILLAR_LOG_LEVEL` / `api.log.level` / `--log-level`                                                  | enum       | `info`                          | Yes       | Structured log level; `debug` forbidden in production unless incident override. | `P10.L03`     |
| `PILLAR_OTEL_ENDPOINT` / `api.otel.endpoint` / `--otel-endpoint`                                      | URL        | none                            | Yes       | OTLP endpoint for traces and metrics.                                           | `P10.L03`     |
| `PILLAR_DEPLOYMENT_MODE` / `global.deploymentMode` / `--deployment-mode`                              | enum       | none                            | Yes       | `hosted`, `customer-validator`, or `self-hosted`.                               | `P9.J04`      |

### 3.2 services/ledger-command

| Field                                                                                                                             | Type       | Default | Required? | Description                                                   | Owning ticket |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- | --------- | ------------------------------------------------------------- | ------------- |
| `PILLAR_LEDGER_API_HOST` / `ledgerCommand.ledger.host` / `--ledger-api-host`                                                      | string     | none    | Yes       | Participant Ledger API host.                                  | `P4.F01`      |
| `PILLAR_LEDGER_API_PORT` / `ledgerCommand.ledger.port` / `--ledger-api-port`                                                      | integer    | `6865`  | Yes       | Participant Ledger API port.                                  | `P4.F01`      |
| `PILLAR_LEDGER_JWT_TOKEN_SECRET_REF` / `ledgerCommand.ledger.jwtTokenSecretRef` / `--ledger-jwt-token-secret-ref`                 | Secret ref | none    | Mode      | Ledger submitter JWT token reference.                         | `P8.K02`      |
| `PILLAR_LEDGER_MTLS_ENABLED` / `ledgerCommand.ledger.mtls.enabled` / `--ledger-mtls-enabled`                                      | boolean    | `false` | Mode      | Enables client mTLS to participant.                           | `P9.J04`      |
| `PILLAR_LEDGER_MTLS_CERT_SECRET_REF` / `ledgerCommand.ledger.mtls.certSecretRef` / `--ledger-mtls-cert-secret-ref`                | Secret ref | none    | Mode      | Client certificate reference.                                 | `P8.K02`      |
| `PILLAR_LEDGER_MTLS_KEY_SECRET_REF` / `ledgerCommand.ledger.mtls.keySecretRef` / `--ledger-mtls-key-secret-ref`                   | Secret ref | none    | Mode      | Client private key reference.                                 | `P8.K02`      |
| `PILLAR_LEDGER_MTLS_CA_SECRET_REF` / `ledgerCommand.ledger.mtls.caSecretRef` / `--ledger-mtls-ca-secret-ref`                      | Secret ref | none    | Mode      | CA bundle for participant TLS validation.                     | `P8.K02`      |
| `PILLAR_COMMAND_DEDUP_PERIOD_SECONDS` / `ledgerCommand.command.dedupPeriodSeconds` / `--command-dedup-period-seconds`             | integer    | `86400` | Yes       | Canton command deduplication period.                          | `P4.F04`      |
| `PILLAR_COMMAND_THROTTLE_PER_PARTICIPANT` / `ledgerCommand.command.throttlePerParticipant` / `--command-throttle-per-participant` | integer    | `500`   | Yes       | In-flight command limit per participant.                      | `P4.F05`      |
| `PILLAR_COMMAND_RETRY_MAX_ATTEMPTS` / `ledgerCommand.command.retry.maxAttempts` / `--command-retry-max-attempts`                  | integer    | `8`     | Yes       | Max retry attempts for classified transient command failures. | `P4.F05`      |
| `PILLAR_COMMAND_RETRY_BASE_MS` / `ledgerCommand.command.retry.baseMs` / `--command-retry-base-ms`                                 | integer    | `250`   | Yes       | Initial command retry backoff.                                | `P4.F05`      |
| `PILLAR_COMMAND_RETRY_MAX_MS` / `ledgerCommand.command.retry.maxMs` / `--command-retry-max-ms`                                    | integer    | `30000` | Yes       | Maximum command retry backoff.                                | `P4.F05`      |
| `PILLAR_COMMAND_RETRY_JITTER_RATIO` / `ledgerCommand.command.retry.jitterRatio` / `--command-retry-jitter-ratio`                  | decimal    | `0.2`   | Yes       | Backoff jitter ratio.                                         | `P4.F05`      |
| `PILLAR_PACKAGE_PROFILE_REGISTRY_URL` / `ledgerCommand.packageProfile.registryUrl` / `--package-profile-registry-url`             | URL        | none    | Yes       | Template/package profile registry endpoint.                   | `P12.N01`     |

### 3.3 services/projection-worker

| Field                                                                                                                            | Type       | Default          | Required? | Description                                                            | Owning ticket |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------- | --------- | ---------------------------------------------------------------------- | ------------- |
| `PILLAR_PQS_JDBC_URL` / `projectionWorker.pqs.jdbcUrlSecretRef` / `--pqs-jdbc-url`                                               | Secret ref | none             | Yes       | PQS JDBC URL reference for ledger-derived projection reads.            | `P5.G01`      |
| `PILLAR_PROJECTION_BATCH_SIZE` / `projectionWorker.batchSize` / `--projection-batch-size`                                        | integer    | `500`            | Yes       | Ledger update rows applied per transaction.                            | `P5.G05`      |
| `PILLAR_PROJECTION_CHECKPOINT_INTERVAL_MS` / `projectionWorker.checkpointIntervalMs` / `--projection-checkpoint-interval-ms`     | integer    | `5000`           | Yes       | Maximum interval between durable checkpoints.                          | `P5.G05`      |
| `PILLAR_PROJECTION_BACKPRESSURE_HIGH_WATER` / `projectionWorker.backpressure.highWater` / `--projection-backpressure-high-water` | integer    | `10000`          | Yes       | Queue depth that pauses non-critical projection consumers.             | `P5.G07`      |
| `PILLAR_PROJECTION_PARALLELISM` / `projectionWorker.parallelism` / `--projection-parallelism`                                    | integer    | `4`              | Yes       | Number of projection apply workers.                                    | `P5.G05`      |
| `PILLAR_PROJECTION_START_OFFSET` / `projectionWorker.startOffset` / `--projection-start-offset`                                  | string     | `checkpoint`     | Yes       | Start offset policy: `checkpoint`, `ledger-begin`, or explicit offset. | `P5.G06`      |
| `PILLAR_PROJECTION_REBUILD_MODE` / `projectionWorker.rebuild.mode` / `--projection-rebuild-mode`                                 | enum       | `disabled`       | Yes       | Enables controlled rebuild process.                                    | `P5.G06`      |
| `PILLAR_PROJECTION_STALE_AFTER_SECONDS` / `projectionWorker.staleAfterSeconds` / `--projection-stale-after-seconds`              | integer    | `120`            | Yes       | Stale-read classification threshold.                                   | `P5.G07`      |
| `PILLAR_PROJECTION_SCHEMA_VERSION` / `projectionWorker.schemaVersion` / `--projection-schema-version`                            | string     | migrator version | Yes       | Expected projection schema version.                                    | `P3.D02`      |
| `PILLAR_PROJECTION_EMIT_EVENTS` / `projectionWorker.emitEvents` / `--projection-emit-events`                                     | boolean    | `true`           | Yes       | Emits webhook/event rows from projected ledger state.                  | `P6.H01`      |

### 3.4 services/workflow-orchestrator

| Field                                                                                                                          | Type       | Default           | Required? | Description                                                  | Owning ticket |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------- | --------- | ------------------------------------------------------------ | ------------- |
| `PILLAR_WORKFLOW_QUEUE_URL` / `workflowOrchestrator.queue.urlSecretRef` / `--workflow-queue-url`                               | Secret ref | none              | Yes       | Durable queue for accepted operations.                       | `P4.E06`      |
| `PILLAR_WORKFLOW_CONCURRENCY` / `workflowOrchestrator.concurrency` / `--workflow-concurrency`                                  | integer    | `64`              | Yes       | Maximum concurrently classified workflows.                   | `P4.E06`      |
| `PILLAR_WORKFLOW_LOCK_TTL_MS` / `workflowOrchestrator.lockTtlMs` / `--workflow-lock-ttl-ms`                                    | integer    | `30000`           | Yes       | Operation lock TTL.                                          | `P4.E06`      |
| `PILLAR_WORKFLOW_LEASE_RENEW_MS` / `workflowOrchestrator.leaseRenewMs` / `--workflow-lease-renew-ms`                           | integer    | `10000`           | Yes       | Lease renewal cadence for long-running workflows.            | `P4.E06`      |
| `PILLAR_WORKFLOW_MAX_PENDING_AGE_SECONDS` / `workflowOrchestrator.maxPendingAgeSeconds` / `--workflow-max-pending-age-seconds` | integer    | `900`             | Yes       | Age threshold for stuck pending operation alerting.          | `P10.L06`     |
| `PILLAR_WORKFLOW_COMMAND_TOPIC` / `workflowOrchestrator.commandTopic` / `--workflow-command-topic`                             | string     | `pillar.commands` | Yes       | Topic/stream for ledger command requests.                    | `P4.F02`      |
| `PILLAR_WORKFLOW_COMPENSATION_ENABLED` / `workflowOrchestrator.compensation.enabled` / `--workflow-compensation-enabled`       | boolean    | `true`            | Yes       | Enables safe compensating workflows for classified failures. | `P4.E07`      |
| `PILLAR_WORKFLOW_TRACE_SAMPLE_RATE` / `workflowOrchestrator.traceSampleRate` / `--workflow-trace-sample-rate`                  | decimal    | `1.0`             | Yes       | Trace sampling rate for workflow spans.                      | `P10.L03`     |

### 3.5 services/webhook-dispatcher

| Field                                                                                                                              | Type    | Default               | Required? | Description                                          | Owning ticket |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------- | --------- | ---------------------------------------------------- | ------------- |
| `PILLAR_WEBHOOK_MAX_ATTEMPTS` / `webhookDispatcher.maxAttempts` / `--webhook-max-attempts`                                         | integer | `12`                  | Yes       | Maximum delivery attempts before DLQ classification. | `P6.H03`      |
| `PILLAR_WEBHOOK_BASE_BACKOFF_SECONDS` / `webhookDispatcher.baseBackoffSeconds` / `--webhook-base-backoff-seconds`                  | integer | `5`                   | Yes       | Initial webhook retry backoff.                       | `P6.H03`      |
| `PILLAR_WEBHOOK_DLQ_THRESHOLD` / `webhookDispatcher.dlqThreshold` / `--webhook-dlq-threshold`                                      | integer | `12`                  | Yes       | Attempts or failure state causing DLQ entry.         | `P6.H04`      |
| `PILLAR_WEBHOOK_SIGNING_KEY_KMS_REF` / `webhookDispatcher.signingKeyKmsRef` / `--webhook-signing-key-kms-ref`                      | KMS ref | none                  | Yes       | KMS key used to sign outbound webhook payloads.      | `P8.K02`      |
| `PILLAR_WEBHOOK_PAYLOAD_MODE_DEFAULT` / `webhookDispatcher.payloadModeDefault` / `--webhook-payload-mode-default`                  | enum    | `thin`                | Yes       | Default event payload mode: `thin` or `snapshot`.    | `P6.H02`      |
| `PILLAR_WEBHOOK_TIMEOUT_SECONDS` / `webhookDispatcher.timeoutSeconds` / `--webhook-timeout-seconds`                                | integer | `10`                  | Yes       | HTTP request timeout for endpoint delivery.          | `P6.H03`      |
| `PILLAR_WEBHOOK_CONCURRENCY` / `webhookDispatcher.concurrency` / `--webhook-concurrency`                                           | integer | `128`                 | Yes       | Concurrent delivery workers.                         | `P6.H03`      |
| `PILLAR_WEBHOOK_ENDPOINT_ALLOW_PRIVATE_IPS` / `webhookDispatcher.endpointAllowPrivateIps` / `--webhook-endpoint-allow-private-ips` | boolean | `false`               | Yes       | SSRF guard override; production default is false.    | `P8.K06`      |
| `PILLAR_WEBHOOK_REPLAY_WINDOW_HOURS` / `webhookDispatcher.replayWindowHours` / `--webhook-replay-window-hours`                     | integer | `168`                 | Yes       | Window for operator/customer replay.                 | `P6.H05`      |
| `PILLAR_WEBHOOK_USER_AGENT` / `webhookDispatcher.userAgent` / `--webhook-user-agent`                                               | string  | `Pillar-Webhooks/1.0` | Yes       | User-Agent for outbound delivery.                    | `P6.H03`      |

### 3.6 services/compliance-adapter

| Field                                                                                                                 | Type       | Default                              | Required? | Description                                                              | Owning ticket |
| --------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------ | --------- | ------------------------------------------------------------------------ | ------------- |
| `PILLAR_COMPLIANCE_PROVIDER` / `complianceAdapter.provider` / `--compliance-provider`                                 | enum       | `internal`                           | Yes       | Compliance provider adapter: `internal`, `chainalysis`, `manual-review`. | `P8.K03`      |
| `PILLAR_COMPLIANCE_API_URL` / `complianceAdapter.apiUrl` / `--compliance-api-url`                                     | URL        | none                                 | Mode      | External compliance provider endpoint.                                   | `P8.K03`      |
| `PILLAR_COMPLIANCE_API_KEY_SECRET_REF` / `complianceAdapter.apiKeySecretRef` / `--compliance-api-key-secret-ref`      | Secret ref | none                                 | Mode      | Provider API key reference.                                              | `P8.K02`      |
| `PILLAR_COMPLIANCE_POLICY_PATH` / `complianceAdapter.policyPath` / `--compliance-policy-path`                         | path       | `/etc/pillar/compliance/policy.yaml` | Yes       | Local policy bundle path.                                                | `P8.K04`      |
| `PILLAR_COMPLIANCE_DECISION_TIMEOUT_MS` / `complianceAdapter.decisionTimeoutMs` / `--compliance-decision-timeout-ms`  | integer    | `2000`                               | Yes       | Inline decision timeout before fail-closed/review.                       | `P8.K03`      |
| `PILLAR_COMPLIANCE_FAIL_CLOSED` / `complianceAdapter.failClosed` / `--compliance-fail-closed`                         | boolean    | `true`                               | Yes       | Blocks unsafe allow on provider or policy failure.                       | `P8.K03`      |
| `PILLAR_COMPLIANCE_REVIEW_QUEUE_URL` / `complianceAdapter.reviewQueue.urlSecretRef` / `--compliance-review-queue-url` | Secret ref | none                                 | Yes       | Queue for async/manual review decisions.                                 | `P8.K03`      |
| `PILLAR_COMPLIANCE_EVIDENCE_BUCKET` / `complianceAdapter.evidence.bucket` / `--compliance-evidence-bucket`            | string     | none                                 | Yes       | Object bucket for compliance evidence packets.                           | `P8.K07`      |

### 3.7 services/template-registry

| Field                                                                                                                   | Type       | Default  | Required? | Description                                                             | Owning ticket |
| ----------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | --------- | ----------------------------------------------------------------------- | ------------- |
| `PILLAR_TEMPLATE_REGISTRY_DATABASE_URL` / `templateRegistry.database.urlSecretRef` / `--template-registry-database-url` | Secret ref | none     | Yes       | Registry DB connection for packages, profiles, and activation metadata. | `P12.N01`     |
| `PILLAR_DAR_ARTIFACT_BUCKET` / `templateRegistry.darArtifactBucket` / `--dar-artifact-bucket`                           | string     | none     | Yes       | Object bucket storing DAR artifacts.                                    | `P12.N03`     |
| `PILLAR_DAR_SIGNATURE_REQUIRED` / `templateRegistry.darSignatureRequired` / `--dar-signature-required`                  | boolean    | `true`   | Yes       | Requires signed DAR artifacts before activation.                        | `P12.N03`     |
| `PILLAR_DAR_TRUSTED_CERTS_SECRET_REF` / `templateRegistry.darTrustedCertsSecretRef` / `--dar-trusted-certs-secret-ref`  | Secret ref | none     | Yes       | Trusted certificate bundle for DAR signature validation.                | `P12.N03`     |
| `PILLAR_TEMPLATE_PROFILE_DEFAULT` / `templateRegistry.profileDefault` / `--template-profile-default`                    | string     | `stable` | Yes       | Default package profile for new tenants.                                | `P12.N02`     |
| `PILLAR_TEMPLATE_COMPATIBILITY_POLICY` / `templateRegistry.compatibilityPolicy` / `--template-compatibility-policy`     | enum       | `strict` | Yes       | Compatibility gate for package/profile upgrades.                        | `P12.N04`     |
| `PILLAR_DAR_ROLLBACK_ENABLED` / `templateRegistry.rollback.enabled` / `--dar-rollback-enabled`                          | boolean    | `true`   | Yes       | Allows controlled rollback to previous active package profile.          | `P12.N05`     |
| `PILLAR_TEMPLATE_CACHE_TTL_SECONDS` / `templateRegistry.cacheTtlSeconds` / `--template-cache-ttl-seconds`               | integer    | `300`    | Yes       | Registry cache TTL for service clients.                                 | `P12.N01`     |

### 3.8 services/usage-meter

| Field                                                                                                                          | Type       | Default  | Required? | Description                                          | Owning ticket |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------- | -------- | --------- | ---------------------------------------------------- | ------------- |
| `PILLAR_USAGE_DATABASE_URL` / `usageMeter.database.urlSecretRef` / `--usage-database-url`                                      | Secret ref | none     | Yes       | Usage/event metering database DSN.                   | `P14.Q01`     |
| `PILLAR_USAGE_EVENT_SOURCE` / `usageMeter.eventSource` / `--usage-event-source`                                                | enum       | `audit`  | Yes       | Source for billable events: audit/projection/export. | `P14.Q02`     |
| `PILLAR_USAGE_AGGREGATION_INTERVAL_SECONDS` / `usageMeter.aggregationIntervalSeconds` / `--usage-aggregation-interval-seconds` | integer    | `300`    | Yes       | Usage aggregation cadence.                           | `P14.Q03`     |
| `PILLAR_USAGE_BILLING_PROVIDER` / `usageMeter.billingProvider` / `--usage-billing-provider`                                    | enum       | `stripe` | Yes       | Billing provider adapter.                            | `P14.Q04`     |
| `PILLAR_STRIPE_API_KEY_SECRET_REF` / `usageMeter.stripe.apiKeySecretRef` / `--stripe-api-key-secret-ref`                       | Secret ref | none     | Mode      | Stripe API key reference.                            | `P14.Q04`     |
| `PILLAR_STRIPE_WEBHOOK_SECRET_REF` / `usageMeter.stripe.webhookSecretRef` / `--stripe-webhook-secret-ref`                      | Secret ref | none     | Mode      | Stripe webhook verification secret reference.        | `P14.Q04`     |
| `PILLAR_USAGE_RECONCILIATION_WINDOW_HOURS` / `usageMeter.reconciliationWindowHours` / `--usage-reconciliation-window-hours`    | integer    | `24`     | Yes       | Lookback window for billing reconciliation.          | `P14.Q07`     |
| `PILLAR_USAGE_EXPORT_BUCKET` / `usageMeter.exportBucket` / `--usage-export-bucket`                                             | string     | none     | Yes       | Bucket for usage exports and invoice evidence.       | `P14.Q06`     |

### 3.9 services/search-indexer + services/export-worker

| Field                                                                                                                   | Type       | Default   | Required? | Description                                            | Owning ticket |
| ----------------------------------------------------------------------------------------------------------------------- | ---------- | --------- | --------- | ------------------------------------------------------ | ------------- |
| `PILLAR_SEARCH_INDEX_URL` / `searchIndexer.index.urlSecretRef` / `--search-index-url`                                   | Secret ref | none      | Yes       | Search backend endpoint.                               | `P11.M02`     |
| `PILLAR_SEARCH_INDEX_PREFIX` / `searchIndexer.indexPrefix` / `--search-index-prefix`                                    | string     | `pillar`  | Yes       | Prefix for per-environment indexes.                    | `P11.M02`     |
| `PILLAR_SEARCH_BATCH_SIZE` / `searchIndexer.batchSize` / `--search-batch-size`                                          | integer    | `500`     | Yes       | Records indexed per batch.                             | `P11.M03`     |
| `PILLAR_SEARCH_FRESHNESS_TARGET_SECONDS` / `searchIndexer.freshnessTargetSeconds` / `--search-freshness-target-seconds` | integer    | `120`     | Yes       | Freshness SLO target disclosed in search metadata.     | `P11.M08`     |
| `PILLAR_SEARCH_REINDEX_PARALLELISM` / `searchIndexer.reindexParallelism` / `--search-reindex-parallelism`               | integer    | `4`       | Yes       | Parallel reindex workers.                              | `P11.M03`     |
| `PILLAR_EXPORT_OBJECT_BUCKET` / `exportWorker.objectBucket` / `--export-object-bucket`                                  | string     | none      | Yes       | Bucket for generated exports.                          | `P11.M04`     |
| `PILLAR_EXPORT_KMS_REF` / `exportWorker.kmsRef` / `--export-kms-ref`                                                    | KMS ref    | none      | Yes       | KMS key for export object encryption.                  | `P11.M04`     |
| `PILLAR_EXPORT_MAX_ROWS` / `exportWorker.maxRows` / `--export-max-rows`                                                 | integer    | `1000000` | Yes       | Maximum rows per export job without elevated approval. | `P11.M05`     |
| `PILLAR_EXPORT_SIGNED_URL_TTL_SECONDS` / `exportWorker.signedUrlTtlSeconds` / `--export-signed-url-ttl-seconds`         | integer    | `900`     | Yes       | Signed download URL TTL.                               | `P11.M05`     |
| `PILLAR_EXPORT_WORKER_CONCURRENCY` / `exportWorker.concurrency` / `--export-worker-concurrency`                         | integer    | `8`       | Yes       | Concurrent export jobs.                                | `P11.M04`     |

### 3.10 services/reconciler

| Field                                                                                                              | Type    | Default                        | Required? | Description                                                       | Owning ticket |
| ------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------ | --------- | ----------------------------------------------------------------- | ------------- |
| `PILLAR_RECONCILER_SCHEDULE_CRON` / `reconciler.scheduleCron` / `--reconciler-schedule-cron`                       | cron    | `*/15 * * * *`                 | Yes       | Reconciliation schedule.                                          | `P5.G07`      |
| `PILLAR_RECONCILER_LOOKBACK_HOURS` / `reconciler.lookbackHours` / `--reconciler-lookback-hours`                    | integer | `24`                           | Yes       | Ledger/projection comparison lookback window.                     | `P5.G07`      |
| `PILLAR_RECONCILER_DIFF_THRESHOLD` / `reconciler.diffThreshold` / `--reconciler-diff-threshold`                    | integer | `0`                            | Yes       | Confirmed customer-visible diff threshold before page.            | `P5.G07`      |
| `PILLAR_RECONCILER_AUTO_REBUILD_ENABLED` / `reconciler.autoRebuildEnabled` / `--reconciler-auto-rebuild-enabled`   | boolean | `false`                        | Yes       | Allows automatic projection rebuild for safe internal diff class. | `P5.G06`      |
| `PILLAR_RECONCILER_EVIDENCE_BUCKET` / `reconciler.evidenceBucket` / `--reconciler-evidence-bucket`                 | string  | none                           | Yes       | Bucket for diff evidence packets.                                 | `P10.L01`     |
| `PILLAR_RECONCILER_LEDGER_SCAN_PAGE_SIZE` / `reconciler.ledgerScanPageSize` / `--reconciler-ledger-scan-page-size` | integer | `1000`                         | Yes       | Ledger scan page size.                                            | `P5.G07`      |
| `PILLAR_RECONCILER_NOTIFY_TOPIC` / `reconciler.notifyTopic` / `--reconciler-notify-topic`                          | string  | `pillar.reconciliation.alerts` | Yes       | Topic for reconciliation findings.                                | `P10.L06`     |

### 3.11 tools/migrator

| Field                                                                                             | Type       | Default                            | Required? | Description                                   | Owning ticket |
| ------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------- | --------- | --------------------------------------------- | ------------- |
| `PILLAR_MIGRATOR_DATABASE_URL` / `migrator.database.urlSecretRef` / `--database-url`              | Secret ref | none                               | Yes       | Target Postgres DSN for migrations.           | `P3.D02`      |
| `PILLAR_MIGRATOR_MIGRATIONS_PATH` / `migrator.migrationsPath` / `--migrations-path`               | path       | `packages/db/migrations`           | Yes       | Migration directory.                          | `P3.D02`      |
| `PILLAR_MIGRATOR_LOCK_TIMEOUT_SECONDS` / `migrator.lockTimeoutSeconds` / `--lock-timeout-seconds` | integer    | `60`                               | Yes       | Advisory lock wait timeout.                   | `P3.D02`      |
| `PILLAR_MIGRATOR_DRY_RUN` / `migrator.dryRun` / `--dry-run`                                       | boolean    | `false`                            | Yes       | Validates planned migration without applying. | `P9.J03`      |
| `PILLAR_MIGRATOR_TARGET_VERSION` / `migrator.targetVersion` / `--target-version`                  | string     | `latest`                           | Yes       | Target migration version.                     | `P9.J03`      |
| `PILLAR_MIGRATOR_SCHEMA_GUARD` / `migrator.schemaGuard` / `--schema-guard`                        | enum       | `strict`                           | Yes       | Blocks drifted or unknown schema state.       | `P3.D02`      |
| `PILLAR_MIGRATOR_AUDIT_OUTPUT_PATH` / `migrator.auditOutputPath` / `--audit-output-path`          | path       | `/tmp/pillar-migration-audit.json` | Yes       | Migration audit evidence output path.         | `P10.L08`     |

### 3.12 tools/cli

| Field                                                                              | Type       | Default                        | Required? | Description                                 | Owning ticket |
| ---------------------------------------------------------------------------------- | ---------- | ------------------------------ | --------- | ------------------------------------------- | ------------- |
| `PILLAR_CLI_CONFIG_PATH` / `cli.configPath` / `--config`                           | path       | `~/.config/pillar/config.yaml` | Yes       | CLI profile config path.                    | `P7.I02`      |
| `PILLAR_PROFILE` / `cli.profile` / `--profile`                                     | string     | `default`                      | Yes       | Active CLI profile.                         | `P7.I02`      |
| `PILLAR_API_BASE_URL` / `cli.apiBaseUrl` / `--api-base-url`                        | URL        | `http://localhost:8080`        | Yes       | API endpoint for CLI commands.              | `P7.I02`      |
| `PILLAR_API_KEY_SECRET_REF` / `cli.apiKeySecretRef` / `--api-key-secret-ref`       | Secret ref | keychain                       | Mode      | API key reference or OS keychain pointer.   | `P7.I02`      |
| `PILLAR_CLI_OUTPUT` / `cli.output` / `--output`                                    | enum       | `table`                        | Yes       | Output renderer: `table`, `json`, `ndjson`. | `P7.I03`      |
| `PILLAR_CLI_TIMEOUT_SECONDS` / `cli.timeoutSeconds` / `--timeout-seconds`          | integer    | `30`                           | Yes       | CLI HTTP timeout.                           | `P7.I03`      |
| `PILLAR_CLI_RETRY_MAX_ATTEMPTS` / `cli.retry.maxAttempts` / `--retry-max-attempts` | integer    | `3`                            | Yes       | CLI retry attempts for safe calls.          | `P7.I03`      |
| `PILLAR_CLI_WEBHOOK_FORWARD_URL` / `cli.webhooks.forwardUrl` / `--forward-to`      | URL        | none                           | Command   | Local webhook forwarding target.            | `P7.I05`      |
| `PILLAR_CLI_SANDBOX_COMPOSE_FILE` / `cli.sandbox.composeFile` / `--compose-file`   | path       | `infra/compose/local.yml`      | Yes       | Compose file used by `pillar sandbox up`.   | `P7.I04`      |

### 3.13 apps/workbench + apps/dashboard

| Field                                                                                             | Type       | Default | Required? | Description                                            | Owning ticket |
| ------------------------------------------------------------------------------------------------- | ---------- | ------- | --------- | ------------------------------------------------------ | ------------- |
| `PILLAR_WORKBENCH_API_BASE_URL` / `workbench.apiBaseUrl` / `--api-base-url`                       | URL        | `/api`  | Yes       | API base URL used by Workbench browser app/server.     | `P7.I06`      |
| `PILLAR_WORKBENCH_OIDC_CLIENT_ID` / `workbench.oidc.clientId` / `--oidc-client-id`                | string     | none    | Mode      | OIDC client ID for user login.                         | `P8.K01`      |
| `PILLAR_WORKBENCH_OIDC_ISSUER_URL` / `workbench.oidc.issuerUrl` / `--oidc-issuer-url`             | URL        | none    | Mode      | OIDC issuer URL.                                       | `P8.K01`      |
| `PILLAR_WORKBENCH_SESSION_SECRET_REF` / `workbench.session.secretRef` / `--session-secret-ref`    | Secret ref | none    | Yes       | Session signing/encryption secret reference.           | `P8.K02`      |
| `PILLAR_WORKBENCH_CSP_REPORT_URI` / `workbench.security.cspReportUri` / `--csp-report-uri`        | URL        | none    | No        | CSP report endpoint.                                   | `P8.K06`      |
| `PILLAR_WORKBENCH_ENABLE_LIVE_MODE` / `workbench.enableLiveMode` / `--enable-live-mode`           | boolean    | `false` | Yes       | Enables permission-gated live environment access.      | `P7.I06`      |
| `PILLAR_DASHBOARD_API_BASE_URL` / `dashboard.apiBaseUrl` / `--dashboard-api-base-url`             | URL        | `/api`  | Yes       | Dashboard API endpoint.                                | `P13.O01`     |
| `PILLAR_DASHBOARD_ONBOARDING_DOCS_URL` / `dashboard.onboarding.docsUrl` / `--onboarding-docs-url` | URL        | `/docs` | Yes       | Docs URL for onboarding flows.                         | `P13.O03`     |
| `PILLAR_DASHBOARD_ANALYTICS_DISABLED` / `dashboard.analyticsDisabled` / `--analytics-disabled`    | boolean    | `true`  | Yes       | Disables product analytics unless explicitly approved. | `P13.O06`     |
| `PILLAR_DASHBOARD_SUPPORT_LINK` / `dashboard.supportLink` / `--support-link`                      | URL        | none    | No        | Support escalation link.                               | `P13.O05`     |

## 4. Shared infrastructure config

| Field                                                                                                                                | Type       | Default          | Required? | Description                                                           | Owning ticket |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------------- | --------- | --------------------------------------------------------------------- | ------------- |
| `PILLAR_POSTGRES_SSL_MODE` / `global.postgres.sslMode` / `--postgres-ssl-mode`                                                       | enum       | `require`        | Yes       | TLS policy for Postgres clients.                                      | `P9.J02`      |
| `PILLAR_POSTGRES_POOL_MAX` / `global.postgres.poolMax` / `--postgres-pool-max`                                                       | integer    | `20`             | Yes       | Default max DB pool size per process.                                 | `P9.J02`      |
| `PILLAR_POSTGRES_CONNECT_TIMEOUT_SECONDS` / `global.postgres.connectTimeoutSeconds` / `--postgres-connect-timeout-seconds`           | integer    | `5`              | Yes       | DB connection timeout.                                                | `P9.J02`      |
| `PILLAR_REDIS_TLS_ENABLED` / `global.redis.tlsEnabled` / `--redis-tls-enabled`                                                       | boolean    | `true`           | Yes       | Redis TLS requirement.                                                | `P9.J02`      |
| `PILLAR_REDIS_KEY_PREFIX` / `global.redis.keyPrefix` / `--redis-key-prefix`                                                          | string     | `pillar`         | Yes       | Shared Redis namespace prefix.                                        | `P3.D04`      |
| `PILLAR_OBJECT_STORAGE_PROVIDER` / `global.objectStorage.provider` / `--object-storage-provider`                                     | enum       | `s3`             | Yes       | Object storage backend: `s3`, `gcs`, `azure-blob`, `minio`.           | `P9.J02`      |
| `PILLAR_OBJECT_STORAGE_ENDPOINT` / `global.objectStorage.endpoint` / `--object-storage-endpoint`                                     | URL        | provider default | Mode      | Object storage endpoint override.                                     | `P9.J02`      |
| `PILLAR_OBJECT_STORAGE_ACCESS_KEY_SECRET_REF` / `global.objectStorage.accessKeySecretRef` / `--object-storage-access-key-secret-ref` | Secret ref | none             | Mode      | Access key ref for non-workload-identity storage.                     | `P8.K02`      |
| `PILLAR_OBJECT_STORAGE_SECRET_KEY_SECRET_REF` / `global.objectStorage.secretKeySecretRef` / `--object-storage-secret-key-secret-ref` | Secret ref | none             | Mode      | Secret key ref for non-workload-identity storage.                     | `P8.K02`      |
| `PILLAR_KMS_PROVIDER` / `global.kms.provider` / `--kms-provider`                                                                     | enum       | none             | Yes       | KMS provider: `aws-kms`, `gcp-kms`, `azure-keyvault`, `vault`, `hsm`. | `P8.K02`      |
| `PILLAR_KMS_DEFAULT_KEY_REF` / `global.kms.defaultKeyRef` / `--kms-default-key-ref`                                                  | KMS ref    | none             | Yes       | Default encryption/signing key reference.                             | `P8.K02`      |
| `PILLAR_OTEL_SERVICE_NAMESPACE` / `global.otel.serviceNamespace` / `--otel-service-namespace`                                        | string     | `pillar`         | Yes       | OTel service namespace.                                               | `P10.L03`     |
| `PILLAR_OTEL_EXPORTER_PROTOCOL` / `global.otel.exporterProtocol` / `--otel-exporter-protocol`                                        | enum       | `grpc`           | Yes       | OTLP protocol.                                                        | `P10.L03`     |
| `PILLAR_OIDC_ISSUER_URL` / `global.oidc.issuerUrl` / `--oidc-issuer-url`                                                             | URL        | none             | Mode      | Identity provider issuer.                                             | `P8.K01`      |
| `PILLAR_OIDC_JWKS_URL` / `global.oidc.jwksUrl` / `--oidc-jwks-url`                                                                   | URL        | derived          | Mode      | JWKS URL for token validation.                                        | `P8.K01`      |
| `PILLAR_STRIPE_ACCOUNT_MODE` / `global.stripe.accountMode` / `--stripe-account-mode`                                                 | enum       | `test`           | Mode      | Stripe account mode for billing integration.                          | `P14.Q04`     |

## 5. Deployment-mode-conditional config

| Config family        | `hosted`                                                           | `customer-validator`                                                 | `self-hosted`                                                               | Required invariant                                         |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Participant endpoint | Pillar-owned participant refs may be resolved from fleet registry. | Customer participant host/port and auth refs are required.           | Customer participant host/port, TLS, auth, and network policy are required. | Public `/v1` grammar does not change.                      |
| Ledger auth          | Pillar KMS/JWT/mTLS refs.                                          | Customer-supplied JWT/mTLS refs; Pillar validates ref presence only. | Customer-supplied refs; no hosted fallback.                                 | Commands fail fast if auth missing.                        |
| Data stores          | Managed service refs may be injected by control plane.             | Pillar-managed or customer-provided refs depending contract.         | Customer-provided refs required.                                            | DB remains projection/audit/config only.                   |
| OIDC                 | Pillar IdP default allowed.                                        | Tenant/customer IdP mapping required for live access.                | Customer IdP required unless local sandbox.                                 | Auth failures are explicit 401/403, not downgraded.        |
| Object storage       | Pillar buckets and KMS.                                            | Contract-selected bucket owner.                                      | Customer bucket and KMS.                                                    | Exports/evidence encrypted before write.                   |
| Observability        | Pillar collector and dashboards.                                   | Dual sink optional: Pillar SRE plus customer.                        | Customer collector required; Pillar sink optional.                          | Required metrics labels remain present.                    |
| Billing/Stripe       | Pillar billing integration.                                        | Usually Pillar billing integration with customer usage source.       | Optional or customer billing integration.                                   | Usage events are auditable regardless of billing provider. |
| Feature flags        | Fleet registry plus tenant overrides.                              | Fleet registry may distribute only non-hot-path defaults.            | Local registry/config file; no hosted dependency in hot path.               | Runtime toggles cannot change API grammar.                 |

## 6. Secret config

Secrets are never raw Helm values, ConfigMap literals, CLI profile literals, health endpoint values, or log fields. They are references resolved by External Secrets, workload identity, Vault, KMS, OS keychain, or provider-native secret managers.

| Secret-bearing suffix | Meaning                           | Examples                                                      | Allowed surfaces                 |
| --------------------- | --------------------------------- | ------------------------------------------------------------- | -------------------------------- |
| `_SECRET_REF`         | Generic secret manager reference. | `PILLAR_DATABASE_URL`, `PILLAR_API_KEY_SECRET_REF`            | env, Helm, config file metadata. |
| `_TOKEN_SECRET_REF`   | Bearer/JWT token reference.       | `PILLAR_LEDGER_JWT_TOKEN_SECRET_REF`                          | env, Helm.                       |
| `_KMS_REF`            | KMS key reference, not key bytes. | `PILLAR_WEBHOOK_SIGNING_KEY_KMS_REF`, `PILLAR_EXPORT_KMS_REF` | env, Helm, config file metadata. |
| `_CERT_SECRET_REF`    | Certificate bundle reference.     | `PILLAR_LEDGER_MTLS_CERT_SECRET_REF`                          | env, Helm.                       |
| `_KEY_SECRET_REF`     | Private key reference.            | `PILLAR_LEDGER_MTLS_KEY_SECRET_REF`                           | env, Helm.                       |

| Value type                          | Secret?       | Handling rule                                                                                            |
| ----------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| DSN with credentials                | Yes           | Store as secret ref; redact username and host when needed for diagnostics unless host is already public. |
| API key, JWT, webhook signing key   | Yes           | Secret ref only; never appear in health schema.                                                          |
| KMS key ARN/name                    | Reference     | May appear as ref; never expose decrypted key material.                                                  |
| Hostname, port, timeout, batch size | No            | May be ConfigMap/Helm value and health metadata.                                                         |
| OIDC issuer/JWKS URL                | No            | Public metadata, but tenant mapping may be sensitive.                                                    |
| Bucket name                         | Usually value | Treat as sensitive in customer-validator/self-hosted support exports when customer marks private.        |

External Secrets binding conventions:

| Helm path           | Kubernetes materialization                             | Consumer env                                                         |
| ------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| `*.urlSecretRef`    | `Secret` key mounted or envFrom by ExternalSecret.     | URL env var with raw value inside pod only.                          |
| `*.apiKeySecretRef` | `Secret` key projected as file or env.                 | Provider client loads at boot and on rotation signal.                |
| `*.kmsRef`          | ConfigMap value or Secret metadata depending provider. | KMS client resolves reference and permissions via workload identity. |
| `*.certSecretRef`   | TLS secret volume.                                     | mTLS client reads cert chain from mounted path.                      |

## 7. Feature flags

Feature flags are registered config entries with owner, mode behavior, runtime mutability, blast radius, and rollback rule. Runtime toggles may change routing, batching, UI visibility, or worker behavior; they MUST NOT change public object grammar, idempotency semantics, ledger source of truth, or audit requirements.

| Flag                             | Services                              | Type    | Default | Runtime? | Description                                                               | Owning ticket |
| -------------------------------- | ------------------------------------- | ------- | ------- | -------- | ------------------------------------------------------------------------- | ------------- |
| `api_version_negotiation_strict` | apps/api, SDKs, CLI                   | boolean | `true`  | Yes      | Rejects unsupported `Pillar-Version` instead of silently falling forward. | `P2.C02`      |
| `idempotency_replay_byte_equal`  | apps/api                              | boolean | `true`  | Yes      | Enforces byte-equivalent replay responses.                                | `P3.D03`      |
| `command_async_completion_v2`    | workflow-orchestrator, ledger-command | boolean | `false` | Yes      | Uses v2 completion classifier after canary.                               | `P4.F05`      |
| `projection_backfill_v2`         | projection-worker, reconciler         | boolean | `false` | Yes      | Enables improved backfill algorithm.                                      | `P5.G06`      |
| `webhook_snapshot_payloads`      | webhook-dispatcher, apps/api          | boolean | `false` | Yes      | Allows snapshot payload mode for opted-in endpoints.                      | `P6.H02`      |
| `workbench_live_mode`            | apps/workbench                        | boolean | `false` | Yes      | Enables live-mode panels behind authz.                                    | `P7.I06`      |
| `compliance_external_provider`   | compliance-adapter                    | boolean | mode    | Yes      | Routes decisions to external provider.                                    | `P8.K03`      |
| `dar_safe_rollforward`           | template-registry, ledger-command     | boolean | `true`  | Yes      | Requires compatible package profile rollforward.                          | `P12.N04`     |
| `search_index_v2`                | search-indexer, apps/api              | boolean | `false` | Yes      | Serves search from v2 index after parity gate.                            | `P11.M03`     |
| `usage_meter_billing_close_v2`   | usage-meter                           | boolean | `false` | Yes      | Enables new billing close pipeline.                                       | `P14.Q08`     |
| `dashboard_onboarding_checklist` | apps/dashboard                        | boolean | `true`  | Yes      | Shows guided onboarding checklist.                                        | `P13.O03`     |
| `export_parquet_format`          | export-worker, apps/api               | boolean | `false` | Yes      | Enables Parquet export format.                                            | `P11.M05`     |

Flag registry schema:

| Key               | Type         | Required | Description                                                                 |
| ----------------- | ------------ | -------- | --------------------------------------------------------------------------- |
| `name`            | string       | Yes      | Lower snake case flag name.                                                 |
| `ownerTicket`     | string       | Yes      | Ticket owning creation and retirement.                                      |
| `ownerTeam`       | string       | Yes      | Runtime owner for incidents and rollbacks.                                  |
| `default`         | typed        | Yes      | Default by deployment mode if necessary.                                    |
| `runtimeMutable`  | boolean      | Yes      | Whether change is allowed without deploy.                                   |
| `allowedModes`    | string array | Yes      | Modes where flag may be used.                                               |
| `guardrailMetric` | string       | Yes      | SLO or metric that must remain healthy during rollout.                      |
| `rollbackValue`   | typed        | Yes      | Value used for immediate rollback.                                          |
| `expiresAt`       | date/null    | Yes      | Required for migration/canary flags; null only for permanent product flags. |

## 8. Health endpoint config schema dump

Every service exposes a redacted config view from its health endpoint. Secrets are represented by reference presence and digest metadata only.

```json
{
  "service": "apps/api",
  "version": "<image-tag-or-semver>",
  "deploymentMode": "hosted|customer-validator|self-hosted",
  "config": {
    "sourcePrecedence": ["env", "flag", "configFile", "helm", "default"],
    "resolvedAt": "<RFC3339>",
    "configBundleVersion": "<chart-or-config-registry-version>",
    "fields": [
      {
        "name": "databaseUrl",
        "env": "PILLAR_DATABASE_URL",
        "helmPath": "api.database.urlSecretRef",
        "cliFlag": "--database-url",
        "type": "secretRef",
        "required": true,
        "source": "env|flag|configFile|helm|default",
        "present": true,
        "redacted": true,
        "secretRefDigest": "sha256:<digest-of-reference-not-secret>",
        "validation": "ok|warning|error",
        "message": null
      }
    ],
    "featureFlags": [
      {
        "name": "api_version_negotiation_strict",
        "value": true,
        "runtimeMutable": true,
        "source": "flagRegistry",
        "ownerTicket": "P2.C02"
      }
    ],
    "dependencies": [
      {
        "name": "postgres",
        "configured": true,
        "secretPresent": true,
        "connectivity": "ok|degraded|unknown",
        "lastCheckedAt": "<RFC3339>"
      }
    ]
  }
}
```

Required health schema rules:

| Rule               | Requirement                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Redaction          | Raw secret values, tokens, DSNs, webhook keys, private keys, and provider API keys MUST NOT appear.                                      |
| Source attribution | Each field reports the winning source after precedence resolution.                                                                       |
| Validation status  | Invalid required field reports `error` and service readiness fails.                                                                      |
| Mode expansion     | Mode-derived requiredness is visible in `required`.                                                                                      |
| Feature flags      | Runtime flags include value, source, mutability, and owner ticket.                                                                       |
| Dependency checks  | Connectivity status is separate from config presence; startup can be valid while dependency is degraded only when service policy allows. |

Per-service health endpoints:

| Service                             | Health path                   | Config object key        | Required redactions                                                                  | Readiness dependency                                           |
| ----------------------------------- | ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `apps/api`                          | `/healthz/config`             | `api`                    | DB URL, Redis URL, participant JWT ref, rate-limit Redis prefix when tenant-scoped.  | Postgres, Redis, OTel exporter optional only in local sandbox. |
| `services/ledger-command`           | `/healthz/config`             | `ledgerCommand`          | JWT token ref, mTLS key/cert refs, participant endpoint when customer marks private. | Participant Ledger API auth and command service readiness.     |
| `services/projection-worker`        | `/healthz/config`             | `projectionWorker`       | PQS JDBC URL and DB role.                                                            | PQS connectivity, projection schema version, checkpoint table. |
| `services/workflow-orchestrator`    | `/healthz/config`             | `workflowOrchestrator`   | Queue URL and lock backend.                                                          | Queue, Postgres operation table, command topic.                |
| `services/webhook-dispatcher`       | `/healthz/config`             | `webhookDispatcher`      | Signing KMS ref digest only, endpoint auth material.                                 | Outbox DB, KMS sign permission, dispatch queue.                |
| `services/compliance-adapter`       | `/healthz/config`             | `complianceAdapter`      | Provider API key ref, review queue URL, evidence bucket if private.                  | Policy bundle load, provider readiness when enabled.           |
| `services/template-registry`        | `/healthz/config`             | `templateRegistry`       | Registry DB URL, trusted certs ref.                                                  | DB schema, artifact bucket, signature verifier.                |
| `services/usage-meter`              | `/healthz/config`             | `usageMeter`             | Stripe key refs, usage DB URL.                                                       | Usage DB, billing provider when enabled, export bucket.        |
| `services/search-indexer`           | `/healthz/config`             | `searchIndexer`          | Search backend URL.                                                                  | Projection DB read role and index backend.                     |
| `services/export-worker`            | `/healthz/config`             | `exportWorker`           | KMS ref digest, object storage credentials.                                          | Object bucket, KMS encrypt permission, export queue.           |
| `services/reconciler`               | `/healthz/config`             | `reconciler`             | Evidence bucket if private, ledger scan credentials.                                 | Projection DB, ledger read path, notify topic.                 |
| `tools/migrator`                    | `stdout --health-config`      | `migrator`               | Database URL.                                                                        | Advisory lock acquisition and migration directory readability. |
| `tools/cli`                         | `pillar config doctor --json` | `cli`                    | API key/keychain pointer, profile token refs.                                        | Profile file readability and API base URL syntax.              |
| `apps/workbench` / `apps/dashboard` | `/healthz/config`             | `workbench`, `dashboard` | Session secret ref, OIDC client secret if present.                                   | OIDC metadata, API reachability, CSP template validity.        |

Schema validation matrix:

| Field class  | Validation                                                                                        | Error code                  |
| ------------ | ------------------------------------------------------------------------------------------------- | --------------------------- |
| URL          | Absolute URL unless explicitly documented as browser-relative UI path; scheme allowlist enforced. | `CONFIG_URL_INVALID`        |
| Port         | Integer in `1..65535`; privileged ports require explicit deployment approval.                     | `CONFIG_PORT_INVALID`       |
| Duration     | Positive duration with upper bound per field; zero allowed only for documented disable switches.  | `CONFIG_DURATION_INVALID`   |
| Size         | Positive byte count; request/export limits must be lower than ingress and object-store caps.      | `CONFIG_SIZE_INVALID`       |
| Enum         | Exact case-sensitive member from this reference.                                                  | `CONFIG_ENUM_INVALID`       |
| Secret ref   | Provider prefix, namespace, key, and ExternalSecret binding must parse.                           | `CONFIG_SECRET_REF_INVALID` |
| KMS ref      | Provider-specific key identity and service account permission must validate before use.           | `CONFIG_KMS_REF_INVALID`    |
| Path         | Absolute path in containers unless CLI-local; mounted file must be readable by service UID.       | `CONFIG_PATH_INVALID`       |
| Cron         | Five-field cron with minimum interval guard.                                                      | `CONFIG_CRON_INVALID`       |
| Feature flag | Registered owner, allowed mode, typed value, rollback value.                                      | `CONFIG_FLAG_INVALID`       |

## 9. Deprecation policy

| Stage             | Duration                           | Allowed behavior                                                                            | Required artifact                                                |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Proposed          | One release before warning         | New field documented; old field still canonical.                                            | Dev doc update and owner ticket.                                 |
| Warning           | At least two minor releases        | Old field accepted but logs redacted warning and health schema marks `deprecated`.          | Migration note in release packet.                                |
| Dual-read         | At least one production release    | New field wins if both set; old field accepted if new absent.                               | Config validation test for precedence.                           |
| Removal scheduled | One release                        | Old field causes startup warning in non-prod and failure in canary if both fields conflict. | Customer/self-hosted upgrade note.                               |
| Removed           | Major or approved breaking release | Old field rejected with explicit validation error.                                          | Regression contract update if public behavior could be affected. |

Deprecation rules:

| Rule            | Requirement                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Secret refs     | Secret field renames require dual-read by reference, never copying secret values.                                 |
| Helm values     | Chart must emit deprecation warnings during template/lint when old path is present.                               |
| CLI flags       | Deprecated flags remain visible with warning until removal stage.                                                 |
| Env vars        | Env var deprecation is startup-visible and included in redacted health schema.                                    |
| Public behavior | Config changes cannot alter public `/v1` object grammar or error envelope except through approved API versioning. |

## 10. Config validation gate

Every service must fail fast on invalid config before readiness succeeds, queue consumers start, ledger commands submit, projection rows apply, webhooks deliver, or exports write objects.

| Gate                  | Required checks                                                                                         | Failure behavior                                                     | Owning ticket |
| --------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------- |
| Parse gate            | Types, enums, durations, sizes, URLs, paths, cron expressions.                                          | Process exits with `CONFIG_PARSE_ERROR`.                             | `P9.J04`      |
| Requiredness gate     | Required fields after deployment-mode expansion.                                                        | Process exits with `CONFIG_REQUIRED_MISSING`.                        | `P9.J04`      |
| Secret reference gate | Secret ref presence, provider syntax, ExternalSecret sync status when available.                        | Readiness false; job exits before mutation.                          | `P8.K02`      |
| Connectivity gate     | DB/Redis/queue/object/KMS/ledger/OTel reachability according to service startup policy.                 | Readiness false; no command/projection/webhook work starts.          | `P10.L04`     |
| Invariant gate        | DB role, ledger source-of-truth, public Canton invisibility, idempotency, audit and trace requirements. | Startup failure for unsafe state.                                    | `P10.L01`     |
| Precedence gate       | Env > flag > config file > Helm > default deterministic winner.                                         | Startup failure on ambiguous conflict for secret or endpoint fields. | `P9.J04`      |
| Deprecation gate      | Deprecated aliases accepted only by active stage and conflict policy.                                   | Warning or failure according to §9.                                  | `P10.L08`     |
| Feature flag gate     | Flag exists in registry, owner ticket present, mode allowed, rollback value set.                        | Runtime toggle rejected or startup failure for build-time flag.      | `P10.L08`     |
| Health schema gate    | Redacted health dump validates against §8 schema.                                                       | Readiness false until schema is valid.                               | `P10.L04`     |
| Test gate             | Unit tests cover parser, precedence, mode expansion, and secret redaction per service.                  | CI fails.                                                            | `P9.J04`      |

Service-specific fail-fast expectations:

| Service                             | Must validate before                                     |
| ----------------------------------- | -------------------------------------------------------- |
| `apps/api`                          | Accepting HTTP traffic.                                  |
| `services/ledger-command`           | Submitting any Canton command.                           |
| `services/projection-worker`        | Advancing checkpoint or emitting event rows.             |
| `services/workflow-orchestrator`    | Acquiring operation leases.                              |
| `services/webhook-dispatcher`       | Dispatching or replaying any webhook.                    |
| `services/compliance-adapter`       | Returning allow/deny/review decisions.                   |
| `services/template-registry`        | Activating package profile or serving registry metadata. |
| `services/usage-meter`              | Emitting usage or billing provider calls.                |
| `services/search-indexer`           | Swapping or serving a new index generation.              |
| `services/export-worker`            | Writing export objects or signed URLs.                   |
| `services/reconciler`               | Creating customer-visible diff findings.                 |
| `tools/migrator`                    | Applying any migration.                                  |
| `tools/cli`                         | Sending live-mode mutating requests.                     |
| `apps/workbench` / `apps/dashboard` | Serving authenticated UI routes.                         |

Validation implementation requirements:

| Requirement               | Implementation detail                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Single parser per service | Each service exposes a typed config module used by runtime, tests, health schema, and docs generation.           |
| No lazy validation        | Missing or malformed config is rejected at process start, not when a code path first needs the value.            |
| Redacted diagnostics      | Error messages include field name, source, and reason; they never include secret values.                         |
| Mode-aware tests          | Parser tests cover `hosted`, `customer-validator`, `self-hosted`, and local sandbox where supported.             |
| Helm template tests       | Rendered chart values must produce the same field names and defaults listed here.                                |
| CLI parity tests          | CLI flags must map one-to-one to env/config keys for `tools/cli` and job entrypoints.                            |
| Runtime reload tests      | Only feature flags and documented dynamic config can reload without restart.                                     |
| Audit on change           | Production config changes emit audit events with actor, field, source, old redacted digest, new redacted digest. |
| Drift detection           | Health schema output is compared against chart values and config registry during readiness checks.               |
| Break-glass control       | Incident overrides require expiry, owner, reason, ticket, and automatic warning in health output.                |

CI enforcement:

| Check              | Command shape                                                    | Blocks                                                                |
| ------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------- | ------------- | ------------------------------------------------------ |
| Config schema unit | `pnpm test -- config-schema` or service-native equivalent.       | Parser drift and missing requiredness tests.                          |
| Helm render        | `helm template infra/helm/pillar -f values-dev.yaml`.            | Missing Helm path, raw secret value, invalid default.                 |
| Secret lint        | `pillarctl config lint --secrets --values <rendered-values>`.    | Secret in ConfigMap, non-ref secret field, unredacted health fixture. |
| Mode matrix        | `pillarctl config validate --mode hosted                         | customer-validator                                                    | self-hosted`. | Mode-specific missing refs or illegal hosted fallback. |
| Health fixture     | `pillarctl health-schema validate fixtures/health/*.json`.       | Nonconforming schema or leaked raw secret.                            |
| Deprecation lint   | `pillarctl config lint --deprecations`.                          | Removed field still accepted or deprecated field lacking warning.     |
| Flag registry lint | `pillarctl flags validate --registry config/feature-flags.yaml`. | Missing owner, rollback value, expiry, or mode allowlist.             |
| Docs drift         | `pillarctl config docs-check docs/Dev/CONFIG_REFERENCE.md`.      | Runtime config field not enumerated here.                             |
