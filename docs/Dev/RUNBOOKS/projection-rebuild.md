# Runbook: Projection Rebuild

## Trigger

| Signal                          | Threshold                                                                        | Source                                       | Immediate concern                                |
| ------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| Reconciliation diff alert       | Any non-zero diff outside configured tolerance                                   | Reconciler / `P5.G07` checks                 | Projection may disagree with Canton Ledger.      |
| Projection corruption suspicion | Missing rows, duplicate rows, checksum mismatch, bad cursor, impossible balance  | API, DB checks, customer report, chaos drill | Customer reads/events may be wrong.              |
| Post-restore validation         | Any DB restore, point-in-time recovery, migration rollback, or replica promotion | Restore runbook / DB audit                   | Projection rows may not match ledger checkpoint. |
| Projection lag exceeds SLO      | Read freshness max breached or growing                                           | Projection worker metrics                    | Reads may be stale even if rows are not corrupt. |
| Byte-equal comparator failure   | Rebuild candidate differs from canonical output                                  | Rebuild runner / comparator                  | Determinism or ledger input boundary changed.    |
| Customer-visible stale reads    | `/v1/balances` or `/v1/holdings` serving stale state beyond SLO                  | API metrics / support ticket                 | Escalate severity and degrade reads.             |

| Required context    | Lookup                                               | Why it matters                                      |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Tenant/environment  | Deployment inventory                                 | Rebuild scope and customer communication.           |
| Projector name      | Projection worker / reconciliation diff              | Decide per-projector vs full rebuild.               |
| Last good offset    | Projection checkpoint and reconciliation checkpoint  | Select safe replay boundary.                        |
| Ledger checkpoint   | Canton/PQS checkpoint evidence                       | Ensures source of truth is stable enough to replay. |
| API read path       | API route config for balances/holdings/search/events | Determines degradation option.                      |
| In-flight mutations | Ledger-command queue and operations table            | Prevents mixed projection writes during rebuild.    |

## Severity classification

| Severity | Condition                                                                                | Customer impact                                              | Incident posture                                                              |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| SEV1     | Customer reads serve stale or wrong balances/holdings beyond SLO.                        | Customers may make decisions from incorrect projected state. | Degrade affected reads immediately; run rebuild with incident commander.      |
| SEV1     | Projection corruption affects mutation safety gates or event emission for active writes. | Workflow correctness and webhook semantics at risk.          | Pause affected mutation/read surfaces until projection authority is restored. |
| SEV2     | Reconciliation diff detected before customer-visible stale reads exceed SLO.             | Potential read/event inconsistency; no confirmed breach.     | Scope, degrade selectively, rebuild target projector.                         |
| SEV2     | Post-restore rebuild required and public reads are already disabled or isolated.         | Maintenance/degraded mode.                                   | Rebuild and verify before reopening.                                          |
| SEV3     | Non-customer-facing projector drift or comparator warning with no read/event impact.     | Internal observability only.                                 | Rebuild off hot path; file follow-up.                                         |

| Contract reference                                                                                  | Runbook implication                                                |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [REGRESSION_CONTRACT IC-01](../REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable) | Canton Ledger wins over projection.                                |
| [REGRESSION_CONTRACT IC-02](../REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable) | Projection rows are regenerable DB state, not authority.           |
| [REGRESSION_CONTRACT IC-10](../REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable) | Projection must be rebuildable from Canton Ledger/PQS at any time. |
| [P5.G06](../Phase_05_Projection_Reconciliation.md)                                                  | Rebuild runner and byte-equal comparator owner.                    |
| [P5.G07](../Phase_05_Projection_Reconciliation.md)                                                  | Reconciliation diff and alert owner.                               |
| [P10.L01](../Phase_10_GA_Hardening.md)                                                              | Chaos drill proving rebuild recovery.                              |

## On-call decision tree

| Step | Question                                                  | If yes                                                          | If no                                                  |
| ---- | --------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| 1    | Is the ledger source and PQS/update stream healthy?       | Continue rebuild scoping.                                       | Do not rebuild yet; fix ledger/PQS input first.        |
| 2    | Are customer reads currently wrong or stale beyond SLO?   | SEV1; degrade read path before diagnosis continues.             | SEV2/SEV3; continue scoped diagnosis.                  |
| 3    | Is one projector isolated as drift source?                | Per-projector rebuild.                                          | Full projection rebuild or broader incident.           |
| 4    | Is the last good offset known and trusted?                | Rebuild from last good offset or ACS boundary if supported.     | Rebuild from offset 0 or canonical ACS boundary.       |
| 5    | Are in-flight mutations writing to the target projection? | Pause or fence projection writers before wipe/replay.           | Proceed with snapshot/wipe/replay.                     |
| 6    | Can API reads bypass projection safely?                   | Use ledger-direct admin-scope read or degraded endpoint policy. | Return explicit `503` for affected read endpoints.     |
| 7    | Does byte-equal comparator pass after replay?             | Reopen reads and webhooks.                                      | Keep degraded; escalate to projector/data-model owner. |

| Rebuild scope              | Use when                                                                                | Blast radius                                                      | Default action                                                      |
| -------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Per-projector              | One projector drifted and dependencies are clean.                                       | One resource family, e.g. balances, holdings, operations, events. | Fence projector, wipe target rows, replay target stream.            |
| Per-tenant/per-environment | Drift isolated to tenant/environment partition.                                         | One customer/environment.                                         | Degrade only affected tenant reads.                                 |
| Full rebuild               | Multiple projectors drift, checkpoint corrupt, restore event, unknown last good offset. | Whole projection schema or environment.                           | Disable affected read surfaces; rebuild from offset 0/ACS boundary. |
| Dry-run comparator         | Suspected issue without confirmed customer impact.                                      | None if isolated.                                                 | Replay into shadow tables and compare.                              |

| API read-path decision  | Allowed behavior                                                                                                               | Forbidden behavior                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `/v1/balances` degraded | Return structured `503 service_unavailable` with `Retry-After`, or ledger-direct read only for privileged admin support scope. | Serving stale balances as current; exposing ledger internals.      |
| `/v1/holdings` degraded | Same as balances; include request ID and retry guidance.                                                                       | Falling back to cached rows beyond SLO without clear stale status. |
| Search/export reads     | Disable or mark delayed if built from affected projection.                                                                     | Re-indexing from corrupt projection without rebuild.               |
| Webhook emission        | Pause event emission from affected projected state until verified.                                                             | Emitting optimistic events from API state.                         |

## Pre-checks

| Check                                   | Evidence                                                   | Pass criteria                                                                      | Stop if failing                       |
| --------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| Confirm source-of-truth availability    | Ledger/PQS health, checkpoint query                        | Ledger stream can replay selected range.                                           | Ledger/PQS unavailable.               |
| Verify ledger checkpoint                | Checkpoint timestamp, offset/update boundary, tenant scope | Stable checkpoint identified and recorded.                                         | No trusted boundary.                  |
| Snapshot existing tables                | DB snapshot, export, or PITR bookmark                      | Target projection rows restorable for forensic comparison.                         | Cannot preserve evidence.             |
| Confirm no in-flight projection writers | Projection worker leases, queue state, deployment replicas | Target projector fenced or paused.                                                 | Writes continue during wipe/replay.   |
| Confirm mutation posture                | Ledger-command queue and operations state                  | In-flight mutations understood; mutation path paused if projection affects safety. | Unknown active mutation side effects. |
| Identify target rows                    | Projector/table/tenant/environment predicates              | Wipe scope is exact and reviewed.                                                  | Predicate ambiguous.                  |
| Confirm downstream consumers            | API routes, webhook event builders, search/export jobs     | Consumers paused/degraded if affected.                                             | Consumers still read corrupt rows.    |
| Establish audit trail                   | Incident ticket/action log                                 | Every destructive operation has approver, reason, and scope.                       | No audit channel.                     |

| Snapshot minimum           | Contents                                                                      |
| -------------------------- | ----------------------------------------------------------------------------- |
| Projection checkpoint rows | Projector name, tenant/environment, last offset/update, checksum, updated_at. |
| Affected projection rows   | Target table partitions or row predicates before wipe.                        |
| Reconciliation diff        | Before-rebuild diff report and sample mismatches.                             |
| API evidence               | Sample stale/wrong customer responses, request IDs, `as_of_ledger_offset`.    |
| Worker state               | Projector leases, queues, deployment version, config bundle.                  |
| Ledger boundary            | Offset 0, ACS boundary, or last good offset evidence.                         |

| Guardrail                                                                      | Requirement                           |
| ------------------------------------------------------------------------------ | ------------------------------------- |
| Do not manually edit projected balances/holdings to match expected values.     | Rebuild from ledger input only.       |
| Do not use projection rows as economic authority.                              | Ledger/PQS stream is rebuild input.   |
| Do not emit webhook events from optimistic API state during rebuild.           | Events come from verified projection. |
| Do not expose raw ledger offsets or contract IDs in public customer responses. | Preserve API grammar.                 |
| Do not run destructive wipe without table snapshot and exact predicate.        | Preserve forensic recoverability.     |

## Diagnose

| Diagnostic question                           | Evidence                                                        | Meaning                              | Action                                                  |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| Which projector drifted?                      | Reconciliation diff grouped by projector/table/object type      | Scope of rebuild.                    | Select per-projector or full rebuild.                   |
| What is the last good offset?                 | Checkpoint history, comparator success, deployment timeline     | Replay boundary.                     | Use last good offset only if trusted.                   |
| Did projection code change?                   | Recent deploys, migration versions, feature flags               | Regression may re-corrupt on replay. | Roll back/fix code before rebuild if deterministic bug. |
| Did input stream change or gap?               | PQS/ledger stream health, offset gaps, duplicate updates        | Source reader issue.                 | Repair reader/checkpoint before wipe.                   |
| Did DB restore/migration alter rows?          | DB audit, PITR timestamp, migration logs                        | Projection storage issue.            | Rebuild affected schema.                                |
| Did one tenant partition drift?               | Diff by tenant/environment                                      | Scoped damage.                       | Rebuild partition only.                                 |
| Are webhooks/search/export affected?          | Event outbox/search index/export jobs tied to projection offset | Downstream stale data.               | Pause/rebuild downstream after projection.              |
| Are mutations using projection preconditions? | Runtime dependency map                                          | Mutation safety risk.                | Pause affected mutations.                               |

| Drift pattern                             | Likely cause                                              | Rebuild shape                                             |
| ----------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| Missing rows after a known offset         | Projector checkpoint advanced before commit or stream gap | Rewind to pre-gap offset or offset 0.                     |
| Duplicate rows or double-counted balances | Non-idempotent upsert/replay bug                          | Fix projector then rebuild from safe boundary.            |
| Checksum mismatch with same row count     | Serialization/order/rounding bug or schema change         | Shadow rebuild and byte comparator before wiping.         |
| One tenant only                           | Partition predicate, tenant config, party binding         | Tenant-scoped rebuild.                                    |
| All projectors after DB restore           | Restore/PITR inconsistency                                | Full rebuild from offset 0 or ACS boundary.               |
| Event/webhook mismatch only               | Event builder/outbox projection dependency                | Rebuild event projection/outbox from verified projection. |

| Data to collect        | Required fields                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Reconciliation report  | projector, table, tenant, object ID, expected hash, actual hash, offset range.                |
| Checkpoint history     | projector, offset/update, processed_at, code version, checksum.                               |
| Projection worker logs | trace ID, projector, offset/update, batch ID, error class.                                    |
| API sample             | request ID, endpoint, public object ID, response `as_of_ledger_offset`, observed wrong field. |
| Ledger sample          | Internal-only update/offset and public object correlation through trace view.                 |

## Mitigate

| Impact                                      | Immediate mitigation                                                                                 | Notes                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Balances/holdings may be wrong              | Switch `/v1/balances` and `/v1/holdings` to structured `503` or privileged ledger-direct admin read. | Default to `503` for public customers unless a safe ledger-direct path exists. |
| Projection stale but not corrupt            | Return stale/unavailable per API policy; prioritize catch-up.                                        | Do not rebuild unless drift/corruption confirmed.                              |
| Webhook event correctness at risk           | Pause affected event emission and delivery.                                                          | Delivery retries resume after verified projection.                             |
| Search/export built from corrupt projection | Pause index/export jobs; mark reports delayed.                                                       | Re-index/export from verified projection only.                                 |
| Mutation preconditions depend on projection | Pause affected mutation types or route to safe ledger-derived checks.                                | Avoid accepting operations based on corrupt projection.                        |
| Customer support needs truth                | Use internal admin ledger trace/read with privileged scope and redaction.                            | Do not send raw ledger identifiers externally.                                 |

| Degradation mode            | Public behavior                                                     | Internal behavior                                          |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Read `503`                  | Error object with retryable service unavailable and `Retry-After`.  | Incident audit records affected endpoint and reason.       |
| Admin ledger-direct         | Only privileged admin/support scope; redacted output.               | Reads ledger/PQS source, not projection.                   |
| Read-only projection freeze | Existing reads disabled or marked unavailable while writers fenced. | Projection tables protected from concurrent writes.        |
| Event pause                 | No new customer webhook events from affected projector.             | Outbox holds or marks events pending rebuild verification. |

| Mitigation guardrail                                                                        | Why                                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Do not backfill projection from API request logs.                                           | API logs are audit, not economic source of truth.       |
| Do not hand-edit rows for a single customer.                                                | Creates non-regenerable state and violates IC-02.       |
| Do not reopen reads before comparator passes.                                               | Rebuild success must be proven.                         |
| Do not leave projections paused without customer-visible degradation if reads are impacted. | Silent stale reads are worse than explicit unavailable. |

## Recover

| Step | Action                                                                           | Evidence                                                                   |
| ---- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1    | Fence target projector(s) and downstream consumers.                              | Worker lease disabled, replicas scaled/paused, queue held.                 |
| 2    | Snapshot target projection rows and checkpoints.                                 | Snapshot location and checksum recorded.                                   |
| 3    | Select rebuild boundary.                                                         | Offset 0, ACS boundary, or trusted last good offset approved.              |
| 4    | Wipe target projection rows using exact tenant/projector predicate.              | Row count and predicate recorded.                                          |
| 5    | Run `P5.G06` rebuild runner.                                                     | Runner execution ID, input boundary, code version, tenant scope.           |
| 6    | Replay from offset 0 or ACS boundary when last good offset is not fully trusted. | Complete replay log and final checkpoint.                                  |
| 7    | Run byte-equal comparator.                                                       | Comparator result = pass; mismatches = 0.                                  |
| 8    | Run reconciliation diff.                                                         | Diff count = 0 for affected scope.                                         |
| 9    | Resume projection workers.                                                       | Checkpoint advances normally without reintroducing diff.                   |
| 10   | Resume API read path and downstream jobs.                                        | Reads return fresh `as_of_ledger_offset`; webhooks/search/export catch up. |

| Rebuild boundary | Use when                                                                                                        | Requirements                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Offset 0         | Full confidence reset, unknown corruption start, post-restore, code determinism audit.                          | Full replay window available and time acceptable.                            |
| ACS boundary     | Current active-contract state is sufficient and historical event reconstruction is not needed for target table. | ACS extraction validated and compatible with projector semantics.            |
| Last good offset | Drift begins after a known verified checkpoint.                                                                 | Prior checkpoint comparator passed and code/data before boundary is trusted. |
| Shadow rebuild   | Need proof before destructive wipe.                                                                             | Separate tables/schema and comparator against current projection.            |

| Target projection wipe                                                    | Required controls                   |
| ------------------------------------------------------------------------- | ----------------------------------- |
| Predicate includes tenant/environment/projector/table scope.              | Avoid cross-tenant damage.          |
| Checkpoint rows reset consistently with data rows.                        | Avoid skipping replay.              |
| Outbox/event derived rows paused or included as dependent rebuild target. | Avoid event/projection split-brain. |
| Row counts before/after recorded.                                         | Audit and rollback evidence.        |

| Downstream recovery           | Order                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| Projection tables             | Rebuilt and comparator-passed first.                                |
| Reconciliation                | Diff = 0 after rebuild.                                             |
| API reads                     | Reopen after freshness and diff checks.                             |
| Webhook event builders/outbox | Resume or rebuild from verified projection offsets.                 |
| Search/export/reporting       | Re-index/re-export from verified projection, not pre-rebuild index. |

## Verify

| Verification            | Pass criteria                                                                                | Evidence link               |
| ----------------------- | -------------------------------------------------------------------------------------------- | --------------------------- |
| Byte-equal comparator   | Pass for affected scope; mismatch count = 0.                                                 | `P5.G06` run output.        |
| Reconciliation diff     | Diff = 0 for affected projector/tenant/environment.                                          | `P5.G07` report.            |
| Checkpoint monotonicity | Projector checkpoint advances without gaps or rollback after reopen.                         | Worker metrics/logs.        |
| API freshness           | Sample `/v1/balances` and `/v1/holdings` return acceptable `as_of_ledger_offset` freshness.  | API probes.                 |
| Public grammar          | Responses do not expose contract/template/party/participant/package/command internals.       | Golden/response scan.       |
| Webhook recovery        | Events emitted from rebuilt projection; DLQ does not grow from platform cause.               | Outbox/DLQ metrics.         |
| Search/export           | Derived indexes/reports rebuilt or marked unaffected.                                        | Search/export job evidence. |
| Mutation safety         | If mutations were paused, first resumed operations trace through ledger/projection normally. | Operation trace sample.     |
| SLO recovery            | Projection freshness and API read SLO burn stops.                                            | SLO dashboard.              |

| Sample verification set | Minimum sample                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Balance object          | One high-volume account, one zero-balance account, one recently mutated account.       |
| Holding object          | One fragmented holding, one locked/pending holding, one settled holding.               |
| Intent/operation        | One operation before rebuild boundary, one during incident window, one after reopen.   |
| Event/webhook           | One event derived from rebuilt rows and one replay/DLQ recovery case.                  |
| Tenant partition        | Every affected tenant/environment; at least one unaffected tenant as negative control. |

| Failure after rebuild                            | Action                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comparator mismatch persists                     | Keep reads degraded; escalate to projector/data-model owner; inspect code determinism and input stream.                                                 |
| Reconciliation diff returns after worker resumes | Pause worker; suspect live projector bug or concurrent writer.                                                                                          |
| API stale after diff = 0                         | Inspect API cache/read replica/route layer.                                                                                                             |
| Webhook DLQ grows from platform errors           | Follow webhook recovery under [participant-down](./participant-down.md) only if ledger/projection dependency is cause; otherwise webhook runbook owner. |

## Communicate

| Audience              | Template                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Internal initial      | "Projection correctness alert for `<tenant/environment/projector>`. Canton Ledger remains source of truth. Affected read/event surfaces are being scoped and may be degraded before rebuild."                                               |
| Customer-visible SEV1 | "We are investigating delayed or unavailable read data for affected Pillar resources. Ledger-backed asset state remains authoritative; affected balance/holding reads may return retryable errors until projection verification completes." |
| Customer-visible SEV2 | "We detected a projection consistency issue before confirmed customer data impact. We are rebuilding the affected read model from ledger data and will update if any customer-visible stale reads are confirmed."                           |
| Status page           | "Read model degradation for affected balance/holding endpoints. Mutations and ledger truth are handled separately; affected reads may be temporarily unavailable."                                                                          |
| Recovery              | "The affected projection has been rebuilt from ledger data. Reconciliation diff is zero and read freshness has recovered."                                                                                                                  |
| Closure               | "Projection rebuild is complete. Verification confirmed byte-equal rebuild, zero reconciliation diff, and recovered API/webhook freshness."                                                                                                 |

| Communication rules                                                                    | Requirement                             |
| -------------------------------------------------------------------------------------- | --------------------------------------- |
| Say "projection/read model" and "ledger-backed state" instead of raw Canton internals. | Preserves public abstraction.           |
| If customer-visible stale reads exceeded SLO, publish status page entry.               | Required by assignment and SLO posture. |
| Never tell customers DB rows were manually corrected.                                  | They must not be manually corrected.    |
| If public reads return `503`, include retry guidance and request IDs.                  | Makes degradation explicit.             |
| If admin ledger-direct read was used, describe it as privileged support verification.  | Do not expose implementation details.   |

## Post-incident

| Task                     | Owner              | Required output                                                                                     |
| ------------------------ | ------------------ | --------------------------------------------------------------------------------------------------- |
| Final severity review    | Incident commander | SEV1/SEV2/SEV3 decision with customer impact evidence.                                              |
| Root cause               | Projection owner   | Cause category: projector code, stream gap, DB restore, migration, cache, operator action, unknown. |
| Rebuild evidence archive | Projection owner   | Snapshot IDs, runner ID, comparator output, reconciliation report.                                  |
| API impact review        | API owner          | Endpoints affected, degraded behavior, sample request IDs.                                          |
| Webhook impact review    | Webhook owner      | Held/delayed/replayed events and DLQ state.                                                         |
| SLO/error budget review  | SRE                | Projection freshness and API read SLO burn impact.                                                  |
| Regression test update   | QA/phase owner     | Add or update `P5.G06`, `P5.G07`, or `P10.L01` coverage.                                            |
| Runbook update           | SRE                | Any missing pre-check, predicate, or communication template.                                        |
| Customer follow-up       | Support/CS         | If visible, send closure and any required RCA excerpt.                                              |

| Required RCA questions                                        | Answer                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Why did reconciliation not prevent customer impact earlier?   | Alert threshold, detection delay, or degradation delay.          |
| Was the rebuild boundary correct?                             | Evidence for offset 0, ACS boundary, or last good offset choice. |
| Did any mutation rely on corrupt projection?                  | Trace safety review.                                             |
| Were webhook events emitted from corrupt or stale projection? | Event audit review.                                              |
| Can this recur after current fix?                             | Code/test/alert/chart changes.                                   |

## Related (SLOs, tickets, ADRs, threats)

| Type         | Link / ID                                                                                                                            | Relationship                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Ticket       | [P5.G06](../Phase_05_Projection_Reconciliation.md)                                                                                   | Rebuild runner, wipe/replay flow, byte-equal comparator.           |
| Ticket       | [P5.G07](../Phase_05_Projection_Reconciliation.md)                                                                                   | Reconciliation diff detection and alerting.                        |
| Ticket       | [P10.L01](../Phase_10_GA_Hardening.md)                                                                                               | Chaos drill for projection corruption/rebuild recovery.            |
| ADR          | [ADR-0001](../DECISIONS.md#adr-0001-canton-ledger-as-sole-source-of-truth)                                                           | Ledger wins during projection disagreement.                        |
| ADR          | [ADR-0005](../DECISIONS.md#adr-0005-projection--audit--config-split-for-pillar-postgres)                                             | Projection is regenerable DB state.                                |
| ADR          | [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar) | Degradation must not fork `/v1` grammar by deployment.             |
| Contract     | [REGRESSION_CONTRACT §8](../REGRESSION_CONTRACT.md#8-projection-contract)                                                            | Projection rebuild, byte-equal, freshness, no authority promotion. |
| Contract     | [REGRESSION_CONTRACT §7](../REGRESSION_CONTRACT.md#7-webhook-contract)                                                               | Events must come from projected ledger state.                      |
| SLO          | Projection freshness                                                                                                                 | Primary read-model SLO for severity and recovery.                  |
| SLO          | API latency/read availability                                                                                                        | Determines customer-visible read degradation.                      |
| Architecture | [Observability](../../Architecture/22_Pillar%20Observability.md)                                                                     | Projection correctness, SLOs, runbook-driven operations.           |
| Architecture | [Deployment](../../Architecture/18_Deployment.md)                                                                                    | Local hot-path independence and deployment-neutral API behavior.   |
| Architecture | [Security](../../Architecture/12_Security.md)                                                                                        | Admin ledger-direct access and redaction rules.                    |
