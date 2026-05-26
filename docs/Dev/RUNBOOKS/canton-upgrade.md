# Runbook: Canton upgrade

## Trigger

| Field                     | Required content                                                                                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alert names               | `PIL-CANTON-UPGRADE-REQUIRED`, `PIL-DAR-UPLOAD-P1`, `PIL-PARTICIPANT-DEGRADED`, security advisory, release-manager planned change.                                                                                                                                                 |
| Manual triggers           | Scheduled Canton/Daml SDK/DPM upgrade, critical security fix, Daml SDK release train, Canton 3.x to 4.x compatibility branch, customer-validator/self-hosted operator request.                                                                                                     |
| Affected planes           | Canton Command, Projection, Data Plane, Control Plane, Template Registry, Helm Deployment, SDK/CLI only if generated bindings or release docs change.                                                                                                                              |
| Customer-visible symptoms | Planned maintenance notice, delayed command completion during window, customer-validator/self-hosted participant upgrade requirement, or no visible change when compatibility is preserved.                                                                                        |
| SLO / threat references   | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_ledger_command_success`, `pillar_ledger_command_p99_latency`, `pillar_participant_availability`, `pillar_dar_upload_success`, `pillar_projection_lag_seconds_p99`; [RISK_REGISTER.md](../RISK_REGISTER.md) R-001, R-002, R-010, R-033. |

### Trigger checklist

| Check                               | Required action                                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is this customer-impacting?         | Planned upgrades are SEV3 when no customer impact; emergency security upgrades are SEV2 unless active outage/correctness risk makes them SEV1 under incident policy. |
| Is economic correctness uncertain?  | Treat as SEV1 until command identity, projection rebuild equivalence, and package compatibility are verified.                                                        |
| Is compromise suspected?            | Preserve security advisory, artifact signatures, participant logs, and release evidence; include Security lead.                                                      |
| Is regulator notification possible? | Include Compliance for regulated customers if maintenance or emergency fix changes availability commitments.                                                         |
| Is public `/v1` behavior affected?  | Stop upgrade; API grammar must remain unchanged across Canton versions unless a separate API release path is approved.                                               |

## Severity classification

| Severity | Use when                                                                                                                                                                          | First response owner                                              | Communications                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| SEV1     | Upgrade causes or may cause duplicate/wrong ledger commands, package incompatibility against active contracts, projection mismatch, lost audit trace, or public API grammar leak. | Incident Commander + Ledger runtime lead + Template registry lead | Status page, direct customer escalation, executive/customer updates.  |
| SEV2     | Emergency security/runtime fix, participant degradation during upgrade, customer-validator hosted compatibility issue, or planned upgrade with material customer action.          | Ledger runtime lead + Release manager                             | Customer notice; status page if live impact or broad customer action. |
| SEV3     | Planned sandbox/testnet/mainnet rollout with no customer-visible degradation; internal compatibility validation.                                                                  | Release manager + component owners                                | Maintenance notice or release notes only.                             |

### Severity downgrade rules

| From | To     | Evidence required                                                                                                                   |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| SEV1 | SEV2   | No duplicate command, no active-contract incompatibility, ledger/projection reconciliation clean, rollback/forward path known.      |
| SEV2 | SEV3   | Upgrade is back to planned window, no SLO burn, no customer action beyond announced maintenance.                                    |
| Any  | Closed | Phase rollout verified, DAR upload complete, command identity preserved, projection rebuild equivalent, customer notices completed. |

## On-call decision tree

```text
Canton/Daml SDK/DPM upgrade requested or required
  -> classify planned vs emergency
  -> freeze unrelated release train
  -> inspect .tool-versions, DPM, Daml SDK, DAR/package registry, participant versions
  -> read Canton/Daml release notes and compatibility matrix
  -> run sandbox compatibility first
  -> promote sandbox -> testnet -> mainnet hosted
  -> coordinate customer-validator participant upgrades
  -> provide self-hosted bundle and scheduling guidance
  -> verify command/projection/DAR invariants after each phase
  -> rollback only if required; otherwise roll forward through compatibility plan
```

| Decision                                     | If yes                                                                                                      | If no                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Critical security fix?                       | SEV2 emergency path; compress rollout but keep invariant gates.                                             | Scheduled planned path.                                |
| Major compatibility jump such as 3.x -> 4.x? | Open compatibility branch; require release-notes review, package compatibility matrix, and customer notice. | Minor upgrade path may use standard phased rollout.    |
| Daml SDK/DPM pin changes?                    | Update `.tool-versions`, DPM config, generated bindings, DAR manifest, release packet.                      | Participant/runtime-only validation may be sufficient. |
| Template/package compatibility uncertain?    | Stop before testnet/mainnet; run P12 registry compatibility and P9.J06 upload evidence.                     | Continue phased rollout.                               |
| Customer-validator participants affected?    | Notify customers; they upgrade participant; Pillar services remain `/v1` compatible.                        | Hosted-only branch.                                    |
| Self-hosted customers affected?              | Ship signed bundle, compatibility notes, offline verification, and self-schedule instructions.              | No self-hosted action.                                 |
| Rollback required?                           | Follow [dar-rollback.md](./dar-rollback.md) and Helm rollback; complete post-incident.                      | Continue forward recovery and close as planned change. |

## Pre-checks (commands to run first)

| Purpose                            | Command / query                                                                                                                                       | Expected result                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Identify current tool pins         | `pillarctl release toolchain current --files .tool-versions,daml/multi-package.yaml`                                                                  | Current Daml SDK, DPM, JVM, generated binding checksums known; P0.A18 satisfied.                      |
| Verify candidate versions          | `pillarctl canton compatibility check --from <current> --to <target> --include dpm,daml-sdk,participant,pqs,ledger-api`                               | Candidate release notes and compatibility warnings enumerated.                                        |
| Check template registry matrix     | `pillarctl template-registry compatibility matrix --target-canton <target> --target-daml-sdk <target-sdk>`                                            | P12 compatibility records for active packages/participants are current or missing entries identified. |
| Check active DAR/package state     | `pillarctl template-registry packages active --env <env> --include dar_uploads,package_versions,template_descriptors`                                 | Active package versions, DAR checksums, `sdk_version`, `template_semver`, registry version known.     |
| Check participant versions by mode | `pillarctl participants list --env <env> --deployment-mode all --include version,owner,health`                                                        | Hosted, customer-validator, and self-hosted participant ownership/version scope known.                |
| Check release artifacts            | `pillarctl release current --env <env> --include images,chart,dar,migrations,toolchain`                                                               | Current immutable chart/image/DAR/toolchain release packet captured.                                  |
| Check SLO baseline                 | `pillarctl slo status --env <env> --slo pillar_ledger_command_success,pillar_participant_availability,pillar_projection_lag_seconds_p99 --window 30m` | Baseline is healthy or pre-existing burn is documented before upgrade.                                |
| Capture audit context              | `pillarctl audit search --operation canton_upgrade --env <env> --release <candidate>`                                                                 | Upgrade approval and planned phases traceable.                                                        |
| Capture logs                       | `pillarctl logs bundle --component ledger-command,projection-worker,template-registry --since <duration> --output <case-id>.tar.zst`                  | Immutable pre-upgrade evidence bundle created.                                                        |

### Evidence preservation before mutation

| Artifact                                 | Required before destructive action? | Notes                                                                                |
| ---------------------------------------- | ----------------------------------: | ------------------------------------------------------------------------------------ |
| Toolchain pins                           |                                 Yes | `.tool-versions`, Daml/DPM config, generated binding checksums.                      |
| Release notes and compatibility findings |                                 Yes | Canton, Daml SDK, DPM, PQS, Ledger API, package management changes.                  |
| DAR/package registry state               |                                 Yes | P12 registry records, active pins, compatibility matrix, upload manifests.           |
| Participant health/version               |                                 Yes | Per deployment mode and tenant scope; customer-owned participants marked.            |
| Helm/release packet                      |                                 Yes | Chart, image digests, DAR checksum, migration range, rollback plan.                  |
| Projection/reconciliation baseline       |                                 Yes | Offsets, rebuild comparator, known diffs before upgrade.                             |
| Customer communications                  |                                 Yes | 90-day notices, maintenance windows, emergency advisories, self-hosted instructions. |

## Diagnose

| Step | Question                                                     | Evidence                                                                          | Branch                                                                          |
| ---- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1    | What changes between current and target Canton/Daml SDK/DPM? | Official release notes, compatibility checker, P0.A18 pins.                       | Toolchain, participant, Ledger API, PQS, package-management branch.             |
| 2    | Do Daml templates need migration?                            | Daml build/test, template registry descriptors, package compatibility matrix.     | P12.N03 ingest + P12.N08 compatibility; DAR lifecycle branch.                   |
| 3    | Do generated bindings change command builders?               | Daml codegen diff, ledger-command compile/tests, command semantic version review. | Preserve command identity or bump internal semantic version with registry plan. |
| 4    | Are customer-validator participants compatible?              | Participant version inventory and customer ownership.                             | Customer notice/action branch.                                                  |
| 5    | Are self-hosted bundles compatible/offline-verifiable?       | Air-gapped bundle manifest, Daml SDK/toolchain pin, chart/image/DAR signatures.   | Self-hosted scheduled branch.                                                   |
| 6    | Does projection/PQS behavior change?                         | Projection lag baseline, rebuild comparator, PQS release notes.                   | Projection rebuild equivalence branch.                                          |
| 7    | Does DAR upload/package visibility behavior change?          | P12.N03 ingest, P9.J06/P12.N06 upload job, participant package query.             | DAR upload verification branch.                                                 |
| 8    | Does public `/v1` grammar change?                            | OpenAPI diff, SDK conformance, forbidden-internals scan.                          | Stop: this is not allowed in Canton upgrade path.                               |

### Required diagnosis outputs

| Output               | Format                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Impact statement     | `current -> target / reason / env / deployment modes / customer action / expected visible impact`                     |
| Affected objects     | Release packet, DAR versions, registry version, participant IDs internal-only, public operation IDs for smoke traces. |
| Timeline             | UTC timestamps for sandbox, testnet, mainnet hosted, customer-validator notice, self-hosted bundle publish.           |
| Invariant assessment | Ledger source-of-truth, command identity, projection equivalence, Canton-invisible API, deployment-mode parity.       |
| Next action          | Continue phase, pause, rollback, customer notice, compatibility branch, or emergency hotfix.                          |

## Mitigate

| Mitigation class  | Allowed actions                                                                                                | Forbidden actions                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Release control   | Freeze unrelated deploys, stage upgrade in sandbox/testnet, canary hosted tenants, require manual approvals.   | Skip sandbox/testnet because upgrade is urgent; mutate public API grammar.                                |
| Toolchain safety  | Pin known-good SDK/DPM, maintain compatibility branch, defer nonessential upgrade.                             | Use floating Daml SDK/DPM versions or local-only global tools.                                            |
| Runtime safety    | Pause command submission during cutover if required; drain queues; verify participant health before resume.    | Submit commands against unknown package/participant compatibility.                                        |
| Registry safety   | Use P12 upgrade choreography and P9.J06 registry-driven DAR upload.                                            | Upload DAR directly to participant outside registry ingest/signature/compatibility.                       |
| Projection safety | Mark reads stale/read-only if projection lag exceeds threshold; rebuild from ledger/PQS after upgrade.         | Patch projection rows as authority.                                                                       |
| Customer safety   | Send 90-day notices for customer-validator/self-hosted planned upgrades; emergency advisory when security fix. | Force customer-validator/self-hosted participant upgrades without notice except legal/security emergency. |

### Deployment-mode rollout branches

| Deployment mode      | Upgrade owner                                                     | Required branch                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hosted`             | Pillar SRE/Ledger runtime                                         | Sandbox -> testnet -> mainnet hosted; Pillar upgrades participant/runtime/chart/DAR and verifies SLOs before each promotion.                                                                    |
| `customer-validator` | Customer owns participant; Pillar owns services/API compatibility | Notify 90 days in advance per [RELEASE_PLAN.md](../RELEASE_PLAN.md); provide compatibility matrix and minimum participant version; Pillar services must remain compatible during notice window. |
| `self-hosted`        | Customer operator                                                 | Publish signed/offline bundle with chart/images/DAR/toolchain pin/verification keys; customer self-schedules; Pillar provides support window and rollback guidance.                             |

### Phased rollout gates

| Phase              | Entry gate                                                                           | Exit gate                                                                                           | Stop condition                                                               |
| ------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Sandbox            | Toolchain pin updated; Daml build/codegen green; candidate release packet created.   | Integration tests pass against target; command identity and projection comparator green.            | Any compile/codegen/OpenAPI forbidden-field failure.                         |
| Testnet            | Sandbox exit green; P12 compatibility matrix complete; DAR upload manifest verified. | Testnet commands complete, projection lag normal, DAR re-upload visible, rollback smoke documented. | Participant package mismatch, command failures, unexplained projection diff. |
| Mainnet hosted     | Testnet exit green; manual approval; customer notice if maintenance.                 | Hosted SLOs normal, command/projection/webhook traces complete, release packet archived.            | SLO burn, participant degradation, registry mismatch.                        |
| Customer-validator | Hosted compatibility proven; notice sent; customer participant version plan known.   | Customer participants report compatible version/health; Pillar service compatibility maintained.    | Customer participant incompatible and no safe compatibility mode.            |
| Self-hosted        | Bundle signed and offline-verifiable; migration/rollback docs included.              | Customer confirms local verification/scheduled upgrade; support case closed.                        | Bundle verification failure or missing rollback path.                        |

### Mitigation record

| Field           | Required value                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Action          | Exact pin, Helm upgrade/rollback, DAR upload, participant upgrade, compatibility hold, or customer notice.            |
| Owner           | Release manager, Ledger runtime lead, Template registry lead, SRE; customer owner for customer-operated participants. |
| Start/end       | UTC timestamps.                                                                                                       |
| Expected effect | Candidate advances one phase or unsafe upgrade is paused with previous version retained.                              |
| Rollback        | Previous chart/image/DAR/toolchain packet; [dar-rollback.md](./dar-rollback.md) and Helm rollback conditions.         |
| Evidence link   | Release packet, compatibility matrix, SLO dashboards, audit bundle, customer notice.                                  |

## Recover

| Recovery step                 | Required checks                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Complete phase before next    | Sandbox/testnet/mainnet hosted/customer-validator/self-hosted each verified independently.                          |
| Re-enable command traffic     | `pillar_ledger_command_success` and participant health normal; command identity trace intact.                       |
| Complete DAR re-upload        | P12.N03 ingest metadata, P12.N06/P9.J06 upload evidence, participant package visibility, registry version recorded. |
| Rebuild/reconcile projections | Projection rebuild equivalent; no unexplained diffs; offsets/freshness normal.                                      |
| Restore release train         | Error budgets healthy; release manager approves unfreeze.                                                           |
| Customer closeout             | Customer-validator/self-hosted notices updated with final status or required action.                                |

## Verify

| Verification                    | Command / source                                                                                                      | Pass condition                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Integration tests on target     | `pillarctl test integration --canton-version <target> --daml-sdk <target-sdk>`                                        | Full sandbox integration passes against new version.                                                                     |
| Command identity preservation   | `pillarctl trace compare-command-identity --before <release-a> --after <release-b> --operation-fixture standard`      | Same external intended change maps to same operation/command identity unless approved semantic-version bump is recorded. |
| Projection rebuild equivalence  | `pillarctl projection rebuild --env <env> --compare --window <upgrade-window>`                                        | Byte-equal or explained diffs; no customer-visible mismatch.                                                             |
| DAR upload completion           | `pillarctl template-registry verify-upload --env <env> --release <release> --tickets P12.N03,P9.J06`                  | DAR re-upload/visibility complete; registry and participant agree.                                                       |
| Participant availability        | `pillarctl slo status --slo pillar_participant_availability --env <env> --window 30m`                                 | Participant availability inside target; no unresolved `PIL-PARTICIPANT-*` alert.                                         |
| Ledger command success          | `pillarctl slo status --slo pillar_ledger_command_success --env <env> --window 30m`                                   | Command success normal and no unknown terminal classification.                                                           |
| Public API parity               | `pillarctl api regression --env <env> --mode hosted,customer-validator,self-hosted --contract REGRESSION_CONTRACT.md` | `/v1` grammar unchanged; no Canton internal identifiers leak.                                                            |
| Customer-validator evidence     | `pillarctl participants list --deployment-mode customer-validator --include version,health,owner`                     | Customer-owned participants compatible or explicitly scheduled with support case.                                        |
| Self-hosted bundle verification | `pillarctl release bundle verify --bundle <bundle> --offline`                                                         | Signatures, checksums, chart provenance, DAR signatures, Daml SDK pin verified offline.                                  |
| Audit integrity                 | `pillarctl audit verify --case <case-id>`                                                                             | Upgrade approvals, phase promotions, registry/DAR actions, and customer communications recorded.                         |

## Communicate (customer-facing message templates)

### Initial status-page update

```text
We are beginning a planned Canton runtime upgrade for <scope>. Pillar's public `/v1` API, SDK object model, and webhook contract are expected to remain unchanged. We will provide the next update by <UTC time>.
```

### Degraded service update

```text
The Canton runtime upgrade is currently degraded for <scope>. Some operations may experience delayed completion while participant compatibility is verified. Accepted operations remain traceable and we are validating final state before continuing rollout. Next update by <UTC time>.
```

### Recovery update

```text
We have completed the Canton runtime upgrade phase for <scope> as of <UTC time>. We are monitoring command completion, projection freshness, and package compatibility before advancing to the next phase.
```

### Resolution update

```text
The Canton runtime upgrade for <scope> is complete. We validated integration tests, command identity preservation, projection rebuild equivalence, and DAR/package visibility. No public `/v1` API changes are required.
```

### Customer-validator and self-hosted notice

```text
Pillar will support Canton/Daml SDK version <target> beginning <date>. Customer-validator customers must upgrade their participant to a compatible version by <deadline>; Pillar services will remain compatible during the notice window. Self-hosted customers may self-schedule using the signed release bundle <bundle-version>. Public `/v1` API behavior is unchanged.
```

### Security/compliance holding statement

```text
We are applying a Canton runtime security update affecting <scope>. We are preserving release and participant evidence, validating compatibility phase by phase, and will notify affected customers and regulators as required after validation.
```

## Post-incident

| Time from resolution | Deliverable                                                                                         | Owner                                 |
| -------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 2 hours              | Upgrade impact draft if rollback/degradation occurred.                                              | Incident Commander                    |
| 24 hours             | Initial report with failed phase, rollback/forward action, customer impact, and invariant evidence. | Ledger runtime lead + Release manager |
| 5 business days      | Full post-mortem only if rollback, SEV1/SEV2 degradation, or customer action failure occurred.      | SRE lead                              |
| Next release gate    | Compatibility test, registry check, or promotion gate updated for the discovered failure class.     | Template registry/release owner       |

### Post-incident fields

| Field                      | Required content                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Summary                    | Customer-visible upgrade impact and duration.                                                                   |
| Root cause                 | Evidence-backed Canton/Daml SDK/DPM/participant/PQS/package compatibility cause.                                |
| Trigger                    | Planned upgrade, security advisory, or release-train dependency.                                                |
| Detection gap              | Why sandbox/testnet/compatibility matrix did or did not catch it.                                               |
| Mitigation                 | Pause, pin, rollback, DAR rollback, Helm rollback, compatibility branch, customer notice.                       |
| Recovery proof             | Integration tests, SLO recovery, command identity, projection equivalence, DAR upload verification.             |
| Invariant impact           | Ledger source-of-truth, command identity, projection correctness, Canton-invisible API, deployment-mode parity. |
| Customer/regulator actions | 90-day notice, emergency advisory, maintenance update, regulator notice or rationale.                           |
| Follow-up work             | P0/P9/P12/P10 ticket IDs, owners, due dates, verification commands.                                             |

## Related

- SLOs: [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_ledger_command_success`, `pillar_ledger_command_p99_latency`, `pillar_participant_availability`, `pillar_dar_upload_success`, `pillar_projection_lag_seconds_p99`.
- Phase tickets: [P0.A18](../Phase_00_Foundation.md#9-implementation-plan) toolchain pinning, [P0.A22](../Phase_00_Foundation.md#9-implementation-plan) DPM version check, [P12.N03](../Phase_12_Template_Registry_Versioning.md#9-implementation-plan) DAR ingest, [P12.N08](../Phase_12_Template_Registry_Versioning.md#9-implementation-plan) compatibility matrix, [P9.J06](../Phase_09_CICD_Helm_Deployment.md#9-implementation-plan) DAR upload job, [P9.J22](../Phase_09_CICD_Helm_Deployment.md#9-implementation-plan) promotion workflow, [P10.L01](../Phase_10_GA_Hardening.md#9-implementation-plan) invariant/chaos gate.
- Release policy: [RELEASE_PLAN.md](../RELEASE_PLAN.md) versioning model, DAR release choreography, Helm chart release, and 90-day customer notice policy for customer-validator/self-hosted operator action.
- ADRs: [ADR-0001](../DECISIONS.md#adr-0001-canton-ledger-as-sole-source-of-truth), [ADR-0002](../DECISIONS.md#adr-0002-billing-style-external-api-surface-canton-internals-hidden), [ADR-0004](../DECISIONS.md#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt), [ADR-0005](../DECISIONS.md#adr-0005-projection--audit--config-split-for-pillar-postgres), [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar).
- Risks: [RISK_REGISTER.md](../RISK_REGISTER.md) R-001 Canton roadmap change, R-002 Daml package upgrade breaks command builders, R-010 DAR upload race, R-033 DPM/SDK release schedule conflict.
- Rollback runbooks: [dar-rollback.md](./dar-rollback.md), [migration-rollback.md](./migration-rollback.md), [participant-down.md](./participant-down.md), [projection-rebuild.md](./projection-rebuild.md).
- Threats: [THREAT_MODEL.md](../THREAT_MODEL.md) ledger command integrity, package/DAR integrity, participant credential, and deployment supply-chain entries where applicable.

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
