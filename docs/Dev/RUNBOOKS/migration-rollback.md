# Runbook: Migration rollback and forward-only recovery

## Trigger

| Trigger                          | Examples                                                           | Default severity                            | Owner                         | Notes                                                               |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Pre-upgrade migrator-job failure | Helm upgrade runs migrator and exits non-zero before app rollout.  | SEV2                                        | Release SRE + DB owner        | Deploy blocked; customer impact depends on maintenance window.      |
| Partially-applied migration      | Some statements applied, migrator failed before completion marker. | SEV2/SEV1 if production data affected       | DB owner + Incident Commander | Must inspect schema state before rerun.                             |
| Expand-and-contract reversion    | New columns/tables created but not populated or used.              | SEV2                                        | Release SRE                   | Safe only for unused expansion artifacts.                           |
| Migrator advisory lock stuck     | Job crashed or competing migrator holds lock.                      | SEV2                                        | DB owner                      | Verify real holder before clearing.                                 |
| Bad migration already applied    | Data changed or app served traffic against new schema.             | SEV1 if production data correctness at risk | Incident Commander            | Do not reverse raw migration; use [db-restore.md](./db-restore.md). |

| Scope                                | Covered                                                                         | Not covered                                   |
| ------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------- |
| Failed migrator-job during deploy    | Diagnose, revert Helm release to previous chart, fix migration, redeploy.       | Rewriting history in migration table.         |
| Partially-applied DDL                | Determine idempotent state and complete/fix forward.                            | Blind `DROP` or down migration in production. |
| Expand-and-contract unused artifacts | Drop new unused columns/tables only when proven unpopulated and not referenced. | Dropping populated production data.           |
| Forward-only rule                    | Applied production migrations are not reversed.                                 | Raw rollback of production schema/data.       |

## Severity

| Severity | Condition                                                                                               | Response                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| SEV1     | Applied migration caused production data corruption, data loss, or customer-visible incorrect behavior. | Incident; enter degraded mode if needed; use [db-restore.md](./db-restore.md). |
| SEV2     | Deploy blocked by migrator failure, partial schema apply, advisory lock issue, app not promoted.        | Release incident; revert Helm release to previous chart; fix forward.          |
| SEV3     | Non-production migrator failure or dry-run schema diff mismatch.                                        | Fix before promotion; no production incident.                                  |

| Escalation signal                                                 | Escalate to                       | Reason                                               |
| ----------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| Migration touched projection/audit/idempotency tables incorrectly | DB owner + relevant service owner | Can violate regression contract.                     |
| Mutation-serving app version already used new schema              | Incident Commander                | Customer-visible state may depend on partial schema. |
| Need to remove populated column/table                             | Incident Commander + DB SRE       | This is data restore territory, not rollback.        |
| Migration lock holder is unknown                                  | DB owner                          | Risk of concurrent migrators.                        |
| Self-hosted customer cannot recover deploy                        | Customer support + Release SRE    | Operational authority differs by deployment mode.    |

## On-call decision tree

| Step | Question                                                       | If yes                                                           | If no                                             |
| ---- | -------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| 1    | Did migrator fail before application pods serving new version? | Treat as deploy-blocked SEV2.                                    | Check whether customer traffic used new schema.   |
| 2    | Was migration marked applied?                                  | Verify schema matches migration expectations; rerun should skip. | Inspect partial statements and lock state.        |
| 3    | Did migration write/delete/transform production data?          | Do not rollback; evaluate [db-restore.md](./db-restore.md).      | Continue forward-only/schema reversion path.      |
| 4    | Are new objects unused and unpopulated?                        | Expand-and-contract reversion may drop them safely.              | Do not drop; fix forward.                         |
| 5    | Is advisory lock still held by live job?                       | Wait or terminate only via DB owner decision.                    | Clear stale lock according to migrator procedure. |
| 6    | Can previous chart version run against current schema?         | Revert Helm release to previous chart.                           | Freeze deploy and fix compatibility immediately.  |
| 7    | Does `migrator verify` pass after fix?                         | Redeploy.                                                        | Keep previous release; continue fix.              |

| Deployment mode      | Decision branch                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `hosted`             | Pillar release team controls Helm, migrator job, DB access, and rollback to previous chart.                                   |
| `customer-validator` | Pillar chart may run against customer participant/network; coordinate maintenance window and participant-dependent readiness. |
| `self-hosted`        | Customer runs Helm/migrator; Pillar provides chart guidance and requires customer evidence before declaring recovery.         |

## Pre-checks

| Check                             | Source                                             | Required answer                             | Stop condition                                      |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| Identify failing migration number | Migrator logs, migration history table             | Exact migration ID/name                     | Do not modify schema without identifying migration. |
| Identify current schema state     | Schema diff, migration history, information schema | Applied, partially applied, not applied     | Unknown state blocks rerun/drop.                    |
| Identify advisory lock state      | DB lock view/migrator lock table                   | Holder PID/job, age, lock key               | Do not clear live lock blindly.                     |
| Identify Helm release versions    | Helm history, Git SHA, image digest                | Previous chart and attempted chart          | Need previous chart for release revert.             |
| Identify app traffic state        | Deployment rollout, readiness, API logs            | New app served traffic or not               | If served traffic, rollback may be unsafe.          |
| Identify data writes              | Table row counts/checksums, audit                  | Whether migration populated or mutated data | Populated data means no raw rollback.               |
| Verify backup point               | Backup/WAL status                                  | Restore point exists before migration       | Required if data restore becomes necessary.         |
| Check regression touchpoints      | Migration target tables                            | P3/P5/P6/P8/P9 contract areas               | Contract violation escalates.                       |

| Required facts to record        | Purpose                                |
| ------------------------------- | -------------------------------------- |
| Migration ID                    | Enables precise fix and audit.         |
| Migration checksum              | Detects edited migration after apply.  |
| Applied status                  | Determines rerun/idempotency behavior. |
| Schema diff                     | Shows partial objects.                 |
| Advisory lock holder            | Prevents concurrent migrator damage.   |
| Helm previous/current revision  | Supports chart revert.                 |
| App version that served traffic | Determines customer impact.            |
| Backup restore point            | Safety net if data damage discovered.  |

## Diagnose

| Diagnostic target                 | Evidence                                                | Interpretation                                   | Action                                                                     |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| Migrator failure before DDL       | Logs show validation/connection failure; no schema diff | Safe to fix config and rerun.                    | Revert chart if deploy window closed; otherwise rerun after fix.           |
| DDL applied, migration not marked | New table/column/index exists; no history row           | Partial apply; migration must become idempotent. | Fix migration to tolerate existing object or mark only after verification. |
| Migration marked, schema missing  | History row exists; expected object absent              | History/schema inconsistency.                    | Stop; DB owner decides forward repair.                                     |
| Data transform failed midway      | Row counts/checksums changed                            | Production data may be inconsistent.             | SEV1 if prod; use db restore or forward repair plan.                       |
| Advisory lock stuck               | Lock holder gone or stale job                           | Migrator blocked.                                | Clear only after DB owner verifies no active migrator.                     |
| Previous chart incompatible       | Old app expects removed/renamed field                   | Violated expand-and-contract rule.               | Keep traffic stopped or fix forward immediately.                           |

| Schema diff categories                  | Safe response                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Additive empty table                    | May drop if unused or leave for fixed migration.                                 |
| Additive nullable column with all nulls | May drop only if no code served traffic and no writes.                           |
| Additive index                          | Usually safe to leave; fixed migrator should skip/create concurrently as needed. |
| Constraint added                        | Check whether previous app tolerates it; may block writes.                       |
| Column rename/drop                      | Unsafe in production; likely contract violation.                                 |
| Data backfill partial                   | Unsafe to reverse manually; forward repair or restore.                           |

| Advisory lock diagnosis                        | Rule                                                            |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Live migrator pod/job exists                   | Do not clear lock; observe logs or terminate job intentionally. |
| No live holder and lock older than job timeout | DB owner may clear stale lock.                                  |
| Multiple migrator jobs                         | Stop duplicate jobs; keep one controlled owner.                 |
| Lock cleared                                   | Immediately rerun `migrator verify` before deploy.              |

## Mitigate

| Step | Action                                                                                             | Reason                                                    | Owner                |
| ---- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------- |
| 1    | Stop rollout of new application version.                                                           | Prevent app/schema mismatch.                              | Release SRE          |
| 2    | Revert Helm release to previous chart version.                                                     | Previous chart uses previous migration set and app image. | Release SRE          |
| 3    | Confirm previous chart does not rerun new migration set.                                           | Avoid repeated failure.                                   | Release SRE/DB owner |
| 4    | Confirm migrator-job is idempotent and skips already-applied migrations.                           | Prevent duplicate DDL/data transforms.                    | DB owner             |
| 5    | Keep additive unused schema if safe; do not reverse applied production migration.                  | Forward-only rule.                                        | DB owner             |
| 6    | If absolutely required to undo data-bearing migration, switch to [db-restore.md](./db-restore.md). | Data restore needs PITR and replay.                       | Incident Commander   |

| NEVER action                                                             | Why                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| NEVER reverse an applied migration on production with ad hoc down SQL.   | Risks silent data loss and breaks forward-only contract. |
| NEVER delete migration history rows to force rerun.                      | Corrupts schema provenance and idempotency.              |
| NEVER edit an applied migration file without a new migration/fix record. | Checksum drift makes environments unreproducible.        |
| NEVER drop populated tables/columns as rollback.                         | Use PITR/data restore.                                   |
| NEVER run app version whose schema compatibility is unknown.             | Can write irrecoverable mixed-shape data.                |

| Helm revert checks                     | Required result                                         |
| -------------------------------------- | ------------------------------------------------------- |
| Previous chart selected                | Known good revision before failed migrator.             |
| Migrator disabled or previous set only | No new failed migration rerun during revert.            |
| App images previous                    | New app not serving with partial schema.                |
| Readiness healthy                      | Previous app can serve against current additive schema. |
| Public API grammar unchanged           | Regression contract §9 preserved.                       |

## Recover

| Recovery path                 | Use when                                                                       | Steps                                                                |
| ----------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Fix migrator and redeploy     | Failed migration is forward-fixable and no data restore needed.                | Add idempotent guards/new fix migration; run verify; redeploy chart. |
| Leave additive objects        | New table/column/index is unused and harmless.                                 | Document state; fixed migration skips or adopts object.              |
| Drop unused expansion objects | Object is newly created, unpopulated, unreferenced, and not in previous chart. | DB owner-approved cleanup migration; verify no data.                 |
| Data restore                  | Applied migration damaged production data or populated wrong rows.             | Switch to [db-restore.md](./db-restore.md).                          |

| Fix migration requirements | Detail                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Idempotent                 | Rerun after partial apply must converge, not fail.                                  |
| Forward-only               | New migration or corrected not-yet-applied migration; no production down migration. |
| Checksummed                | Migration checksum stable after promotion.                                          |
| Verified                   | `migrator verify` passes against current schema state and clean database.           |
| Compatible                 | Previous app tolerates additive schema until new app rolls out.                     |
| Observable                 | Logs identify migration number, step, and result.                                   |

| Expand-and-contract reversion criteria                                     | Must all be true |
| -------------------------------------------------------------------------- | ---------------- |
| Object was introduced only by failed deploy.                               |
| Object is not referenced by currently serving previous app.                |
| Object has zero rows or all new column values are null/default and unused. |
| No customer traffic was served by code writing the object.                 |
| Dropping object does not remove audit/idempotency/projection evidence.     |
| DB owner approves and records evidence.                                    |

| Deployment-mode recovery | Notes                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `hosted`                 | Central release can revert Helm and patch migrator quickly; verify all regions.                                |
| `customer-validator`     | Customer maintenance window and participant readiness may constrain redeploy; API grammar remains identical.   |
| `self-hosted`            | Provide exact chart version and migrator command; customer supplies `migrator verify` output and Helm history. |

## Verify

| Verification          | Command/source                                                                         | Pass condition                                         |
| --------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Migrator verification | `migrator verify`                                                                      | Passes against target DB.                              |
| Schema diff           | Expected schema model vs actual                                                        | Only approved additive/cleanup differences remain.     |
| Migration history     | History table and checksums                                                            | No missing/duplicate/edited applied migrations.        |
| Advisory lock         | DB lock state                                                                          | No stale migrator lock.                                |
| Previous chart health | Helm status/readiness                                                                  | Previous app healthy after revert.                     |
| New deploy canary     | Fixed migrator job logs                                                                | Migration applies/skips idempotently.                  |
| Regression guard      | [REGRESSION_CONTRACT §12.2](../REGRESSION_CONTRACT.md) referenced by release checklist | No migration policy violation.                         |
| Public API parity     | Smoke or OpenAPI diff if app rolled                                                    | No `/v1` grammar change due to deployment mode/revert. |

| Negative verification                                       | Must not occur |
| ----------------------------------------------------------- | -------------- |
| Production down migration executed against populated data.  |
| Migration history row deleted or edited manually.           |
| App writes accepted while schema compatibility unknown.     |
| Duplicate migrator jobs running concurrently.               |
| `migrator verify` skipped before redeploy.                  |
| Customer-visible `/v1` grammar changed because of rollback. |

## Communicate

| Audience                       | Default                                               | Message content                                                                 |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| Internal release channel       | Always                                                | Migration ID, failure reason, Helm revision, current schema state, next action. |
| Incident channel               | SEV1 or customer-visible SEV2                         | Impact, mitigation, recovery owner.                                             |
| Customer support               | Customer-visible downtime/degraded deploy             | Short explanation: deploy delayed/rolled back, no API contract change expected. |
| Status page                    | Only if customer-visible downtime or degraded service | Deployment issue, affected region/mode, service state.                          |
| Self-hosted customer operators | Self-hosted chart failure                             | Exact previous chart, migrator status checks, verify requirements.              |

| Internal update template | Text                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy blocked           | `Migrator job failed for migration <id> during <release>. New app rollout is stopped. Current schema state: <not_applied/partial/applied>. Helm release is reverting to <previous_revision>. No raw rollback will be executed.` |
| Partial apply            | `Migration <id> partially applied: <objects>. DB owner is preparing forward-only/idempotent fix. Previous chart compatibility is <status>. Data-bearing changes are <present/absent>.`                                          |
| Data restore escalation  | `Migration <id> affected production data. This is no longer a rollback. Switching to db-restore runbook with restore target evaluation.`                                                                                        |
| Resolved                 | `Migration recovery complete. <migrator verify> passes, Helm release <revision> is healthy, advisory lock clear, and no production down migration was executed.`                                                                |

## Post-incident

| Item                    | Required output                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Timeline                | Migrator start/fail, rollout stop, Helm revert, schema diagnosis, fix, verify, redeploy.           |
| Root cause              | SQL incompatibility, non-idempotent DDL, lock issue, permission, data backfill, environment drift. |
| Blast radius            | Environments, tenants, tables, app versions, customer-visible downtime.                            |
| Forward-only compliance | Evidence that no raw production rollback occurred, or db-restore was invoked.                      |
| Verification            | `migrator verify`, schema diff, Helm health, lock state.                                           |
| Follow-up               | Add migration test, improve migrator idempotency, enhance pre-upgrade dry run.                     |

| Preventive action                         | Trigger                                           |
| ----------------------------------------- | ------------------------------------------------- |
| Add clean DB + existing DB migration test | Partial apply or idempotency failure.             |
| Add schema drift preflight                | Production schema differed from expected.         |
| Add lock observability                    | Advisory lock blocked deploy without clear owner. |
| Improve expand-and-contract lint          | Previous chart incompatible with additive schema. |
| Require backfill chunking                 | Data transform timed out or partially wrote.      |
| Add self-hosted upgrade notes             | Customer operator confusion.                      |

## Related

| Type         | Reference                                                                                                                            | Relevance                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Ticket       | [P3.D07](../Phase_03_DB_Idempotency.md)                                                                                              | Migration discipline and DB schema verification.                              |
| Ticket       | [P9.J05](../Phase_09_CICD_Helm_Deployment.md)                                                                                        | Helm migrator-job and release deployment behavior.                            |
| ADR          | [ADR-0005](../DECISIONS.md#adr-0005-projection--audit--config-split-for-pillar-postgres)                                             | Postgres stores projection/audit/config, not economic source of truth.        |
| ADR          | [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar) | Deployment revert must preserve `/v1` grammar.                                |
| Regression   | [REGRESSION_CONTRACT §9](../REGRESSION_CONTRACT.md#9-deployment-mode-contract)                                                       | Release rollback/chart upgrade must preserve public identity and idempotency. |
| Regression   | [REGRESSION_CONTRACT §12.2](../REGRESSION_CONTRACT.md)                                                                               | Migration policy reference for forward-only verification.                     |
| Runbook      | [db-restore.md](./db-restore.md)                                                                                                     | Required path if an applied migration must be undone through data restore.    |
| Architecture | [18 Deployment](../../Architecture/18_Deployment.md)                                                                                 | Helm/deployment mode responsibility split.                                    |
| Architecture | [22 Observability](../../Architecture/22_Pillar%20Observability.md)                                                                  | Runbook-driven SRE and health surfaces.                                       |
| Data model   | [DATA_MODEL.md](../DATA_MODEL.md)                                                                                                    | Schema ownership and table classification.                                    |

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
