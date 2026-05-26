# Phase 10 — GA Hardening

> Prove Pillar is ready for general availability by validating SLOs, chaos recovery, performance headroom, dashboards, runbooks, status semantics, and release readiness without changing the stable `/v1` product contract.

## 1. Executive Summary

Phase 10 maps to M10 GA Hardening in the implementation plan: **chaos, perf, docs, runbooks** with exit criteria that **SLO and recovery tests pass**. It is the final release-readiness phase after the Helm/CI/CD release stack is installed.

Primary architecture sources:

| Source                                                                                   | Phase 10 dependency                                                                                |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [22 Pillar Observability / SRE / Runbooks](../Architecture/22_Pillar%20Observability.md) | SLOs, metrics, dashboards, alerts, incident runbooks, DR evidence                                  |
| [18 Deployment / Enterprise Architecture](../Architecture/18_Deployment.md)              | deployment-neutral `/v1`, observability namespace, control/data plane separation, release topology |
| [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)                    | M10 scope, Test Strategy chaos/perf layers, Agent-ready Release checklist                          |

Phase 10 is not a feature expansion phase. It is a proof phase:

| Principle                                             | GA interpretation                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Canton Ledger is the source of truth                  | every chaos/perf/rebuild test reconciles against ledger-derived state            |
| Pillar DB stores only Projection / Audit / Config     | no source-of-truth state is introduced for hardening                             |
| External API must be developer-friendly and Canton-invisible | `/v1` remains stable and public status is customer-readable                      |
| Internal runtime must be Canton-native                | command/completion/update/projection traces are observable                       |
| Operations must be ledger-traceable                   | incidents and runbook actions retain request-to-ledger-to-webhook trace evidence |
| Balance/Holding-first, not contract-first             | SLOs focus on API, projection freshness, webhook delivery, reconciliation        |
| Intent-first, not transaction-first                   | acceptance success and command outcome are measured separately                   |
| Webhook-first for async workflow                      | webhook delivery success, DLQ, replay, and fan-out are GA gates                  |
| API grammar must be polished from day one         | no GA-only grammar changes; only status semantics are clarified                  |
| Deployment model changes, API experience does not     | Hosted/Dedicated/Hybrid/self-hosted expose the same `/v1` behavior               |

GA hardening delivers:

| Deliverable                    | Output                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Chaos harness                  | participant restart, network loss, DB restart, projection corruption injection                                         |
| Performance harness            | k6 API throughput, projection lag under load, webhook fan-out volume                                                   |
| Observability stack validation | OTel collector, Prometheus, Grafana, Alertmanager, dashboard provisioning                                              |
| SLO catalog                    | API p99 latency, intent acceptance success, projection lag p99, webhook delivery success p99, reconciliation diff rate |
| Runbook set                    | participant unavailable, projection rebuild, DAR rollback, key rotation, mass webhook DLQ drain                        |
| Status page semantics          | customer-facing normal/degraded/read-only/incident/update/resolved states                                              |
| GA readiness review            | release artifacts, dashboards, runbooks, changelog, SDK/CLI publishing checklist signed off                            |

## 2. Goals / Non-goals

### Goals

| Goal                        | Concrete Phase 10 output                                                                          | Source                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Validate SLOs               | SLO definitions, dashboards, alert bindings, burn-rate thresholds                                 | [22 Observability](../Architecture/22_Pillar%20Observability.md)                              |
| Prove recovery              | chaos suite and runbook rehearsals for P0/P1 incidents                                            | [23 Test Strategy](../Architecture/23_Implementation%20Plan.md#test-strategy)                 |
| Prove capacity              | k6 throughput, projection-lag, webhook fan-out load results                                       | [23 Test Strategy](../Architecture/23_Implementation%20Plan.md#test-strategy)                 |
| Install operator visibility | Grafana dashboards for executive SLO, API, command, projection, webhook, participant, DR/security | [22 Dashboards](../Architecture/22_Pillar%20Observability.md)                                 |
| Freeze public contract      | reaffirm `/v1` stability and deployment-invariant API behavior                                    | [18 Deployment](../Architecture/18_Deployment.md)                                             |
| Complete release readiness  | mirror Agent-ready Release checklist and require sign-off                                         | [23 Agent-ready Checklist](../Architecture/23_Implementation%20Plan.md#agent-ready-checklist) |

### Non-goals

| Non-goal                               | Reason                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| Add new public API resources           | GA hardening must not expand the customer integration surface.                  |
| Introduce new public objects           | Architecture already defines customer objects; this phase validates them.       |
| Add DB source-of-truth state           | Pillar DB remains Projection / Audit / Config only.                             |
| Hide SLO misses by relaxing metrics    | GA readiness is blocked by unresolved SLO or recovery failures.                 |
| Replace runbooks with tribal knowledge | Runbooks must be published, rehearsed, and reviewable.                          |
| Promise webhook exactly-once delivery  | Contract remains at-least-once, signed, retryable, replayable.                  |
| Promise 100% SLO                       | Error-budget model is explicit; 100% is not the operating target.               |
| Change deployment grammar per topology | Hosted, Dedicated, Hybrid, and Fully self-hosted expose the same `/v1` grammar. |

### GA entry prerequisites

| Prerequisite              | Required state                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------ |
| Phase 9 release stack     | Helm chart, release workflow, DAR upload job, migration job, promotion gates working |
| Security/compliance phase | red-team pass, pen-test pass, compliance adapter sign-off available for review       |
| Core runtime              | API, ledger command, projection, webhook, SDK/CLI, Workbench implemented             |
| Observability foundation  | metrics/logs/traces emitted by services and Canton participant scrape configured     |

## 3. Architecture

Phase 10 hardens the already-built deployment. It does not add a new runtime plane; it validates and operationalizes the Observability/SRE plane described in [22 Observability](../Architecture/22_Pillar%20Observability.md) and deployed through the `pillar-observability` namespace described in [18 Deployment](../Architecture/18_Deployment.md).

### 3.1 GA hardening topology

```text
Customer / SDK / CLI / Workbench
        |
        v
/v1 API Gateway + API Service
        |
        +--> Idempotency / Audit / Intent Orchestrator
        |
        +--> Ledger Executor --> Canton Participant --> Synchronizer
        |
        +--> Projection Worker --> Projection DB --> Event Builder
        |
        +--> Webhook Dispatcher --> Customer Endpoints
        |
        v
Observability / SRE Plane
  - OpenTelemetry Collector
  - Prometheus / OpenMetrics scrape
  - Grafana dashboards
  - Alertmanager / paging routes
  - Loki / structured logs
  - Tempo / traces
  - Runbooks / incident evidence
  - Status page publisher
  - Chaos and performance harnesses
```

### 3.2 Observability stack

| Component               | Phase 10 responsibility                           | Inputs                                                                             | Outputs                                                                               | GA acceptance                                                                |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| OpenTelemetry Collector | receive, normalize, and route traces/metrics/logs | API service, ledger-command, projection-worker, webhook-dispatcher, Canton adapter | OTLP to tracing backend, metrics pipeline, log enrichment                             | API request trace links to ledger command and webhook event where applicable |
| Prometheus              | scrape Pillar and Canton metrics                  | service `/metrics`, Canton OpenMetrics endpoint, exporters                         | time series for SLOs and alerts                                                       | scrape success for all required targets in staging/prod                      |
| Grafana                 | provision dashboards                              | Prometheus, logs, traces                                                           | executive SLO, API, command, projection, webhook, participant, DR/security dashboards | dashboards live and linked from release readiness packet                     |
| Alertmanager            | route severity-based alerts                       | Prometheus alert rules                                                             | P0/P1/P2 pages, customer-advisory notifications                                       | each P0/P1 alert maps to a runbook and on-call route                         |
| Loki / log backend      | retain structured logs                            | JSON logs with request/command/event correlation                                   | searchable operational history                                                        | no raw contract payload in production logs                                   |
| Tempo / trace backend   | retain distributed traces                         | OTel spans                                                                         | request-to-ledger-to-webhook trace                                                    | sampled traces prove command path propagation                                |
| Status publisher        | expose customer-facing state                      | incident severity, affected component, SLO impact                                  | public status page updates                                                            | customer-visible degradation reflected within policy                         |

### 3.3 Required metric families

```text
# API / integration
pillar_api_requests_total{endpoint,method,status,api_version,account_tier}
pillar_api_request_duration_seconds_bucket{endpoint,method,api_version}
pillar_api_platform_errors_total{endpoint,code}
pillar_idempotency_replays_total{endpoint,result}
pillar_idempotency_conflicts_total{endpoint}

# Intent and command runtime
pillar_intent_acceptance_total{type,result}
pillar_command_submissions_total{participant_id,intent_type}
pillar_command_completions_total{participant_id,status}
pillar_command_completion_latency_seconds_bucket{participant_id,intent_type}
pillar_command_failure_rate{participant_id,intent_type}

# Projection
pillar_projection_lag_seconds{participant_id,stream}
pillar_projection_cursor_age_seconds{participant_id,stream}
pillar_projection_backlog_events{stream}
pillar_projection_reconciliation_mismatch_total{asset,account_tier}
pillar_projection_rebuild_duration_seconds_bucket{scope}

# Webhook
pillar_webhook_events_created_total{type,api_version}
pillar_webhook_delivery_attempts_total{endpoint_id,status_code_class}
pillar_webhook_first_attempt_latency_seconds_bucket{type}
pillar_webhook_delivery_latency_seconds_bucket{type}
pillar_webhook_outbox_depth{endpoint_id}
pillar_webhook_dlq_total{endpoint_id,reason}

# Participant health
pillar_participant_health{participant_id,state}
pillar_participant_synchronizer_connected{participant_id,synchronizer_id}
pillar_participant_synchronizer_unhealthy{participant_id,synchronizer_id}
pillar_participant_metrics_scrape_success{participant_id}

# DR / audit
pillar_backup_last_success_age_seconds{system}
pillar_backup_restore_drill_last_success_age_seconds
pillar_audit_hash_chain_gap_total
```

### 3.4 Grafana dashboard set

| Dashboard          | Required panels                                                                                                           | Primary users                  | Blocks GA if missing? |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------- |
| Executive SLO      | API availability, intent acceptance success, projection p99, webhook delivery p99, reconciliation diff rate, error budget | exec, incident commander       | yes                   |
| API / Integration  | latency p50/p95/p99, 4xx/5xx, idempotency replay/conflict, rate-limit pressure, top integration errors                    | SRE, support, customer success | yes                   |
| Canton Command     | submissions/completions, completion latency, failure code distribution, duplicate command count, route failovers          | SRE, ledger engineers          | yes                   |
| Projection         | lag by stream, cursor movement, applied events/sec, rebuild ETA, reconciliation mismatch                                  | SRE, projection owners         | yes                   |
| Webhook            | first-attempt latency, delivery latency, attempt failure by endpoint, DLQ by reason, retry depth, signature failures      | SRE, integration support       | yes                   |
| Participant Health | participant state, synchronizer health, Ledger API latency, scrape success, HA active/passive                             | SRE, deployment operators      | yes                   |
| DR / Backup        | backup age, PITR lag, restore drill, audit hash chain, cross-region lag                                                   | SRE, compliance                | yes                   |
| Security / Audit   | key rotations, auth failures, mTLS/JWT errors, audit gaps, privileged actions                                             | security, compliance           | yes                   |
| Capacity           | API CPU, DB CPU, queue depth, worker utilization, autoscaling headroom                                                    | SRE, platform                  | yes                   |

### 3.5 Alert rule set

| Severity | Alert                           | Condition                                          | Runbook                                  |
| -------- | ------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| P0       | API unavailable                 | 5xx ratio > 5% for 5m or availability burn > 10x   | API outage / latency surge               |
| P0       | No active participant           | all write-capable participants unavailable > 2m    | participant unavailable                  |
| P0       | Balance reconciliation mismatch | confirmed customer-visible mismatch                | projection rebuild / balance mismatch    |
| P0       | Projection stopped              | projection lag > 5m or cursor not moving > 3m      | projection rebuild                       |
| P1       | Command failure spike           | platform command failure > 5% for 10m              | command failure spike                    |
| P1       | Webhook platform failure        | dispatcher failure or outbox depth growing for 10m | mass webhook DLQ drain / webhook failure |
| P1       | Rate limit saturation           | global pressure > 95% or 429 ratio > 10% for 10m   | traffic surge                            |
| P1       | Audit gap                       | audit hash-chain gap or missing envelope           | audit integrity                          |
| P2       | Participant degraded            | synchronizer unhealthy or metrics scrape partial   | participant degraded                     |
| P2       | Backup stale                    | backup older than policy                           | backup/restore                           |
| P2       | Webhook endpoint noisy          | endpoint failure > 50% for 30m                     | customer advisory                        |

### 3.6 Chaos harness

The chaos harness must be deterministic enough for CI/staging and realistic enough for game-day rehearsal.

| Scenario                        | Injection                                                                              | Expected system behavior                                                                 | Recovery proof                                                                       | Invariant                               |
| ------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------- |
| Participant restart             | restart active participant pod/process during command flow                             | affected writes become delayed/read-only or fail over only when dedupe-safe              | completions reconciled, projection catches up, no unknown commands above threshold   | no duplicate ledger command             |
| Network loss                    | block API-to-participant or participant-to-synchronizer traffic                        | affected scope marked degraded/read-only; healthy scopes remain online                   | route restored, pending commands classified, status page updated if customer-visible | no command into isolated route          |
| DB restart                      | restart Postgres primary or managed DB failover during idempotent write and projection | API returns retry-safe errors or resumes after connection recovery; idempotency not lost | idempotency replay stable, projection cursor resumes, audit chain intact             | DB remains projection/audit/config only |
| Projection corruption injection | modify projection checksum or inject invalid cursor in staging fixture                 | reconciliation detects mismatch; affected reads/writes freeze                            | rebuild from ledger/state service; before/after evidence retained                    | ledger wins over projection             |
| Webhook dispatcher interruption | stop workers with queued events                                                        | events remain durable; retries resume without unsigned delivery                          | outbox drains; DLQ policy applied                                                    | events not lost                         |
| Alert path failure drill        | suppress one scrape target or route test alert                                         | missing telemetry is visible as an alert; on-call route receives synthetic page          | route verified and incident evidence recorded                                        | monitoring failure is observable        |

### 3.7 Performance harness

| Harness                   | Workload                                                                                                   | Measures                                                                 | Target evidence                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| k6 API throughput         | authenticated `/v1` read/write mix: balances, holdings, asset/account reads, issue/transfer/redeem intents | p50/p95/p99 latency, 5xx, 429, idempotency replay, CPU/DB/queue pressure | API p99 SLO satisfied under agreed GA load profile                |
| Projection lag under load | sustained ledger update stream from issue/transfer/hold/release/redeem scenarios                           | stream lag p99, cursor age, backlog events, rebuild ETA                  | projection p99 lag SLO satisfied and max threshold not breached   |
| Webhook fan-out volume    | high event rate across endpoints with success, timeout, 5xx, and TLS failures                              | first-attempt p99, eventual delivery success, retry depth, DLQ volume    | webhook p99 and success SLO satisfied; endpoint failures isolated |
| Reconciliation stress     | randomized ledger-derived balances vs projected balances during load                                       | mismatch count, diff rate, rebuild duration                              | diff rate below SLO and every injected mismatch detected          |
| Release rollback smoke    | deploy candidate then rollback chart/DAR in staging                                                        | time to rollback, command route pause, package registry state            | rollback runbook succeeds without changing `/v1` grammar          |

### 3.8 Release readiness architecture packet

```text
release-readiness/<version>/
  artifacts/
    dar-checksums.txt
    image-digests.txt
    helm-chart-version.txt
    sdk-cli-versions.txt
  evidence/
    chaos-results.md
    performance-results.md
    slo-dashboard-links.md
    alert-route-test.md
    runbook-review.md
    red-team-pen-test-signoff.md
    compliance-gdpr-data-residency.md
  decisions/
    ga-scope-freeze.md
    known-risks.md
    rollback-plan.md
```

The packet may live in the release system or Workbench evidence store; this phase defines the required contents, not a new customer object.

## 4. API / Object Model

No new public API resources, fields, objects, or version namespaces are introduced in Phase 10.

### 4.1 `/v1` GA stability contract

| Rule                   | GA requirement                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Namespace              | `/v1` remains the public namespace for GA.                                                                                     |
| Canton invisibility    | public responses expose no `contract_id`, `template_id`, participant offset, synchronizer id, or command internals by default. |
| Intent-first mutations | state-changing calls continue to create intents/operations rather than exposing ledger transactions.                           |
| Idempotency            | state-changing POSTs continue to require stable `Idempotency-Key` behavior.                                                    |
| Webhook-first async    | terminal state is delivered through event/webhook and readable event logs.                                                     |
| Version pinning        | account API version and webhook endpoint version remain independently pinned.                                                  |
| Deployment neutrality  | Hosted, Dedicated, Hybrid, Fully self-hosted use the same grammar and object semantics.                                        |
| Error object           | status/degraded responses use the existing standard error object; no ad hoc GA error shape.                                    |

### 4.2 Public status page semantics

The status page is customer-facing operational communication, not a new source of truth.

| Public state     | Meaning                                                                   | Customer-visible API behavior                                                                 | Trigger examples                                                                     |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `operational`    | SLOs within target; no active customer-impacting incident                 | normal reads/writes/webhooks                                                                  | all critical checks green                                                            |
| `degraded`       | one or more components impaired but core reads or writes remain available | increased latency, delayed processing, retry advisories                                       | participant degraded, projection lag under stale threshold, webhook retries elevated |
| `read_only`      | writes paused for affected scope; reads may remain available              | POST intent endpoints return retry-safe 503/delayed classification by existing error contract | participant unavailable, package route paused, synchronizer disconnected             |
| `partial_outage` | subset of accounts/assets/regions/endpoints unavailable                   | impacted scope disclosed; unaffected scopes normal                                            | tenant-isolated DB/participant issue                                                 |
| `major_outage`   | platform-wide customer impact                                             | broad API or webhook unavailability                                                           | API unavailable P0, no active participant for broad scope                            |
| `maintenance`    | planned maintenance with published window                                 | documented degradation only                                                                   | Helm/DAR rollout, DB maintenance, key rotation window                                |
| `resolved`       | incident mitigated and SLO stable for exit window                         | normal operations restored                                                                    | runbook exit criteria satisfied                                                      |

Status updates must include:

| Field            | Requirement                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| Components       | API, ledger command, projection, webhooks, Workbench/CLI, status page itself |
| Scope            | region, deployment model, affected accounts/assets if publishable            |
| Customer action  | retry guidance, webhook replay guidance, support escalation                  |
| Data correctness | explicit statement when balances/holdings are stale/unavailable              |
| Post-incident    | summary with customer-visible impact and remediation after review            |

### 4.3 Internal/admin surfaces

Phase 10 may validate existing admin/ops surfaces but must not create new public objects.

| Surface             | Allowed Phase 10 use                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Health endpoints    | validate `/health/live`, `/health/ready`, `/health/deep`, `/v1/status` behavior               |
| Workbench           | link dashboards, request logs, event logs, replay tools, version state                        |
| CLI                 | run `health`, `events`, `logs`, `replay`, `listen`, and release smoke commands if implemented |
| Admin runbook tools | execute existing projection rebuild, DAR rollback, key rotation, and DLQ drain commands       |

## 5. Internal Runtime

Phase 10 validates operational runtime behavior across SLOs, runbooks, dashboards, and release readiness.

### 5.1 SLO catalog

| SLO                            | SLI definition                                                                                      | Internal target                                                                                                       | Measurement window                                | Exclusions                                                                      | Dashboard                              | Alert                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------- |
| API p99 latency                | p99 `pillar_api_request_duration_seconds` for valid `/v1` requests by endpoint class                | write intent acceptance p99 < 1s; read balance/holding p99 < 800ms                                                    | rolling 30d plus 10m/1h burn views                | customer 4xx, auth failure, quota 429                                           | Executive SLO; API / Integration       | API latency P1; availability burn        |
| Intent acceptance success rate | accepted intent requests not failing due to Pillar platform error / valid intent requests           | 99.95% / 30d                                                                                                          | rolling 30d                                       | business validation failures, insufficient balance, client idempotency conflict | Executive SLO; Canton Command          | command failure spike; API unavailable   |
| Projection lag p99             | p99 ledger update to customer-visible projection applied time                                       | p99 < 30s, p95 < 5s, max < 120s                                                                                       | rolling 30d plus 5m incident window               | planned paused routes declared as maintenance                                   | Executive SLO; Projection              | projection stopped; balance mismatch     |
| Webhook delivery success p99   | deliverable events reaching 2xx or DLQ classification within policy, plus p99 first-attempt latency | first attempt p99 < 60s; eventual delivery 99.99% < 24h                                                               | rolling 30d                                       | customer endpoint outage counted separately from platform failure               | Executive SLO; Webhook                 | webhook platform failure; endpoint noisy |
| Reconciliation diff rate       | confirmed ledger-vs-projection balance/holding diffs / reconciled objects                           | 0 customer-visible confirmed mismatches; diff rate below agreed internal threshold for non-visible staging injections | every scheduled reconciliation and post-chaos run | deliberately injected staging corruption after detection                        | Executive SLO; Projection; DR/Security | balance reconciliation mismatch          |

### 5.2 Error budget policy

| Budget burn                 | Operational action                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------- |
| 50% consumed in rolling 30d | risky deploys require incident commander approval                                       |
| 75% consumed                | non-critical release freeze for affected component                                      |
| 100% consumed               | production-affecting changes stop until incident review and corrective actions complete |
| burn > 10x short-window     | page P0/P1 depending on customer impact                                                 |

### 5.3 Runbook list

| Runbook                  | Incident class                                                                   | Mandatory actions                                                                                                                                              | Exit criteria                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Participant unavailable  | `pillar_participant_health=unavailable`, command submissions fail                | scope accounts/assets/participants; fail over only if dedupe-safe; otherwise read-only/delayed; never reuse submission id; reconcile pending commands          | projection lag normal, completions normal, no unknown in-flight commands above threshold |
| Projection rebuild       | lag, cursor corruption, reconciliation mismatch, projection corruption injection | stop final-state webhooks for affected scope; mark stale reads; rebuild from ledger/state service; preserve before/after evidence                              | lag under target and reconciliation passes twice                                         |
| DAR rollback             | package/version mismatch, command rejection spike after release                  | pause affected package route; stop command runtime consuming new work; roll back package registry/chart/DAR per release workflow; verify command compatibility | command failures below threshold and API grammar unchanged                               |
| Key rotation             | API key, webhook secret, JWT/mTLS, or KMS rotation                               | issue/activate replacement, dual-validate during window if supported, revoke old key, test webhook signatures, update audit evidence                           | no unsigned event trusted, auth failures normal, audit trail complete                    |
| Mass webhook DLQ drain   | platform dispatcher incident or customer-wide replay campaign                    | classify endpoint vs platform failure; throttle replay; preserve event order metadata; replay from outbox/DLQ; monitor retry storm                             | outbox decreasing, DLQ drained or customer-notified, no duplicate event IDs created      |
| API 5xx / latency surge  | 5xx spike or p99 breach                                                          | classify client/DB/participant/deploy; rollback or degraded mode; protect idempotency and command dedupe                                                       | 15 minutes stable SLO and audit/idempotency/command trace gap check passes               |
| Rate limit traffic surge | pressure > 95%, 429 spike, command queue growth                                  | enforce quota, isolate abusive keys, reserve capacity for projection/webhook, customer advisory                                                                | pressure < 80% for 30 minutes                                                            |
| Backup / restore failure | stale backup or failed drill                                                     | trigger manual backup, block risky deploys, verify WAL/object storage/KMS, restore in isolated env                                                             | backup success and restore drill recorded                                                |

### 5.4 Traceability requirement

Every runbook execution must retain trace evidence:

```text
incident_id
  -> status page update id
  -> alert fingerprint
  -> dashboard snapshot link
  -> affected account/asset/participant scope
  -> request_id / idempotency_key_hash where applicable
  -> intent_id / command_id / submission_id where applicable
  -> completion / update_id / projection cursor evidence
  -> event_id / webhook_delivery_id where applicable
  -> operator action audit entries
```

### 5.5 GA runtime invariants

| Runtime path        | GA invariant                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| API acceptance      | accepted means intent accepted, not ledger finality                       |
| Command submission  | `command_id` is semantic and stable; `submission_id` is attempt-specific  |
| Completion tracking | unknown completions are reconciled before incident close                  |
| Projection          | projection is rebuildable from ledger and linked to source update         |
| Webhook             | events are created from projected ledger state, not optimistic API state  |
| Incident response   | no mitigation may create duplicate ledger commands or hide stale balances |

## 6. DB Schema

No schema expansion is planned for Phase 10. GA hardening uses existing Projection / Audit / Config tables from the architecture.

### 6.1 Allowed DB work

| Category                                              | Allowed?    | Notes                                                                    |
| ----------------------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| New source-of-truth business table                    | no          | violates Pillar DB invariant                                             |
| New public object persistence                         | no          | Phase 10 adds no public API/object model                                 |
| Index tuning                                          | yes         | only for measured SLO/perf bottlenecks                                   |
| Query-plan fixes                                      | yes         | only when backed by perf evidence                                        |
| Dashboard acceleration using existing snapshot tables | yes         | `participant_health_snapshot`, `projection_lag_snapshot` already defined |
| Audit evidence retention adjustment                   | yes         | if within retention/compliance policy                                    |
| Migration for hardening-only indexes                  | conditional | must be backward-compatible, reversible, and verified by migration gates |

### 6.2 Existing tables used by Phase 10

| Table                            | Phase 10 use                                        |
| -------------------------------- | --------------------------------------------------- |
| `projection_cursors`             | lag, cursor movement, rebuild starting point        |
| `balance_projection`             | reconciliation and stale-read detection             |
| `holding_projection`             | reconciliation and stale-read detection             |
| `intent_projection`              | intent status SLO and customer-visible state        |
| `event_projection`               | event list validation and webhook creation source   |
| `participant_health_snapshot`    | participant dashboards and status semantics         |
| `projection_lag_snapshot`        | SLO dashboards and alert acceleration               |
| `api_request_audit`              | API latency/availability investigations             |
| `idempotency_audit`              | replay/conflict proof during DB restart chaos       |
| `command_audit`                  | participant restart and DAR rollback reconciliation |
| `ledger_update_audit`            | ledger-to-projection trace evidence                 |
| `webhook_event_audit`            | event creation proof                                |
| `webhook_delivery_attempt_audit` | DLQ drain and delivery SLO proof                    |
| `security_audit`                 | red-team, key rotation, privileged action evidence  |
| `audit_hash_chain`               | audit integrity gate                                |
| `incident_timeline`              | runbook action and release readiness evidence       |
| `backup_restore_drill_audit`     | DR readiness proof                                  |

### 6.3 Index tuning candidates

Index changes are acceptable only when a measured GA harness run identifies a bottleneck.

```sql
-- examples only; exact migrations require measured query plans
-- projection lag / rebuild scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projection_cursors_stream_participant
  ON projection_cursors (stream_name, participant_id, applied_at);

-- API SLO investigation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_request_audit_created_endpoint_status
  ON api_request_audit (created_at, path, status);

-- webhook DLQ drain / replay
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_delivery_attempt_event_status_next_retry
  ON webhook_delivery_attempt_audit (event_id, status, next_retry_at);
```

These are not mandated migrations. Section 10 tracks whether GA load evidence requires any index-only release candidate.

## 7. Failure Modes

### 7.1 GA hardening risks

| Risk                                       | Cause                                                                               | Symptom                                                   | Mitigation                                                                                        | GA gate                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Regression from optimization               | perf fixes change query shape, queue ordering, retry timing, or projection batching | better throughput but broken ordering/idempotency/rebuild | require before/after tests for idempotency, projection rebuild, webhook replay, command dedupe    | optimization cannot merge without invariant checks |
| Alert fatigue                              | too many noisy alerts or endpoint-caused failures page platform on-call             | ignored alerts, delayed P0 response                       | severity taxonomy, customer endpoint noisy as P2/advisory, burn-rate alerts for SLOs              | every P0/P1 alert has owner, route, runbook        |
| Runbook drift                              | commands, dashboards, or deployment topology change after docs                      | incident operator cannot execute steps                    | runbook review in release readiness, game-day rehearsal, links to current dashboard/tool commands | runbooks reviewed and signed off                   |
| False confidence from staging              | staging load or topology differs from production                                    | SLO passes in staging but fails in prod                   | document load model, topology deltas, capacity headroom and first-customer assumptions            | readiness packet states coverage and gaps          |
| Chaos test causes unsafe replay            | participant/DB restart test resubmits with wrong identity                           | duplicate ledger command or conflicting intent            | enforce stable `command_id`, attempt-specific `submission_id`, participant affinity checks        | chaos suite checks duplicate command count         |
| Projection rebuild hides corruption        | rebuild overwrites evidence                                                         | root cause lost                                           | preserve before/after snapshots and ledger trace in incident timeline                             | evidence required before incident close            |
| Webhook replay storm                       | mass DLQ drain overwhelms customer endpoints or dispatcher                          | retry storm, elevated failures                            | throttle replay, endpoint segmentation, customer advisory                                         | replay rate limits and dashboard required          |
| Status page under-communicates stale reads | projection lag not reflected publicly                                               | customer sees stale balances as normal                    | stale-read threshold mapped to degraded/read-only status                                          | projection lag alert tests status semantics        |
| Compliance sign-off delayed                | evidence packet incomplete                                                          | release blocked late                                      | security/compliance artifacts included in readiness checklist                                     | Section 8 sign-offs required                       |

### 7.2 Failure mode matrix

| Failure mode             | Detection                                                                        | Immediate mitigation                                   | Recovery                                                         | Invariant                      |
| ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------ |
| Participant unavailable  | health.status failure, `pillar_participant_health=unavailable`, submissions fail | fail over only if dedupe-safe or mark writes read-only | restart/promote participant; reconcile completions/update stream | ledger remains source of truth |
| Network loss             | synchronizer disconnected, Ledger API timeout, route errors                      | disable writes for affected scope                      | restore connectivity, verify pending commands                    | no command into isolated route |
| DB restart               | connection failures, migration/health alert, API 5xx                             | retry-safe errors, degraded mode, block unsafe deploy  | reconnect, verify idempotency and audit hash chain               | idempotency not lost           |
| Projection corruption    | checksum/reconciliation mismatch                                                 | freeze affected balance/holding reads/writes           | rebuild from ledger/state service                                | ledger wins                    |
| Webhook dispatcher stuck | outbox depth grows, attempts stop                                                | restart workers, isolate bad endpoint batch            | replay from outbox/DLQ                                           | events not lost                |
| DAR/package mismatch     | command rejection spike, package registry drift                                  | pause affected intent type/package route               | rollback DAR/config/chart and verify                             | API version stable             |
| Key compromise           | security alert, signature mismatch, customer report                              | rotate/revoke secret, disable endpoint if needed       | replay signed events after rotation                              | no unsigned event trusted      |

## 8. Security / Compliance

GA release readiness requires security and compliance evidence from prior security work plus Phase 10 operational sign-off.

### 8.1 Required sign-offs

| Sign-off                    | Evidence                                                                                    | Owner                | Blocks GA? |
| --------------------------- | ------------------------------------------------------------------------------------------- | -------------------- | ---------- |
| Red-team pass               | findings closed or risk-accepted, no critical/high unresolved issues                        | Security             | yes        |
| Pen-test pass               | external/internal test report, remediation evidence                                         | Security             | yes        |
| Compliance sign-off         | audit trail, retention, incident evidence, policy mappings                                  | Compliance           | yes        |
| GDPR review                 | data subject handling, retention, deletion/export boundaries, processor/subprocessor notes  | Legal/Compliance     | yes        |
| Data-residency review       | deployment model, region pinning, control/data plane boundary, log/trace retention location | Legal/Compliance/SRE | yes        |
| Secrets/key rotation review | API key, webhook secret, JWT/mTLS, KMS rotation runbook rehearsal                           | Security/SRE         | yes        |
| Audit integrity review      | audit hash chain, incident timeline, privileged action evidence                             | Compliance/SRE       | yes        |

### 8.2 Security constraints during hardening

| Constraint                                         | Enforcement                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| No raw contract payload in production logs         | log sampling and redaction review before GA                               |
| No raw secrets in config bundles                   | release readiness checks config-agent bundle schema and secret references |
| No public Canton identifiers by default            | API contract/golden response checks remain part of release gate           |
| No unsigned webhook trusted                        | webhook signature tests and key rotation runbook rehearsal                |
| No chaos tests against production without approval | game-day scope and blast-radius approval required                         |
| No perf test using real customer PII               | synthetic/sandbox fixtures or approved anonymized data only               |

### 8.3 Compliance evidence mapping

| Evidence                          | Source system                                           | Retention expectation                    |
| --------------------------------- | ------------------------------------------------------- | ---------------------------------------- |
| API request and idempotency audit | `api_request_audit`, `idempotency_audit`                | per compliance policy                    |
| Command and ledger trace          | `command_audit`, `ledger_update_audit`                  | per asset/customer policy                |
| Webhook delivery history          | `webhook_event_audit`, `webhook_delivery_attempt_audit` | customer support and compliance window   |
| Security/admin actions            | `security_audit`                                        | compliance policy                        |
| Incident actions                  | `incident_timeline`                                     | incident review retention                |
| Release artifacts                 | release registry / CI artifacts                         | indefinite or per release policy         |
| Runbooks/dashboards               | IaC repository                                          | per change, indefinite history preferred |

## 9. Implementation Plan

New ticket area: **L = GA hardening**.

| ID      | Title                                                     | Path                                                                                                     | Output                                                                                                                            | Deps                                                                                                                         | Acceptance                                                                                                                                                                                                                                                     | Risk   |
| ------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P10.L01 | Chaos harness                                             | `tests/chaos`, `infra/compose`, `infra/helm/pillar`                                                      | participant restart, network loss, DB restart, projection corruption injection scenarios                                          | P9.J03, P9.J06, P9.J07                                                                                                       | chaos suite passes; duplicate command count unchanged; projection rebuild verifies ledger-derived state                                                                                                                                                        | high   |
| P10.L02 | Performance harness                                       | `tests/perf`, `tools/perf`, `infra/observability`                                                        | k6 throughput, projection lag under load, webhook fan-out volume reports                                                          | P10.L03, P10.L06                                                                                                             | API p99, projection p99, webhook p99 targets met under GA load profile                                                                                                                                                                                         | high   |
| P10.L03 | Grafana dashboards                                        | `infra/observability/grafana`, `infra/helm/pillar`                                                       | executive SLO, API, command, projection, webhook, participant, DR/security, capacity dashboards                                   | P9.J07                                                                                                                       | dashboards live with Prometheus data and release packet links                                                                                                                                                                                                  | medium |
| P10.L04 | Alert rules                                               | `infra/observability/prometheus`, `infra/observability/alertmanager`                                     | P0/P1/P2 rules, burn-rate alerts, routes to runbooks                                                                              | P10.L03, P10.L06                                                                                                             | synthetic alert route test reaches on-call target; every P0/P1 alert maps to a runbook                                                                                                                                                                         | medium |
| P10.L05 | Runbook set                                               | `docs/runbooks`, `apps/workbench`, `tools/cli`                                                           | participant unavailable, projection rebuild, DAR rollback, key rotation, mass webhook DLQ drain runbooks                          | P10.L01, P10.L04                                                                                                             | runbooks reviewed; game-day rehearsal records incident evidence and exit criteria                                                                                                                                                                              | high   |
| P10.L06 | SLO definitions                                           | `infra/observability/slo`, `docs/slo`, `apps/workbench`                                                  | SLO catalog, SLI queries, error-budget policy, dashboard links                                                                    | P10.L03                                                                                                                      | SLO table implemented; burn-rate queries visible; owners assigned                                                                                                                                                                                              | medium |
| P10.L07 | Status page                                               | `apps/status`, `apps/workbench`, `infra/helm/pillar`                                                     | public status semantics for operational/degraded/read-only/outage/maintenance/resolved                                            | P10.L04, P10.L06                                                                                                             | customer-visible incident simulation updates status page with correct scope and guidance                                                                                                                                                                       | medium |
| P10.L08 | GA readiness review                                       | `release-readiness`, `.github/workflows/release.yml`, `infra/helm/pillar`                                | signed release readiness packet, artifact checksums, SLO/chaos/perf evidence, compliance sign-offs                                | P10.L01, P10.L02, P10.L03, P10.L04, P10.L05, P10.L06, P10.L07                                                                | release readiness checklist signed off; no unresolved GA-blocking risks                                                                                                                                                                                        | high   |
| P10.L09 | Chaos: participant restart drill                          | `tests/chaos/participant-restart`, `infra/compose`, `infra/helm/pillar`                                  | deterministic active-participant restart drill covering in-flight issue/transfer/redeem/hold commands                             | P10.L01, P10.L03, P10.L04, P10.L06                                                                                           | drill proves stable `operation_id`/`command_id`, unique `submission_id` per retry, completion reconciliation, projection catch-up, and no duplicate ledger command under `hosted`, `customer-validator`, and `self-hosted` profiles                            | high   |
| P10.L10 | Chaos: synchronizer/sequencer failure drill               | `tests/chaos/synchronizer-failure`, `infra/compose/canton`, `infra/helm/pillar`                          | synchronizer disconnect and sequencer-unavailable scenarios with route degradation policy                                         | P10.L01, P10.L04, P10.L07, P9.J06                                                                                            | affected writes become read-only or delayed with retry-safe public errors; healthy scopes remain available; status page updates without exposing synchronizer IDs; pending commands are classified before recovery close                                       | high   |
| P10.L11 | Chaos: API-to-DB network partition drill                  | `tests/chaos/api-db-partition`, `apps/api`, `packages/idempotency`                                       | API/Postgres partition injection for idempotent mutations, reads, audit writes, and projection reads                              | P10.L01, P3.D03, P3.D04, P10.L04                                                                                             | API returns retry-safe errors or degraded/read-only status; no mutation bypasses idempotency/audit reservation; replay after partition returns the original operation/result or a typed idempotency conflict; audit hash chain has no gap                      | high   |
| P10.L12 | Chaos: projection corruption injection                    | `tests/chaos/projection-corruption`, `services/reconciler`, `services/projection-worker`                 | checksum, cursor, balance, holding, and event projection corruption fixtures plus rebuild evidence capture                        | P10.L01, P5.G06, P5.G07, P10.L04                                                                                             | reconciliation detects every injected mismatch, freezes affected customer-visible reads/writes, rebuilds from ledger/PQS to byte-equal projection, and retains before/after evidence in the incident timeline                                                  | high   |
| P10.L13 | Chaos: webhook receiver mass-failure simulation           | `tests/chaos/webhook-mass-failure`, `services/webhook-dispatcher`, `apps/api/src/routes/v1/events`       | high-cardinality endpoint failure matrix for timeout, 5xx, TLS, signature reject, and slow 2xx receivers                          | P10.L01, P6.H02, P6.H04, P6.H05, P10.L04                                                                                     | platform failures are separated from customer endpoint failures; event IDs remain stable; retry/DLQ/replay drains without duplicate events or unsigned delivery; endpoint noise does not page as platform P0                                                   | high   |
| P10.L14 | Chaos: DAR rollback under load                            | `tests/chaos/dar-rollback`, `infra/helm/pillar`, `services/ledger-command`, `services/template-registry` | staged DAR/package rollback drill while mutation and read traffic continue against `/v1`                                          | P10.L01, P9.J05, P9.J06, P10.L05, P12.N05                                                                                    | affected package routes pause safely; no new commands target rolled-back-incompatible templates; chart/DAR/package registry rollback completes; `/v1` grammar, idempotency records, operation IDs, and projection rebuild remain stable                        | high   |
| P10.L15 | Perf: k6 mutation and read baseline                       | `tests/perf/k6`, `tools/perf`, `apps/api`                                                                | canonical k6 baseline for account/asset reads, balance/holding reads, and issue/transfer/redeem/hold mutation mixes               | P10.L02, P10.L03, P10.L06, P2.C04, P4.E06                                                                                    | report records GA load profile, p50/p95/p99 latency, 5xx/429, idempotency replay/conflict rate, CPU/DB/queue pressure, and proves API read/write SLOs without changing public `/v1` grammar                                                                    | high   |
| P10.L16 | Perf: projection lag under load                           | `tests/perf/projection-lag`, `services/projection-worker`, `services/reconciler`                         | sustained ledger update workload for issue/transfer/hold/release/redeem with projection lag and cursor metrics                    | P10.L02, P10.L03, P10.L06, P5.G03, P5.G04, P5.G05                                                                            | projection p95/p99/max lag, cursor age, backlog, rebuild ETA, and reconciliation mismatch rate stay within SLO; events are emitted only after projected ledger state                                                                                           | high   |
| P10.L17 | Perf: webhook fan-out volume                              | `tests/perf/webhook-fanout`, `services/webhook-dispatcher`, `apps/api/src/routes/v1/webhook_endpoints`   | fan-out benchmark across event catalog types, endpoint versions, retry classes, DLQ, and replay                                   | P10.L02, P10.L03, P10.L06, P6.H01, P6.H03, P6.H04, P6.H05                                                                    | first-attempt latency, eventual delivery success, retry depth, DLQ volume, and replay throughput meet webhook SLOs; endpoint-version rendering and HMAC signatures remain valid under load                                                                     | high   |
| P10.L18 | Perf: reconciliation stress                               | `tests/perf/reconciliation-stress`, `services/reconciler`, `services/projection-worker`                  | randomized ledger-vs-projection reconciliation workload for balances, holdings, events, operations, and injected diffs            | P10.L02, P10.L12, P5.G06, P5.G07, P10.L06                                                                                    | every injected diff is detected, no silent correction occurs, diff rate and rebuild duration are reported, customer-visible confirmed mismatches remain zero, and ledger remains the conflict winner                                                           | high   |
| P10.L19 | DR drill: regional or single-region failover              | `tests/dr/failover`, `infra/terraform`, `infra/helm/pillar`, `infra/observability`                       | full-region failover drill where topology supports it, otherwise single-region restore/failover with explicit limitation evidence | P10.L03, P10.L04, P10.L05, P9.J03, P9.J08                                                                                    | backup restore, participant route recovery, projection rebuild, webhook outbox continuity, status-page updates, RTO/RPO evidence, and audit hash-chain continuity are recorded in the readiness packet                                                         | high   |
| P10.L20 | Business continuity: customer-validator outage simulation | `tests/chaos/customer-validator-outage`, `infra/helm/pillar`, `apps/status`, `apps/workbench`            | customer-validator deployment-mode outage simulation with customer-owned participant unavailable or degraded                      | P10.L09, P10.L10, P10.L07, P9.J04                                                                                            | `customer-validator` mode exposes the same `/v1` grammar as hosted/self-hosted; affected writes degrade to read-only/delayed per scope; public guidance identifies customer action without leaking participant internals; recovery reconciles pending commands | high   |
| P10.L21 | Post-incident review template and game-day cadence        | `docs/runbooks`, `apps/workbench`, `infra/observability`                                                 | post-incident review template, game-day schedule, evidence checklist, action-item tracking, and owner cadence                     | P10.L05, P10.L09, P10.L10, P10.L11, P10.L12, P10.L13, P10.L14, P10.L19, P10.L20                                              | every P0/P1 chaos or DR game-day produces incident timeline, dashboard snapshots, customer-impact statement, root cause, invariant checks, corrective actions, owners, due dates, and readiness packet links                                                   | medium |
| P10.L22 | GA readiness packet assembly                              | `release-readiness`, `.github/workflows/release.yml`, `infra/helm/pillar`, `apps/workbench`              | versioned GA packet with artifact checksums, signed SLO/chaos/perf/security/compliance evidence, and runbook review               | P10.L08, P10.L09, P10.L10, P10.L11, P10.L12, P10.L13, P10.L14, P10.L15, P10.L16, P10.L17, P10.L18, P10.L19, P10.L20, P10.L21 | packet contains DAR/image/chart/SDK/CLI checksums, dashboard links, signed off chaos/perf/SLO/security/compliance evidence, DR results, post-incident reviews, known risks, rollback plan, and no unresolved GA-blocking item                                  | high   |

### 9.1 Ticket sequencing

```text
P10.L03 dashboards ─┐
                    ├─> P10.L06 SLO definitions ─┬─> P10.L15 k6 baseline ─────────┐
P10.L04 alerts   <──┘                             ├─> P10.L16 projection lag ─────┤
                                                    ├─> P10.L17 webhook fan-out ────┤
P10.L01 chaos harness ─┬─> P10.L09 participant ───┤                                │
                       ├─> P10.L10 synchronizer ──┤                                │
                       ├─> P10.L11 API/DB network ├─> P10.L21 incident/game-day ────┤
                       ├─> P10.L12 projection ────┤                                │
                       ├─> P10.L13 webhook failure┤                                │
                       └─> P10.L14 DAR rollback ──┘                                │
                                                                                     │
P10.L05 runbooks ─┬─> P10.L19 DR failover ──────────────────────────────────────────┤
P10.L07 status ───└─> P10.L20 customer-validator outage ────────────────────────────┤
P10.L02 perf harness ───────────────┬─> P10.L18 reconciliation stress ──────────────┤
Security/compliance sign-offs ──────┴───────────────────────────────────────────────┤
                                                                                     v
                                                                      P10.L08/P10.L22 GA readiness
```

### 9.2 Per-ticket hardening checks

| Ticket  | Must prove                                                                                                     | Must not do                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P10.L01 | recovery paths are safe under failure                                                                          | resubmit ledger commands with unstable identity                           |
| P10.L02 | capacity and freshness targets hold                                                                            | tune by dropping audit/projection/webhook guarantees                      |
| P10.L03 | dashboards show real metrics                                                                                   | ship static dashboard shells with no data                                 |
| P10.L04 | alerts route and link to runbooks                                                                              | page on customer endpoint noise as platform P0                            |
| P10.L05 | humans can execute runbooks                                                                                    | leave stale command names or missing dashboard links                      |
| P10.L06 | SLOs have SLI, owner, dashboard, alert, runbook                                                                | define unmeasurable goals                                                 |
| P10.L07 | status semantics match customer impact                                                                         | expose internal Canton implementation details                             |
| P10.L08 | release evidence is complete                                                                                   | sign off with unresolved critical/high security findings                  |
| P10.L09 | participant restart preserves command dedupe and projection recovery                                           | reuse submission identity or close with unknown completions               |
| P10.L10 | synchronizer/sequencer failure degrades safely by scope                                                        | submit commands into an isolated route or leak synchronizer internals     |
| P10.L11 | API/DB partition preserves idempotency and audit integrity                                                     | accept mutations without durable idempotency/audit state                  |
| P10.L12 | projection corruption is detected, frozen, rebuilt, and evidenced                                              | overwrite corruption evidence or let DB win over ledger                   |
| P10.L13 | webhook receiver failure is isolated, durable, signed, and replayable                                          | treat customer endpoint failure as platform ledger failure                |
| P10.L14 | DAR rollback under load preserves `/v1`, command routing, and projection rebuild                               | allow incompatible package routes to keep consuming work                  |
| P10.L15 | k6 baseline covers representative mutation and read mixes                                                      | optimize by weakening API grammar, auth, idempotency, or audit            |
| P10.L16 | projection freshness holds during sustained ledger updates                                                     | emit events before projected ledger state exists                          |
| P10.L17 | webhook fan-out meets latency/success SLOs under volume                                                        | drop signatures, endpoint versioning, retry, DLQ, or replay evidence      |
| P10.L18 | reconciliation detects injected diffs under load                                                               | silently correct projection rows without diff/evidence                    |
| P10.L19 | failover/restore meets RTO/RPO and preserves trace continuity                                                  | claim multi-region readiness when only single-region failover was drilled |
| P10.L20 | customer-validator outage preserves deployment-invariant `/v1` behavior                                        | expose customer participant identifiers or require client grammar changes |
| P10.L21 | incident reviews convert game-day evidence into tracked corrective actions                                     | close P0/P1 drills without root cause, invariant checks, and owners       |
| P10.L22 | GA packet assembles signed evidence across artifacts, SLO, chaos, perf, DR, security, compliance, and runbooks | treat P10.L08 as sufficient without granular evidence checks              |

## 10. Open Questions

| Question                       | Current resolution                                                                                                                                                     | Owner               | Blocks GA?  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------- |
| GA scope freeze date           | Must be set before P10.L08; no new public API/object/schema changes after freeze except index-only performance fixes approved by release readiness review              | Product/Engineering | yes         |
| First regulated-asset customer | Must be identified or represented by an approved launch profile so SLO load model, data-residency review, compliance evidence, and support/runbook scope are realistic | GTM/Compliance/SRE  | yes         |
| GA load profile                | Derive from first customer or approved synthetic profile; record request mix, write/read ratio, webhook fan-out, participant topology                                  | SRE/Product         | yes         |
| Index tuning need              | No schema changes planned; if perf harness shows bottleneck, allow measured index-only migration with migration gate                                                   | DB/Platform         | conditional |
| Status page public granularity | Decide whether affected accounts/assets are named, grouped, or described generically for regulated customers                                                           | Legal/Comms/SRE     | yes         |
| Game-day environment           | Prefer staging/prod-shadow; production game-day requires blast-radius approval                                                                                         | SRE/Security        | yes         |
| SLA publication                | SLOs are internal unless contracted; external SLA targets need legal approval                                                                                          | Legal/Product       | conditional |

Architecture conflict resolution: [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) defines M10 as chaos, perf, docs, runbooks with SLO and recovery tests as the exit gate. Any request to add GA product features or new DB tables conflicts with that scope and is deferred out of Phase 10.

## 11. Agent-ready Checklist

### Build gate

- [ ] P10.L09, P10.L10, P10.L11, P10.L12, P10.L13, and P10.L14 chaos drills pass for participant restart, synchronizer/sequencer failure, API/DB network partition, projection corruption, webhook receiver mass failure, and DAR rollback under load.
- [ ] P10.L15, P10.L16, P10.L17, and P10.L18 performance profiles complete for k6 mutation/read baseline, projection lag under load, webhook fan-out volume, and reconciliation stress.
- [ ] P10.L19 DR drill completes full-region failover where topology supports it, or records single-region failover limitations with RTO/RPO evidence.
- [ ] P10.L20 business-continuity drill proves customer-validator outage handling without `/v1` grammar drift.
- [ ] P10.L21 post-incident review template and game-day cadence are published and linked from runbooks/Workbench.
- [ ] SLO dashboards are live in Grafana with Prometheus data for API p99 latency, intent acceptance success, projection lag p99, webhook delivery success p99, and reconciliation diff rate.
- [ ] Alert rules are installed and synthetic P0/P1 route tests reach the expected on-call target.
- [ ] Runbooks for participant unavailable, projection rebuild, DAR rollback, key rotation, mass webhook DLQ drain, DR failover, customer-validator outage, and incident review are reviewed.
- [ ] P10.L22 GA readiness packet is signed off using the Release sub-list from the implementation plan:
  - [ ] DAR artifacts versioned and checksummed.
  - [ ] Docker images built and signed.
  - [ ] DB migrations verified.
  - [ ] Helm migration Job runs before rollout.
  - [ ] DAR upload Job completes before command runtime processes work.
  - [ ] Observability dashboards installed.
  - [ ] Runbooks published.
  - [ ] API changelog published.
  - [ ] SDKs published.
  - [ ] CLI published.
  - [ ] SLO/chaos/perf/security/compliance evidence signed.
  - [ ] DR and business-continuity evidence signed.

### Verify gate

- [ ] Executive SLO dashboard shows rolling 30d and short-window burn views.
- [ ] API p99 latency remains within target under the agreed GA load profile from P10.L15.
- [ ] Intent acceptance success excludes business validation failures and includes platform failures.
- [ ] Projection lag p99 remains below target under P10.L16 and injected projection corruption from P10.L12 is detected.
- [ ] Webhook fan-out load from P10.L17 isolates customer endpoint failures from platform failures and preserves signed, replayable deliveries.
- [ ] Reconciliation diff rate is visible; P10.L18 detects injected diffs; customer-visible confirmed mismatches are zero.
- [ ] P10.L09 through P10.L14 chaos evidence includes duplicate-command, idempotency, projection, webhook, status, and rollback invariant checks.
- [ ] P10.L19 failover evidence includes backup restore, participant route recovery, projection rebuild, webhook continuity, RTO/RPO, and audit hash-chain continuity.
- [ ] P10.L20 customer-validator outage simulation reports correct degraded/read-only/outage states without exposing Canton internals.
- [ ] Red-team, pen-test, compliance, GDPR, and data-residency reviews are signed off or explicitly risk-accepted by accountable owners.
- [ ] GA scope freeze date and first regulated-asset customer launch profile are recorded in the P10.L22 readiness packet.

### Invariant gate

- [ ] Public API exposes no Canton contract-first fields.
- [ ] DB asset state is projection only.
- [ ] Every mutation has stable operation_id and command_id.
- [ ] Projection is rebuildable.
- [ ] Webhook deliveries are signed and replayable.
- [ ] Deployment mode does not change /v1 grammar, including P10.L20 customer-validator outage behavior.
- [ ] Chaos, DR, business-continuity, and performance mitigations do not weaken idempotency, audit, projection, ledger trace, or webhook guarantees.
