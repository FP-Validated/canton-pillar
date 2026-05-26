# Runbook: Sandbox provisioning failure

## Trigger

| Field                     | Required content                                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alert names               | `PIL-ONBOARDING-SYSTEM-FAIL-P1`, `PIL-ONBOARDING-DROP-P2`, `PIL-SANDBOX-PROVISION-P1`, `PIL-CMD-SUCCESS-P1`, `PIL-PROJ-LAG-P1`, `PIL-WH-DELIVERY-P1`.                                                                                                                             |
| Manual triggers           | Customer onboarding ticket `P13.O11`/`P13.O12`, support report that sandbox is not ready, dashboard wizard stuck at sandbox step, multiple customers report failed first integration test.                                                                                        |
| Affected planes           | Customer Onboarding, External API, Canton Command, Projection, Webhook, Control Plane, Data Plane.                                                                                                                                                                                |
| Customer-visible symptoms | Onboarding workflow times out at sandbox step, sandbox API key cannot be used, first sandbox transfer cannot be submitted, sandbox projection not visible, dummy webhook never arrives.                                                                                           |
| SLO / threat references   | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_onboarding_completion_rate`, `pillar_ledger_command_success`, `pillar_projection_lag_seconds_p99`, `pillar_webhook_delivery_success`; [THREAT_MODEL.md](../THREAT_MODEL.md) onboarding misconfiguration and tenant isolation failure. |

### Trigger checklist

| Check                                              | Required action                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Is more than one customer affected?                | Classify SEV2, pause new onboardings, open incident channel, triage shared sandbox/control-plane path. |
| Is exactly one customer/session affected?          | Classify SEV3 unless contractual deadline, regulated launch, or data isolation concern escalates.      |
| Is ledger/projection correctness uncertain?        | Do not mark onboarding complete; verify ledger-backed first transfer through normal `/v1` path.        |
| Is tenant isolation uncertain?                     | Treat as SEV1/SEV2 security incident; stop provisioning and verify no cross-tenant sandbox artifacts.  |
| Is public `/v1` API unavailable beyond onboarding? | Route to API/participant/projection runbooks and keep this runbook for onboarding recovery.            |

## Severity

| Severity | Use when                                                                                                                                                      | First response owner                                  | Communications                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| SEV1     | Sandbox provisioning creates cross-tenant artifacts, exposes another tenant's data/key/webhook, or causes ledger/projection economic correctness uncertainty. | Incident Commander + Security + SRE                   | Executive/customer escalation, status page if broad, regulator check if data exposure. |
| SEV2     | Multiple customers cannot complete sandbox provisioning, shared sandbox/control-plane/deployment path broken, or onboarding SLO burn pages.                   | Incident Commander or Developer Experience Lead + SRE | Status page if broad; direct customer updates for affected onboardings.                |
| SEV3     | Single customer onboarding session stuck, retryable provisioning failure, customer-specific config issue, or support-assisted activation.                     | Onboarding/component owner                            | Direct support/account-owner update only.                                              |

### Severity downgrade rules

| From | To     | Evidence required                                                                                                                                       |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEV2 | SEV3   | Only one tenant/session remains affected; shared sandbox health and new onboarding canary pass.                                                         |
| SEV1 | SEV2   | Tenant isolation verified, no data/key exposure, no ledger/projection inconsistency, and remaining issue is availability only.                          |
| Any  | Closed | Affected session(s) complete sandbox provisioning, first key delivered, sandbox transfer/projection/webhook verified, and post-incident owner assigned. |

## On-call decision tree

```text
Onboarding sandbox failure alert/customer report
  -> classify single-customer vs multiple-customer scope
  -> preserve onboarding/audit/log evidence
  -> inspect onboarding session state and failed step
  -> inspect deployment mode and sandbox ownership
  -> verify shared sandbox health or per-tenant sandbox compose/status
  -> diagnose dpm/DAR/Postgres/party_mapping/projection/webhook branch
  -> retry idempotently from sandbox step if safe
  -> pause new onboardings if shared/multi-customer impact
  -> complete sandbox provisioning and first key delivery
  -> verify first sandbox transfer, projection, webhook
  -> communicate and review retry logic
```

| Decision                                        | If yes                                                                          | If no                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| Multiple onboarding sessions failing same step? | Pause new onboardings; inspect shared sandbox/control-plane/release.            | Continue single-session triage.                     |
| Per-tenant sandbox mode?                        | Inspect that tenant's compose/Kubernetes namespace/resources.                   | Inspect shared sandbox pool and allocator.          |
| Sandbox participant unavailable?                | Route to participant branch; do not bypass ledger-backed completion.            | Continue DAR/config/projection diagnosis.           |
| DAR missing or incompatible?                    | Upload/activate expected sandbox DAR; verify template registry/package profile. | Continue DB/party mapping diagnosis.                |
| Postgres/config provisioning blocked?           | Fix config migration/transaction/lock; retry idempotently.                      | Continue party resolver/first workflow diagnosis.   |
| `party_mappings` creation failed?               | Repair onboarding config through service path; verify P3.D11/P4.F09 route.      | Continue projection/webhook verification.           |
| First key not delivered?                        | Follow P13.O13 key-delivery branch after sandbox is ready.                      | Verify customer can execute first sandbox transfer. |

### Deployment-mode branches

| Deployment mode         | Sandbox ownership                                                                                 | Branch                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hosted`                | Pillar-owned shared or per-tenant sandbox infrastructure.                                         | SRE can restart/provision sandbox resources, run `dpm sandbox up`, upload DAR, seed config, and retry onboarding centrally.                                                                              |
| `customer-validator`    | Pillar onboarding flow with customer-operated participant/validator path for ledger connectivity. | Coordinate participant readiness, party allocation, mTLS/JWT trust, and package vetting with customer validator operator. Do not mark complete until Pillar `/v1` first workflow sees projected success. |
| `self-hosted`           | Customer local stack and secret/config store.                                                     | Provide exact local commands; customer runs compose/Helm/DPM and returns status/audit evidence. Pillar support verifies exported logs and `/v1` behavior.                                                |
| Local `sandbox` profile | Developer compose profile, not production deployment mode.                                        | Use for reproduction and support diagnostics; it does not define customer production SLO ownership.                                                                                                      |

## Pre-checks

| Purpose                              | Command / query                                                                                                                                        | Expected result                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Identify affected onboarding session | `pillarctl onboarding get <onb_...> --env prod`                                                                                                        | Shows tenant, environment, deploymentMode, current step, `next_action`, last failure reason, idempotency key. |
| Identify affected tenant             | `pillarctl env describe --tenant <tenant> --env sandbox`                                                                                               | Shows sandbox environment, region, release, chart, participant alias, sandbox mode.                           |
| Check onboarding SLO                 | `pillarctl slo status --env prod --slo pillar_onboarding_completion_rate --window 24h`                                                                 | Determines single-session vs cohort/system issue.                                                             |
| Check active onboarding alerts       | `pillarctl alerts active --env prod --labels owner_team=developer-experience`                                                                          | Confirms alert fingerprint and start time.                                                                    |
| Capture audit trail                  | `pillarctl audit search --resource <onb_...> --include-related tenant,environment,api_key,webhook,operation`                                           | Request/step/admin traces exist.                                                                              |
| Capture logs                         | `pillarctl logs bundle --env prod --services onboarding,api,ledger-command,projection-worker,webhook-dispatcher --since 2h --output <case-id>.tar.zst` | Evidence preserved before retry.                                                                              |
| Check shared sandbox health          | `pillarctl sandbox health --env prod --scope shared`                                                                                                   | Sandbox allocator/participant/API/projection/webhook fixture status known.                                    |
| Check per-tenant sandbox status      | `pillarctl sandbox status --tenant <tenant> --env sandbox`                                                                                             | Compose/Kubernetes resources, participant, DB, queue, and seed state known.                                   |
| Check current release                | `pillarctl release current --env prod`                                                                                                                 | Recent deploy/chart/DAR/migration version known.                                                              |

### Evidence preservation before mutation

| Artifact                  | Required before destructive action? | Notes                                                                               |
| ------------------------- | ----------------------------------: | ----------------------------------------------------------------------------------- |
| Onboarding session state  |                                 Yes | Include step history, failure reason, idempotency keys, `next_action`, timestamps.  |
| Tenant/environment config |                                 Yes | Include public IDs and safe internal refs; no raw secrets.                          |
| Sandbox provisioner logs  |                                 Yes | Include dpm/compose/Helm job output with secret redaction.                          |
| DB migration/lock state   |                                 Yes | Snapshot config-row status before manual repair.                                    |
| Party mapping attempt     |                                 Yes | Include P3.D11 row status, participant alias, purpose; no raw private key material. |
| Customer communication    |                                 Yes | Preserve email/support/status-page updates.                                         |

### Scope worksheet

| Dimension                               | Required answer                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Which customers?                        | `onb_*`, tenant, environment, region, deployment mode, support/account owner.                                                            |
| Which step?                             | Sandbox provision, DAR upload, Postgres config, party mapping, first key, first transfer, projection, webhook.                           |
| Which resources exist already?          | Sandbox environment, participant route, DAR/package profile, DB config rows, party mapping, restricted key, webhook endpoint, operation. |
| Which resources are missing or partial? | Exact failed artifact and whether retry is safe/idempotent.                                                                              |
| Which customer action is pending?       | None, retry wizard, update endpoint, use delivered key, wait for status, or customer-validator operator action.                          |

## Diagnose

| Step | Question                                                                | Evidence                                                                         | Branch                                                        |
| ---- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1    | Is onboarding state stuck at sandbox step or a later verification step? | `pillarctl onboarding get`, dashboard session history.                           | Sandbox provision vs first-key/transfer/webhook branch.       |
| 2    | Did `dpm sandbox up` fail?                                              | Provisioner logs, sandbox health, process/job exit code.                         | Restart/recreate sandbox resources; inspect Daml/DPM/tooling. |
| 3    | Is the expected DAR uploaded and active in sandbox?                     | `pillarctl dar status --env sandbox --tenant <tenant>`, template registry.       | Upload/activate DAR; verify package profile.                  |
| 4    | Is Postgres provisioning blocked?                                       | Migrator status, config transaction locks, tenant/environment rows.              | Resolve migration/lock/constraint; retry idempotently.        |
| 5    | Did `party_mappings` creation fail?                                     | P3.D11 lookup, onboarding step error, ledger-command party resolver logs.        | Repair through onboarding service; verify P4.F09 resolver.    |
| 6    | Can ledger-command route a sandbox transfer?                            | Participant health, mTLS/JWT, route snapshot, package profile.                   | Participant/auth/package branch.                              |
| 7    | Is projection visible after ledger completion?                          | Projection lag, operation trace, event log.                                      | Projection rebuild/lag branch.                                |
| 8    | Is dummy webhook delivered?                                             | Webhook endpoint/test delivery logs, dispatcher metrics, signature verification. | Webhook delivery branch.                                      |

### Failure branches

| Failure                         | Confirm with                                                                                              | Interpretation                                                         | Action                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `dpm sandbox up` failed         | Provisioner log contains DPM/participant boot failure, port conflict, image pull, or package build error. | Sandbox runtime unavailable before Pillar resources are useful.        | Restart sandbox job/pod/compose; if shared and multi-customer, pause new onboardings.           |
| DAR not uploaded                | Sandbox participant lacks expected DAR checksum/version; template-registry package profile missing.       | Commands cannot compile/submit safely.                                 | Upload/activate expected sandbox DAR; verify `pillar_dar_upload_success`.                       |
| Postgres provisioning blocked   | Tenant/environment/config transaction failed, migration missing, lock wait, unique constraint conflict.   | Config/audit state incomplete; retry may need cleanup of partial rows. | Use service idempotent retry; repair only via approved config path.                             |
| `party_mapping` creation failed | Missing/suspended mapping, duplicate `(tenant_id, account_id, purpose)`, wrong participant alias.         | Ledger route cannot derive `act_as`/`read_as`.                         | Correct mapping through onboarding/admin service; verify P3.D11 uniqueness and P4.F09 resolver. |
| First restricted key missing    | No `ak_*` linked to onboarding session, one-time delivery not acknowledged, orphaned key.                 | Customer cannot call sandbox API.                                      | Revoke orphaned key if needed and recreate/deliver through P13.O13 secure channel.              |
| First transfer incomplete       | Intent/operation stuck, command unknown, participant down, projection lag.                                | Activation cannot prove ledger-backed workflow.                        | Use participant/projection branch; never fake completion.                                       |
| Dummy webhook not delivered     | Endpoint not created, signing failure, dispatcher backlog, customer dummy endpoint down.                  | Onboarding cannot prove webhook-first integration.                     | Test endpoint, drain dispatcher, verify signature and delivery classification.                  |

### Required diagnosis outputs

| Output               | Format                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Impact statement     | `who / onboarding step / since when / current state / customer action`.                                                             |
| Affected objects     | Public IDs: `onb_*`, `acct_*`, `ak_*`, `we_*`, `op_*`, `evt_*`, `tr_*`; internal refs only in privileged incident notes.            |
| Timeline             | UTC timestamps for session creation, sandbox step start, first failure, alert, retry, recovery, customer notification.              |
| Invariant assessment | Tenant isolation, no Canton internals in customer UX, ledger-backed completion, projection freshness, deployment-mode parity.       |
| Next action          | Retry, pause new onboardings, repair config, restart sandbox, upload DAR, create party mapping, deliver key, verify first workflow. |

## Mitigate

| Mitigation class      | Allowed actions                                                                                                                             | Forbidden actions                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Retry onboarding step | Retry from sandbox step using same `onb_*` session and idempotency key; rely on provisioner idempotency to converge partial resources.      | Starting a second onboarding session to hide partial state; manually marking sandbox complete.     |
| Pause new onboardings | Disable new sandbox provisioning when multiple customers/shared path fail; keep existing sessions visible with `requires_action`/`pending`. | Continuing to enqueue sessions into known broken shared provisioner.                               |
| Sandbox runtime       | Restart failed sandbox provisioner job/pod/compose; repair image/DPM/DAR dependency; recreate only resources proven safe to recreate.       | Deleting tenant resources without snapshot/audit; reusing another tenant's sandbox.                |
| Config repair         | Use onboarding/admin service path to complete tenant/environment/party mapping rows; maintain audit.                                        | Direct DB edits that bypass audit/idempotency except under approved incident repair with snapshot. |
| Ledger path           | Queue/retry command after participant/DAR/package health returns; keep stable operation/command identity.                                   | Changing `command_id`/route snapshot to force success; exposing Canton IDs to customer.            |
| Projection/webhook    | Rebuild/refresh projection from ledger; replay/deliver webhook preserving `evt_*` identity.                                                 | Patching projection as source of truth; generating substitute events for already-created event.    |

### Idempotent retry procedure

| Step | Command / action                                                                            | Expected result                                                                        |
| ---- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | `pillarctl onboarding retry <onb_...> --from-step sandbox --case <case-id>`                 | Existing session enters retrying state; no duplicate tenant/environment/key artifacts. |
| 2    | `pillarctl sandbox provision --tenant <tenant> --session <onb_...> --idempotency-key <key>` | Provisioner reuses existing successful sub-steps and completes missing ones.           |
| 3    | `pillarctl onboarding get <onb_...>`                                                        | Step advances to first-key or next required action; failure reason cleared or updated. |
| 4    | `pillarctl audit search --resource <onb_...> --operation sandbox_retry`                     | Retry attempt and outcome recorded.                                                    |

### Multi-customer mitigation

| Action                           | Owner                                | Exit condition                                                               |
| -------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| Pause new onboardings            | Developer Experience Lead            | Shared sandbox health canary passes twice and failure rate stops increasing. |
| Freeze recent onboarding deploy  | Incident Commander + Release Manager | Correlated bad deploy rolled back/fixed or ruled out.                        |
| Notify Support and Account teams | Incident Commander                   | Affected customers mapped to status and next update.                         |
| Route root component             | SRE                                  | dpm/DAR/Postgres/party/projection/webhook branch owner assigned.             |

### Deployment-mode mitigation details

| Mode                 | Mitigation detail                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hosted`             | Pillar may restart sandbox provisioner, shared sandbox pool, onboarding service, and dependent workers; all changes recorded in Pillar audit.                                                |
| `customer-validator` | Coordinate with customer operator for participant readiness, party allocation, package vetting, and mTLS/JWT trust; Pillar retries onboarding only after customer-owned dependency is ready. |
| `self-hosted`        | Customer runs local `dpm sandbox up`, Helm/compose checks, DB migration verify, and returns evidence; Pillar support verifies exported logs and public `/v1` smoke only.                     |

### Mitigation record

| Field           | Required value                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Action          | Exact retry/pause/restart/repair/upload command or customer instruction.                           |
| Owner           | Developer Experience, SRE, Ledger Runtime, Projection Runtime, Webhook Runtime, customer operator. |
| Start/end       | UTC timestamps.                                                                                    |
| Expected effect | Sandbox step completes, first key delivered, first workflow verifies, onboarding SLO recovers.     |
| Rollback        | How to undo pause/restart/config repair or restore previous release.                               |
| Evidence link   | Incident/support ticket, audit query, dashboard panel, log bundle.                                 |

## Recover

| Recovery step                 | Required checks                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Complete sandbox provisioning | Onboarding session step status `completed`; sandbox environment reachable; no duplicate tenant/environment artifacts.                     |
| Confirm DAR/package readiness | Expected sandbox DAR checksum active; template/package profile compatible with command runtime.                                           |
| Confirm config state          | Tenant/environment rows complete; `party_mappings` present and active for first account; audit trace complete.                            |
| Deliver first key             | Restricted sandbox key created once, delivered through configured secure channel, acknowledged or safely recreated after revoking orphan. |
| Resume paused onboardings     | Shared canary passes; queue drain controlled; support has affected-customer plan.                                                         |
| Recover first workflow        | Sample sandbox transfer accepted, command completed or terminally classified, projection visible, webhook delivered to dummy endpoint.    |
| Customer closeout             | Customer receives recovery message and next step instructions.                                                                            |

### Partial artifact cleanup rules

| Artifact            | Cleanup rule                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Sandbox environment | Reuse if healthy and tenant-scoped; recreate only after audit snapshot and isolation check.                                    |
| DB config rows      | Prefer service-level idempotent completion; direct DB repair requires incident approval and audit note.                        |
| `party_mappings`    | Never silently change route for in-flight operation; create/suspend through config service with audit.                         |
| API key             | If one-time secret was generated but not acknowledged, revoke orphan and create replacement; never reveal stored secret again. |
| Webhook endpoint    | Preserve endpoint ID when retrying delivery; rotate secret only if exposure occurred.                                          |
| Operation/transfer  | Preserve operation and command identity; retry by normal idempotency/unknown reconciliation path.                              |

## Verify

| Verification       | Command / source                                                                                                       | Pass condition                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Onboarding state   | `pillarctl onboarding get <onb_...>`                                                                                   | Sandbox, first-key, webhook-test, and first-transfer steps show completed or correct next action. |
| Sandbox health     | `pillarctl sandbox health --tenant <tenant> --env sandbox`                                                             | API, participant, DB, queue, projection, webhook components healthy.                              |
| DAR readiness      | `pillarctl dar status --tenant <tenant> --env sandbox`                                                                 | Expected DAR checksum/version active and compatible.                                              |
| Party resolver     | `pillarctl ledger resolve-party --tenant <tenant> --account <acct_...> --purpose onboarding_transfer`                  | Active route found; no suspended/revoked mapping; no raw Canton identifiers in customer output.   |
| First key          | `pillarctl api-keys list --tenant <tenant> --env sandbox --filter onboarding`                                          | One active restricted sandbox key or revoked orphan plus replacement with audit.                  |
| Sandbox transfer   | `pillarctl smoke transfer --tenant <tenant> --env sandbox --account <acct_...> --amount 1 --idempotency-key <case-id>` | Intent accepted; operation reaches terminal success; no duplicate economic command.               |
| Projection visible | `pillarctl projection inspect --operation <op_...>`                                                                    | Transfer/balance/holding projection visible within SLO; stale marker absent or explained.         |
| Dummy webhook      | `pillarctl webhooks test --endpoint <we_...> --event onboarding.sandbox_transfer_completed`                            | Signed delivery reaches dummy endpoint; signature verifies; `evt_*` identity preserved.           |
| SLO recovery       | `pillarctl slo status --env prod --slo pillar_onboarding_completion_rate --window 24h`                                 | System-failure rate below page threshold or burn stopped.                                         |
| Audit integrity    | `pillarctl audit verify --resource <onb_...>`                                                                          | Complete trace for retry/provision/key/webhook/transfer actions.                                  |

### Customer acceptance smoke

| Scenario                                 | Pass condition                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Customer opens dashboard onboarding page | Shows sandbox ready and next step without Canton internals.                        |
| Customer uses first key                  | Sandbox `/v1` request authenticates with restricted key.                           |
| Customer issues sandbox transfer         | Request returns public intent/operation IDs; projected result appears.             |
| Customer dummy webhook receives event    | Signature verifies with current endpoint secret; payload uses public event schema. |
| Customer refreshes onboarding session    | State remains completed; no duplicate key/environment/transfer created.            |

## Communicate

| Audience                    | When                                                                  | Message posture                                                         |
| --------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Affected customer           | Any customer-specific stuck onboarding or required action.            | Direct, concrete next step, no Canton internals, no blame.              |
| Support/account owner       | Always for customer-visible sessions.                                 | Provide `onb_*`, symptom, expected next update, allowed talking points. |
| Status page                 | Multiple customers, shared sandbox outage, or contractual obligation. | Capability-level status: onboarding sandbox provisioning degraded.      |
| Customer-validator operator | Participant/party/DAR/trust dependency in customer-validator mode.    | Technical coordination checklist with exact readiness evidence.         |
| Internal engineering        | SEV1/SEV2 or repeated SEV3.                                           | Root branch owner, logs, release correlation, mitigation record.        |

### Affected customer email template

```text
Subject: Pillar sandbox onboarding update for <workspace/customer>

We identified an issue provisioning the sandbox step for your Pillar onboarding session <onb_...>. The affected capability is sandbox readiness for first integration testing; production live-mode asset operations are not affected by this onboarding step.

Current status: <investigating / retrying provisioning / waiting for customer-validator readiness / recovered>.
Required action from you: <none / retry the onboarding step / confirm validator readiness / use the newly delivered sandbox key>.
Next update: <UTC time>.

We will not mark onboarding complete until a sandbox transfer is accepted, projected, and delivered through the configured webhook test path.
```

### Status-page template

```text
We are investigating degraded sandbox provisioning for customer onboarding. Some new onboarding sessions may remain pending at the sandbox step or require retry. Existing live-mode API behavior is not affected by this onboarding issue unless otherwise noted. Next update by <UTC time>.
```

### Recovery message template

```text
Sandbox provisioning for onboarding session <onb_...> completed at <UTC>. We verified <sandbox transfer / projection / webhook> and delivered the first restricted sandbox key through <configured channel>. You can continue onboarding from the dashboard. If your previous key delivery was not acknowledged, use only the latest delivered key and treat any earlier orphaned key as revoked.
```

### Customer-validator coordination template

```text
Pillar onboarding for <tenant> is blocked on customer-validator sandbox readiness. Please confirm participant endpoint availability, package/DAR vetting status, party allocation for <acct_...>, and mTLS/JWT trust configuration. Pillar will retry the onboarding sandbox step after those checks pass and will verify completion only through the normal `/v1` first-transfer path.
```

## Post-incident

| Time from resolution | Deliverable                                                                                                                                         | Owner                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 2 hours              | Timeline and affected-session list; customer updates sent; retry/cleanup evidence attached.                                                         | Incident Commander or Onboarding Lead       |
| 24 hours             | Initial report covering failure branch, release correlation, affected customers, SLO impact, and immediate prevention.                              | Developer Experience Lead + component owner |
| 5 business days      | Full post-incident report with root cause, retry/idempotency gaps, action items, owners, due dates, and customer/regulator disposition if relevant. | Developer Experience Lead + SRE Lead        |
| Next release gate    | Onboarding orchestrator retry logic, sandbox canary, Helm/compose/DAR/projection/webhook guard updated if gap found.                                | Phase 13 owner                              |

### Post-incident fields

| Field            | Required content                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary          | Customer-visible onboarding impact, count of affected sessions, duration, and deployment modes.                                                 |
| Root cause       | Evidence-backed cause: DPM sandbox, DAR upload, Postgres provisioning, party mapping, first key, transfer, projection, webhook, release/config. |
| Trigger          | Alert/customer ticket/support report/status-page report.                                                                                        |
| Detection gap    | Why onboarding SLO, step-age alert, provisioner health, or sandbox canary did or did not catch it earlier.                                      |
| Mitigation       | Retry, pause, restart, upload, config repair, customer-validator coordination, or rollback actions.                                             |
| Recovery proof   | Commands and smoke results proving sandbox transfer/projection/webhook.                                                                         |
| Invariant impact | Tenant isolation, ledger-backed completion, projection source-of-truth, public API grammar, deployment parity.                                  |
| Customer actions | Emails/status updates sent and required customer steps.                                                                                         |
| Follow-up work   | Ticket IDs, owners, due dates, verification commands.                                                                                           |

### Orchestrator retry-logic review

| Review area      | Required question                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Idempotency      | Does retry from sandbox step reuse the same session and avoid duplicate tenant/environment/key artifacts? |
| Partial failures | Are successful sub-steps persisted with enough evidence to skip safely on retry?                          |
| Backoff          | Does provisioner avoid hot-looping shared sandbox/DPM/Postgres failures?                                  |
| Customer state   | Does dashboard show actionable `next_action` rather than opaque failure?                                  |
| Isolation        | Do retries prove tenant-scoped resources and never reuse another tenant's sandbox?                        |
| Completion gate  | Is `onboarding.completed` blocked until projected first transfer and webhook test succeed?                |

## Related

| Type         | Reference                                                                                                                            | Relevance                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| SLO          | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_onboarding_completion_rate`                                                              | Primary SLO for system-caused onboarding step failures.                                 |
| SLO          | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_ledger_command_success`                                                                  | First sandbox transfer depends on command completion/classification.                    |
| SLO          | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_projection_lag_seconds_p99`                                                              | Onboarding completion requires projected first transfer visibility.                     |
| SLO          | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_webhook_delivery_success`                                                                | Dummy endpoint delivery proves webhook-first integration.                               |
| Ticket       | [P13.O09](../Phase_13_Dashboard_Docs_Onboarding.md#9-implementation-plan)                                                            | Onboarding service skeleton and state store.                                            |
| Ticket       | [P13.O10](../Phase_13_Dashboard_Docs_Onboarding.md#9-implementation-plan)                                                            | Onboarding wizard UI and resume flow.                                                   |
| Ticket       | [P13.O11](../Phase_13_Dashboard_Docs_Onboarding.md#9-implementation-plan)                                                            | KYB integration/evidence references; adjacent failure often blocks sandbox/key steps.   |
| Ticket       | [P13.O12](../Phase_13_Dashboard_Docs_Onboarding.md#9-implementation-plan)                                                            | Sandbox provisioner, retry/rollback semantics, Helm wiring.                             |
| Ticket       | [P13.O13](../Phase_13_Dashboard_Docs_Onboarding.md#9-implementation-plan)                                                            | First-key delivery and webhook setup.                                                   |
| Ticket       | [P13.O14](../Phase_13_Dashboard_Docs_Onboarding.md#9-implementation-plan)                                                            | End-to-end onboarding completion after projected first transfer.                        |
| Ticket       | [P3.D11](../Phase_03_DB_Idempotency.md#9-implementation-plan)                                                                        | `party_mappings` table and tenant-scoped uniqueness.                                    |
| Ticket       | [P4.F09](../Phase_04_Ledger_Command_Runtime.md#9-implementation-plan)                                                                | Party resolver maps account to participant route/`act_as`/`read_as`.                    |
| Ticket       | [P9.J01](../Phase_09_CICD_Helm_Deployment.md#9-implementation-plan)                                                                  | Compose local sandbox profile.                                                          |
| Ticket       | [P9.J04](../Phase_09_CICD_Helm_Deployment.md#9-implementation-plan)                                                                  | Helm chart for deployable services and onboarding wiring.                               |
| ADR          | [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar) | Hosted/customer-validator/self-hosted differ in ownership, not customer `/v1` behavior. |
| ADR          | [ADR-0011](../DECISIONS.md#adr-0011-command_id-derivation-spec)                                                                      | Retry/recovery must not change command identity or create duplicate economic commands.  |
| Regression   | [REGRESSION_CONTRACT §2](../REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable)                                     | Ledger source-of-truth, projection, webhook, and deployment parity invariants.          |
| Regression   | [REGRESSION_CONTRACT §9](../REGRESSION_CONTRACT.md#9-deployment-mode-contract)                                                       | Deployment-mode branches keep public grammar identical.                                 |
| Architecture | [14 CLI Design](../../Architecture/14_CLI%20Design.md)                                                                               | `pillar sandbox up` developer workflow and sandbox expectations.                        |
| Architecture | [16 Pillar Workbench UX](../../Architecture/16_Pillar%20Workbench%20UX.md)                                                           | Workbench/dashboard split and support-grade diagnostics.                                |
| Architecture | [18 Deployment](../../Architecture/18_Deployment.md)                                                                                 | Hosted/customer-validator/self-hosted ownership and Kubernetes/Helm branches.           |
| Architecture | [23 Implementation Plan](../../Architecture/23_Implementation%20Plan.md)                                                             | Phase 13 onboarding milestone and sandbox integration expectations.                     |
