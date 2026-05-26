# Pillar Metrics Catalog

This catalog enumerates every Prometheus/OpenTelemetry metric Pillar emits or requires from Pillar-owned runtime components. It is distinct from [SLO_CATALOG.md](./SLO_CATALOG.md): SLOs define SLIs and targets; this catalog defines metric ownership, shape, labels, and permitted cardinality.

Source alignment:

| Source                                                                        | Catalog usage                                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [README](./README.md)                                                         | Dev invariant and ticket conventions.                                  |
| [REGRESSION_CONTRACT](./REGRESSION_CONTRACT.md)                               | Correctness and observability clauses guarded by metrics.              |
| [VERIFICATION](./VERIFICATION.md)                                             | Verification gates that consume metric evidence.                       |
| [Phase 02 API Contract](./Phase_02_API_Contract.md)                           | API grammar, object/error semantics, version headers.                  |
| [Phase 04 Ledger Command Runtime](./Phase_04_Ledger_Command_Runtime.md)       | Command submission, completion, participant, JWT, mTLS metrics.        |
| [Phase 05 Projection Reconciliation](./Phase_05_Projection_Reconciliation.md) | Projector, PQS, reconciliation, rebuild metrics.                       |
| [Phase 06 Webhook Event System](./Phase_06_Webhook_Event_System.md)           | Webhook dispatcher, retry, DLQ, endpoint-health metrics.               |
| [Phase 07 SDK / CLI / Workbench](./Phase_07_SDK_CLI_Workbench.md)             | Customer-visible dashboard and Workbench metric surfaces.              |
| [Phase 08 Security Compliance](./Phase_08_Security_Compliance.md)             | Auth, KYC/KYB, sanctions, key, threat, scan metrics.                   |
| [Phase 09 CI/CD Helm Deployment](./Phase_09_CICD_Helm_Deployment.md)          | ServiceMonitor, deployment labels, release-mode labels.                |
| [Phase 10 GA Hardening](./Phase_10_GA_Hardening.md)                           | Production alert, dashboard, SLO, and incident-readiness requirements. |
| [SLO_CATALOG](./SLO_CATALOG.md)                                               | SLI consumers of selected metric families.                             |

## 1. Conventions

### 1.1 Naming

| Rule                | Requirement                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prefix              | Every Pillar-owned metric name starts with `pillar_`.                                                                                                                                                                                 |
| Shape               | Use `pillar_<domain>_<measurement>_<unit>` when a unit exists; counters MAY end with `_total` instead of a unit suffix.                                                                                                               |
| Domains             | `api`, `ledger`, `participant`, `projection`, `pqs`, `reconciliation`, `webhook`, `workflow`, `compliance`, `kyc`, `template_registry`, `dar`, `search`, `export`, `usage`, `billing`, `billing`, `migrator`, `db`, `secret`, `image`. |
| Counters            | Monotonic counters end in `_total` and reset only on process restart.                                                                                                                                                                 |
| Histograms          | Duration histograms end in `_duration_seconds` or `_lag_seconds`; expose `_bucket`, `_sum`, and `_count`.                                                                                                                             |
| Gauges              | Point-in-time state uses natural units: `_seconds`, `_bytes`, `_count`, `_up`, or explicit object name.                                                                                                                               |
| Summaries           | Summaries are discouraged; histograms are preferred for fleet aggregation. If summary appears, owning ticket must justify it.                                                                                                         |
| Units               | Seconds for time, bytes for size, ratios as unitless gauges, integer counts for gauges/counters.                                                                                                                                      |
| Public object names | Labels MAY contain object classes such as `account`, `holding`, or `transfer_intent`; labels MUST NOT contain object IDs.                                                                                                             |
| Canton terms        | Internal metrics MAY use `participant`, `command_type`, `offset_class`, and `package_status`; public dashboard aliases hide Canton internals.                                                                                         |

### 1.2 Label policy

| Policy               | Requirement                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required base labels | Every Pillar metric emitted in production carries `env`, `deployment_mode`, `region`, `service`, `version`, and `owner_team`.                     |
| Deployment mode      | `deployment_mode` is one of `hosted`, `customer-validator`, `self-hosted`; `sandbox` is allowed only outside production.                          |
| Tenant label         | `tenant_id` is allowed only on approved per-tenant operational counters and histograms listed in §15. Prefer `tenant_tier` or `tenant_class`.     |
| Route label          | `route` MUST be templated (`/v1/accounts/{id}`), never raw URL or query string.                                                                   |
| Status label         | HTTP status is the numeric class or full code only where explicitly listed; do not add arbitrary error text.                                      |
| Outcome label        | Use bounded enum values from owning phase docs: `success`, `failure`, `timeout`, `duplicate`, `rejected`, `unknown`, `dlq`, `cancelled`.          |
| Reason label         | `reason` is a bounded machine enum, not exception message or vendor text.                                                                         |
| Endpoint label       | Webhook `endpoint` is an internal stable endpoint key or tier bucket, never full customer URL.                                                    |
| Query label          | `query_class` is a curated class such as `lookup`, `list`, `insert`, `update`, `reconcile`, `export`; never raw SQL.                              |
| Worker label         | `worker` is a stable process or lease shard, capped by configured worker count.                                                                   |
| Participant label    | `participant` is a configured participant alias, never endpoint URL, party ID, auth subject, or certificate subject.                              |
| PII                  | Names, emails, phone numbers, addresses, tax IDs, bank data, raw metadata values, public object IDs, and raw request IDs are forbidden in labels. |
| High cardinality     | Use logs/traces for request IDs, operation IDs, command IDs, event IDs, customer URLs, exception messages, stack traces, and ledger offsets.      |
| Exemplars            | Histograms MAY attach trace exemplars; exemplars carry trace/span IDs outside label cardinality accounting.                                       |

### 1.3 Type policy

| Type      | Use                                                                             | Examples                                                    |
| --------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Counter   | Event occurrence and classified terminal outcomes.                              | API requests, command attempts, auth failures, DLQ entries. |
| Gauge     | Current state, age, lag, backlog, health, expiry, active package count.         | Participant up, DLQ size, JWT age, certificate expiry.      |
| Histogram | Fleet-aggregated latency, lag, rebuild, query, job, and decision distributions. | API duration, command submission duration, projection lag.  |
| Summary   | Local process quantiles only when fleet aggregation is not needed.              | None approved by default.                                   |

### 1.4 Cardinality budget per metric

| Budget tier | Max active series per environment | Allowed labels                                                  | Approval                        |
| ----------- | --------------------------------: | --------------------------------------------------------------- | ------------------------------- |
| Tiny        |                                50 | base labels plus 1 enum                                         | Owning service lead.            |
| Standard    |                               500 | base labels plus 2-3 bounded enums                              | Owning phase ticket.            |
| Elevated    |                             5,000 | tenant-safe or route-safe dimensions                            | Observability owner and SRE.    |
| Exceptional |                            25,000 | explicitly listed per-tenant operational metrics                | Engineering lead plus SRE lead. |
| Forbidden   |                         Unbounded | raw IDs, URLs, SQL, exception text, user input, metadata values | Not allowed.                    |

### 1.5 Histogram buckets

| Metric class               | Default buckets                                             |
| -------------------------- | ----------------------------------------------------------- |
| HTTP/API duration          | `0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5,10` seconds.    |
| Ledger command duration    | `0.05,0.1,0.25,0.5,1,2.5,5,10,30,60,120,300` seconds.       |
| Projection lag             | `0.1,0.5,1,2,5,10,30,60,120,300,900` seconds.               |
| Webhook delivery           | `0.05,0.1,0.25,0.5,1,2.5,5,10,30,60,300` seconds.           |
| Compliance/vendor decision | `0.05,0.1,0.25,0.5,1,2,5,10,30,60` seconds.                 |
| Export/job duration        | `1,5,10,30,60,300,900,1800,3600,7200` seconds.              |
| Database query             | `0.001,0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5` seconds. |

## 2. Service emission matrix

| Service/component                | Metric families emitted                                          | Owning phase tickets                                          | Primary consumers                                   |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `apps/api`                       | `pillar_api_*`, selected auth/rate-limit, customer-facing gauges | `P2.C02`, `P4.E06`, `P8.K05`, `P10.L06`                       | SLO dashboards, Workbench, status page.             |
| `services/ledger-command`        | `pillar_ledger_*`, `pillar_participant_*`                        | `P4.F03`, `P4.F04`, `P4.F05`, `P9.J04`, `P10.L06`             | Command runtime alerts, participant runbook.        |
| `services/projection-worker`     | `pillar_projection_*`, `pillar_pqs_*`                            | `P5.G05`, `P5.G06`, `P5.G07`, `P10.L06`                       | Projection freshness SLO, rebuild runbook.          |
| `services/reconciler`            | `pillar_reconciliation_*`                                        | `P5.G06`, `P5.G07`, `P10.L01`, `P10.L06`                      | Correctness stop alerts, evidence packets.          |
| `services/webhook-dispatcher`    | `pillar_webhook_*`                                               | `P6.H02`, `P6.H03`, `P6.H04`, `P6.H05`, `P10.L06`             | Webhook delivery SLO and DLQ runbook.               |
| `services/workflow-orchestrator` | `pillar_workflow_*`                                              | `P4.F02`, `P4.F06`, `P6.H02`, `P10.L06`                       | Queue health, lease safety, workflow dashboards.    |
| `services/compliance-adapter`    | `pillar_compliance_*`, `pillar_kyc_*`, `pillar_sanctions_*`      | `P8.K03`, `P8.K04`, `P8.K07`, `P10.L06`                       | Compliance decision latency, provider health.       |
| `services/template-registry`     | `pillar_template_registry_*`, `pillar_dar_*`                     | `P12.N03`, `P12.N04`, `P12.N06`, `P10.L06`                    | Release readiness, DAR rollback, package inventory. |
| `services/search-indexer`        | `pillar_search_*`                                                | `P11.M02`, `P11.M03`, `P11.M08`, `P10.L06`                    | Search freshness and query dashboards.              |
| `services/export-worker`         | `pillar_export_*`                                                | `P11.M04`, `P11.M05`, `P11.M09`, `P10.L06`                    | Export backlog runbook and audit exports.           |
| `services/usage-meter`           | `pillar_usage_*`, `pillar_billing_*`, `pillar_billing_*`          | `P14.Q02`, `P14.Q03`, `P14.Q04`, `P14.Q06`, `P10.L06`         | Billing-close dashboards and usage reconciliation.  |
| `services/migrator`              | `pillar_migrator_*`                                              | `P3.D01`, `P8.K01`, `P11.M01`, `P12.N01`, `P14.Q01`, `P9.J03` | Release gates and rollback evidence.                |
| shared DB instrumentation        | `pillar_db_*`                                                    | `P3.D02`, `P9.J03`, `P10.L06`                                 | Capacity, slow-query, pool saturation alerts.       |
| CI/release scanner               | `pillar_image_scan_*`                                            | `P9.J06`, `P8.K10`, `P10.L08`                                 | Release security gate and compliance evidence.      |

## 3. API gateway metrics

| Name                                       | Type      | Unit        | Labels                                     | Emitting service | Owning ticket | Use case                                                                                          |
| ------------------------------------------ | --------- | ----------- | ------------------------------------------ | ---------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `pillar_api_requests_total`                | Counter   | requests    | `method`, `route`, `status`, `tenant_id`   | `apps/api`       | `P2.C02`      | Count every templated `/v1` request for availability, adoption, and tenant-scoped support triage. |
| `pillar_api_request_duration_seconds`      | Histogram | seconds     | `method`, `route`, `status`, `tenant_tier` | `apps/api`       | `P2.C02`      | Compute API p95/p99 latency and isolate slow route classes.                                       |
| `pillar_api_idempotency_replays_total`     | Counter   | replays     | `outcome`                                  | `apps/api`       | `P3.D03`      | Detect safe replay, conflict, and divergent-idempotency paths.                                    |
| `pillar_api_rate_limit_hits_total`         | Counter   | hits        | `bucket`                                   | `apps/api`       | `P8.K05`      | Prove quota protection and diagnose customer-visible 429 bursts.                                  |
| `pillar_api_auth_failures_total`           | Counter   | failures    | `reason`                                   | `apps/api`       | `P8.K02`      | Detect invalid key, expired token, bad signature, and scope-denied patterns.                      |
| `pillar_api_version_resolution_total`      | Counter   | resolutions | `source`                                   | `apps/api`       | `P2.C04`      | Track version selection from header, account default, SDK default, or fallback.                   |
| `pillar_api_metadata_pii_rejections_total` | Counter   | rejections  | `pattern`                                  | `apps/api`       | `P8.K08`      | Count metadata payloads rejected by PII policy before persistence.                                |
| `pillar_api_validation_failures_total`     | Counter   | failures    | `route`, `field_class`, `error_code`       | `apps/api`       | `P2.C03`      | Monitor schema drift and high-volume invalid client usage without logging values.                 |
| `pillar_api_response_bytes`                | Histogram | bytes       | `route`, `status`, `tenant_tier`           | `apps/api`       | `P2.C02`      | Capacity planning for list/search endpoints and SDK pagination behavior.                          |
| `pillar_api_inflight_requests`             | Gauge     | requests    | `route_class`                              | `apps/api`       | `P10.L02`     | Detect overload before queueing collapses downstream services.                                    |
| `pillar_api_request_body_bytes`            | Histogram | bytes       | `route`, `content_type`                    | `apps/api`       | `P2.C03`      | Enforce upload and metadata body limits while preserving privacy.                                 |
| `pillar_api_expand_usage_total`            | Counter   | requests    | `object`, `expand`                         | `apps/api`       | `P2.C05`      | Measure expandable object usage and guard expensive nested expansions.                            |

## 4. Ledger command metrics

| Name                                                | Type      | Unit        | Labels                              | Emitting service          | Owning ticket | Use case                                                                     |
| --------------------------------------------------- | --------- | ----------- | ----------------------------------- | ------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `pillar_ledger_command_submissions_total`           | Counter   | submissions | `command_type`, `outcome`           | `services/ledger-command` | `P4.F03`      | Count accepted command submissions and terminal submission outcomes.         |
| `pillar_ledger_command_submission_duration_seconds` | Histogram | seconds     | `command_type`, `outcome`           | `services/ledger-command` | `P4.F03`      | Measure API intent-to-participant submission latency.                        |
| `pillar_ledger_command_attempts_total`              | Counter   | attempts    | `outcome`                           | `services/ledger-command` | `P4.F04`      | Track retries, dedupe, backoff, and final attempt classification.            |
| `pillar_ledger_command_dedup_hits_total`            | Counter   | hits        | `command_type`, `source`            | `services/ledger-command` | `P4.F04`      | Prove duplicate suppression across crashes and replayed operations.          |
| `pillar_ledger_command_unknown_total`               | Counter   | commands    | `command_type`, `age_bucket`        | `services/ledger-command` | `P4.F05`      | Page on commands with unknown completion state requiring reconciliation.     |
| `pillar_ledger_completion_lag_seconds`              | Histogram | seconds     | `command_type`, `participant_scope` | `services/ledger-command` | `P4.F05`      | Measure participant completion lag after successful submission.              |
| `pillar_participant_connection_up`                  | Gauge     | boolean     | `participant`                       | `services/ledger-command` | `P9.J04`      | Alert when configured participant connectivity is down.                      |
| `pillar_participant_jwt_age_seconds`                | Gauge     | seconds     | `participant`                       | `services/ledger-command` | `P8.K06`      | Rotate or refresh participant JWTs before expiry risk.                       |
| `pillar_participant_mtls_cert_expiry_seconds`       | Gauge     | seconds     | `participant`                       | `services/ledger-command` | `P8.K06`      | Alert before mTLS client or CA certificate expiry.                           |
| `pillar_ledger_command_queue_depth`                 | Gauge     | commands    | `queue`, `priority`                 | `services/ledger-command` | `P4.F02`      | Detect backlog between workflow orchestration and participant submission.    |
| `pillar_ledger_command_retry_delay_seconds`         | Histogram | seconds     | `reason`                            | `services/ledger-command` | `P4.F04`      | Validate exponential backoff and retry safety under participant degradation. |
| `pillar_ledger_command_terminal_state_age_seconds`  | Gauge     | seconds     | `outcome`                           | `services/ledger-command` | `P4.F05`      | Surface stale terminal states awaiting projection/webhook propagation.       |

## 5. Projection / reconciliation metrics

| Name                                         | Type      | Unit    | Labels                          | Emitting service             | Owning ticket | Use case                                                                                               |
| -------------------------------------------- | --------- | ------- | ------------------------------- | ---------------------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| `pillar_projection_lag_seconds`              | Histogram | seconds | `projector`, `tenant_class`     | `services/projection-worker` | `P5.G05`      | Measure ledger-to-projection freshness for customer-visible reads.                                     |
| `pillar_projection_updates_total`            | Counter   | updates | `projector`, `outcome`          | `services/projection-worker` | `P5.G05`      | Count applied, skipped, failed, and retried projection updates.                                        |
| `pillar_projection_checkpoint_age_seconds`   | Gauge     | seconds | `projector`, `shard`            | `services/projection-worker` | `P5.G05`      | Detect stalled checkpoints and replay gaps.                                                            |
| `pillar_projection_rebuild_duration_seconds` | Histogram | seconds | `projector`, `outcome`          | `services/projection-worker` | `P5.G06`      | Time full and scoped rebuilds from ledger/PQS.                                                         |
| `pillar_pqs_query_duration_seconds`          | Histogram | seconds | `query_class`, `outcome`        | `services/projection-worker` | `P5.G05`      | Diagnose PQS-backed read and catch-up latency.                                                         |
| `pillar_pqs_connection_up`                   | Gauge     | boolean | `endpoint`, `mode`              | `services/projection-worker` | `P9.J04`      | Alert when PQS is unreachable or degraded.                                                             |
| `pillar_reconciliation_diff_total`           | Counter   | diffs   | `class`                         | `services/reconciler`        | `P5.G07`      | Count confirmed, suspected, customer-visible, and benign reconciliation diffs.                         |
| `pillar_reconciliation_run_duration_seconds` | Histogram | seconds | `scope`, `outcome`              | `services/reconciler`        | `P5.G07`      | Ensure scheduled reconciliation completes inside operational windows.                                  |
| `pillar_projection_stale_reads_total`        | Counter   | reads   | `object`, `staleness_class`     | `apps/api`                   | `P5.G05`      | Count reads served with stale markers instead of hidden freshness failures.                            |
| `pillar_projection_rebuild_rows_total`       | Counter   | rows    | `projector`, `table`, `outcome` | `services/projection-worker` | `P5.G06`      | Audit rebuild volume and failed row application.                                                       |
| `pillar_projection_watermark_offset`         | Gauge     | offset  | `projector`, `shard`            | `services/projection-worker` | `P5.G05`      | Compare projector progress against ledger/PQS watermark without labels carrying raw offsets elsewhere. |
| `pillar_reconciliation_checks_total`         | Counter   | checks  | `scope`, `outcome`              | `services/reconciler`        | `P5.G07`      | Denominator for diff rate and correctness evidence packets.                                            |

## 6. Webhook dispatcher metrics

| Name                                                   | Type      | Unit       | Labels                    | Emitting service              | Owning ticket | Use case                                                                     |
| ------------------------------------------------------ | --------- | ---------- | ------------------------- | ----------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `pillar_webhook_deliveries_total`                      | Counter   | deliveries | `outcome`                 | `services/webhook-dispatcher` | `P6.H03`      | Count delivered, failed, DLQ-classified, skipped, and expired deliveries.    |
| `pillar_webhook_delivery_duration_seconds`             | Histogram | seconds    | `event_type`, `outcome`   | `services/webhook-dispatcher` | `P6.H03`      | Compute first-attempt and terminal delivery latency.                         |
| `pillar_webhook_attempt_total`                         | Counter   | attempts   | `outcome`                 | `services/webhook-dispatcher` | `P6.H03`      | Track retries, endpoint failures, signature failures, and platform errors.   |
| `pillar_webhook_dlq_size`                              | Gauge     | events     | `endpoint_tier`, `reason` | `services/webhook-dispatcher` | `P6.H04`      | Alert on DLQ backlog by customer endpoint class and platform/customer cause. |
| `pillar_webhook_dlq_age_seconds`                       | Gauge     | seconds    | `endpoint_tier`, `reason` | `services/webhook-dispatcher` | `P6.H04`      | Page when oldest platform-owned DLQ item violates policy.                    |
| `pillar_webhook_endpoint_health`                       | Gauge     | boolean    | `endpoint`, `status`      | `services/webhook-dispatcher` | `P6.H05`      | Surface endpoint health for Workbench without exposing URLs.                 |
| `pillar_webhook_signature_verification_failures_total` | Counter   | failures   | `reason`                  | `services/webhook-dispatcher` | `P6.H06`      | Detect bad signing material, clock skew, or forged webhook attempts.         |
| `pillar_webhook_outbox_lag_seconds`                    | Histogram | seconds    | `event_type`, `shard`     | `services/webhook-dispatcher` | `P6.H02`      | Measure projection-event to dispatcher-pickup lag.                           |
| `pillar_webhook_replay_requests_total`                 | Counter   | requests   | `source`, `outcome`       | `services/webhook-dispatcher` | `P6.H05`      | Audit operator/customer replay requests and replay safety.                   |
| `pillar_webhook_payload_bytes`                         | Histogram | bytes      | `event_type`              | `services/webhook-dispatcher` | `P6.H03`      | Capacity planning for signed payload size and endpoint pressure.             |

## 7. Workflow orchestrator metrics

| Name                                    | Type      | Unit    | Labels              | Emitting service                 | Owning ticket | Use case                                                                     |
| --------------------------------------- | --------- | ------- | ------------------- | -------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `pillar_workflow_tasks_total`           | Counter   | tasks   | `type`, `outcome`   | `services/workflow-orchestrator` | `P4.F02`      | Count orchestrated task lifecycle by type and terminal outcome.              |
| `pillar_workflow_task_duration_seconds` | Histogram | seconds | `type`, `outcome`   | `services/workflow-orchestrator` | `P4.F02`      | Measure workflow scheduling, execution, and terminal classification latency. |
| `pillar_workflow_lease_held`            | Gauge     | boolean | `worker`            | `services/workflow-orchestrator` | `P4.F06`      | Detect lease loss, split brain, and stuck workers.                           |
| `pillar_workflow_queue_depth`           | Gauge     | tasks   | `queue`, `priority` | `services/workflow-orchestrator` | `P4.F02`      | Alert on workflow backlog before command or webhook SLO impact.              |
| `pillar_workflow_dead_letter_total`     | Counter   | tasks   | `type`, `reason`    | `services/workflow-orchestrator` | `P4.F06`      | Count tasks requiring operator inspection after retry exhaustion.            |
| `pillar_workflow_resume_total`          | Counter   | resumes | `type`, `outcome`   | `services/workflow-orchestrator` | `P4.F06`      | Verify crash-safe workflow resume and idempotent continuation.               |

## 8. Compliance adapter metrics

| Name                                          | Type      | Unit      | Labels                              | Emitting service              | Owning ticket | Use case                                                                   |
| --------------------------------------------- | --------- | --------- | ----------------------------------- | ----------------------------- | ------------- | -------------------------------------------------------------------------- |
| `pillar_compliance_decisions_total`           | Counter   | decisions | `decision`, `vendor`                | `services/compliance-adapter` | `P8.K03`      | Count allow, deny, review, timeout, and provider-error decisions.          |
| `pillar_compliance_decision_duration_seconds` | Histogram | seconds   | `decision`, `vendor`, `policy_type` | `services/compliance-adapter` | `P8.K03`      | Measure inline and async compliance decision latency.                      |
| `pillar_kyc_vendor_up`                        | Gauge     | boolean   | `vendor`                            | `services/compliance-adapter` | `P8.K04`      | Alert when KYC/KYB provider dependency is unavailable.                     |
| `pillar_sanctions_list_age_seconds`           | Gauge     | seconds   | `vendor`, `list`                    | `services/compliance-adapter` | `P8.K04`      | Ensure sanctions list freshness meets compliance policy.                   |
| `pillar_compliance_case_queue_depth`          | Gauge     | cases     | `policy_type`, `priority`           | `services/compliance-adapter` | `P8.K03`      | Monitor manual review backlog and regulator-clock exposure.                |
| `pillar_compliance_evidence_exports_total`    | Counter   | exports   | `format`, `outcome`                 | `services/compliance-adapter` | `P8.K07`      | Audit evidence package generation for compliance reviews.                  |
| `pillar_compliance_vendor_errors_total`       | Counter   | errors    | `vendor`, `error_class`             | `services/compliance-adapter` | `P8.K04`      | Detect provider outages or contract drift without storing vendor messages. |

## 9. Template registry metrics

| Name                                                   | Type      | Unit      | Labels                      | Emitting service             | Owning ticket | Use case                                                                     |
| ------------------------------------------------------ | --------- | --------- | --------------------------- | ---------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `pillar_template_registry_uploads_total`               | Counter   | uploads   | `outcome`                   | `services/template-registry` | `P12.N03`     | Count DAR/template uploads, validation failures, and activations.            |
| `pillar_template_registry_active_packages`             | Gauge     | packages  | `status`, `deployment_mode` | `services/template-registry` | `P12.N04`     | Show active, staged, deprecated, and blocked package inventory.              |
| `pillar_dar_signature_verification_failures_total`     | Counter   | failures  | `reason`                    | `services/template-registry` | `P12.N03`     | Detect unsigned, tampered, expired, or untrusted DAR uploads.                |
| `pillar_template_registry_validation_duration_seconds` | Histogram | seconds   | `stage`, `outcome`          | `services/template-registry` | `P12.N03`     | Time package validation, compatibility checks, and activation gates.         |
| `pillar_template_registry_rollback_total`              | Counter   | rollbacks | `reason`, `outcome`         | `services/template-registry` | `P12.N06`     | Audit rollback attempts and outcome after failed release/package activation. |
| `pillar_dar_upload_bytes`                              | Histogram | bytes     | `package_class`             | `services/template-registry` | `P12.N03`     | Capacity planning for artifact storage and upload limits.                    |

## 10. Search/export metrics

| Name                                       | Type      | Unit      | Labels                            | Emitting service          | Owning ticket | Use case                                                              |
| ------------------------------------------ | --------- | --------- | --------------------------------- | ------------------------- | ------------- | --------------------------------------------------------------------- |
| `pillar_search_index_lag_seconds`          | Histogram | seconds   | `index`, `tenant_class`           | `services/search-indexer` | `P11.M02`     | Measure search freshness relative to projection watermark.            |
| `pillar_search_query_duration_seconds`     | Histogram | seconds   | `index`, `query_class`, `outcome` | `services/search-indexer` | `P11.M03`     | Track search latency and slow query classes without raw query labels. |
| `pillar_export_job_duration_seconds`       | Histogram | seconds   | `format`, `outcome`               | `services/export-worker`  | `P11.M04`     | Measure export job completion latency and timeout rate.               |
| `pillar_export_blob_upload_failures_total` | Counter   | failures  | `store`, `reason`                 | `services/export-worker`  | `P11.M05`     | Detect object-storage failures during export package upload.          |
| `pillar_search_index_documents_total`      | Counter   | documents | `index`, `outcome`                | `services/search-indexer` | `P11.M02`     | Count indexed, skipped, and failed documents.                         |
| `pillar_search_index_backlog`              | Gauge     | documents | `index`, `shard`                  | `services/search-indexer` | `P11.M02`     | Alert on backlog before freshness SLO breach.                         |
| `pillar_export_jobs_total`                 | Counter   | jobs      | `format`, `outcome`               | `services/export-worker`  | `P11.M04`     | Count export submissions and terminal outcomes by format.             |
| `pillar_export_job_queue_depth`            | Gauge     | jobs      | `format`, `priority`              | `services/export-worker`  | `P11.M04`     | Capacity planning and backlog alerting for export workers.            |
| `pillar_export_bytes_total`                | Counter   | bytes     | `format`, `object_class`          | `services/export-worker`  | `P11.M05`     | Track export volume for capacity and billing reconciliation.          |

## 11. Usage metering / billing metrics

| Name                                     | Type      | Unit     | Labels                     | Emitting service       | Owning ticket | Use case                                                                    |
| ---------------------------------------- | --------- | -------- | -------------------------- | ---------------------- | ------------- | --------------------------------------------------------------------------- |
| `pillar_usage_events_emitted_total`      | Counter   | events   | `event_type`, `tenant_id`  | `services/usage-meter` | `P14.Q02`     | Count billable usage events emitted from auditable source events.           |
| `pillar_usage_rollup_duration_seconds`   | Histogram | seconds  | `rollup_window`, `outcome` | `services/usage-meter` | `P14.Q03`     | Measure usage rollup latency during billing close.                          |
| `pillar_billing_invoices_total`          | Counter   | invoices | `outcome`                  | `services/usage-meter` | `P14.Q04`     | Track invoice creation, posting, cancellation, and failure classification.  |
| `pillar_billing_api_failures_total`       | Counter   | failures | `operation`, `reason`      | `services/usage-meter` | `P14.Q06`     | Detect billing dependency failures without storing customer payment details. |
| `pillar_usage_events_expected_total`     | Counter   | events   | `event_type`, `source`     | `services/usage-meter` | `P14.Q02`     | Denominator for usage emission completeness.                                |
| `pillar_usage_reconciliation_diff_total` | Counter   | diffs    | `event_type`, `class`      | `services/usage-meter` | `P14.Q07`     | Find missing, duplicate, or mispriced usage records before invoice close.   |
| `pillar_billing_close_age_seconds`       | Gauge     | seconds  | `billing_period`, `state`  | `services/usage-meter` | `P14.Q08`     | Alert when billing close remains open past policy deadline.                 |
| `pillar_billing_invoice_amount_cents`    | Histogram | cents    | `currency`, `tenant_tier`  | `services/usage-meter` | `P14.Q04`     | Financial monitoring using tier/currency buckets without tenant identity.   |

## 12. Database / migration metrics

| Name                                | Type      | Unit        | Labels                | Emitting service          | Owning ticket | Use case                                                           |
| ----------------------------------- | --------- | ----------- | --------------------- | ------------------------- | ------------- | ------------------------------------------------------------------ |
| `pillar_migrator_runs_total`        | Counter   | runs        | `outcome`             | `services/migrator`       | `P9.J03`      | Count migration executions and failures across release hooks.      |
| `pillar_db_connections`             | Gauge     | connections | `role`, `state`       | shared DB instrumentation | `P3.D02`      | Monitor active, idle, waiting, and failed DB pool connections.     |
| `pillar_db_query_duration_seconds`  | Histogram | seconds     | `role`, `query_class` | shared DB instrumentation | `P3.D02`      | Identify slow projection, API, audit, and export query classes.    |
| `pillar_db_partition_count`         | Gauge     | partitions  | `table`               | `services/migrator`       | `P3.D04`      | Alert on partition growth and retention job drift.                 |
| `pillar_migrator_duration_seconds`  | Histogram | seconds     | `range`, `outcome`    | `services/migrator`       | `P9.J03`      | Time migration ranges and identify rollback-prone migrations.      |
| `pillar_db_deadlocks_total`         | Counter   | deadlocks   | `role`, `query_class` | shared DB instrumentation | `P3.D02`      | Detect concurrency bugs and transaction-order regressions.         |
| `pillar_db_replication_lag_seconds` | Gauge     | seconds     | `replica_role`        | shared DB instrumentation | `P9.J03`      | Alert when read replicas or backup targets lag beyond policy.      |
| `pillar_db_backup_age_seconds`      | Gauge     | seconds     | `backup_class`        | `services/migrator`       | `P10.L05`     | Ensure backup freshness before destructive operations or restores. |

## 13. Security metrics (auth, key, rate limit)

| Name                                       | Type    | Unit        | Labels                   | Emitting service         | Owning ticket | Use case                                                                               |
| ------------------------------------------ | ------- | ----------- | ------------------------ | ------------------------ | ------------- | -------------------------------------------------------------------------------------- |
| `pillar_api_key_revocations_total`         | Counter | revocations | `reason`, `actor_type`   | `apps/api`               | `P8.K02`      | Audit key revocations, compromise response, and customer/admin actions.                |
| `pillar_secret_rotation_age_seconds`       | Gauge   | seconds     | `kind`                   | `apps/api`, `services/*` | `P8.K06`      | Alert before API, webhook, DB, participant, and vendor secrets exceed rotation policy. |
| `pillar_image_scan_findings`               | Gauge   | findings    | `severity`               | CI/release scanner       | `P8.K10`      | Block releases with unresolved critical/high findings.                                 |
| `pillar_auth_token_issued_total`           | Counter | tokens      | `grant_type`, `outcome`  | `apps/api`               | `P8.K02`      | Monitor token issuance, denial, and auth service degradation.                          |
| `pillar_auth_scope_denials_total`          | Counter | denials     | `scope`, `route`         | `apps/api`               | `P8.K02`      | Detect least-privilege gaps and attempted privilege escalation.                        |
| `pillar_rate_limit_decisions_total`        | Counter | decisions   | `bucket`, `decision`     | `apps/api`               | `P8.K05`      | Measure allow/throttle/block decisions for overload protection.                        |
| `pillar_rate_limit_overflow_total`         | Counter | overflows   | `bucket`, `result`       | `apps/api`               | `P8.K05`      | Detect downstream pressure not absorbed by configured limits.                          |
| `pillar_audit_trace_total`                 | Counter | traces      | `result`, `object_class` | `apps/api`, `services/*` | `P8.K07`      | Count complete/missing trace spines for regulated operations.                          |
| `pillar_security_policy_evaluations_total` | Counter | evaluations | `policy`, `decision`     | `apps/api`               | `P8.K09`      | Monitor runtime policy decisions and deny spikes.                                      |
| `pillar_secret_load_failures_total`        | Counter | failures    | `kind`, `reason`         | `apps/api`, `services/*` | `P8.K06`      | Detect broken secret references, KMS/Vault outages, and bad mounts.                    |

## 14. Customer-facing metrics (exposed via /v1 or dashboard)

Customer-facing metrics are derived views exposed through Workbench/dashboard or support APIs. They MUST aggregate or bucket internal dimensions and MUST NOT expose raw Canton internals, raw participant endpoints, secret state, raw URLs, or other customers' data.

| Name                                           | Type    | Unit    | Labels                             | Emitting service              | Owning ticket | Use case                                                             |
| ---------------------------------------------- | ------- | ------- | ---------------------------------- | ----------------------------- | ------------- | -------------------------------------------------------------------- |
| `pillar_customer_api_success_ratio`            | Gauge   | ratio   | `tenant_id`, `route_class`         | `apps/api`                    | `P13.O06`     | Dashboard view of tenant API health over fixed windows.              |
| `pillar_customer_projection_freshness_seconds` | Gauge   | seconds | `tenant_id`, `object_class`        | `apps/api`                    | `P13.O06`     | Show whether balances, holdings, events, and search are fresh.       |
| `pillar_customer_webhook_success_ratio`        | Gauge   | ratio   | `tenant_id`, `endpoint`            | `services/webhook-dispatcher` | `P13.O06`     | Customer dashboard health for configured webhook endpoints.          |
| `pillar_customer_webhook_backlog`              | Gauge   | events  | `tenant_id`, `endpoint`            | `services/webhook-dispatcher` | `P13.O06`     | Show customer-actionable pending webhook deliveries.                 |
| `pillar_customer_usage_events_total`           | Counter | events  | `tenant_id`, `event_type`          | `services/usage-meter`        | `P14.Q02`     | Tenant-visible usage event count for billing transparency.           |
| `pillar_customer_export_jobs_total`            | Counter | jobs    | `tenant_id`, `format`, `outcome`   | `services/export-worker`      | `P11.M04`     | Customer-facing export job state and completion history.             |
| `pillar_customer_onboarding_steps_total`       | Counter | steps   | `tenant_id`, `step`, `outcome`     | `apps/dashboard`              | `P13.O03`     | Track onboarding progress without recording form values.             |
| `pillar_customer_sandbox_runs_total`           | Counter | runs    | `tenant_id`, `scenario`, `outcome` | `apps/workbench`              | `P7.I06`      | Surface sandbox validation success/failure for developer onboarding. |

Exposure rules:

| Rule                | Requirement                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Aggregation         | Customer-facing metrics use fixed windows or current-state gauges, never raw event streams.                                            |
| Tenant isolation    | A request scoped to tenant A can only return tenant A rows.                                                                            |
| Canton invisibility | Fields use public object classes and health concepts; no `party_id`, `contract_id`, raw `offset`, synchronizer ID, or participant URL. |
| Support parity      | Support tooling may resolve customer-facing metrics to internal traces only in privileged audit contexts.                              |
| Retention           | Customer-facing views obey §16 retention and product contract terms.                                                                   |

## 15. Cardinality budget

### 15.1 Approved elevated-cardinality metrics

| Metric                                  | Budget tier | Max active series per env | Cardinality driver                               | Owning ticket | Required control                                      |
| --------------------------------------- | ----------- | ------------------------: | ------------------------------------------------ | ------------- | ----------------------------------------------------- |
| `pillar_api_requests_total`             | Exceptional |                    25,000 | `tenant_id` x templated routes x status x method | `P2.C02`      | Route allowlist, tenant cap, 4xx sampling dashboards. |
| `pillar_api_request_duration_seconds`   | Elevated    |                     5,000 | route x status x tier x histogram buckets        | `P2.C02`      | No `tenant_id`; route templates only.                 |
| `pillar_usage_events_emitted_total`     | Exceptional |                    25,000 | `tenant_id` x event type                         | `P14.Q02`     | Event type registry and inactive tenant expiry.       |
| `pillar_customer_*`                     | Exceptional |                    25,000 | `tenant_id` x customer dimensions                | `P13.O06`     | Only exported through tenant-isolated dashboards.     |
| `pillar_webhook_endpoint_health`        | Elevated    |                     5,000 | endpoint key x status                            | `P6.H05`      | Endpoint key is internal bounded ID, no URL.          |
| `pillar_customer_webhook_success_ratio` | Exceptional |                    25,000 | tenant x endpoint                                | `P13.O06`     | Per-tenant endpoint cap from API contract.            |
| `pillar_db_query_duration_seconds`      | Standard    |                       500 | role x query class x buckets                     | `P3.D02`      | Query class registry; no SQL labels.                  |
| `pillar_projection_lag_seconds`         | Standard    |                       500 | projector x tenant class x buckets               | `P5.G05`      | Use `tenant_class`, not `tenant_id`.                  |

### 15.2 Forbidden labels by example

| Forbidden label                  | Why                                      | Replacement                                              |
| -------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| `request_id`                     | Unbounded and high churn.                | Trace exemplar or structured log field.                  |
| `operation_id`                   | Unbounded public object ID.              | Trace exemplar, audit search, or `object_class`.         |
| `command_id`                     | Unbounded internal identifier.           | `command_type`, `outcome`, trace span.                   |
| `event_id`                       | Unbounded public object ID.              | `event_type`, `outcome`.                                 |
| `tenant_name`                    | PII/commercial sensitive.                | `tenant_id` only when approved, otherwise `tenant_tier`. |
| `email`, `phone`, `tax_id`       | PII.                                     | None; never label.                                       |
| `url`                            | PII/secret/cardinality risk.             | `endpoint` stable key or `endpoint_tier`.                |
| `exception`                      | Unbounded and may contain secrets.       | `reason` bounded enum.                                   |
| `sql`                            | Unbounded and may expose schema details. | `query_class`.                                           |
| `metadata_key`, `metadata_value` | User-controlled and may contain PII.     | `pattern` or rejection class.                            |

### 15.3 Review gate

| Gate                       | Requirement                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------- |
| New metric                 | Add a row to this catalog before implementation.                                   |
| New label                  | Prove bounded cardinality, privacy safety, and dashboard/alert consumer.           |
| New per-tenant metric      | SRE lead approval plus retention cost review.                                      |
| New histogram              | Use bucket class from §1.5 or document an exception in the owning ticket.          |
| New customer-facing metric | Product/API owner approval and tenant-isolation test.                              |
| Removal or rename          | Keep recording-rule compatibility or migration window documented in release notes. |

### 15.4 Series calculation rules

| Rule             | Formula                                                             | Required action                                                  |
| ---------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Counter series   | `base_labels x product(explicit label values)`                      | Estimate from configured enums before rollout.                   |
| Histogram series | Counter series multiplied by bucket count plus `_sum` and `_count`. | Histogram labels require stricter review than counters.          |
| Gauge series     | Current active dimension combinations only.                         | Expire stale label combinations after configured TTL.            |
| Tenant series    | Active tenants only, not deleted or suspended tenants.              | Remove tenant-scoped series after deletion/anonymization window. |
| Endpoint series  | Configured endpoint cap per tenant multiplied by status enums.      | Reject endpoint creation that would exceed budget.               |
| Route series     | Templated route registry multiplied by method/status enums.         | New route requires observability budget review.                  |
| Query series     | Query class registry only.                                          | New SQL path must map to existing or reviewed class.             |
| Worker series    | Configured worker/shard count.                                      | Autoscaling max replicas must be included in budget.             |

### 15.5 Cardinality enforcement

| Enforcement point | Mechanism                                                                      | Failure behavior                                                            |
| ----------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Code review       | Metric registry diff in owning ticket.                                         | PR blocked until catalog row and label budget exist.                        |
| CI                | Static metric-name and label allowlist check.                                  | Build fails on unknown metric or unknown label key.                         |
| Runtime           | SDK wrapper rejects unregistered dynamic label keys.                           | Metric emission drops the bad label and increments an internal self-metric. |
| Prometheus        | Relabel rules drop forbidden labels at scrape boundary.                        | Alert `PIL-METRICS-LABEL-DROP-P2` opens corrective ticket.                  |
| Dashboard review  | Grafana panel query linter checks high-cardinality joins.                      | Dashboard change blocked.                                                   |
| SLO rule review   | Recording rules must use approved metric families.                             | SLO rule change blocked until catalog update.                               |
| Incident review   | New useful ad hoc metrics from incident become catalog entries or are deleted. | Owner assigned in post-incident action.                                     |

### 15.6 Label value registries

| Label       | Registry owner      | Allowed source                                                      |
| ----------- | ------------------- | ------------------------------------------------------------------- |
| `method`    | API owner           | HTTP methods accepted by `/v1`.                                     |
| `route`     | API owner           | OpenAPI templated paths from `packages/api-contracts`.              |
| `status`    | API owner           | HTTP status code or class enumerations.                             |
| `outcome`   | Runtime owner       | Owning phase terminal-state enum.                                   |
| `reason`    | Runtime owner       | Bounded error-class enum reviewed with security.                    |
| `bucket`    | SRE owner           | Rate-limit and capacity bucket registry.                            |
| `projector` | Projection owner    | Projection worker names.                                            |
| `endpoint`  | Webhook owner       | Stable endpoint key generated by config service.                    |
| `vendor`    | Compliance owner    | Approved provider alias registry.                                   |
| `format`    | Data products owner | `csv`, `jsonl`, `parquet`, and approved report formats.             |
| `role`      | DB owner            | `api`, `projection`, `reconciler`, `export`, `billing`, `migrator`. |
| `severity`  | Security owner      | `critical`, `high`, `medium`, `low`, `info`.                        |

### 15.7 Cardinality incident response

| Symptom                     | First action                                            | Recovery rule                                                           |
| --------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Prometheus memory spike     | Identify top series by metric and label.                | Drop offending dynamic label at scrape boundary before scaling storage. |
| Unexpected tenant explosion | Check deleted/suspended tenant expiry and abuse.        | Preserve aggregate counters; expire stale tenant series.                |
| Route cardinality spike     | Verify route templating did not regress to raw paths.   | Roll back route-label change or patch templating.                       |
| Endpoint cardinality spike  | Check customer endpoint cap and endpoint-key lifecycle. | Disable excess endpoint metrics, not deliveries.                        |
| Query cardinality spike     | Confirm raw SQL was not emitted.                        | Replace with `query_class`; preserve logs/traces for SQL detail.        |
| Vendor/reason explosion     | Check exception-to-reason mapping.                      | Collapse to bounded enum and open corrective ticket.                    |

## 16. Retention policy

| Metric class                    |                        Raw retention |               Downsampled retention | Owner                                  | Notes                                                                    |
| ------------------------------- | -----------------------------------: | ----------------------------------: | -------------------------------------- | ------------------------------------------------------------------------ |
| API, auth, rate limit           |                              30 days |                           13 months | `api-runtime`, `sre-platform`          | Supports SLO windows, incident review, and customer usage trend.         |
| Ledger command, participant     |                              90 days |        7 years for audit aggregates | `ledger-runtime`                       | Command correctness incidents require longer evidence retention.         |
| Projection, PQS, reconciliation |                              90 days |  7 years for correctness aggregates | `projection-runtime`                   | Diff counters and rebuild evidence align to audit requirements.          |
| Webhook                         |                              90 days |                           13 months | `webhook-runtime`                      | DLQ and delivery aggregates support customer disputes and replay review. |
| Workflow                        |                              30 days |                           13 months | `workflow-runtime`                     | Queue/lease metrics are operational, not audit source of truth.          |
| Compliance/security             |                             180 days |                             7 years | `security-compliance`                  | Regulatory and incident evidence retention.                              |
| Template registry/DAR           |                             180 days |                             7 years | `ledger-runtime`                       | Release/package evidence must outlive active package support.            |
| Search/export                   |                              90 days | 7 years for export audit aggregates | `data-products`                        | Export evidence may support compliance production.                       |
| Usage/billing                   |                             180 days |                             7 years | `billing-runtime`                      | Billing disputes and revenue recognition.                                |
| DB/migration                    |                              90 days |                           13 months | `sre-platform`                         | Release and capacity evidence.                                           |
| Image scan                      |                             180 days |        7 years for release evidence | `security-compliance`                  | Tied to signed release provenance.                                       |
| Customer-facing derived views   | Contract-specific, default 13 months |                   Contract-specific | `developer-experience`, owning runtime | Must not exceed privacy or customer contract terms.                      |

Retention rules:

| Rule               | Requirement                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Counters           | Preserve counter resets; do not backfill by editing series.                                                                                   |
| Histograms         | Retain bucket series long enough for SLO windows; downsample only through recording rules that preserve quantile inputs needed by dashboards. |
| Exemplars          | Retain exemplars for 7-30 days depending on trace backend cost; traces carry identifiers, metrics labels do not.                              |
| Incident snapshots | Export immutable dashboard and query snapshots for SEV1/SEV2 incidents before retention expiry.                                               |
| Legal hold         | Compliance lead may freeze relevant metric exports and evidence bundles without increasing live Prometheus retention.                         |
| Tenant deletion    | Customer-facing per-tenant derived metrics follow deletion/anonymization policy; aggregate platform metrics remain anonymized.                |
| Self-hosted        | Self-hosted customers may choose shorter retention, but release/SLO dashboards must declare deviation from GA defaults.                       |
