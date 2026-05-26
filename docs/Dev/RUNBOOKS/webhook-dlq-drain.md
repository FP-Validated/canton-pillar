# Runbook: Webhook DLQ drain

## Trigger

| Trigger                                | Detection source                                                     | Default severity                                | Owner                  | Notes                                                                 |
| -------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| DLQ size above threshold               | `pillar_webhook_dlq_age_seconds`, DLQ depth dashboard, alert         | SEV2 if many customers; SEV3 if single customer | Webhook SRE            | Age is usually more important than raw count.                         |
| Customer complaint about missed events | Support ticket, Workbench event inspector, customer integration logs | SEV3 single customer; SEV2 many customers       | Support + Webhook SRE  | Treat customer endpoint evidence as input, not authority.             |
| Delivery success drop                  | `pillar_webhook_delivery_success` per endpoint/version               | SEV2/SEV3                                       | Webhook SRE            | Separate platform-origin failure from customer receiver failure.      |
| Signature mismatch spike               | Delivery attempt errors and customer logs                            | SEV3 unless broad platform signer issue         | Security + Webhook SRE | Common cause: customer regenerated secret without rotating in Pillar. |
| Retry amplification risk               | Queue depth, retry depth, endpoint 5xx/timeout rate                  | SEV2                                            | Webhook SRE            | Pause retries for affected endpoint before drain.                     |

| Affected surface     | Included                                                        | Excluded                                              |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| Webhook event outbox | Event creation from projected ledger state.                     | Recreating events from API request state.             |
| Delivery attempts    | Retry/DLQ classification, endpoint pause, manual replay.        | Exactly-once delivery guarantees.                     |
| Customer receiver    | 4xx, 5xx, timeout, TLS, DNS, signature mismatch diagnostics.    | Modifying customer code directly.                     |
| Manual replay        | P6.H05 replay flow with rate limiting and preserved `event.id`. | Ad hoc SQL updates that bypass delivery ledger/audit. |

## Severity

| Severity | Condition                                                                                                 | Incident posture                                               | Customer posture                                                                |
| -------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| SEV2     | Many customers affected, platform dispatcher/signing failure, shared queue failure, broad DLQ age breach. | Incident Commander optional; Webhook SRE leads.                | Customer-specific notices for impacted tenants; status page if platform-origin. |
| SEV3     | Single endpoint/customer affected by receiver failure, bad secret, endpoint outage, or isolated DLQ.      | Normal support escalation.                                     | Customer-specific notice and replay coordination.                               |
| SEV1     | Webhook DLQ plus ledger/projection corruption or platform-wide event loss.                                | Use DB/projection incident path; this runbook is insufficient. | Status page and executive escalation.                                           |

| Escalation signal                        | Escalate to        | Reason                                             |
| ---------------------------------------- | ------------------ | -------------------------------------------------- |
| Event outbox creation stopped            | Projection SRE     | Events must originate from projected ledger state. |
| Delivery worker cannot read queue        | Infra SRE          | Platform dispatcher failure.                       |
| Signatures invalid for many endpoints    | Security           | Potential signer/key regression.                   |
| DLQ includes regulated compliance events | Compliance         | Notice obligations may apply.                      |
| Replay would exceed customer rate limit  | Support + customer | Customer-driven recovery required.                 |

## On-call decision tree

| Step | Question                                                | If yes                                                                                       | If no                                                                   |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | Is the alert scoped to one endpoint/customer?           | Treat as SEV3; inspect receiver behavior.                                                    | Treat as SEV2; inspect platform dispatcher and shared dependencies.     |
| 2    | Are events being created in the outbox?                 | Continue delivery diagnostics.                                                               | Escalate to projection/event creation; do not drain nonexistent events. |
| 3    | Is receiver returning 5xx or timing out?                | Pause additional retries for endpoint; contact customer.                                     | Check 4xx/signature/TLS/DNS causes.                                     |
| 4    | Is receiver returning 4xx?                              | Classify as customer configuration or permanent rejection.                                   | Check timeout/network/signer.                                           |
| 5    | Is signature mismatch present?                          | Verify endpoint secret/version; suspect customer regenerated secret without Pillar rotation. | Continue status-code diagnosis.                                         |
| 6    | Is platform signer/dispatcher failing across endpoints? | SEV2 platform incident; pause broad replay until fixed.                                      | Endpoint-specific mitigation.                                           |
| 7    | Has customer fixed receiver and approved replay window? | Drain via P6.H05 manual replay with rate limits.                                             | Keep endpoint paused or retry-suppressed to prevent amplification.      |
| 8    | Is DLQ age returning to zero and success recovering?    | Verify and close.                                                                            | Reassess cause; do not force unbounded replay.                          |

| Deployment mode      | Control branch                                                                                         | Customer responsibility                                          | Pillar responsibility                              |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------- |
| `hosted`             | Pillar runs dispatcher/queue and owns drain tooling.                                                   | Fix receiver endpoint and confirm replay window.                 | Pause retries, run P6.H05 replay, monitor metrics. |
| `customer-validator` | Pillar may run API/dispatcher; customer participant/projection locality may affect event availability. | Fix receiver and participant/network availability.               | Verify event creation and delivery pipeline.       |
| `self-hosted`        | Customer runs dispatcher and queue unless managed support.                                             | Execute local drain; export metrics/audit if asking for support. | Provide procedure and review evidence.             |

## Pre-checks

| Check                       | Source                                               | Required answer                                | Stop condition                                                     |
| --------------------------- | ---------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| Identify endpoint(s)        | Webhook endpoint ID `we_*`, URL hash, tenant/account | Exact endpoint IDs                             | Do not replay all endpoints when only one is affected.             |
| Identify event types        | DLQ rows grouped by event type                       | Event type list and counts                     | Compliance events may require extra notice.                        |
| Identify oldest DLQ age     | `pillar_webhook_dlq_age_seconds`                     | Oldest event age and threshold breach          | If age violates SLO, keep severity at least SEV2 for broad impact. |
| Identify failure reason     | Delivery attempts, status, error class               | 5xx, 4xx, timeout, TLS/DNS, signature mismatch | Unknown reason blocks replay.                                      |
| Verify event authority      | Event row trace to projection offset                 | Event came from projected ledger state         | If not, stop and escalate; never replay optimistic events.         |
| Check endpoint pause state  | Dispatcher endpoint config                           | active, paused, retry_suppressed               | Avoid retry amplification.                                         |
| Check customer secret state | Endpoint secret active/previous and rotation window  | Secret version expected by customer            | Signature mismatch often equals unsynced rotation.                 |
| Check rate limits           | Endpoint/customer replay policy                      | Safe replay rate                               | Do not exceed customer receiver capacity.                          |
| Check idempotency advice    | Customer confirms `event.id` handling                | Receiver can tolerate at-least-once replay     | Warn before drain if not.                                          |

| Minimum incident facts   | Example                                                        |
| ------------------------ | -------------------------------------------------------------- |
| Tenant/account           | `acct_*`, environment, livemode.                               |
| Endpoint ID              | `we_*`; do not paste signing secret.                           |
| Event types              | `transfer_intent.succeeded`, `holding.updated`, etc.           |
| DLQ count/age            | Count and oldest `created`/`next_attempt_at`.                  |
| Failure class            | 5xx/4xx/timeout/signature mismatch.                            |
| Replay window            | Customer-approved start/end and rate.                          |
| Related operation traces | `op_*` only when customer asks about specific business action. |

## Diagnose

| Failure class         | Evidence                                      | Likely cause                                                                                                | Mitigation                                                    |
| --------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Receiver 5xx          | HTTP 500-599 attempts, customer app errors    | Customer handler down, dependency failure, unhandled payload version                                        | Pause retries; customer fixes receiver; replay later.         |
| Receiver 4xx          | HTTP 400/401/403/404/410/422                  | Bad URL, auth config, endpoint removed, payload schema rejection                                            | Pause retries; customer updates endpoint/config.              |
| Timeout               | Attempt timed out, connect/read timeout       | Slow handler, network path, customer firewall                                                               | Pause or lower concurrency; customer improves ack path.       |
| TLS/DNS               | Certificate, hostname, resolution errors      | Expired cert, DNS change, firewall                                                                          | Customer fixes endpoint infrastructure.                       |
| Signature mismatch    | Customer verifier rejects `Pillar-Signature`  | Wrong secret, raw body reserialization, timestamp skew, customer regenerated secret without Pillar rotation | Verify secret rotation state; provide signing input guidance. |
| Platform signer issue | Many endpoints reject signatures after deploy | Signing regression or key retrieval bug                                                                     | Stop replay; rollback/fix dispatcher.                         |
| Queue/worker failure  | Attempts not being made, worker errors        | Dispatcher unavailable, queue permissions, DB/queue outage                                                  | Infra incident; no customer replay until fixed.               |

| Diagnostic slice   | Query grouping                        | Useful decision                         |
| ------------------ | ------------------------------------- | --------------------------------------- |
| By endpoint        | endpoint ID                           | Single vs many customers.               |
| By event type      | event object/type                     | Payload-specific receiver bug.          |
| By API version     | endpoint pinned version               | Version compatibility issue.            |
| By failure class   | status/error enum                     | Customer vs platform cause.             |
| By age bucket      | oldest pending/DLQ age                | SLO breach severity.                    |
| By deployment mode | hosted/customer-validator/self-hosted | Operational owner and tooling location. |

| Signature mismatch checks | Expected result                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Header exists             | `Pillar-Signature: t=<unix>,v1=<base64 hmac-sha256>` present.                                                    |
| Signing input             | Customer verifies exactly `t + "." + raw_body` bytes.                                                            |
| Endpoint secret           | Active or previous secret matches rotation window.                                                               |
| Endpoint version          | Payload `api_version` equals endpoint pinned version.                                                            |
| Clock tolerance           | Timestamp within allowed tolerance.                                                                              |
| Replay cache              | Customer is not rejecting legitimate replay solely due to previous attempt ID; they should dedupe by `event.id`. |

## Mitigate

| Step | Action                                                   | Why                                                   | Owner                                |
| ---- | -------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ |
| 1    | Pause additional retries for affected endpoint(s).       | Prevent retry amplification against failing receiver. | Webhook SRE/customer in self-hosted. |
| 2    | Preserve DLQ rows and delivery attempts.                 | Needed for replay and evidence.                       | Webhook SRE.                         |
| 3    | Confirm events are ledger-projected and replayable.      | Prevent replaying invalid events.                     | Projection/Webhook SRE.              |
| 4    | Notify customer with failure class and sample event IDs. | Customer owns receiver fix in most cases.             | Support.                             |
| 5    | Offer manual replay window.                              | Drain must be customer-driven after receiver fix.     | Support/Webhook SRE.                 |
| 6    | Set replay rate limit and batch size.                    | Protect customer receiver and dispatcher.             | Webhook SRE.                         |
| 7    | Keep unrelated endpoints active.                         | Avoid unnecessary event delay.                        | Webhook SRE.                         |

| Pause policy               | Use when                                                | Exit condition                                        |
| -------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Endpoint-level retry pause | Single endpoint failure, 5xx/timeout/signature mismatch | Customer confirms fix and replay window.              |
| Event-type replay hold     | Payload-specific bug affects one event type             | Fixed customer parser or platform payload regression. |
| Tenant-level replay hold   | Customer infra outage affects all endpoints             | Customer recovery confirmed.                          |
| Platform-wide replay hold  | Dispatcher/signer/queue regression                      | Platform fix verified across canary endpoints.        |

| Manual replay offer   | Required content                                                       |
| --------------------- | ---------------------------------------------------------------------- |
| Scope                 | Endpoint ID, event types, time range, count.                           |
| Rate                  | Max events/sec and concurrency.                                        |
| Semantics             | At-least-once; `event.id` preserved; new delivery identity created.    |
| Customer precondition | Receiver returns fast 2xx after durable enqueue.                       |
| Safety                | Customer should dedupe by `event.id`; payload order is not guaranteed. |

## Recover

| Recovery step           | Hosted                                                           | Customer-validator                                                         | Self-hosted                                                          |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Customer fixes receiver | Customer deploys fix; Pillar observes 2xx on test/canary replay. | Same, plus validate customer network/participant dependencies if relevant. | Customer validates locally and provides evidence if managed support. |
| Unpause endpoint        | Pillar dispatcher config.                                        | Pillar or customer depending on dispatcher ownership.                      | Customer local dispatcher.                                           |
| Drain DLQ               | P6.H05 manual replay flow with rate limiting.                    | Same, with deployment-specific queue location.                             | Customer runs local P6.H05 equivalent.                               |
| Monitor replay          | Per-endpoint success, latency, remaining DLQ age.                | Same.                                                                      | Customer exports metrics.                                            |
| Resume normal retries   | After DLQ near zero and success stable.                          | Same.                                                                      | Same.                                                                |

| P6.H05 manual replay rules    | Requirement                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Preserve `event.id`           | Customer dedupe depends on stable event identity.                                                                 |
| Create new delivery identity  | Delivery attempts remain auditable.                                                                               |
| Preserve endpoint API version | Replay payload shape must match endpoint pinned version at event rendering rules.                                 |
| Rate limit                    | Batch size/concurrency bounded per endpoint.                                                                      |
| Audit                         | Operator, reason, time range, event count, result recorded.                                                       |
| No SQL-only drain             | Marking DLQ delivered without HTTP success is forbidden unless explicitly customer-waived and audited as dropped. |

| Drain strategy             | Use when                                      | Notes                                                            |
| -------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| Oldest-first               | Normal DLQ drain                              | Minimizes max age and customer confusion.                        |
| Event-type priority        | Compliance or settlement events need priority | Do not reorder within a type if customer expects sequence hints. |
| Small canary batch         | Receiver recently fixed or high volume        | Confirm 2xx before full drain.                                   |
| Throttled continuous drain | Large backlog                                 | Keep live traffic and replay from starving each other.           |

## Verify

| Verification          | Metric/source                                  | Pass condition                                                      |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| DLQ draining          | DLQ depth and `pillar_webhook_dlq_age_seconds` | Size trends to 0; oldest age falls below threshold.                 |
| Delivery success      | `pillar_webhook_delivery_success` per endpoint | Returns to expected baseline.                                       |
| Receiver stability    | Attempt status distribution                    | 2xx dominates; 5xx/timeout not recurring.                           |
| No amplification      | Retry queue depth/concurrency                  | Retry volume bounded and not growing faster than drain.             |
| Event identity        | Replay records                                 | `event.id` preserved; new delivery IDs created.                     |
| Audit completeness    | Replay audit entries                           | Operator, endpoint, event range, count, rate, outcome recorded.     |
| Customer confirmation | Support ticket                                 | Customer confirms missing events received or intentionally skipped. |

| SLO                               | Runbook interpretation                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pillar_webhook_dlq_age_seconds`  | Primary alert and recovery metric; oldest undelivered DLQ event must return under threshold.                                  |
| `pillar_webhook_delivery_success` | Per-endpoint success rate must recover; exclude customer-declared disabled endpoints from platform SLO only if policy allows. |
| API/projection SLOs               | Should remain normal; webhook drain must not degrade API or projection workers.                                               |

## Communicate

| Audience                   | When                                                 | Message content                                                                            |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Customer technical contact | Single-customer endpoint failure                     | Endpoint ID, failure class, event count/time range, required receiver fix, replay options. |
| Customer account owner     | High-volume or long-age backlog                      | Impact summary and support owner.                                                          |
| Internal support           | On alert open                                        | Known endpoint(s), event types, customer-safe explanation.                                 |
| Status page                | Many customers or platform-origin dispatcher failure | Component impact: webhook delivery delayed; ledger/API may be unaffected.                  |
| Security                   | Signature mismatches across endpoints                | Potential signer or secret rotation issue.                                                 |

| Customer notice template | Text                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receiver failure         | `Pillar webhook delivery to endpoint <we_id> is failing with <failure_class>. We have paused additional retries to avoid amplification. Please confirm once your receiver is ready for replay. We can replay <count> events from <start> to <end> at <rate> events/sec. Event IDs are preserved and deliveries are at-least-once.` |
| Platform issue           | `Pillar is experiencing delayed webhook delivery for <scope>. Events are retained and will be replayed after dispatcher recovery. API acceptance and ledger state are <status>. We will provide the replay window and affected event counts once verified.`                                                                        |
| Completion               | `Webhook backlog for endpoint <we_id> has drained. DLQ size is <count>, oldest age is <age>, and delivery success has recovered to <rate>.`                                                                                                                                                                                        |

## Post-incident

| Item              | Required output                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Timeline          | Alert, pause, customer notification, fix confirmation, replay start/end, verification.          |
| Impact            | Endpoints, tenants, event types, count, oldest age, duration.                                   |
| Root cause        | Receiver 5xx/4xx/timeout/signature mismatch/platform dispatcher/etc.                            |
| Customer action   | Fix applied, replay accepted, any events intentionally skipped.                                 |
| Platform action   | Retry pause, replay rate, dispatcher fix if any.                                                |
| Regression ticket | Required if platform signer, event authority, retry, DLQ, or replay behavior violated contract. |

| Preventive improvement            | Trigger                                                |
| --------------------------------- | ------------------------------------------------------ |
| Add endpoint preflight/test event | Repeated receiver config failures.                     |
| Improve secret rotation UX        | Signature mismatch due to unsynced regenerated secret. |
| Add per-endpoint adaptive retry   | Retry amplification observed.                          |
| Improve Workbench diagnostics     | Customer could not identify failure reason.            |
| Add replay dry-run count          | Operators lacked confidence before drain.              |

## Related

| Type         | Reference                                                                                                          | Relevance                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Ticket       | [P6.H03](../Phase_06_Webhook_Event_System.md)                                                                      | Dispatcher e2e and event delivery behavior.                |
| Ticket       | [P6.H04](../Phase_06_Webhook_Event_System.md)                                                                      | Retry and DLQ behavior.                                    |
| Ticket       | [P6.H05](../Phase_06_Webhook_Event_System.md)                                                                      | Manual replay flow used to drain DLQ.                      |
| ADR          | [ADR-0006](../DECISIONS.md#adr-0006-webhook-first-async-with-hmac-sha256-signing-and-per-endpoint-version-pinning) | Webhook-first, HMAC, version pinning, replay.              |
| Regression   | [REGRESSION_CONTRACT §7](../REGRESSION_CONTRACT.md#7-webhook-contract)                                             | Signature, endpoint version, retry/DLQ, replay invariants. |
| Regression   | [REGRESSION_CONTRACT §2 IC-07](../REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable)             | Webhooks signed, versioned, retried, replayable.           |
| SLO          | `pillar_webhook_dlq_age_seconds`                                                                                   | Primary backlog age SLO.                                   |
| SLO          | `pillar_webhook_delivery_success`                                                                                  | Per-endpoint delivery recovery metric.                     |
| Architecture | [22 Observability](../../Architecture/22_Pillar%20Observability.md)                                                | Webhook/Event plane and SRE metrics.                       |
| Catalog      | [EVENT_CATALOG.md](../EVENT_CATALOG.md)                                                                            | Event type reference for affected event analysis.          |
| API          | [API_MATRIX.md](../API_MATRIX.md)                                                                                  | Endpoint and event API surface cross-check.                |
