# Runbook: <title>

> Copy this template for every Pillar runbook. Keep sections in this exact order. Replace placeholders before publishing. Do not delete sections; write `Not applicable` with rationale when a section genuinely does not apply.

## Trigger

| Field                     | Required content                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Alert names               | `<Prometheus/Grafana/PagerDuty alert names>`                                                                           |
| Manual triggers           | `<support/security/release/customer/regulator trigger>`                                                                |
| Affected planes           | `<External API / Intent / Canton Command / Projection / Webhook / Data Plane / Control Plane / Security / Compliance>` |
| Customer-visible symptoms | `<what a customer sees without Canton internals>`                                                                      |
| SLO / threat references   | `<links to ../SLO_CATALOG.md and ../THREAT_MODEL.md entries>`                                                          |

### Trigger checklist

| Check                               | Required action                                                           |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Is this customer-impacting?         | Classify severity before mitigation.                                      |
| Is economic correctness uncertain?  | Treat as SEV1 until ledger/projection reconciliation proves otherwise.    |
| Is compromise suspected?            | Preserve evidence and include Security lead immediately.                  |
| Is regulator notification possible? | Include Compliance lead immediately; do not wait for root cause.          |
| Is public `/v1` behavior affected?  | Include API owner and verify regression contract clauses before recovery. |

## Severity classification

| Severity | Use when                                                                                                                                                 | First response owner           | Communications                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| SEV1     | Customer-impacting outage, suspected compromise, possible ledger/projection economic inconsistency, material data exposure, or regulatory deadline risk. | Incident Commander + SRE Lead  | Status page and executive/customer escalation.                            |
| SEV2     | Degraded customer experience, delayed projections/webhooks/finality, partial tenant/region impact, no known economic inconsistency.                      | Incident Commander or SRE Lead | Status page if broad or contractually required.                           |
| SEV3     | Internal alert, safe retry, failed non-critical job, single-tenant advisory, investigation-only.                                                         | Component owner                | Internal channel; customer notice only if support/account owner requests. |

### Severity downgrade rules

| From | To     | Evidence required                                                                                             |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------- |
| SEV1 | SEV2   | Ledger source-of-truth is intact; no unauthorized access; no customer-wide outage; no regulator clock active. |
| SEV2 | SEV3   | No external SLO breach; no customer action required; issue is bounded to internal retry/rebuild.              |
| Any  | Closed | Verify section complete; customer communication sent when required; post-incident owner assigned.             |

## On-call decision tree

```text
Alert/manual report received
  -> classify severity
  -> assign Incident Commander when SEV1/SEV2
  -> preserve evidence before destructive action
  -> identify affected plane
  -> choose mitigation path
  -> verify invariant safety
  -> communicate status and next update
  -> recover service
  -> complete post-incident actions
```

| Decision                             | If yes                                                                             | If no                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------- |
| Customer impact or uncertain impact? | Open incident channel; use SEV1/SEV2 flow.                                         | Continue component triage as SEV3.      |
| Ledger source-of-truth uncertainty?  | Stop writes if needed; reconcile from ledger; never patch projection as authority. | Continue service-specific mitigation.   |
| Security suspicion?                  | Freeze evidence, rotate/disable credentials, involve Security.                     | Continue operational triage.            |
| Data loss/corruption suspicion?      | Snapshot state, use db-restore/projection-rebuild runbooks.                        | Use live mitigation.                    |
| Release or migration related?        | Freeze deploys; use rollback runbook.                                              | Continue runtime diagnosis.             |
| Customer action required?            | Prepare customer-facing template and support instructions.                         | Internal-only update may be sufficient. |

## Pre-checks (commands to run first)

> Commands are examples. Each concrete runbook MUST replace service names, namespaces, dashboards, and environment variables with exact values or mode-specific variants.

| Purpose                     | Command / query                                                                   | Expected result                                                        |
| --------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Identify deployment context | `pillarctl env describe --tenant <tenant> --env <env>`                            | Shows `deploymentMode`, region, release, chart, data-plane ownership.  |
| Check incident SLO panel    | `pillarctl slo status --env <env> --window 30m`                                   | Lists breached SLIs and burn rate.                                     |
| Check active alerts         | `pillarctl alerts active --env <env> --severity all`                              | Confirms alert names, start times, labels.                             |
| Check API health            | `curl -fsS https://<api-host>/healthz`                                            | API edge responds or failure scope is clear.                           |
| Check data-plane pods       | `kubectl -n <ns> get pods -o wide`                                                | No unexpected restarts, pending pods, or unavailable critical workers. |
| Check recent deploy         | `pillarctl release current --env <env>`                                           | Current image/chart/DAR/migration version known.                       |
| Capture audit context       | `pillarctl audit search --request-id <req_...> --operation-id <op_...>`           | Request/operation trace exists when relevant.                          |
| Capture logs                | `pillarctl logs bundle --env <env> --since <duration> --output <case-id>.tar.zst` | Immutable evidence bundle created.                                     |

### Evidence preservation before mutation

| Artifact                | Required before destructive action? | Notes                                                                   |
| ----------------------- | ----------------------------------: | ----------------------------------------------------------------------- |
| Audit rows              |                                 Yes | Include request, idempotency, operation, command attempt, admin action. |
| Metrics snapshots       |                                 Yes | Export dashboard/panel links and time range.                            |
| Logs                    |                                 Yes | Redacted structured logs; no raw contract payload in customer export.   |
| Traces                  |                                 Yes | Include request-to-ledger-command trace where available.                |
| DB snapshot             |     Yes for DB/data-plane incidents | Snapshot before restore, migration rollback, rebuild, or manual repair. |
| Customer communications |                                 Yes | Preserve status-page, support, email, and account-owner updates.        |

## Diagnose

| Step | Question                                       | Evidence                                                      | Branch                                    |
| ---- | ---------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| 1    | Which plane is failing?                        | Alerts, health endpoints, dashboards.                         | Route to component owner/runbook.         |
| 2    | Is the issue new after a deploy/config change? | Release registry, config bundle version, migration history.   | Roll back or freeze change if correlated. |
| 3    | Is the ledger path healthy?                    | Participant health, command completion, synchronizer status.  | Participant/down or command-runtime path. |
| 4    | Are projections fresh and correct?             | Offset lag, reconciliation diffs, rebuild compare.            | Projection rebuild path.                  |
| 5    | Are webhooks delayed or failing?               | Outbox, delivery attempts, DLQ, customer endpoint status.     | Webhook DLQ drain path.                   |
| 6    | Is auth/security involved?                     | Key usage, auth failures, impossible travel, secret exposure. | Security and key rotation path.           |
| 7    | Are customers/regulators affected?             | Support tickets, SLO breach scope, compliance triggers.       | Communication and escalation path.        |

### Required diagnosis outputs

| Output               | Format                                                                   |
| -------------------- | ------------------------------------------------------------------------ |
| Impact statement     | `who / what / since when / current status`                               |
| Affected objects     | Public object IDs only unless internal channel is explicitly privileged. |
| Timeline             | UTC timestamps for first symptom, alert, ack, mitigation, recovery.      |
| Invariant assessment | Which IC clauses are at risk and current evidence.                       |
| Next action          | Mitigate, recover, escalate, or monitor with owner.                      |

## Mitigate

| Mitigation class  | Allowed actions                                                                                         | Forbidden actions                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Traffic control   | Rate-limit, shed non-critical traffic, enter read-only mode, route to healthy region when parity holds. | Change public `/v1` grammar, silently drop accepted requests, bypass idempotency. |
| Runtime safety    | Pause workers, stop deploys, disable unsafe feature flag, freeze package rollout.                       | Patch ledger-derived Projection rows as economic truth.                           |
| Credential safety | Disable/rotate credential, revoke session, narrow scopes, enforce mTLS/IP allowlist.                    | Delete audit evidence or reveal raw secrets in logs/messages.                     |
| Data safety       | Snapshot, restore config/audit from backup, rebuild projection from ledger.                             | Restore stale projection without ledger reconciliation.                           |
| Webhook safety    | Pause endpoint, replay event, drain DLQ with preserved `event.id`.                                      | Generate replacement event IDs for already-created events.                        |

### Mitigation record

| Field           | Required value                                |
| --------------- | --------------------------------------------- |
| Action          | `<exact command/config/deploy/manual action>` |
| Owner           | `<person/role>`                               |
| Start/end       | `<UTC timestamps>`                            |
| Expected effect | `<SLO or symptom expected to improve>`        |
| Rollback        | `<how to undo mitigation>`                    |
| Evidence link   | `<ticket/dashboard/log bundle>`               |

## Recover

| Recovery step             | Required checks                                                              |
| ------------------------- | ---------------------------------------------------------------------------- |
| Re-enable traffic/workers | Error rate and latency stable; queues not explosively growing.               |
| Resume writes             | Idempotency, ledger command, completion, projection, webhook paths verified. |
| Rebuild/reconcile         | Projection byte-equal or explained diffs; Canton Ledger remains authority.   |
| Replay delayed events     | Event identity preserved; endpoint version/signature verified.               |
| Reopen deploys            | Release rollback/fix validated; error budget policy permits.                 |
| Customer closeout         | Customer-facing recovery message sent when required.                         |

## Verify

| Verification         | Command / source                                | Pass condition                                                                               |
| -------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| SLO recovery         | `pillarctl slo status --env <env> --window 30m` | Relevant SLI back inside threshold or burn-rate stopped.                                     |
| API smoke            | `pillarctl smoke api --env <env> --mode <mode>` | Create/read/list flow works without public Canton identifiers.                               |
| Idempotency smoke    | `pillarctl smoke idempotency --env <env>`       | Same request/key returns same operation/response; conflicting body returns 409.              |
| Ledger trace         | `pillarctl trace operation <op_...>`            | Request → operation → command attempt → completion/update → projection/event trace complete. |
| Projection freshness | `pillarctl projection status --env <env>`       | Lag within SLO; no unexplained reconciliation diffs.                                         |
| Webhook smoke        | `pillarctl webhooks test --endpoint <we_...>`   | Signed delivery accepted or classified correctly.                                            |
| Audit integrity      | `pillarctl audit verify --case <case-id>`       | Incident actions and admin changes are recorded.                                             |

## Communicate (customer-facing message templates)

### Initial status-page update

```text
We are investigating an issue affecting <customer-visible capability>. The issue began at <UTC time>. We have identified the affected scope as <scope>. We will provide the next update by <UTC time>.
```

### Degraded service update

```text
<Capability> is currently degraded for <scope>. Requests may experience <symptom>. Accepted operations remain traceable and we are validating final state before declaring recovery. Next update by <UTC time>.
```

### Recovery update

```text
We have mitigated the issue affecting <capability> as of <UTC time>. We are monitoring recovery and validating delayed operations/events. Customers do not need to retry successful idempotent requests unless instructed by Support.
```

### Resolution update

```text
The incident affecting <capability> is resolved as of <UTC time>. We validated <verification summary>. A post-incident summary will be provided according to contractual commitments.
```

### Security/compliance holding statement

```text
We are investigating a potential security or compliance event affecting <scope>. We have contained the suspected vector and are preserving evidence. We will notify affected customers and regulators as required after validation.
```

## Post-incident

| Time from resolution | Deliverable                                                                                   | Owner                               |
| -------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| 2 hours              | Incident timeline and customer impact draft.                                                  | Incident Commander                  |
| 24 hours             | Initial post-incident report with impact, mitigation, verification, and immediate prevention. | Incident Commander + Component Lead |
| 5 business days      | Full post-mortem with root cause, contributing factors, action items, owners, and due dates.  | SRE Lead                            |
| Next release gate    | Regression/invariant checks updated if the incident exposed a missing gate.                   | Phase owner                         |

### Post-incident fields

| Field                      | Required content                                         |
| -------------------------- | -------------------------------------------------------- |
| Summary                    | Customer-visible impact and duration.                    |
| Root cause                 | Evidence-backed cause; no speculation.                   |
| Trigger                    | Alert/manual report/deploy/customer ticket.              |
| Detection gap              | Why existing SLO/threat/control did or did not catch it. |
| Mitigation                 | What changed during incident response.                   |
| Recovery proof             | Commands/dashboards/tests proving recovery.              |
| Invariant impact           | IC clauses at risk and final disposition.                |
| Customer/regulator actions | Notifications sent or rationale for not sending.         |
| Follow-up work             | Ticket IDs, owners, due dates, verification commands.    |

## Related

- SLOs: [SLO_CATALOG.md](../SLO_CATALOG.md) `<specific SLO rows>`
- Phase tickets: `<Phase ticket links, e.g. ../Phase_10_GA_Hardening.md>`
- ADRs: [ADR-0001](../DECISIONS.md#adr-0001-canton-ledger-as-sole-source-of-truth), [ADR-0002](../DECISIONS.md#adr-0002-stripe-style-external-api-surface-canton-internals-hidden), [ADR-0003](../DECISIONS.md#adr-0003-intent-first-write-path), [ADR-0004](../DECISIONS.md#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt), [ADR-0005](../DECISIONS.md#adr-0005-projection--audit--config-split-for-pillar-postgres), [ADR-0006](../DECISIONS.md#adr-0006-webhook-first-async-with-hmac-sha256-signing-and-per-endpoint-version-pinning), [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar)
- Threats: [THREAT_MODEL.md](../THREAT_MODEL.md) `<specific threat IDs>`
