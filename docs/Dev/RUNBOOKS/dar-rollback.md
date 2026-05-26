# Runbook: DAR Rollback

## Trigger

| Signal                                       | Threshold                                                                | Source                                                  | Immediate concern                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ |
| Post-DAR-upload command failures             | Command rejection rate above incident threshold after DAR upload/cutover | `services/ledger-command`, participant completions      | New active package may reject valid Pillar workflows.              |
| `package_id` mismatch                        | Registry active package differs from participant-visible/vetted package  | Template registry compatibility matrix / DAR upload job | Command builder and participant package inventory are split-brain. |
| Daml workflow regression                     | Valid intent type fails after package rollout                            | Command planner, ledger completion errors, canary tests | New package/template/choice behavior is broken.                    |
| Registry pin drift                           | Tenant/environment active version changed unexpectedly                   | `services/template-registry` audit                      | Commands may use wrong package binding.                            |
| In-flight command failures                   | Existing queued commands fail after cutover                              | Ledger-command queue and attempts                       | Rollback must preserve command identity and operation trace.       |
| Customer-validator/self-hosted upgrade issue | Customer chart or participant lacks expected package                     | Compatibility evidence / support ticket                 | Rollback may require customer operator action.                     |

| Required context        | Lookup                                              | Why it matters                                   |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------ |
| Upgrade plan ID         | Template registry `upgrade_plan` / P12.N06 evidence | Determines whether rollback choreography exists. |
| Previous active version | Registry package version history                    | Candidate pin target.                            |
| Introduced `package_id` | Registry package version and participant inventory  | Identifies broken package.                       |
| Affected intent types   | Command semantic version mapping                    | Determines what to refuse/drain.                 |
| In-flight commands      | Ledger-command queue and attempt table              | Decide drain, classify, or hold.                 |
| Deployment mode         | Hosted, customer-validator, self-hosted             | Communication and operator ownership.            |

## Severity classification

| Severity | Condition                                                                    | Customer impact                                                                               | Incident posture                                                       |
| -------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| SEV1     | Commands are rejected for core mutation types after DAR cutover.             | Customers cannot complete asset workflows.                                                    | Pin rollback or pause immediately; incident commander required.        |
| SEV1     | Broken package accepts commands that create wrong ledger state.              | Ledger source-of-truth contains bad contracts; rollback may be impossible without correction. | Stop affected commands; escalate to Daml/runtime leads and governance. |
| SEV1     | No previous compatible version can be pinned and commands remain rejected.   | Sustained mutation outage.                                                                    | Pause affected mutations and prepare corrected DAR roll-forward.       |
| SEV2     | Degraded/non-core intent types fail, or canary detects before broad rollout. | Limited workflow degradation.                                                                 | Pin previous version for affected tenants or stop cutover.             |
| SEV2     | Package mismatch isolated to one customer-validator/self-hosted deployment.  | Tenant-specific degradation.                                                                  | Coordinate chart/DAR action with customer operator.                    |
| SEV3     | Registry detects mismatch before command failures.                           | No customer-visible impact.                                                                   | Block cutover and repair compatibility records.                        |

| Ticket / ADR reference                                                                                    | Runbook implication                                                              |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [P12.N04](../Phase_12_Template_Registry_Versioning.md)                                                    | Registry package metadata, checksum, signature, descriptor mapping.              |
| [P12.N06](../Phase_12_Template_Registry_Versioning.md)                                                    | Upgrade-plan rollback choreography and active pin changes.                       |
| [P12.N09](../Phase_12_Template_Registry_Versioning.md)                                                    | Participant compatibility, self-hosted/customer-validator distribution evidence. |
| [ADR-0011](../DECISIONS.md#adr-0011-command_id-derivation-spec)                                           | Command identity must stay stable across retry and rollback.                     |
| [REGRESSION_CONTRACT IC-03](../REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable)       | Public API must not expose package/template IDs.                                 |
| [REGRESSION_CONTRACT IC-04/IC-05](../REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable) | Mutation trace and idempotent command identity remain required.                  |

## On-call decision tree

| Step | Question                                                               | If yes                                                                       | If no                                                                 |
| ---- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1    | Are commands failing because of package/template/Daml workflow errors? | Continue DAR rollback path.                                                  | Use participant/network/auth runbooks.                                |
| 2    | Was the P12.N06 upgrade-plan rollback choreography followed?           | Use approved rollback state transition.                                      | Freeze new commands; reconstruct registry state and require approval. |
| 3    | Can registry pin safely return to previous active version?             | Pin tenant/environment to previous active version.                           | Pause affected new commands; prepare corrected roll-forward.          |
| 4    | Were any contracts created under the broken version?                   | Do not assume simple rollback; assess roll-forward or compensating workflow. | Pin rollback is usually safe after draining in-flight commands.       |
| 5    | Are in-flight commands bound to previous version?                      | Drain them under previous version if participant supports it.                | Refuse/hold commands using broken version.                            |
| 6    | Is the required previous DAR still uploaded/vetted on participant(s)?  | Validate checksum/signature and proceed.                                     | Re-upload previous DAR if removed, then verify inventory.             |
| 7    | Deployment mode requires customer action?                              | Send customer-validator/self-hosted coordinated chart/DAR instructions.      | Hosted SRE executes internally.                                       |

| Rollback option                 | Use when                                                                                    | Risk                                              | Required approval                             |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| Registry pin revert             | Broken version not used for new contracts or old and new versions coexist safely.           | Low/medium if command mapping is compatible.      | Incident commander + template registry owner. |
| Drain previous-version commands | In-flight commands were planned before cutover and previous package is still valid.         | Medium if queue contains mixed bindings.          | Ledger-command owner.                         |
| Refuse broken-version commands  | New command builder would select broken package.                                            | Low; causes retryable/degraded customer behavior. | On-call lead.                                 |
| Re-upload previous DAR          | Previous package removed or absent on participant.                                          | Medium; participant package state change.         | Registry owner + deployment owner.            |
| Corrected DAR roll-forward      | Broken version already created ledger state or previous pin cannot serve current contracts. | High; requires Daml/runtime review.               | Engineering lead + incident commander.        |
| Compensating ledger workflow    | Bad contracts exist and require domain correction.                                          | Highest; economic state affected.                 | Governance/security/compliance approval.      |

| Deployment mode      | Rollback authority                                                             | Expected action                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `hosted`             | Pillar SRE and template registry owner                                         | Silent internal fix where customer workflows recover without action; communicate only if customer-visible impact occurred. |
| `customer-validator` | Pillar controls registry; customer controls participant/chart where applicable | Coordinate registry pin plus customer participant DAR/chart state; provide exact evidence required.                        |
| `self-hosted`        | Customer operator controls local registry/chart/participant                    | Provide signed rollback bundle/chart instructions; customer executes locally and shares verification.                      |

## Pre-checks

| Check                                | Evidence                                                                | Pass criteria                                                                     | Stop if failing                            |
| ------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| Freeze cutover                       | Template registry upgrade plan state                                    | No further automatic rollout/cutover/retire actions.                              | Rollout automation still active.           |
| Freeze affected commands             | Ledger-command command-family gate                                      | New commands using broken package refused or held.                                | Commands continue to use broken version.   |
| Capture registry state               | Registry package versions, active pins, descriptors, upgrade plan audit | Current and previous active versions recorded.                                    | Registry state unknown.                    |
| Capture participant inventory        | PackageManagementService / compatibility records                        | Broken and previous package visibility known per participant.                     | Inventory missing.                         |
| Capture command failures             | Completion errors grouped by package/version/intent type                | Regression package and affected workflows identified.                             | Failure classification unknown.            |
| Capture in-flight queue              | Command request and attempt rows                                        | Each queued command has operation ID, command semantic version, registry version. | Mixed queue cannot be classified.          |
| Verify checksums/signatures          | Registry artifact metadata and object storage                           | Previous DAR artifact checksum/signature trusted.                                 | Artifact untrusted or missing.             |
| Check contracts under broken version | Projection/ledger trace/internal admin query                            | Count and scope known.                                                            | Unknown ledger state under broken package. |
| Establish audit approval             | Incident ticket, operator identity, approval record                     | Manual pin/upload action is approved and logged.                                  | No approval/audit path.                    |

| Public API guardrail                                                                                               | Requirement                       |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Do not expose `package_id`, `template_id`, `participantId`, or command internals in customer responses.            | Use internal admin traces only.   |
| Do not rewrite customer object IDs or operation IDs because package version changed.                               | Public object identity is stable. |
| Do not delete ledger contracts created under a broken version outside approved Daml workflows.                     | Ledger is source of truth.        |
| Do not change `command_semantic_version` during emergency unless intentionally changing command identity boundary. | ADR-0011 must hold.               |
| Do not retire/unvet packages still needed by existing in-flight or historical contracts.                           | Avoid trapping operations.        |

## Diagnose

| Diagnostic                                              | Evidence                                                              | Interpretation                                                    | Action                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| Which `package_id` introduced regression?               | Registry cutover timestamp, command failures, participant completions | Identifies broken package version.                                | Mark version blocked/revoked candidate in registry. |
| Which intent types are affected?                        | Command semantic version, planner route, completion error class       | Scope command refusal/drain.                                      | Gate only affected command families if safe.        |
| Was rollback choreography followed?                     | Upgrade plan state history and approvals                              | Determines safe rollback path.                                    | If not, freeze and reconstruct manually.            |
| Are failures deterministic?                             | Repeat/canary on sandbox or shadow tenant                             | Confirms Daml workflow regression vs transient participant issue. | Avoid broad rollback for transient errors.          |
| Are previous packages still available?                  | Participant inventory and registry compatibility                      | Pin rollback feasible.                                            | Re-upload previous DAR if needed.                   |
| Were new contracts created under broken package?        | Internal trace/projection by package/version                          | Simple rollback may leave active incompatible contracts.          | Consider corrected roll-forward/compensation.       |
| Are customer-validator/self-hosted deployments drifted? | Compatibility matrix and customer evidence                            | Rollback requires local action.                                   | Coordinate chart/DAR rollback.                      |
| Are public API errors stable and retryable?             | API error logs                                                        | Customers can retry safely.                                       | Keep errors structured and idempotent.              |

| Failure signature                                             | Likely cause                                | Branch                                                                      |
| ------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| `package_not_found` or package visibility failure             | DAR upload/vetting missing on participant   | Re-upload previous or target DAR; update compatibility.                     |
| `template/choice not found` after cutover                     | Descriptor/command-builder package mismatch | Registry pin revert; fix descriptor mapping.                                |
| Daml assertion/business rule failure for valid intent         | Daml workflow regression                    | Pin previous version if no bad contracts; otherwise corrected roll-forward. |
| Only one participant fails                                    | Deployment inventory drift                  | Customer-validator/self-hosted or participant-specific fix.                 |
| Only canary tenant fails before global cutover                | Canary caught issue                         | Abort upgrade plan; no broad rollback needed.                               |
| Existing operations planned before cutover fail after cutover | Queue mixed-version handling bug            | Drain with stored registry version or pin previous.                         |

| Required failure grouping | Fields                                                        |
| ------------------------- | ------------------------------------------------------------- |
| By package version        | previous active, broken active, canary, tenant pin.           |
| By command family         | issue, transfer, redeem, hold, settlement, admin command.     |
| By deployment mode        | hosted, customer-validator, self-hosted.                      |
| By participant            | Inventory alias, compatibility state, upload/vetting status.  |
| By lifecycle              | queued, submitted, completed, rejected, timed out, projected. |

## Mitigate

| Situation                                          | Action                                                                                                  | Guardrail                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Broken package selected for new commands           | Pin registry to previous active version using P12.N06 rollback transition.                              | Audit pin change; confirm command builder cache refresh.                 |
| Previous version still supports in-flight commands | Drain queued/in-flight commands using previous version.                                                 | Preserve stored operation and command identity; no duplicate operations. |
| New commands would use broken version              | Refuse with structured retryable/degraded error or pause mutation API.                                  | Do not accept and then fail unsafe commands.                             |
| Previous DAR removed from participant              | Re-upload previous DAR from signed artifact, verify checksum/signature, then verify package visibility. | Do not upload unsigned/unregistered DAR.                                 |
| Broken version has active contracts                | Stop creating more broken-version contracts; assess compatibility and prepare corrected roll-forward.   | Do not blindly pin back if old code cannot handle new contracts.         |
| Customer-validator participant drift               | Send coordinated action: chart/DAR rollback, package inventory evidence, restart/reload if needed.      | Keep public API behavior unchanged.                                      |
| Self-hosted drift                                  | Provide signed rollback bundle and local verification checklist.                                        | Customer executes local hot-path changes.                                |
| Command retry storm                                | Increase backoff or hold queue for affected command families.                                           | Stable `command_id`; new `submission_id` only per real retry.            |

| Registry pin rollback checklist                                                          | Requirement                             |
| ---------------------------------------------------------------------------------------- | --------------------------------------- |
| Previous active package version is verified and not revoked for this tenant/environment. | Prevents rollback to known-bad package. |
| Participant compatibility record is current for every required participant.              | Prevents package-not-found after pin.   |
| Command-builder cache is invalidated or refreshed.                                       | Prevents continued broken selection.    |
| Upgrade plan state records rollback reason and approver.                                 | Maintains auditability.                 |
| Metrics and alerts are annotated with rollback event.                                    | Aids verification and RCA.              |

| Refusal behavior                                                                 | Public API response                                                                                   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| New affected mutation before idempotency acceptance                              | `503 service_unavailable` with `Retry-After`, request ID, no operation created.                       |
| New affected mutation after idempotency acceptance but before command submission | Existing operation remains `processing`/degraded internal state; public response is stable/retryable. |
| Idempotency replay                                                               | Return stored response or current stable operation state; do not create new operation.                |
| Unaffected mutation                                                              | Continue only if command family and package mapping are proven unaffected.                            |

## Recover

| Step | Action                                                                                 | Evidence                                                                |
| ---- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | Stop rollout/cutover automation for the broken DAR.                                    | Upgrade plan frozen.                                                    |
| 2    | Mark broken version blocked for new command selection.                                 | Registry status/audit entry.                                            |
| 3    | Pin affected tenant/environment to previous active version when safe.                  | P12.N06 rollback transition and approval.                               |
| 4    | If previous DAR is absent, re-upload it from registry artifact.                        | Checksum/signature verification and participant package inventory.      |
| 5    | Refresh command-builder registry cache.                                                | Runtime lookup returns previous active version.                         |
| 6    | Drain in-flight commands planned for previous version.                                 | Queue depth decreases; failures stop.                                   |
| 7    | Refuse or reclassify commands planned for broken version according to policy.          | No new broken-version command attempts.                                 |
| 8    | Re-run command identity checks.                                                        | Same operation has same command ID; retries have unique submission IDs. |
| 9    | Verify projections and webhooks for recovered command flow.                            | Terminal operations project and emit events normally.                   |
| 10   | Decide broken-version cleanup: revoke, corrected roll-forward, or compatibility patch. | Post-incident action filed.                                             |

| Previous DAR re-upload | Required evidence                                          |
| ---------------------- | ---------------------------------------------------------- |
| Artifact URI           | Immutable registry artifact location.                      |
| Checksum               | Matches P12.N04 registry record.                           |
| Signature              | Trusted signer, valid signature, not expired/revoked.      |
| Package IDs            | Match previous active registry descriptor.                 |
| Participant inventory  | Each required participant reports package uploaded/vetted. |
| Audit                  | Upload action tied to incident and operator identity.      |

| Command identity recovery                                               | Required check                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Existing accepted operation retains its `operation_id`.                 | Idempotency/audit record unchanged.                              |
| Existing command request retains its `command_id`.                      | Command request table unchanged across retry.                    |
| Retry attempt receives new `submission_id`.                             | Attempt record unique.                                           |
| Registry version attached to operation trace is explainable.            | Shows original plan, rollback action, and final attempt version. |
| No duplicate successful ledger effect for one external intended change. | Completion/projection trace confirms one final economic effect.  |

| Broken-version contracts exist?                      | Recovery path                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| No                                                   | Pin back, drain previous-version queue, block broken version, plan fixed DAR.                                       |
| Yes, but old version can read/operate on them safely | Pin new commands back while preserving compatibility route for existing contracts.                                  |
| Yes, old version cannot handle them                  | Do not simple-rollback; stop further damage and prepare corrected DAR roll-forward or compensating ledger workflow. |
| Unknown                                              | Keep affected commands paused; run internal ledger/projection trace before pin decision.                            |

## Verify

| Verification           | Pass criteria                                                                              | Related control              |
| ---------------------- | ------------------------------------------------------------------------------------------ | ---------------------------- |
| Registry active pin    | Affected tenant/environment points to previous safe version or approved corrected version. | P12.N06.                     |
| Participant inventory  | Required participants have previous/corrected package uploaded/vetted.                     | P12.N09.                     |
| Command-builder lookup | Runtime selects safe package for affected command families.                                | P12.N04/P12.N06.             |
| Command success rate   | `pillar_ledger_command_success` returns to normal band for affected workflows.             | P4 command SLO.              |
| Command failures       | No new failures attributable to broken package.                                            | Runtime logs/completions.    |
| Command identity       | No duplicate operations or changed command IDs for accepted retries.                       | ADR-0011 / IC-05.            |
| Broken package usage   | No new contracts or command submissions under broken version after mitigation timestamp.   | Registry/ledger trace query. |
| Projection correctness | New successful commands project normally and reconciliation remains zero.                  | IC-10.                       |
| Webhook correctness    | Events emitted from projected ledger state and delivery recovers.                          | IC-06/IC-07.                 |
| Public API grammar     | No public response exposes package/template internals or mode-specific differences.        | IC-03/IC-08.                 |

| Sample verification matrix | Minimum cases                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Affected intent type       | One new mutation after rollback and one retry of an incident-window operation.     |
| Unaffected intent type     | One command proves unrelated workflows still work.                                 |
| Hosted                     | If hosted affected, verify internal participant inventory and silent fix path.     |
| Customer-validator         | If affected, verify customer participant evidence and Pillar registry state align. |
| Self-hosted                | If affected, verify local registry/chart/participant evidence from customer.       |
| Broken package             | Query confirms zero new command submissions/contracts after block timestamp.       |

| Verification failure                                  | Action                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Command builder still selects broken version          | Keep commands paused; invalidate cache/restart service; inspect registry client. |
| Participant lacks previous package                    | Re-upload previous DAR or coordinate customer action.                            |
| Commands still rejected under previous version        | Reassess root cause; may not be DAR regression.                                  |
| New contracts appear under broken version after block | SEV1; freeze all affected command paths and audit bypass.                        |
| Projection diff appears                               | Switch to [projection rebuild](./projection-rebuild.md).                         |

## Communicate

| Audience   | Hosted template                                                                                                                                                      | Customer-validator template                                                                                                                                                                   | Self-hosted template                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial    | "We are investigating command failures after a package rollout. We have paused affected command selection and are validating rollback to the previous safe version." | "A package rollout appears to be failing against your configured validator path. Pillar may pin the registry back, and your participant/chart may require coordinated DAR rollback evidence." | "Your local deployment reports command failures after a DAR/package change. Pause affected mutations and follow the signed rollback bundle/chart verification steps." |
| Mitigation | "We pinned affected environments to the previous safe package version and are draining in-flight operations with preserved idempotency semantics."                   | "Registry pin rollback is ready or applied. Please verify participant package inventory and apply the coordinated chart/DAR rollback if requested."                                           | "Apply the local rollback bundle, verify checksum/signature, and confirm participant package visibility before reopening mutations."                                  |
| Recovery   | "Command success has recovered and no new contracts are being created under the broken package version."                                                             | "The validator path and registry state are aligned. Command success and projection/webhook recovery are being verified."                                                                      | "Local verification should confirm command success, no new broken-version contracts, and healthy projections/webhooks."                                               |
| Closure    | "Rollback is complete. Accepted operations retained command identity and the broken package is blocked pending corrected release."                                   | "Coordinated rollback is complete for the affected validator path. No public API change is required."                                                                                         | "Local rollback may be closed after your audit confirms package inventory, command identity, and projection recovery."                                                |

| Communication rules                                                                                                        | Requirement                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Hosted fix may be silent only if there was no customer-visible impact and no customer action required.                     | Otherwise communicate impact and recovery.                                       |
| Customer-validator/self-hosted requires coordinated chart/DAR language when local action is needed.                        | State exact evidence: checksum, signature, participant inventory, chart version. |
| Do not expose `package_id` or template IDs in public customer-facing messages unless via authorized admin/support channel. | Keep `/v1` Canton-invisible.                                                     |
| Explain retry behavior in idempotency terms.                                                                               | Customers need safe retry guidance.                                              |
| If commands were rejected, disclose affected workflow family and window.                                                   | Supports customer reconciliation.                                                |

## Post-incident

| Task                         | Owner                                | Required output                                                                                                  |
| ---------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Final severity review        | Incident commander                   | SEV1/SEV2/SEV3 with command/customer impact evidence.                                                            |
| Root cause                   | Daml/runtime/template registry owner | Regression category: Daml logic, descriptor mapping, package upload, compatibility, chart drift, cache, process. |
| Registry audit archive       | Template registry owner              | Upgrade plan history, pin changes, approvals, package states.                                                    |
| Participant evidence archive | Deployment owner                     | Package inventory before/after, upload/vetting evidence, customer evidence if applicable.                        |
| Command identity audit       | Ledger-command owner                 | Sample operations prove stable operation/command IDs and unique submission attempts.                             |
| Broken-version containment   | Template registry owner              | Version status: blocked/revoked/retired/corrected, and no new usage after timestamp.                             |
| Projection/webhook audit     | Projection/webhook owners            | Confirmation final states and events are correct after rollback.                                                 |
| Release process fix          | Release owner                        | Add missing canary, compatibility, or rollback gate to P12/P9/P10 work.                                          |
| Customer RCA                 | Support/CS                           | If visible, workflow impact, retry guidance, and closure statement.                                              |

| RCA questions                                           | Required answer                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Why did pre-cutover validation miss the regression?     | Canary, compatibility matrix, Daml test, descriptor extraction, chart evidence gap. |
| Was rollback choreography followed?                     | If not, record why and add a gate.                                                  |
| Were any contracts created under the broken version?    | If yes, record corrective plan and customer impact.                                 |
| Did cache or participant inventory drift from registry? | If yes, fix invalidation/compatibility evidence.                                    |
| Did deployment mode ownership slow recovery?            | Convert into hosted/customer-validator/self-hosted procedure update.                |
| Did public API leak internals during incident?          | If yes, security/regression blocker.                                                |

## Related (SLOs, tickets, ADRs, threats)

| Type         | Link / ID                                                                                                                            | Relationship                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Ticket       | [P12.N04](../Phase_12_Template_Registry_Versioning.md)                                                                               | DAR ingest, checksum/signature, package descriptors.                 |
| Ticket       | [P12.N06](../Phase_12_Template_Registry_Versioning.md)                                                                               | Upgrade plan rollback, registry pin revert, choreography.            |
| Ticket       | [P12.N09](../Phase_12_Template_Registry_Versioning.md)                                                                               | Compatibility matrix and deployment-mode package evidence.           |
| Ticket       | [P4.F04](../Phase_04_Ledger_Command_Runtime.md)                                                                                      | Retry safety and command dedup during rollback.                      |
| Ticket       | [P4.F06](../Phase_04_Ledger_Command_Runtime.md)                                                                                      | Command failure classification.                                      |
| Ticket       | [P10.L01](../Phase_10_GA_Hardening.md)                                                                                               | Chaos drill for rollback and retry storm.                            |
| ADR          | [ADR-0001](../DECISIONS.md#adr-0001-canton-ledger-as-sole-source-of-truth)                                                           | Ledger contracts remain source of truth after package regression.    |
| ADR          | [ADR-0004](../DECISIONS.md#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt)                         | Stable operation/command identity through retry.                     |
| ADR          | [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar) | Mode-specific rollback ownership without API fork.                   |
| ADR          | [ADR-0011](../DECISIONS.md#adr-0011-command_id-derivation-spec)                                                                      | Exact command identity derivation.                                   |
| Contract     | [REGRESSION_CONTRACT §5](../REGRESSION_CONTRACT.md#5-ledger-trace-contract)                                                          | Trace package rollback through operation/command/update/projection.  |
| Contract     | [REGRESSION_CONTRACT §9](../REGRESSION_CONTRACT.md#9-deployment-mode-contract)                                                       | Hosted/customer-validator/self-hosted allowed differences.           |
| SLO          | `pillar_ledger_command_success`                                                                                                      | Primary command regression and recovery metric.                      |
| SLO          | `pillar_api_5xx_rate`                                                                                                                | Public impact when mutation API is paused/refusing commands.         |
| Architecture | [Deployment](../../Architecture/18_Deployment.md)                                                                                    | Deployment responsibility split and local hot-path independence.     |
| Architecture | [Security](../../Architecture/12_Security.md)                                                                                        | Admin-only exposure and audit of sensitive package/participant data. |
| Architecture | [Observability](../../Architecture/22_Pillar%20Observability.md)                                                                     | Command, projection, webhook trace and incident practices.           |
