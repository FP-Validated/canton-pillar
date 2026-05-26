# Runbook: Postgres point-in-time restore

## Trigger

| Trigger                         | Examples                                                                                         | Severity                         | Immediate owner             | Notes                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------- | --------------------------- | ------------------------------------------- |
| Data corruption                 | Projection rows wrong, audit hash chain gap, config table corruption, idempotency cache damaged. | SEV1                             | Incident Commander + DB SRE | Ledger remains economic source of truth.    |
| Accidental DROP/TRUNCATE        | Dropped table/index/schema, destructive maintenance, bad SQL.                                    | SEV1                             | DB SRE                      | Snapshot current state before repair.       |
| Mass tampering suspicion        | Unauthorized DB changes, compromised admin credential, unexpected row mutation.                  | SEV1                             | Security + DB SRE           | Preserve forensics before restore.          |
| Region failure                  | Primary Postgres region unavailable or unrecoverable.                                            | SEV1                             | Infra SRE + DB SRE          | May combine failover and PITR.              |
| Bad migration/application write | Migration or projector wrote invalid rows.                                                       | SEV1 if production data affected | DB SRE + service owner      | Diagnose migration/projector before replay. |

| Scope                | Included                                                         | Excluded                                                        |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| Postgres PITR        | Projection, audit, config, idempotency, webhook/outbox tables.   | Canton Ledger rollback or mutation.                             |
| Projection replay    | Rebuild from ledger/PQS after selected restore timestamp.        | Treating DB as asset source of truth.                           |
| Idempotency recovery | Preserve/reconstruct operation identity across restore boundary. | Creating new `operation_id` for previously committed operation. |
| Forensics            | Snapshot current corrupted state before restore.                 | Deleting evidence to speed recovery.                            |

## Severity

| Severity | Condition                                                                                                        | Required action                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| SEV1     | Any production PITR consideration, corruption affecting reads/writes/audit/idempotency, region-level DB failure. | Incident Commander, mutation stop, forensic snapshot, restore plan.       |
| SEV2     | Non-production restore, isolated tenant sandbox, or dry-run restore failure.                                     | DB SRE-led recovery; no production incident unless confidence is reduced. |
| SEV3     | Restore drill or backup validation failure with no production data impact.                                       | Track as reliability issue.                                               |

| SEV1 escalation    | Why                                                       |
| ------------------ | --------------------------------------------------------- |
| Compliance         | Data loss, tampering, audit corruption, regulated tenant. |
| Security           | Unauthorized DB changes or credential compromise.         |
| Projection SRE     | Rebuild/replay correctness.                               |
| Ledger runtime SRE | Idempotency and committed-operation boundary.             |
| Customer support   | Status page and customer impact comms.                    |

## On-call decision tree

| Step | Question                                                | If yes                                                                                                                 | If no                                                             |
| ---- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1    | Is production Postgres integrity in doubt?              | Declare SEV1; enter read-degraded mode.                                                                                | Use non-prod/drill process.                                       |
| 2    | Is Canton Ledger available and trusted?                 | Continue PITR/replay plan.                                                                                             | Escalate beyond this runbook; ledger source of truth unavailable. |
| 3    | Can last-good timestamp be identified?                  | Select candidate PITR timestamp.                                                                                       | Widen investigation; do not restore blindly.                      |
| 4    | Can ledger offset at last-good timestamp be verified?   | Record offset/watermark for replay.                                                                                    | Stop: restore without replay boundary risks inconsistency.        |
| 5    | Is impact single tenant?                                | Prefer tenant-scoped replay/validation if schema supports it.                                                          | Full DB restore/replay.                                           |
| 6    | Were mutations accepted after restore target timestamp? | Plan idempotency replay-correctness handling.                                                                          | Simpler projection replay.                                        |
| 7    | Was corruption caused by migration?                     | Link to [migration-rollback.md](./migration-rollback.md) for deploy mitigation; still use PITR if data restore needed. | Diagnose projector/application writer.                            |
| 8    | Does validation prove projection byte-equal to ledger?  | Recover service.                                                                                                       | Keep mutations disabled; continue rebuild/reconcile.              |

| Deployment mode      | Restore branch                                                             | Operational authority                                                        |
| -------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `hosted`             | Pillar DB SRE runs PITR, projection replay, status page.                   | Pillar.                                                                      |
| `customer-validator` | Pillar may operate Postgres; ledger/participant may be customer-owned.     | Shared: coordinate ledger offset and participant availability with customer. |
| `self-hosted`        | Customer runs PITR using local backups; Pillar provides procedure/support. | Customer unless managed service contract.                                    |

## Pre-checks

| Pre-check                         | Source                                                           | Required output                                   | Stop condition                                                                 |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Identify last-good timestamp      | Monitoring, audit, migration logs, customer report, DB snapshots | UTC timestamp with confidence level               | No restore without candidate timestamp.                                        |
| Verify ledger offset at that time | Projection checkpoint, ledger update stream, PQS watermark       | Offset/update boundary corresponding to timestamp | Stop if offset cannot be mapped.                                               |
| Identify scope                    | Tenant/account/environment, affected tables                      | Single tenant vs full DB                          | Avoid global restore for tenant-local corruption when safe alternative exists. |
| Identify corruption writer        | Migration number, projector, app version, operator SQL           | Cause hypothesis                                  | If writer still active, mitigation must disable it first.                      |
| Check backup availability         | Backup catalog, WAL archive, restore drill status                | PITR target recoverable                           | Stop if backup chain invalid; escalate DR.                                     |
| Check current state snapshot      | Storage snapshot/export                                          | Forensic copy created                             | Do not destroy evidence for tampering cases.                                   |
| Check mutation stop               | API/readiness/config                                             | Mutations return 503/read-degraded                | Continuing writes may widen boundary.                                          |
| Check audit durability            | Audit export/hash chain                                          | Evidence preserved                                | Audit corruption requires compliance involvement.                              |
| Check idempotency boundary        | Operations accepted after target timestamp                       | List of operation IDs and statuses                | Needed for replay-correctness.                                                 |

| Required identifiers            | Purpose                                              |
| ------------------------------- | ---------------------------------------------------- |
| Incident ID                     | Ties restore decisions, comms, and evidence.         |
| Restore target timestamp        | PITR input.                                          |
| Ledger offset/update at target  | Projection replay boundary.                          |
| Migration version at target     | Diagnose bad schema/data writer.                     |
| Projector version at corruption | Identify bad rows and replay fix.                    |
| Tenant/environment              | Scope and customer comms.                            |
| Backup artifact IDs             | Restore reproducibility.                             |
| Current snapshot ID             | Forensics and rollback of restore attempt if needed. |

## Diagnose

| Diagnostic question                             | Evidence                                                | Decision                                                                            |
| ----------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Which migration was applied at corruption time? | Migrator history table, Helm release, job logs          | If migration caused irreversible data change, use PITR; do not raw rollback.        |
| Which projector wrote bad rows?                 | Projector version, checkpoint, row `updated_by`, traces | Disable/fix projector before replay.                                                |
| Are audit rows corrupt or missing?              | Audit hash chain verification                           | Compliance/security escalation.                                                     |
| Are config rows corrupt?                        | Config bundle sequence, signature verification          | Restore config from signed bundle if narrower than full PITR.                       |
| Are projections only stale?                     | Ledger/projection lag, reconciliation diffs             | Prefer projection rebuild over full DB PITR if idempotency/audit/config are intact. |
| Are idempotency rows lost/corrupt?              | Idempotency table diff and operation trace              | Replay-correctness handling required.                                               |
| Were customer-visible reads wrong?              | API logs, projection checksums                          | Customer notice may be needed.                                                      |
| Were mutations accepted during corruption?      | Operation records and ledger completions                | Need operation boundary reconciliation.                                             |

| Cause class                  | Restore need                                                 | Notes                                                 |
| ---------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| Projection-only corruption   | Maybe no PITR; projection rebuild may suffice                | Ledger remains source of truth.                       |
| Config corruption            | Maybe restore signed config bundle                           | Beware key/auth config impact.                        |
| Audit corruption             | PITR likely; compliance evidence path required               | Preserve corrupted state.                             |
| Idempotency corruption       | PITR/reconstruct; high risk for duplicate operation identity | Must enforce operation ID continuity.                 |
| Migration destructive change | PITR if production data affected                             | See [migration-rollback.md](./migration-rollback.md). |
| Region loss                  | PITR/failover to another region                              | Validate WAL completeness.                            |

## Mitigate

| Step | Action                                                                      | Reason                                                          | Owner                      |
| ---- | --------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------- |
| 1    | Declare read-degraded mode: mutations return 503.                           | Stop accepting operations while DB truth boundary is uncertain. | API SRE/Incident Commander |
| 2    | Keep safe reads only if projection correctness is known.                    | Avoid serving corrupt balances/holdings.                        | Projection SRE             |
| 3    | Snapshot current state for forensics.                                       | Preserve tampering/corruption evidence.                         | DB SRE/Security            |
| 4    | Disable bad writer: projector, migrator, job, API path, or operator access. | Prevent re-corruption after restore.                            | Service owner              |
| 5    | Freeze deploys except incident fixes.                                       | Avoid moving target.                                            | Incident Commander         |
| 6    | Export operation/idempotency boundary after target timestamp.               | Needed for replay-correctness.                                  | Ledger runtime SRE         |
| 7    | Announce status page if customer-visible.                                   | SEV1 transparency.                                              | Comms                      |

| Read-degraded behavior        | Rule                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Mutations                     | Return 503 with structured platform-unavailable/degraded error before idempotency mutation.    |
| Reads from suspect projection | Disable or label unavailable; do not return known-corrupt balances.                            |
| Webhooks                      | Pause delivery if event/projection correctness is suspect; do not emit optimistic corrections. |
| Admin trace                   | Keep available for incident operators if audit integrity allows.                               |
| Health                        | `/health/ready` should fail for write-serving pods; `/v1/status` should show degraded.         |

| Forensic snapshot contents    | Include                              |
| ----------------------------- | ------------------------------------ |
| Physical/logical DB snapshot  | Corrupted current state before PITR. |
| WAL/backup catalog metadata   | Backup chain evidence.               |
| Migrator logs/history         | Migration at corruption time.        |
| Projector checkpoints         | Offset and version information.      |
| Audit export/hash chain       | Tampering and request evidence.      |
| Relevant deployment manifests | Image/chart versions.                |

## Recover

| Phase                         | Action                                                         | Acceptance                                                                  |
| ----------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Restore preparation           | Select PITR timestamp and target environment.                  | Timestamp approved by Incident Commander, DB SRE, Projection SRE.           |
| Restore execution             | Restore Postgres to selected timestamp from PITR backup.       | DB starts, schema matches expected migration state.                         |
| Schema validation             | Verify migration history and schema checksum at target.        | Matches expected state for timestamp/release.                               |
| Ledger replay                 | Replay projections from ledger/PQS offset boundary to current. | Projection catches up with no gaps/checksum mismatch.                       |
| Idempotency reconciliation    | Reconcile operations accepted/committed after restore target.  | No duplicate `operation_id`; committed ledger operations preserve identity. |
| Webhook/outbox reconciliation | Rebuild or replay event outbox from projected ledger state.    | Events derive from projection; no optimistic duplicates.                    |
| Service recovery              | Re-enable reads, then mutations after gates pass.              | Health and verification checks green.                                       |

| Replay-correctness rule                       | Required behavior                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Operation committed to ledger but lost in DB  | When re-accepted, reuse same `operation_id` and same command identity; do not create a new economic operation. |
| Same idempotency key + same request hash      | Return original result if reconstructable; otherwise classify safely and preserve operation identity.          |
| Same idempotency key + different request hash | Return 409 conflict.                                                                                           |
| Ledger committed but projection missing       | Reproject from ledger; do not resubmit command.                                                                |
| API accepted but ledger not committed         | Reconstruct pending/failed state according to command completion evidence.                                     |
| Duplicate boundary risk                       | Block mutation route until `operation_id` uniqueness is verified across timestamp boundary.                    |

| Projection replay order | Rule                                                        |
| ----------------------- | ----------------------------------------------------------- |
| Start offset            | Use last verified offset at or before restore timestamp.    |
| Source                  | Canton Ledger/PQS, not corrupted projection rows.           |
| Determinism             | Same offset range and inputs produce byte-equal projection. |
| Events                  | Emit/rebuild events from projected ledger transitions only. |
| Checkpoints             | Advance only after transactional projection batch commit.   |
| Reconciliation          | Run diff after replay before enabling mutations.            |

| Deployment mode      | Recovery note                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hosted`             | Pillar can coordinate DB, projection workers, webhook dispatcher, and status page centrally.                                                      |
| `customer-validator` | Customer participant availability may gate replay; coordinate offset/export access and participant health.                                        |
| `self-hosted`        | Customer backup/WAL retention determines recoverability; Pillar should not claim restore success without customer-provided verification evidence. |

## Verify

| Verification                    | Source                                                   | Pass condition                                                                                  |
| ------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Schema state                    | Migrator verify/schema checksum                          | Matches expected migration state.                                                               |
| Projection byte-equal to ledger | Reconciler/rebuild comparator                            | Byte-equal for selected scope/range.                                                            |
| Ledger offset continuity        | Projection checkpoints                                   | No gaps from restore boundary to current.                                                       |
| Idempotency replay test         | Replay same idempotency key/request hash across boundary | Same response/operation identity or safe reconstructed terminal state.                          |
| Operation uniqueness            | Query operation IDs across pre/post boundary             | No duplicate `operation_id`; no new operation for committed ledger action.                      |
| Webhook consistency             | Event/outbox diff against projection                     | No duplicate customer event for same projected transition unless replay delivery identity only. |
| Audit continuity                | Audit hash chain and restore incident entries            | Chain valid or documented gap with compliance approval.                                         |
| API behavior                    | Read smoke then mutation canary                          | Reads correct; mutation accepted only after all invariants pass.                                |
| SLO recovery                    | Projection freshness, API 5xx, webhook backlog           | Recovering and not hiding unresolved corruption.                                                |

| Required negative checks                                            | Must be false |
| ------------------------------------------------------------------- | ------------- |
| Any mutation accepted while read-degraded mutation stop was active. |
| Any balance/holding row treated as source of truth over ledger.     |
| Any raw rollback of ledger state.                                   |
| Any new `operation_id` for an already committed ledger operation.   |
| Any duplicate event object for the same projected transition.       |
| Any unreviewed destructive migration after restore.                 |

## Communicate

| Audience              | Timing                                                                   | Content                                                                    |
| --------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Status page           | As soon as production customer-visible impact is confirmed               | Degraded API/data plane; mutations paused; reads may be unavailable/stale. |
| Customers             | If data loss, wrong reads, delayed webhooks, or downtime affected them   | Scope, timeframe, affected objects/events, recovery plan.                  |
| Regulators/compliance | If data loss > 0, tampering, audit corruption, or jurisdictional trigger | Facts, evidence preservation, customer impact.                             |
| Internal teams        | SEV1 start and phase changes                                             | Current mode, allowed actions, freeze status.                              |
| Executive/stakeholder | Major data incident                                                      | Business impact and next decision point.                                   |

| Customer notice template | Text                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial                  | `Pillar is investigating a production data-store integrity incident affecting <scope>. Canton Ledger remains the economic source of truth. We have placed affected services in degraded mode while we restore Postgres projections/config/audit as needed and replay from ledger. Mutating API requests may return 503 during recovery.` |
| Restore underway         | `We have selected a restore point at <timestamp> and are replaying ledger-derived projection data from <offset/time>. We will not re-enable mutations until projection, idempotency, and operation identity checks pass.`                                                                                                                |
| Data loss                | `We confirmed data loss or customer-visible incorrect data for <scope/timeframe>. We are providing affected objects/events and remediation details. Regulatory notices are being evaluated according to your profile.`                                                                                                                   |
| Resolved                 | `Postgres restore and ledger projection replay are complete for <scope>. Verification confirmed projection consistency with ledger, idempotency boundary safety, and no duplicate operation IDs across the restore boundary.`                                                                                                            |

## Post-incident

| Item                        | Required output                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Timeline                    | First signal, mutation stop, snapshot, restore target selection, PITR start/end, replay start/end, verification, recovery. |
| Root cause                  | Migration, projector, operator SQL, infrastructure, security/tampering, backup tooling.                                    |
| Data impact                 | Tenants, tables, objects, reads/writes, webhook events, audit gaps.                                                        |
| Recovery evidence           | Backup artifact, restore timestamp, ledger offset, verification reports.                                                   |
| Replay-correctness evidence | Idempotency and operation uniqueness checks.                                                                               |
| Customer/regulator notices  | Sent/not required with rationale.                                                                                          |
| Follow-up tickets           | Prevent recurrence, improve backup drill, add guardrail tests.                                                             |

| Preventive action                     | Trigger                                          |
| ------------------------------------- | ------------------------------------------------ |
| Add migration guard                   | Migration caused corruption.                     |
| Add projector invariant test          | Projector wrote bad rows.                        |
| Tighten DB permissions                | Operator/app could mutate unsafe tables.         |
| Increase PITR drill cadence           | Restore procedure slow or backup confidence low. |
| Add idempotency boundary test         | Replay correctness was manual or fragile.        |
| Improve tenant-scoped restore tooling | Single-tenant incident required full DB restore. |

## Related

| Type         | Reference                                                                                              | Relevance                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Ticket       | [P3.D03](../Phase_03_DB_Idempotency.md)                                                                | Idempotency uniqueness and replay behavior.                                         |
| Ticket       | [P5.G06](../Phase_05_Projection_Reconciliation.md)                                                     | Projection rebuild and byte-equal ledger comparison.                                |
| ADR          | [ADR-0001](../DECISIONS.md#adr-0001-canton-ledger-as-sole-source-of-truth)                             | Canton Ledger is source of truth; DB is recoverable projection/audit/config.        |
| ADR          | [ADR-0005](../DECISIONS.md#adr-0005-projection--audit--config-split-for-pillar-postgres)               | Postgres responsibility split.                                                      |
| Regression   | [REGRESSION_CONTRACT §2 IC-01](../REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable) | Ledger source-of-truth invariant.                                                   |
| Regression   | [REGRESSION_CONTRACT §2 IC-10](../REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable) | Projection rebuildability invariant.                                                |
| Regression   | [REGRESSION_CONTRACT §6](../REGRESSION_CONTRACT.md#6-idempotency-contract)                             | Idempotency replay and conflict behavior.                                           |
| Runbook      | [migration-rollback.md](./migration-rollback.md)                                                       | Use for failed migrator/deploy mitigation; switch here for production data restore. |
| Architecture | [18 Deployment](../../Architecture/18_Deployment.md)                                                   | Deployment-mode DR responsibilities.                                                |
| Architecture | [22 Observability](../../Architecture/22_Pillar%20Observability.md)                                    | SRE control surfaces, DR, projection metrics.                                       |
| Data model   | [DATA_MODEL.md](../DATA_MODEL.md)                                                                      | Table responsibility and projection/audit/config classification.                    |

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
