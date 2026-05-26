# Runbook: Participant Down

## Trigger

| Signal                              | Threshold                                                                | Source                              | Immediate concern                                         |
| ----------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- | --------------------------------------------------------- |
| `ledger-command` health = `unready` | 2 consecutive probes or one hard dependency failure                      | `services/ledger-command` readiness | New mutations cannot safely submit Canton commands.       |
| Command queue backing up            | Queue age or depth above page threshold                                  | Queue / worker metrics              | Accepted intents may breach command completion freshness. |
| Projection lag growing              | Ledger offset gap increasing while commands are pending                  | Projection worker metrics           | Customer reads and webhook events may become stale.       |
| Participant health degraded         | Ledger API unreachable, unhealthy synchronizer, or no active participant | Canton health endpoint / Prometheus | Canton source-of-truth path is unavailable.               |
| Command success SLO burn            | `pillar_ledger_command_success` burn alert                               | SLO alert                           | Commands may be rejected, timed out, or unclassified.     |
| API 5xx spike                       | `pillar_api_5xx_rate` burn alert                                         | API / gateway metrics               | Public mutation path may be returning platform errors.    |

| Correlation key        | Required lookup                                                      | Why it matters                                            |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| Tenant/environment     | Deployment mode, participant binding, active party set               | Mitigation differs by mode.                               |
| `operation_id` sample  | Trace through intent, command request, completion, projection, event | Confirms whether failures are before or after submission. |
| Participant endpoint   | Ledger API, Admin API, health, metrics address                       | Distinguishes Pillar runtime failure from Canton failure. |
| Active DAR/package set | Registry active package pin and participant inventory                | Prevents confusing package mismatch with outage.          |
| Idempotency cohort     | Idempotency keys accepted during incident window                     | Ensures retries reuse stable command identity.            |

## Severity classification

| Severity | Condition                                                                               | Customer impact                                                       | Incident posture                                                                                      |
| -------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SEV1     | No working participant in a deployment mode that requires one for new ledger mutations. | Mutations cannot progress to ledger truth; customer workflow blocked. | Page incident commander, pause unsafe mutation acceptance, execute failover or read-only degradation. |
| SEV1     | Accepted commands are backing up and no healthy HA target exists.                       | Idempotent operations may remain `processing` past SLO.               | Freeze risky deploys, protect idempotency records, communicate impact.                                |
| SEV1     | Participant outage plus projection lag prevents safe customer reads beyond SLO.         | Reads may be stale and writes blocked.                                | Degrade read/write surfaces explicitly; do not serve misleading balances.                             |
| SEV2     | One participant replica down but HA participant is healthy and queue drains normally.   | No or limited customer-visible impact.                                | Fail over, monitor, no broad customer message unless SLO burn starts.                                 |
| SEV2     | Customer-validator participant down for one tenant while hosted fleet is healthy.       | Tenant-specific mutation degradation.                                 | Coordinate with customer operator; keep API grammar unchanged.                                        |
| SEV3     | Readiness flapped and self-recovered before queue age exceeded alert threshold.         | No confirmed customer impact.                                         | Open post-incident note and inspect deploy/network changes.                                           |

| SLO / ticket reference                                                                                    | Runbook usage                                                             |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pillar_api_5xx_rate`                                                                                     | Classify public API availability impact and decide status-page update.    |
| `pillar_ledger_command_success`                                                                           | Classify command-plane failure rate and validate recovery.                |
| [P4.F02](../Phase_04_Ledger_Command_Runtime.md)                                                           | Ledger command worker readiness and participant connectivity behavior.    |
| [P4.F04](../Phase_04_Ledger_Command_Runtime.md)                                                           | Retry and command dedup identity behavior.                                |
| [P4.F06](../Phase_04_Ledger_Command_Runtime.md)                                                           | Runtime failure classification and operator visibility.                   |
| [REGRESSION_CONTRACT IC-04/IC-05](../REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable) | Mutation trace and command identity must remain intact during mitigation. |

## On-call decision tree

| Step | Question                                                                     | If yes                                                                  | If no                                                               |
| ---- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1    | Is any participant healthy for the affected tenant/environment?              | Continue to deployment-mode branch.                                     | SEV1; pause mutation acceptance or route to explicit degraded mode. |
| 2    | Are accepted command requests already persisted?                             | Preserve queue ordering and idempotency state; do not delete rows.      | Block new mutation admission before creating orphaned operations.   |
| 3    | Is HA participant failover configured and verified for this binding?         | Fail over only if sticky routing and command dedupe rules remain valid. | Do not improvise participant changes; use mode-specific mitigation. |
| 4    | Is projection lag caused by participant outage or projection worker failure? | Follow participant recovery first; then drain projection.               | Escalate to projection runbook if ledger path is healthy.           |
| 5    | Are commands rejected with package/template errors?                          | Switch to [DAR rollback](./dar-rollback.md).                            | Continue participant/network/auth diagnosis.                        |

| Deployment mode      | Primary owner                               | Safe mitigation                                                                                                                         | Unsafe mitigation                                                                                    |
| -------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `hosted`             | Pillar SRE                                  | Fail over to Pillar-operated HA participant; pause mutation API if no HA target; drain command queue in order.                          | Routing to a participant lacking required packages, party rights, or dedupe continuity.              |
| `customer-validator` | Customer validator operator plus Pillar SRE | Keep Pillar API stable; coordinate customer participant restart/connectivity; optionally pause tenant mutations with `503 Retry-After`. | Exposing participant details in public `/v1` responses or bypassing customer-owned validator policy. |
| `self-hosted`        | Customer SRE; Pillar supports runbook       | Instruct local operator to restart participant/chart, validate local config bundle and secrets, keep API grammar unchanged.             | Pillar cloud attempting hot-path control over self-hosted local participant.                         |

| Decision               | Required evidence                                                                                            | Action                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Fail over              | Healthy alternate participant, same tenant/party binding, required DARs visible, dedupe/sticky routing valid | Shift ledger-command target and watch completions.                                                 |
| Pause mutations        | No safe participant target or command identity risk                                                          | Return structured `503` with `Retry-After`; keep reads only if projection freshness is within SLO. |
| Hold incoming requests | Idempotency layer can persist requests without submission and later resume safely                            | Accept only if product semantics allow `processing`; otherwise return `503`.                       |
| Degrade reads          | Projection lag exceeds read freshness SLO                                                                    | Serve explicit stale/unavailable behavior; do not fabricate balances.                              |

## Pre-checks

| Check                       | Command/source                                        | Pass criteria                                                                         | Stop if failing                           |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| Confirm incident scope      | Alert labels: tenant, environment, mode, region       | Single scope or documented multi-scope blast radius                                   | Unknown tenant/mode.                      |
| Freeze deploys              | Release dashboard / deploy pipeline                   | No active deploy touching `services/ledger-command`, registry, Helm, network, secrets | Active deploy in same blast radius.       |
| Snapshot queue state        | Queue dashboard and DB read-only query                | Oldest command age, depth, retry count, operation sample recorded                     | Queue state unavailable.                  |
| Snapshot idempotency cohort | Idempotency/audit read-only query                     | Accepted mutation keys in incident window listed                                      | Cannot prove retry identity preservation. |
| Check participant inventory | Registry / deployment inventory                       | Expected participant(s), endpoint(s), package status known                            | Inventory missing or stale.               |
| Check active DARs           | Template registry active pin and compatibility record | Required package set is uploaded/vetted on target participant                         | Package mismatch suspected.               |
| Check secrets age           | Secret manager / local chart values                   | JWT, mTLS certs, trust roots unexpired and current                                    | Expired or rotated secrets unresolved.    |
| Check network path          | Gateway, DNS, firewall, service mesh, mTLS policy     | Ledger API and Admin API reachable from ledger-command                                | Network isolation unresolved.             |
| Establish audit channel     | Incident ticket and operator identity                 | All manual actions logged with reason                                                 | No audit trail.                           |

| Public API guardrail                                                                            | Requirement                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do not expose Canton participant, package, command, or party identifiers in customer responses. | [README invariant 3](../README.md#cross-phase-invariants-never-violate).                                                                                                          |
| Do not create a new `operation_id` or `command_id` for the same external intended change.       | [ADR-0004](../DECISIONS.md#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt) and [ADR-0011](../DECISIONS.md#adr-0011-command_id-derivation-spec). |
| Do not mutate projection tables to hide ledger unavailability.                                  | [REGRESSION_CONTRACT IC-01/IC-02](../REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable).                                                                        |
| Do not treat DB balances as authority during recovery.                                          | [README invariant 1-2](../README.md#cross-phase-invariants-never-violate).                                                                                                        |

## Diagnose

| Area                      | Evidence                                               | Interpretation                                                    | Next step                                                 |
| ------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------- |
| Participant process       | Health endpoint, pod/systemd status, restart count     | Process crash, deadlock, storage issue, or resource exhaustion    | Restart only after queue/idempotency snapshot.            |
| Synchronizer connectivity | Participant health: connected/unhealthy synchronizers  | Participant alive but not connected to ordering service           | Engage network/Canton operator.                           |
| Ledger API auth           | JWT validation errors, mTLS handshake failures         | Secret expiry, issuer/audience mismatch, CA rotation, cert expiry | Rotate/fix secrets before retry storm.                    |
| Ledger API network        | DNS failure, TLS timeout, connection refused           | Service discovery, firewall, mesh, endpoint change                | Restore route or fail over.                               |
| Package/DAR availability  | PackageManagementService query, registry compatibility | Participant lacks active package or vetting                       | Switch to DAR rollback or upload plan.                    |
| Command queue             | Oldest age, retries, dead-letter reasons               | Backpressure, poison command, participant outage                  | Preserve order; isolate poison only with trace evidence.  |
| Completion stream         | Completion listener lag, missing completions           | Submitted commands not classified                                 | Reconnect listener; do not resubmit with new command IDs. |
| Projection lag            | Last processed ledger offset and update timestamp      | Ledger updates not projected or no new updates exist              | Split participant outage vs projection worker issue.      |
| Webhook DLQ               | DLQ growth after projection resumes                    | Downstream notifications delayed                                  | Recover after projection catches up.                      |
| Recent changes            | Deploys, config bundle, registry pin, secret rotation  | Regression or drift                                               | Roll back config/deploy only if safe and audited.         |

| Log query focus                    | Required fields                                                         | Redaction rule                                                           |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ledger-command` startup/readiness | tenant, environment, participant binding, registry version, error class | No raw contract payloads.                                                |
| Command submission failure         | operation ID, command semantic version, attempt number, error category  | Internal traces only; do not paste Canton internals into customer comms. |
| Auth failure                       | issuer, audience, cert fingerprint, expiry, mTLS policy name            | Never expose secret values.                                              |
| Network failure                    | source service, destination endpoint alias, status, latency             | Use endpoint alias in incident ticket where possible.                    |
| Projection lag                     | projector, checkpoint, ledger offset watermark, lag duration            | Customer-visible message uses freshness language, not raw offsets.       |

| Failure pattern                                                     | Likely cause                                 | Branch                                                                            |
| ------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Readiness fails with `participant_unreachable` and network timeouts | Ledger API route or participant down         | Mitigate participant/network.                                                     |
| Readiness fails with `package_not_found`                            | DAR/package mismatch                         | [DAR rollback](./dar-rollback.md).                                                |
| Commands accepted but completions absent                            | Completion stream or participant state issue | Restart listener; validate submitted attempts before resubmission.                |
| Commands rejected as unauthorized                                   | Party rights, JWT, mTLS, user mapping        | Security/config fix; no retry storm.                                              |
| Projection lag grows while command completions continue             | Projection worker issue                      | [Projection rebuild](./projection-rebuild.md) only if corruption/drift suspected. |

## Mitigate

| Situation                                  | Action                                                                            | Guardrail                                                                                | Owner                           |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| Hosted HA target healthy                   | Fail over ledger-command to standby participant.                                  | Verify active DARs, party bindings, sticky routing, and command dedupe continuity first. | Pillar SRE.                     |
| Hosted no HA target                        | Pause mutation API for affected tenant/environment.                               | Return `503` with `Retry-After`; do not accept commands that cannot be submitted safely. | Pillar SRE/API on-call.         |
| Customer-validator participant down        | Coordinate customer restart/connectivity; pause only affected tenant mutations.   | Public API grammar remains same; do not expose participant internals.                    | Customer operator + Pillar SRE. |
| Self-hosted participant down               | Provide local chart/systemd recovery instructions and validation checklist.       | Pillar does not assume control of local hot path; customer audit trail is authoritative. | Customer SRE.                   |
| Queue backlog but participant restored     | Stop new mutation admission if drain threatens SLO; drain existing queue ordered. | FIFO/priority order must match command runtime policy; no delete/recreate.               | Ledger-command owner.           |
| Retry storm                                | Disable aggressive retries or extend backoff.                                     | Stable `command_id`; new `submission_id` only per actual attempt.                        | Ledger-command owner.           |
| Auth rotation failure                      | Roll back config bundle or install corrected JWT/mTLS material.                   | Audit every secret operation; no plaintext secret in ticket.                             | Security/on-call.               |
| Projection stale but ledger mutations safe | Consider read degradation for affected endpoints.                                 | Do not serve stale balances past SLO without explicit degraded response.                 | API/projection owner.           |

| Mutation pause behavior                      | Required response                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| New mutation request before idempotency lock | Structured `503 service_unavailable` with `Retry-After` and `request_id`; no intent/operation created.                   |
| Replay of existing idempotency key           | Return stored response if already finalized; otherwise return current operation state without changing command identity. |
| Accepted operation pending submission        | Keep operation in `processing` or `queued` internal state; do not synthesize success/failure.                            |
| Customer-visible read                        | Serve only if projection freshness within SLO; otherwise explicit unavailable/stale classification.                      |

| Idempotency holding pattern                                                                        | Rule                                  |
| -------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Hold incoming requests only when the idempotency record and operation can be persisted atomically. | Avoid orphaned operations.            |
| Never rehash or normalize the original request differently during incident code paths.             | Prevents operation identity drift.    |
| Never change `command_semantic_version` as an incident workaround.                                 | Would alter command ID derivation.    |
| Store incident reason on audit/config record, not customer object metadata.                        | Avoids leaking operational internals. |

## Recover

| Step | Action                                                 | Evidence                                                                               |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1    | Restore participant process or endpoint.               | Health endpoint reports ready; synchronizer connectivity healthy.                      |
| 2    | Validate Ledger API auth.                              | Test internal health/read call succeeds with current JWT/mTLS; no auth errors in logs. |
| 3    | Validate package inventory.                            | Active registry package set is visible/vetted on participant.                          |
| 4    | Re-enable ledger-command readiness.                    | Readiness reports all hard dependencies healthy.                                       |
| 5    | Resume queue drain in deterministic order.             | Oldest age decreases; no command identity drift.                                       |
| 6    | Classify pending attempts.                             | Each pending operation has completion, timeout, retry, or known queued state.          |
| 7    | Reopen mutation API gradually.                         | Error rate and queue age stay below thresholds.                                        |
| 8    | Let projection catch up.                               | Projection lag decreases to normal operating band.                                     |
| 9    | Let webhooks recover.                                  | Event outbox and DLQ drain; manual replay only when required.                          |
| 10   | Close incident only after verification table is green. | Incident ticket contains evidence links.                                               |

| Restart path                | Hosted                                                 | Customer-validator                                                                  | Self-hosted                                |
| --------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| Participant process restart | Pillar SRE restarts pod/service or fails over replica. | Customer operator restarts participant; Pillar validates externally visible effect. | Customer SRE restarts local chart/systemd. |
| Config reload               | Pillar config bundle or secret reload.                 | Pillar-side config plus customer participant auth material.                         | Local signed config bundle or Helm values. |
| DAR/package validation      | Pillar registry inventory.                             | Registry plus customer-provided participant evidence.                               | Local registry/offline bundle evidence.    |
| Command drain               | Pillar ledger-command queue.                           | Tenant-scoped queue drain after customer participant healthy.                       | Local queue drain by customer runbook.     |

| Command identity verification                                                     | Required check                                              |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| For sampled operations accepted before outage, `operation_id` is unchanged.       | Compare audit/idempotency record before and after recovery. |
| For each sampled operation, `command_id` is unchanged across retries.             | Compare command request/attempt records.                    |
| For each actual retry attempt, `submission_id` is unique.                         | Compare attempt table.                                      |
| No duplicate successful ledger operation exists for one external intended change. | Trace operation to completion/update/projection.            |
| Any timed-out command is classified before resubmission.                          | Avoids concurrent duplicate attempts.                       |

## Verify

| Verification          | Pass criteria                                                                         | Related invariant                        |
| --------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| Participant readiness | `ledger-command` readiness healthy for affected tenant/environment.                   | IC-04.                                   |
| Command success       | `pillar_ledger_command_success` returns to normal band and burn stops.                | IC-04/IC-05.                             |
| API errors            | `pillar_api_5xx_rate` returns below incident threshold.                               | IC-08 for mode-independent API behavior. |
| Queue drain           | Oldest command age and depth trend to pre-incident baseline.                          | IC-05.                                   |
| Command identity      | No operation has multiple command IDs for same external intended change.              | IC-05/IC-09.                             |
| Projection freshness  | Projection lag catches up and customer-visible reads are within SLO.                  | IC-10.                                   |
| Webhook recovery      | Outbox retry backlog drains; DLQ only contains customer endpoint or classified items. | IC-06/IC-07.                             |
| Public response scan  | No public response exposes participant/package/command IDs during degraded mode.      | IC-03.                                   |
| Audit completeness    | Incident actions linked to request/operation/config/audit records.                    | Ledger trace contract.                   |

| Sample operation audit                                        | Expected state after recovery                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Operation accepted before outage and committed after recovery | One operation, one command ID, one successful ledger update, projected terminal state, event emitted once with replay-safe delivery. |
| Operation accepted before outage and rejected by ledger       | One operation, one command ID, terminal failure classification, customer-visible error/event from projection/runtime rules.          |
| Operation retried by customer during outage                   | Same idempotency record and response semantics; no duplicate operation.                                                              |
| New mutation after reopen                                     | Accepted latency normal; completion freshness within SLO; webhook path normal.                                                       |

## Communicate

| Audience   | Hosted message template                                                                                                                                                                                                             | Customer-validator message template                                                                                                                                                                                                                                               | Self-hosted message template                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial    | "We are investigating degraded ledger command processing for affected Pillar environments. New mutations may remain processing or receive retryable service errors. Existing ledger-confirmed balances remain sourced from Canton." | "We are seeing degraded connectivity to your configured Canton validator/participant. Pillar API behavior is unchanged, but new mutations may be paused until the validator path is healthy. Please run the participant health checklist and share the incident ticket evidence." | "Your local Pillar data plane reports participant unavailability. Keep `/v1` clients unchanged; run the local participant and ledger-command recovery checks. Pillar can review evidence but does not control your hot path." |
| Mitigation | "We have paused affected mutation acceptance / failed over participant capacity and are draining accepted operations in order."                                                                                                     | "We have paused affected tenant mutations or are waiting for your validator to recover; idempotent retries will preserve operation identity."                                                                                                                                     | "Keep mutation traffic paused or retryable until local participant readiness and queue drain are green."                                                                                                                      |
| Recovery   | "Ledger command processing has recovered. We are validating projection freshness and webhook delivery before closing the incident."                                                                                                 | "Your validator path is healthy from Pillar's perspective. We are validating command completion, projection freshness, and webhook recovery."                                                                                                                                     | "Local evidence indicates recovery. Validate command identity, projection freshness, and webhook queues before reopening traffic fully."                                                                                      |
| Closure    | "The incident is resolved. Accepted operations retained idempotent command identity and projections/webhooks caught up."                                                                                                            | "The incident is resolved for the affected validator path. No public API contract change was required."                                                                                                                                                                           | "The local incident may be closed after your audit trail confirms command identity and projection recovery."                                                                                                                  |

| Communication rules                                                                          | Requirement                                          |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Public/customer messages use balance/intent/mutation terminology, not Canton internals.      | Protects Canton-invisible API model.                 |
| Do not promise exact ledger completion timing unless current telemetry supports it.          | Completion latency is deployment/operator dependent. |
| If customer reads were stale past SLO, publish a status page entry.                          | Avoids silent correctness impact.                    |
| If mutations were paused, include retry guidance and `Retry-After` semantics.                | Keeps clients safe without changing API grammar.     |
| If customer-validator/self-hosted action is required, state the exact local evidence needed. | Avoids vague escalation.                             |

## Post-incident

| Task                          | Owner                         | Evidence                                                                           |
| ----------------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| Attach timeline               | Incident commander            | Trigger, mitigation, recovery, verification timestamps.                            |
| Confirm severity              | Incident commander + SRE lead | Final classification against table above.                                          |
| Preserve samples              | Ledger-command owner          | Representative operation traces, idempotency keys hashed, command attempt records. |
| Review command identity       | Runtime owner                 | Proof no duplicate command IDs or duplicate ledger effects.                        |
| Review deployment-mode branch | Infra owner                   | Whether hosted/customer-validator/self-hosted ownership matched reality.           |
| Review alert quality          | Observability owner           | Alert led to correct runbook and scope.                                            |
| Review customer comms         | Support/CS                    | Templates used, customer-visible impact, status page accuracy.                     |
| File fixes                    | Owning phase/ticket           | Link to P4/P5/P6/P9/P10/P12 tickets as applicable.                                 |
| Add chaos coverage            | GA hardening owner            | Candidate for [P10.L01](../Phase_10_GA_Hardening.md) if missing.                   |

| Blameless questions                                   | Required answer                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Why did `ledger-command` become unready?              | Root cause category: participant, network, auth, DAR, runtime, queue, deploy, unknown. |
| Why did mitigation preserve or risk command identity? | Compare actions against ADR-0004/ADR-0011.                                             |
| Did any customer see stale or unavailable reads?      | Use projection freshness and API logs.                                                 |
| Did webhooks lag or DLQ?                              | Use event/outbox/DLQ metrics.                                                          |
| Did deployment mode ownership slow recovery?          | Convert ambiguity to docs/chart/runbook changes.                                       |
| Should alert thresholds change?                       | Tie to SLO burn and customer impact.                                                   |

## Related (SLOs, tickets, ADRs, threats)

| Type         | Link / ID                                                                                                                            | Relationship                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| SLO          | `pillar_api_5xx_rate`                                                                                                                | Public API availability degradation and recovery signal.                |
| SLO          | `pillar_ledger_command_success`                                                                                                      | Command-plane success degradation and recovery signal.                  |
| Ticket       | [P4.F02](../Phase_04_Ledger_Command_Runtime.md)                                                                                      | Participant connectivity/readiness integration.                         |
| Ticket       | [P4.F04](../Phase_04_Ledger_Command_Runtime.md)                                                                                      | Retry and dedup command identity.                                       |
| Ticket       | [P4.F06](../Phase_04_Ledger_Command_Runtime.md)                                                                                      | Command failure classification and operational visibility.              |
| Ticket       | [P5.G06](../Phase_05_Projection_Reconciliation.md)                                                                                   | Projection rebuild if downstream state becomes suspect.                 |
| Ticket       | [P6.H04](../Phase_06_Webhook_Event_System.md)                                                                                        | Webhook retry/DLQ recovery after ledger/projection catch-up.            |
| Ticket       | [P10.L01](../Phase_10_GA_Hardening.md)                                                                                               | Chaos drill for participant outage and retry storm.                     |
| ADR          | [ADR-0001](../DECISIONS.md#adr-0001-canton-ledger-as-sole-source-of-truth)                                                           | Ledger remains economic authority during outage.                        |
| ADR          | [ADR-0004](../DECISIONS.md#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt)                         | Stable operation and command identity during retries.                   |
| ADR          | [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar) | Deployment mode changes ownership, not `/v1` grammar.                   |
| ADR          | [ADR-0011](../DECISIONS.md#adr-0011-command_id-derivation-spec)                                                                      | Exact command ID derivation to preserve.                                |
| Contract     | [REGRESSION_CONTRACT §5](../REGRESSION_CONTRACT.md#5-ledger-trace-contract)                                                          | Trace spine from API request to ledger/projection/webhook.              |
| Contract     | [REGRESSION_CONTRACT §9](../REGRESSION_CONTRACT.md#9-deployment-mode-contract)                                                       | Mode-specific operational differences and forbidden public differences. |
| Architecture | [Security](../../Architecture/12_Security.md)                                                                                        | JWT/mTLS, authz, no raw ledger leakage.                                 |
| Architecture | [Deployment](../../Architecture/18_Deployment.md)                                                                                    | Hosted/customer-validator/self-hosted responsibility split.             |
| Architecture | [Observability](../../Architecture/22_Pillar%20Observability.md)                                                                     | SLOs, traces, runbook-driven operations.                                |

## Action steps
1. Triage alert scope and affected environment.
2. Capture dashboard, logs, and command/projection evidence.
3. Apply the documented recovery action with incident commander approval.
4. Validate no duplicate ledger commands and attach evidence.

## Exit criteria
- Alert cleared or downgraded.
- Affected SLO is back within burn-rate policy.
- Evidence is attached to the incident record.

## Evidence checklist
- Alert ID and timestamps.
- Dashboard or log excerpt.
- Owner decision record.
- Validation command output.

## Cross-links
- SLO catalog: `infra/observability/slo/catalog.yaml`.
- Dashboards: `infra/observability/grafana/dashboards/`.

## Last reviewed
2026-05-26
