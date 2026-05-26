# Runbook: Incident Response

General incident response for Pillar Mission Control. Use this runbook when impact is unclear, multiple planes are involved, or no component-specific runbook has been selected yet. After triage, keep this runbook as the incident command spine and attach the relevant component runbook for execution.

## Trigger

| Trigger type                     | Examples                                                                                                                | Initial severity                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Customer-impacting outage        | API unavailable, create/read/list failures, widespread auth failure, failed writes, prolonged read-only mode.           | SEV1                                                    |
| Degraded customer experience     | Elevated latency, delayed ledger completion, projection lag, webhook delivery backlog, regional partial outage.         | SEV2                                                    |
| Economic correctness uncertainty | Balance/holding mismatch, unexplained reconciliation diff, projection corruption, duplicate command suspicion.          | SEV1 until disproven                                    |
| Security suspicion               | API key leak, unauthorized request pattern, privilege escalation, audit tampering, webhook secret exposure.             | SEV1 until scoped                                       |
| Compliance/regulatory trigger    | Personal/sensitive data exposure, suspicious activity, outage crossing notification threshold, evidence retention hold. | SEV1                                                    |
| Internal operational alert       | Failed batch, single worker crash, non-customer retry exhaustion, dashboard-only anomaly.                               | SEV3                                                    |
| Customer report                  | Support ticket, account team report, customer webhook/API monitoring report.                                            | SEV2 unless outage/security/economic uncertainty exists |
| Release regression               | New image/chart/DAR/migration/config causes SLO breach or unsafe behavior.                                              | SEV2 or SEV1 by impact                                  |

### Immediate trigger checklist

| Step | Action                                                                                               | Owner                                    |
| ---- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1    | Acknowledge page or manual report.                                                                   | First responder                          |
| 2    | Create incident record with UTC start time, reporter, suspected scope, and initial severity.         | First responder                          |
| 3    | Open incident channel for SEV1/SEV2.                                                                 | First responder                          |
| 4    | Assign Incident Commander for SEV1/SEV2.                                                             | First responder or SRE lead              |
| 5    | Preserve evidence before destructive mitigation.                                                     | Incident Commander                       |
| 6    | Decide whether customer/status-page update is required.                                              | Incident Commander + Communications Lead |
| 7    | Include Security/Compliance if compromise, data exposure, audit gap, or regulator clock is possible. | Incident Commander                       |

## Severity classification

| Severity | Definition                                                                                                                                  | Examples                                                                                                                                                                                                | Required response                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEV1     | Customer-impacting outage, suspected compromise, possible ledger/projection economic inconsistency, or material regulatory/compliance risk. | API unavailable for multiple tenants; accepted writes not reaching terminal classification; balance correctness uncertain; API key compromise; data exposure; participant outage blocking command path. | Incident Commander, SRE Lead, Component Lead, Communications Lead, Security/Compliance when relevant, status-page update, executive escalation when impact persists or trigger applies. |
| SEV2     | Degraded customer experience with bounded or partial impact and no known economic inconsistency or compromise.                              | Projection freshness above SLO; webhook first-attempt latency breach; elevated 5xx in one region; command completion delays; partial dashboard/workbench outage.                                        | Incident Commander or delegated SRE Lead, Component Lead, customer/status update if broad or contractual, mitigation owner assigned.                                                    |
| SEV3     | Internal issue or advisory with no customer-visible impact and no safety/security/compliance concern.                                       | Single worker crash with automatic recovery; retryable job failure; alert noise; non-production issue; one customer's endpoint returning 500s without platform fault.                                   | Component owner handles; record if repeated; escalate if impact broadens.                                                                                                               |

### Severity decision table

| Question                                                                 | If yes                                                     | If no                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------- |
| Are customers unable to create/read/list or complete critical workflows? | SEV1.                                                      | Continue.                     |
| Is final economic state or projection correctness uncertain?             | SEV1; stop unsafe writes if needed; reconcile from ledger. | Continue.                     |
| Is unauthorized access, secret leak, or audit tampering suspected?       | SEV1; Security lead joins; preserve evidence.              | Continue.                     |
| Is a regulatory notification clock possibly active?                      | SEV1 until Compliance determines otherwise.                | Continue.                     |
| Is customer experience degraded but safe and bounded?                    | SEV2.                                                      | Continue.                     |
| Is the alert internal-only with safe retry and no customer impact?       | SEV3.                                                      | Reassess after more evidence. |

### Downgrade and upgrade rules

| Change       | Allowed when                                                                                                         | Required approval                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| SEV1 to SEV2 | Customer outage is bounded, ledger source-of-truth is intact, no compromise/data exposure, regulator clock inactive. | Incident Commander + SRE Lead; Security/Compliance if they joined. |
| SEV2 to SEV3 | No SLO breach remains, no customer action required, and all delayed operations/events are safely classified.         | Incident Commander or SRE Lead.                                    |
| SEV3 to SEV2 | Customer-visible degradation or repeated alert pattern emerges.                                                      | First responder may upgrade immediately.                           |
| SEV2 to SEV1 | Outage becomes broad, correctness/compromise/regulatory uncertainty appears, or mitigation fails.                    | Any responder may upgrade immediately.                             |

## On-call decision tree

```text
Incident signal
  -> acknowledge and open record
  -> classify severity
  -> preserve evidence
  -> assign Incident Commander if SEV1/SEV2
  -> identify affected customer capability
  -> identify affected operating plane
  -> choose mitigation owner and component runbook
  -> decide communication cadence
  -> mitigate safely
  -> verify with SLO + trace + invariant checks
  -> recover service
  -> communicate resolution
  -> run post-incident process
```

| Decision                                 | Yes                                                                                 | No                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| Impact unknown after first check?        | Treat as SEV2 minimum; if correctness/security/regulatory uncertainty exists, SEV1. | Use known severity.                               |
| Multiple planes involved?                | Keep this runbook as command spine; assign one component lead per plane.            | Transfer execution to matching component runbook. |
| Writes may worsen impact?                | Pause or rate-limit writes; preserve idempotency and accepted-operation trace.      | Continue controlled mitigation.                   |
| Public API grammar involved?             | Check Regression Contract IC-03, IC-08, IC-09 before recovery.                      | Continue plane-specific checks.                   |
| Ledger/projection relationship involved? | Check IC-01, IC-02, IC-04, IC-05, IC-10; never patch projection as authority.       | Continue service checks.                          |
| Webhook/event delivery involved?         | Check IC-06 and IC-07; preserve `event.id`; replay delivery only.                   | Continue.                                         |
| Customer action required?                | Communications Lead drafts update and Support instructions.                         | Internal incident updates only.                   |
| Regulator notification possible?         | Compliance Lead starts notification assessment and evidence hold.                   | Continue normal evidence retention.               |

### Incident roles

| Role                    | Required for                                            | Responsibilities                                                                                 | Not responsible for                                    |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Incident Commander (IC) | SEV1/SEV2                                               | Owns severity, channel, timeline, decisions, escalation, next update time, closure.              | Deep debugging unless also assigned as component lead. |
| SRE Lead                | SEV1/SEV2                                               | Owns platform health, dashboards, mitigations, traffic control, restore/recovery coordination.   | Customer wording approval.                             |
| Component Lead          | Any component incident                                  | Diagnoses and executes runbook for affected plane.                                               | Incident-wide priority decisions.                      |
| Communications Lead     | SEV1 and customer-visible SEV2                          | Drafts status-page/customer/support updates, tracks cadence, ensures no unsupported speculation. | Technical mitigation.                                  |
| Security Lead           | Suspected compromise, auth/key/audit issue              | Evidence preservation, containment, credential rotation, threat scoping.                         | General outage status cadence unless delegated.        |
| Compliance Lead         | Data/regulatory/audit/evidence trigger                  | Notification assessment, legal/regulatory clock, retention hold.                                 | Technical root cause.                                  |
| Customer Support Lead   | Customer reports or notices                             | Ticket mapping, customer-specific instructions, account-owner coordination.                      | Incident command decisions.                            |
| Executive Sponsor       | Broad SEV1, prolonged impact, strategic customer impact | External escalation support, customer/account prioritization.                                    | Bypassing technical safety gates.                      |

### Role handoff rules

| Event                     | Required action                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| IC changes                | Outgoing IC posts summary: current severity, impact, mitigations, next action, next update time, open risks.                            |
| Component lead changes    | Outgoing lead posts diagnostics already run, evidence links, unsafe actions avoided, next recommended command.                          |
| Security/Compliance joins | IC pauses public root-cause statements until leads approve wording.                                                                     |
| Incident splits           | IC creates parent/child incident records and assigns separate component leads; one customer communication thread remains authoritative. |

## Pre-checks (commands to run first)

> Replace placeholders with the affected environment. If commands are unavailable in a deployment mode, use the equivalent dashboard/export and record the source.

| Purpose               | Command / source                                                                         | Expected result                                                         |
| --------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Current alerts        | `pillarctl alerts active --env <env> --severity all`                                     | Alert names, labels, firing time, affected tenant/region/service known. |
| SLO burn              | `pillarctl slo status --env <env> --window 30m`                                          | Breached SLOs and burn rate known.                                      |
| Release state         | `pillarctl release current --env <env>`                                                  | Current chart/image/DAR/migration/config bundle versions known.         |
| Deployment mode       | `pillarctl env describe --tenant <tenant> --env <env>`                                   | `deploymentMode` and operational ownership known.                       |
| API edge health       | `curl -fsS https://<api-host>/healthz`                                                   | Confirms API edge status or failure.                                    |
| API smoke read        | `curl -fsS -H "Authorization: Bearer <test-key>" https://<api-host>/v1/balances?limit=1` | Read path status known; output must not expose Canton internals.        |
| Kubernetes status     | `kubectl -n <ns> get pods -o wide`                                                       | Restart loops, pending pods, unavailable workers visible.               |
| Recent events         | `kubectl -n <ns> get events --sort-by=.lastTimestamp`                                    | Cluster scheduling/config/network symptoms visible.                     |
| Ledger command health | `pillarctl ledger health --env <env>`                                                    | Participant/Ledger API/synchronizer status known.                       |
| Projection health     | `pillarctl projection status --env <env>`                                                | Offset lag and reconciliation state known.                              |
| Webhook health        | `pillarctl webhooks backlog --env <env>`                                                 | Outbox backlog, retry, DLQ counts known.                                |
| Audit trace sample    | `pillarctl trace request <req_...>` or `pillarctl trace operation <op_...>`              | Trace spine completeness checked for sample affected operation.         |
| Evidence bundle       | `pillarctl logs bundle --env <env> --since <duration> --case <case-id>`                  | Immutable evidence archive created.                                     |

### Evidence collection

| Evidence                                | Collect when                                         | Minimum content                                                                                    | Retention                                                       |
| --------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Incident record                         | Every incident                                       | Case ID, severity, timeline, roles, decisions, links.                                              | Standard incident retention; legal hold if Compliance requires. |
| Metrics snapshot                        | SEV1/SEV2, recurring SEV3                            | Dashboard links/export, UTC range, alert labels.                                                   | Standard observability retention or incident archive.           |
| Logs bundle                             | SEV1/SEV2, security/compliance, unknown cause        | Structured logs for affected services, redacted payloads, no raw contract payload customer export. | Incident archive; legal hold if trigger.                        |
| Traces                                  | Ledger/API/projection/webhook incidents              | Request ID, operation ID, internal trace IDs, service spans.                                       | Incident archive.                                               |
| Audit records                           | All SEV1/SEV2, security/compliance                   | API request logs, admin actions, key events, idempotency records, command attempts.                | Audit retention policy; legal/regulatory hold if trigger.       |
| DB snapshot                             | Data loss, migration, restore, projection corruption | Pre-mitigation snapshot or backup identifier, checksum, operator.                                  | Backup retention plus incident archive.                         |
| Ledger/projection reconciliation output | Correctness incidents                                | Reconciliation diff, ledger offset range, rebuild compare.                                         | Incident archive.                                               |
| Communications                          | Customer-visible incidents                           | Status-page updates, emails, support macros, account-owner notes.                                  | Customer communication retention.                               |
| Access review                           | Security incidents                                   | Principals, key IDs, scopes, IPs, mTLS certs, sessions, last used.                                 | Security evidence retention/legal hold.                         |

### Evidence handling rules

| Rule                    | Requirement                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve before mutate  | Snapshot logs/audit/config/DB state before rollback, restore, rebuild, key disablement, or manual correction where feasible.                                     |
| Redact externally       | Customer-facing evidence must not include raw secrets, raw contract payloads, private keys, internal party IDs, participant IDs, command IDs, or unapproved PII. |
| Keep internal trace     | Internal privileged evidence may include operation/command/update/offset identifiers for audit and root cause.                                                   |
| Chain of custody        | Security/compliance cases require owner, timestamp, source, checksum or immutable link for each evidence artifact.                                               |
| No speculative deletion | Do not delete queues, DLQ entries, audit rows, or logs to clear symptoms. Quarantine or snapshot first.                                                          |

## Diagnose

| Step | Question                                                 | Evidence                                                            | Next branch                                        |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| 1    | What customer capability is affected?                    | Support reports, SLOs, API/dashboard/webhook symptoms.              | Define impact statement.                           |
| 2    | What is the scope?                                       | Tenant, region, deployment mode, service, endpoint, object type.    | Decide SEV and communication.                      |
| 3    | Did a deploy/config/DAR/migration occur near start time? | Release registry, CI/CD, Helm history, config bundle audit.         | Freeze deploys or start rollback runbook.          |
| 4    | Is API edge healthy?                                     | Healthz, 5xx/4xx rates, latency, auth errors.                       | API/service owner or infra owner.                  |
| 5    | Are accepted writes reaching ledger command path?        | Operation queue, command attempts, completion listener.             | Participant-down or command-runtime investigation. |
| 6    | Is Canton Ledger/participant/synchronizer healthy?       | Ledger health, participant metrics, synchronizer status.            | Participant-down runbook.                          |
| 7    | Are projections fresh and correct?                       | Offset lag, reconciliation diffs, rebuild compare.                  | Projection-rebuild runbook.                        |
| 8    | Are webhooks delayed/failing?                            | Outbox backlog, retry attempts, DLQ, customer endpoint responses.   | Webhook-DLQ runbook.                               |
| 9    | Are credentials/authz behaving correctly?                | Key usage, auth failure spike, policy decisions, IP/mTLS anomalies. | API-key-rotation/security path.                    |
| 10   | Is data restore or migration rollback needed?            | DB health, migration history, corruption evidence.                  | DB-restore or migration-rollback runbook.          |

### Impact statement format

```text
Impact: <capability> is <unavailable/degraded/delayed> for <scope> since <UTC time>.
Safety: Ledger source-of-truth is <confirmed intact / under validation / uncertain>.
Customer action: <none / retry idempotently / pause integration / await support>.
Next update: <UTC time>.
```

### Invariant assessment

| Invariant clause                        | Incident risk question                                                            | Required evidence                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| IC-01 Canton Ledger source of truth     | Did any mitigation or bug create off-ledger economic authority?                   | Ledger command/projection trace; no manual projection-as-truth edits. |
| IC-02 DB Projection/Audit/Config only   | Did DB restore/patch introduce authoritative asset state?                         | Migration/schema review; restore/rebuild logs.                        |
| IC-03 Public API hides Canton internals | Did errors/status/customer exports expose internal IDs?                           | Response/log/customer update review.                                  |
| IC-04 Mutation trace spine              | Can affected writes trace request → intent → operation → command → update/offset? | `pillarctl trace` sample and audit rows.                              |
| IC-05 Stable operation/command identity | Did retries create duplicate economic operations?                                 | Idempotency record and command attempt comparison.                    |
| IC-06 Events from projection            | Were customer events generated from optimistic state?                             | Event source and projection checkpoint audit.                         |
| IC-07 Webhook signing/replay            | Were deliveries signed/versioned/replayed correctly?                              | Delivery attempt headers, endpoint version, replay audit.             |
| IC-08 Deployment-mode API parity        | Did mode-specific mitigation change public behavior?                              | OpenAPI/API smoke across affected mode.                               |
| IC-09 Idempotency uniqueness            | Did same key/request produce same response and operation?                         | Idempotency replay check.                                             |
| IC-10 Projection rebuildable            | Can projections be rebuilt from ledger/PQS for affected scope?                    | Rebuild/reconcile output.                                             |

## Mitigate

| Scenario                 | Mitigation                                                                                                      | Guardrail                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Broad API outage         | Route to healthy region if API grammar and data-plane ownership remain valid; otherwise fail closed/read-only.  | Do not accept writes that cannot be traced/idempotently resumed.          |
| Elevated write failures  | Pause write workers or reject new mutations with typed errors while preserving accepted operation trace.        | Do not change accepted operation IDs or command IDs.                      |
| Command completion delay | Keep accepted intents in `processing`; slow or pause new writes if queues grow; monitor completion.             | Do not mark ledger outcome from API optimism.                             |
| Projection lag           | Serve stale reads only within documented freshness policy; disclose degradation; rebuild/reconcile from ledger. | Do not patch balances/holdings manually as truth.                         |
| Webhook backlog          | Scale dispatcher, pause failing endpoints, drain DLQ, replay with preserved `event.id`.                         | Do not create replacement event objects for already-created events.       |
| Security suspicion       | Disable/rotate suspected credentials, narrow scopes, block suspicious IPs, require mTLS, preserve evidence.     | Do not reveal raw secrets or delete audit records.                        |
| Bad deploy/config        | Freeze deployments, roll back image/chart/config/DAR/migration using specific runbook.                          | Preserve pre-rollback evidence and verify invariant gates after rollback. |
| DB corruption/loss       | Isolate affected data plane, snapshot, restore Audit/Config, rebuild Projection from ledger.                    | Canton Ledger remains authority; no stale projection reopening.           |

### Mitigation approval matrix

| Action                          |                                 IC approval |    Component lead |                     Security/Compliance |                           Customer comms |
| ------------------------------- | ------------------------------------------: | ----------------: | --------------------------------------: | ---------------------------------------: |
| Scale workers/pods              |   Optional for SEV3, required for SEV1/SEV2 |          Required |                            Not required |     Not required unless customer impact. |
| Pause writes or enter read-only |                                    Required |          Required | Required if compliance/security context |           Required for customer-visible. |
| Disable customer credential     | Required for broad, optional for single key |      API/Security |                                Required |          Required for affected customer. |
| Roll back deploy/config         |                      Required for SEV1/SEV2 | Release/component |          If security/compliance related |            Required if customer-visible. |
| Restore DB                      |                                    Required |    Database owner |       Compliance if audit/data affected |            Required if customer-visible. |
| Rebuild projection              |                      Required for SEV1/SEV2 |  Projection owner |          Not required unless data issue | Required if stale reads/customer impact. |
| Public root-cause statement     |                                    Required |  Component review |         Required if security/compliance |                                Required. |

## Recover

| Recovery phase       | Actions                                                                                                 | Exit criteria                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Stabilize            | Mitigation in place; no worsening impact; incident roles staffed.                                       | Error rate/burn no longer increasing or unsafe path stopped. |
| Restore capability   | Re-enable healthy traffic/workers/region/config; replay safe queues; complete rollback/restore/rebuild. | Customer-visible capability works in smoke tests.            |
| Validate correctness | Run trace, idempotency, projection, webhook, audit checks for affected scope.                           | No unexplained invariant risk remains.                       |
| Drain delayed work   | Classify accepted operations, command attempts, projection jobs, webhook deliveries.                    | Queues/backlogs within SLO or safely quarantined with owner. |
| Monitor              | Watch SLO dashboards over recovery window.                                                              | No recurrence; burn-rate stable.                             |
| Close customer loop  | Send recovery/resolution updates and customer-specific instructions.                                    | Communications complete and recorded.                        |

### Recovery safety gates

| Gate                 | Must pass before closure                                                                |
| -------------------- | --------------------------------------------------------------------------------------- |
| Customer capability  | Affected endpoint/workflow is available or explicitly declared degraded with follow-up. |
| Ledger safety        | No unresolved ledger/projection economic uncertainty.                                   |
| Idempotency safety   | Accepted retries remain safe and traceable.                                             |
| Webhook safety       | Delayed events are delivered, queued, or DLQ-classified with replay plan.               |
| Audit safety         | Incident actions and affected operations are auditable.                                 |
| Communication safety | Customers/status page/support have consistent, approved statements.                     |
| Follow-up safety     | Root cause owner and prevention tickets exist for unresolved systemic gaps.             |

## Verify

| Verification                | Command / source                                                                         | Pass condition                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Active alert clear          | `pillarctl alerts active --env <env> --severity all`                                     | Incident-causing alert cleared or intentionally silenced with owner/timebox.                                  |
| SLO recovery                | `pillarctl slo status --env <env> --window 30m`                                          | SLO back within threshold or burn rate stopped and impact disclosed.                                          |
| API read smoke              | `curl -fsS -H "Authorization: Bearer <test-key>" https://<api-host>/v1/balances?limit=1` | Returns valid public object grammar without Canton internal identifiers.                                      |
| API write/idempotency smoke | `pillarctl smoke idempotency --env <env>`                                                | Same key/request returns same operation/response; conflict returns structured 409.                            |
| Trace sample                | `pillarctl trace operation <op_...>`                                                     | Request → operation → command attempt → completion/update → projection/event trace complete where applicable. |
| Projection                  | `pillarctl projection status --env <env>`                                                | Lag within SLO; no unexplained reconciliation diff.                                                           |
| Reconciliation              | `pillarctl reconcile run --env <env> --scope <affected-scope> --dry-run`                 | Zero unexplained diff or documented ledger-final explanation.                                                 |
| Webhook                     | `pillarctl webhooks backlog --env <env>`                                                 | Backlog/DLQ within expected bounds; affected events delivered or classified.                                  |
| Security                    | `pillarctl audit verify --case <case-id>`                                                | Admin actions, key changes, access reviews, and evidence collection recorded.                                 |
| Regression contract         | Review [REGRESSION_CONTRACT.md](../REGRESSION_CONTRACT.md) applicable IC clauses.        | No clause remains violated by mitigation/recovery.                                                            |

### Closure checklist

| Item                            |       Required for SEV1 |       Required for SEV2 |    Required for SEV3 |
| ------------------------------- | ----------------------: | ----------------------: | -------------------: |
| Incident timeline complete      |                     Yes |                     Yes |          Recommended |
| Customer impact statement       |                     Yes | Yes if customer-visible |                   No |
| Verification table completed    |                     Yes |                     Yes | Relevant checks only |
| Evidence links attached         |                     Yes |                     Yes |   If useful/repeated |
| Security/compliance disposition | Yes if trigger possible | Yes if trigger possible |          If relevant |
| Post-incident owner assigned    |                     Yes |                     Yes |         If recurring |
| Status-page resolution          |                     Yes |   If status page opened |                   No |

## Communicate (customer-facing message templates)

### Communication channels

| Channel                    | Use for                                                        | Owner                                     | Cadence                                                             |
| -------------------------- | -------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| Incident channel           | Internal coordination, decisions, timeline.                    | Incident Commander                        | Continuous during active incident.                                  |
| Status page                | Broad customer-visible SEV1/SEV2 impact.                       | Communications Lead                       | Initial within incident policy; updates at stated next-update time. |
| Support macro/ticket       | Customer-specific tickets and instructions.                    | Customer Support Lead                     | At initial update, material change, recovery, resolution.           |
| Account owner update       | Strategic/regulated/high-touch customers.                      | Customer Support Lead + Executive Sponsor | As contractual commitments require.                                 |
| Security/compliance notice | Potential compromise, data exposure, regulator trigger.        | Security/Compliance Lead                  | Per legal/regulatory clock.                                         |
| Executive bridge           | Broad SEV1, prolonged outage, severe customer/regulatory risk. | Incident Commander                        | At IC-defined cadence.                                              |

### Status-page update flow

| Step | Action                             | Required content                                                                                  |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1    | Decide if status page is required. | Customer-visible SEV1 always; SEV2 if broad, contractual, or likely to generate customer tickets. |
| 2    | Draft initial message.             | Capability, scope, start time, current action, next update time.                                  |
| 3    | Review.                            | IC approves technical accuracy; Security/Compliance approves if relevant.                         |
| 4    | Publish.                           | Status page component and severity match customer symptom.                                        |
| 5    | Update on cadence.                 | Material change or next-update time, whichever comes first.                                       |
| 6    | Resolve.                           | Recovery time, verification summary, post-incident commitment if applicable.                      |

### Initial investigation

```text
We are investigating an issue affecting <customer-visible capability> for <scope>. The issue began at approximately <UTC time>. Our team is actively working to identify the cause and mitigate impact. We will provide the next update by <UTC time>.
```

### Identified degradation

```text
We have identified a degradation affecting <capability> for <scope>. Customers may experience <symptom>. Accepted requests remain traceable, and we are validating final state before declaring recovery. Next update by <UTC time>.
```

### Write/read-only mitigation

```text
We have temporarily limited <write/read capability> for <scope> to protect operation integrity while we complete validation. Previously accepted idempotent requests should not be retried with changed request bodies. We will provide an update by <UTC time>.
```

### Webhook delay

```text
Webhook delivery for <scope> is delayed. Events are being retained for delivery/replay, and event identity will be preserved. Customer endpoints may receive delayed events after recovery. Next update by <UTC time>.
```

### Recovery monitoring

```text
We have mitigated the issue affecting <capability> as of <UTC time> and are monitoring recovery. We are validating delayed operations and notifications. Next update by <UTC time>.
```

### Resolved

```text
The issue affecting <capability> is resolved as of <UTC time>. We validated <API/projection/webhook/trace verification summary>. Customers do not need to retry successful idempotent requests unless instructed by Support.
```

### Security/compliance holding statement

```text
We are investigating a potential security or compliance event affecting <scope>. We have contained the suspected vector and are preserving evidence. We will notify affected customers and regulators as required after validation.
```

### Customer-specific follow-up

```text
Your environment <environment/account descriptor> was affected by <customer-visible symptom> between <UTC start> and <UTC end>. We validated <verification summary>. Required customer action: <none/action>. If you retried requests, ensure the same Idempotency-Key and request body were used for the same intended operation.
```

### Communication rules

| Rule                    | Requirement                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Be factual              | State observed impact, scope, mitigation, next update. Do not speculate about root cause.                                                 |
| Be Canton-invisible     | Public/customer language uses Pillar objects and capabilities, not participant/contract/template/command internals.                       |
| Preserve legal review   | Security/compliance statements require Security/Compliance approval before publication.                                                   |
| Avoid blame             | Do not attribute to a customer endpoint, cloud provider, Canton network, or vendor until evidence is confirmed and messaging is approved. |
| Explain customer action | If action is needed, make it explicit; otherwise say no action is required.                                                               |

## Post-incident

### Timeline requirements

| Time from resolution | Deliverable                  | Owner                               | Required content                                                                                                              |
| -------------------- | ---------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 2 hours              | Timeline skeleton            | Incident Commander                  | Start, detection, ack, mitigation, recovery, resolution, roles, evidence links.                                               |
| 24 hours             | Initial post-incident report | Incident Commander + Component Lead | Impact, root-cause hypothesis or known unknowns, mitigation, verification, customer/regulator disposition, immediate actions. |
| 5 business days      | Full post-mortem             | SRE Lead + Component Lead           | Root cause, contributing factors, detection gaps, prevention actions, owners, due dates, regression/invariant updates.        |
| Next release gate    | Follow-up verification       | Phase/release owner                 | Tests, runbooks, alerts, SLOs, threat controls, or docs updated and verified.                                                 |

### Post-mortem outline

| Section                      | Required detail                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Summary                      | Customer-visible impact in one paragraph.                                                    |
| Severity                     | Final severity and why it changed, if changed.                                               |
| Customer impact              | Tenants/regions/capabilities affected; duration; customer action.                            |
| Timeline                     | UTC event sequence from first signal through closure.                                        |
| Root cause                   | Evidence-backed root cause; if unknown, exact remaining unknown and next investigation step. |
| Contributing factors         | Missing alerts, unsafe defaults, weak gates, tooling gaps, unclear ownership.                |
| What went well               | Detection/mitigation/recovery behaviors worth keeping.                                       |
| What went poorly             | Delays, confusion, missing evidence, communication gaps.                                     |
| Invariant review             | Applicable Regression Contract clauses and final disposition.                                |
| Security/compliance review   | Threat/regulator/data exposure assessment and retention status.                              |
| Prevention actions           | Ticket IDs, owners, acceptance checks, due dates.                                            |
| Customer/regulator follow-up | Messages sent, commitments made, deadlines.                                                  |

### Regulator notification triggers

| Trigger                                                                                                  | Include Compliance immediately? | Notes                                                                  |
| -------------------------------------------------------------------------------------------------------- | ------------------------------: | ---------------------------------------------------------------------- |
| Confirmed or suspected unauthorized access to customer data, audit logs, credentials, or admin functions |                             Yes | Treat as SEV1 until scoped.                                            |
| Loss, alteration, or unavailability of required audit evidence                                           |                             Yes | Preserve chain-of-custody artifacts.                                   |
| Potential personal/sensitive data exposure                                                               |                             Yes | Do not send customer/regulator details before validation/legal review. |
| Material outage crossing contractual or jurisdictional reporting threshold                               |                             Yes | Compliance determines clock and notification body.                     |
| Suspicious asset movement, sanctions/compliance hook bypass, or policy decision failure                  |                             Yes | Preserve ledger trace and policy decision evidence.                    |
| Failed retention, deletion, or legal hold control                                                        |                             Yes | Stop destructive jobs for affected scope.                              |
| Customer-validator/self-hosted regulated customer requests incident attestation                          |                             Yes | Coordinate with account owner and legal/compliance.                    |

### Evidence retention

| Evidence class                                        | Default action                                                                       | Extended retention trigger                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Incident record and timeline                          | Retain in incident archive.                                                          | SEV1/SEV2, customer commitment, regulator inquiry.                 |
| Audit logs and admin actions                          | Retain under audit policy.                                                           | Security/compliance trigger, legal hold, disputed customer action. |
| Request/operation/idempotency records                 | Retain under audit/idempotency policy.                                               | Economic correctness review or customer dispute.                   |
| Command attempt/completion/update/projection evidence | Retain in privileged incident evidence store.                                        | Ledger/projection correctness uncertainty.                         |
| Logs/traces/metrics exports                           | Retain incident-scoped bundle.                                                       | Security/compliance, recurring incident, root cause unknown.       |
| DB snapshots/backups                                  | Retain backup reference and checksum; avoid indefinite raw snapshot unless required. | Legal hold, restore validation, corruption investigation.          |
| Customer communications                               | Retain with incident record and support tickets.                                     | Contractual reporting, regulator inquiry.                          |

### Follow-up action rules

| Rule            | Requirement                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Actionable      | Every follow-up has owner, due date, acceptance check, and linked phase/ticket when applicable. |
| Verified        | Prevention action is not complete until test/dashboard/runbook/gate proves it.                  |
| Invariant-aware | If an invariant was at risk, update a regression check or runbook gate.                         |
| Customer-aware  | If customer communication was confusing, update templates/support macros.                       |
| Security-aware  | If threat control failed, update threat model/control/test, not only code.                      |

## Related

- SLOs: [SLO_CATALOG.md](../SLO_CATALOG.md), [22 Pillar Observability — SLO draft](../../Architecture/22_Pillar%20Observability.md#pillar-%EC%9A%B4%EC%98%81-slo--sla-%EC%B4%88%EC%95%88)
- Phase tickets: [Phase 06 Webhook Event System](../Phase_06_Webhook_Event_System.md), [Phase 08 Security Compliance](../Phase_08_Security_Compliance.md), [Phase 09 CI/CD Helm Deployment](../Phase_09_CICD_Helm_Deployment.md), [Phase 10 GA Hardening](../Phase_10_GA_Hardening.md)
- ADRs: [ADR-0001](../DECISIONS.md#adr-0001-canton-ledger-as-sole-source-of-truth), [ADR-0002](../DECISIONS.md#adr-0002-billing-style-external-api-surface-canton-internals-hidden), [ADR-0003](../DECISIONS.md#adr-0003-intent-first-write-path), [ADR-0004](../DECISIONS.md#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt), [ADR-0005](../DECISIONS.md#adr-0005-projection--audit--config-split-for-pillar-postgres), [ADR-0006](../DECISIONS.md#adr-0006-webhook-first-async-with-hmac-sha256-signing-and-per-endpoint-version-pinning), [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar)
- Threats: [THREAT_MODEL.md](../THREAT_MODEL.md), [12 Security](../../Architecture/12_Security.md), [19 Compliance](../../Architecture/19_Compliance.md)
- Component runbooks: [participant-down.md](./participant-down.md), [projection-rebuild.md](./projection-rebuild.md), [dar-rollback.md](./dar-rollback.md), [api-key-rotation.md](./api-key-rotation.md), [webhook-dlq-drain.md](./webhook-dlq-drain.md), [db-restore.md](./db-restore.md), [migration-rollback.md](./migration-rollback.md)
