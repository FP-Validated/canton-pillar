# Phase 12 — Template Registry, Versioning, and DAR Lifecycle

> Make `services/template-registry` the internal source-of-record for DAR artifacts, package versions, template descriptors, command-version mapping, upgrade choreography, and participant compatibility.

## 1. Executive Summary

Phase 12 closes the gap between the Daml package lifecycle described in architecture and the deploy-time DAR upload stub currently owned by Phase 09.

The Pillar template registry is the source-of-record for:

- DAR artifacts and immutable checksums.
- Package IDs and semver per template family.
- Template descriptor metadata used by command builders.
- Command-version mapping for `services/ledger-command`.
- Tenant/environment pinning and per-participant compatibility.
- Upgrade choreography from announcement through retirement.
- Rollback decisions and replay/restore evidence.

Without this registry, `services/ledger-command` cannot deterministically choose a `package_id`, package compatibility becomes an implicit deployment side effect, and DAR rollback is ad hoc. Phase 09's `P9.J06` DAR upload Job remains the Helm execution hook, but its ownership is superseded by Phase 12: `P9.J06` becomes a registry-driven upload executor, not the policy owner for DAR selection, verification, compatibility, or rollout state.

Source documents:

| Architecture source                                                                       | Phase usage                                                                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [17 Template Registry Versioning](../Architecture/17_Template%20Registry%20Versioning.md) | Canonical registry lifecycle, template metadata extraction, tenant pins, compatibility, rollback, self-hosted sync |
| [08 Daml Template Library](../Architecture/08_Daml%20Template%20Library.md)               | Canonical template families, object mapping, package map, template metadata envelope                               |
| [07 Canton-native runtime](../Architecture/07_Canton-native%20runtime.md)                 | Command builder package selection, command envelope, participant routing, Canton-native runtime boundaries         |
| [18 Deployment](../Architecture/18_Deployment.md)                                         | Deployment mode invariants, multi-validator distribution, config/data-plane separation                             |
| [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)                     | Canonical source tree, Helm DAR Job, service and DB paths, release artifact expectations                           |

Core principles embedded in this phase:

| Principle                                             | Phase 12 enforcement                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Canton Ledger is the source of truth                  | Registry only selects package/template bindings; economic state remains active ledger contracts.                    |
| Pillar DB stores only Projection / Audit / Config     | `template_registry` is configuration/control-plane metadata, not asset state.                                       |
| External API must be Stripe-like and Canton-invisible | Public `/v1` surfaces do not expose `package_id`, `template_id`, DAR, or participant internals.                     |
| Internal runtime must be Canton-native                | Registry records Daml package IDs, DAR manifests, Ledger API upload evidence, and command-builder bindings.         |
| Operations must be ledger-traceable                   | Registry mutations, package uploads, pin changes, upgrade states, and rollback decisions are audited.               |
| Balance/Holding-first, not contract-first             | Template compatibility is evaluated against object mappings for holdings, balances, intents, and events.            |
| Intent-first, not transaction-first                   | Command-version mapping is keyed by intent operation type and template family, not raw transaction recipes.         |
| Webhook-first for async workflow                      | Upgrade windows preserve endpoint-pinned event schema and prevent webhook shape drift.                              |
| API grammar must be Stripe-grade from day one         | Optional admin API is scoped under `/v1/admin/template_registry/*`; no public customer grammar changes.             |
| Deployment model changes, API experience does not     | Hosted, customer-validator, and self-hosted use the same registry semantics and different distribution wiring only. |

Cross-phase invariants directly enforced:

| README §0 invariant                                                                  | Phase 12 enforcement                                                                                                               |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1. Canton Ledger is the single economic source of truth.                             | Registry never authorizes asset movement from DB metadata; package selection is validated again by participant command acceptance. |
| 2. Pillar DB stores only Projection / Audit / Config.                                | `template_registry` schema is config/control-plane metadata and contains no balances, holdings, or ownership authority.            |
| 3. Public `/v1` API never exposes Canton internals.                                  | Admin-only surfaces are gated; customer object responses omit DAR, package, template, participant, and command identifiers.        |
| 4. Every mutation goes through `intent → operation → command_id → update_id/offset`. | Command-builder adapter resolves active package before command construction and records registry version in operation trace.       |
| 8. Deployment mode changes infrastructure wiring only.                               | Compatibility matrix uses the same logical package set across `hosted`, `customer-validator`, and `self-hosted`.                   |

Regression contract clauses satisfied:

| IC clause | Phase 12 satisfaction                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| IC-01     | Package selection cannot replace ledger validation; command submission still fails if participant package state or active contracts reject it. |
| IC-02     | Migration `0100_template_registry` is config-only and replay/restoreable from signed DAR artifacts plus registry audit.                        |
| IC-03     | Public API forbidden-internals rule includes package/template identifiers; admin endpoints require privileged scope.                           |
| IC-04     | Registry version and package selection are attached to operation trace before command submission.                                              |
| IC-08     | Deployment mode wiring changes only DAR distribution and participant compatibility records; `/v1` grammar is unchanged.                        |

Phase output:

```text
services/template-registry/
services/ledger-command/src/main/kotlin/template/registry-client
infra/helm/pillar/templates/dar-upload-job.yaml
packages/db/migrations/0100_template_registry/
apps/workbench/src/template-registry/
apps/api/src/routes/v1/admin/template_registry/
infra/observability/template-registry/
```

Milestone mapping:

| Milestone                                          | Scope                                                                                                                   | Exit criteria                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| M12 Template Registry / Versioning / DAR Lifecycle | registry service, DAR ingest, signatures, command-builder adapter, compatibility matrix, upgrade choreography, rollback | command-builder never submits a command with a `package_id` absent from the active registry |

## 2. Goals / Non-goals

### Goals

| Goal                                    | Implementation commitment                                                                                                        | Acceptance signal                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Registry of template versions           | Store `(template, package_id, version, semver, status)` in `template_registry.template_descriptors` and `package_versions`.      | Query active descriptor for each command family returns exactly one active package version per tenant/environment/pin.            |
| Package selection at command-build time | `services/ledger-command` resolves package/template/choice binding through the registry client before compiling commands.        | Command builder fails closed when active binding is missing, retired, incompatible, or unverified.                                |
| Controlled DAR upload                   | Ingest DAR with checksum, signature, manifest parse, package extraction, immutable artifact URI, and audit record.               | Upload rejects mismatched checksum, missing signature, untrusted signer, malformed manifest, or duplicate mutable tag.            |
| Upgrade choreography                    | Implement announce → stage → dual-publish → cutover → retire with explicit state transitions and rollback rules.                 | Upgrade plan cannot skip required states or retire a version still pinned by a tenant/participant.                                |
| Per-validator compatibility matrix      | Track participant/validator package visibility, vetting/upload status, deployment mode, last verification, and allowed commands. | Matrix blocks cutover when any required participant is missing the active package.                                                |
| Rollback flow                           | Provide safe pin revert before new contracts exist and roll-forward correction after new contracts exist.                        | Rollback runbook chooses one of pause, pin revert, package unvet, corrected DAR roll-forward, or compensating ledger operation.   |
| Helm DAR Job integration                | Convert `P9.J06` from ad-hoc chart logic into a registry-driven executor using registry-issued upload manifests.                 | Job input references registry upload plan and verifies participant-visible package IDs after upload.                              |
| Registry replay/restore                 | Rebuild registry records from object storage artifacts, signed manifests, and audit log.                                         | Restore recreates active package set and compatibility matrix without changing public `/v1` behavior.                             |
| Telemetry and audit                     | Emit metrics, traces, and immutable audit for every mutation and runtime lookup failure.                                         | Alerts cover stale registry, package mismatch, upload failure, signature failure, split-brain, and manual side-channel detection. |

### Non-goals

| Non-goal                                          | Reason                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Replacing DPM                                     | DPM remains the build tool for Daml packages; registry controls runtime metadata, distribution, and selection. |
| Distributing community DARs                       | Phase 12 only handles Pillar-controlled and approved tenant-entitled DARs.                                     |
| Exposing package internals publicly               | Public `/v1` customer APIs remain Canton-invisible; package internals are admin/debug-only.                    |
| Making registry an economic source of truth       | Registry is config/control-plane metadata; ledger contracts remain authoritative.                              |
| Automatically making breaking changes safe        | Compatibility checks classify and block/require choreography; they do not erase Daml or API incompatibility.   |
| Uploading arbitrary DARs directly to participants | All production upload paths require registry ingest, signature verification, and compatibility evaluation.     |
| Adding a new public API version                   | Phase 12 may add admin endpoints; customer-facing API object grammar does not change.                          |
| Rewriting Phase 09 deployment chart ownership     | Phase 09 still owns Helm mechanics; Phase 12 owns DAR policy and upload manifests.                             |

## 3. Architecture

### 3.1 Service boundary

`services/template-registry` is a Kotlin/JVM internal service. It exposes internal APIs consumed by `services/ledger-command`, Helm DAR upload Jobs, Workbench/admin tools, and CI release workflows.

```text
CI release workflow / admin CLI
  -> services/template-registry
     -> checksum + signature verification
     -> manifest parse + package metadata extraction
     -> compatibility classification
     -> registry DB write
     -> upload plan emission
        -> infra/helm/pillar/templates/dar-upload-job.yaml
           -> Canton participant PackageManagementService
              -> participant package query / vetting evidence
                 -> compatibility_records

services/ledger-command
  -> registry client
     -> active package/template binding
     -> command builder
     -> Canton Ledger API command submission
```

Primary design decision: the registry is internal-only in Phase 12. No public `/v1` customer surface is added. Optional admin endpoints live under `/v1/admin/template_registry/*` and require admin scope.

### 3.2 Data ownership

| Data                     | Owner                                                  | Schema                                    | Classification         |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------- | ---------------------- |
| DAR artifact metadata    | `services/template-registry`                           | `template_registry.dar_uploads`           | Config/audit metadata  |
| Template descriptors     | `services/template-registry`                           | `template_registry.template_descriptors`  | Config metadata        |
| Package versions         | `services/template-registry`                           | `template_registry.package_versions`      | Config metadata        |
| Upgrade plans            | `services/template-registry`                           | `template_registry.upgrade_plans`         | Config/audit metadata  |
| Compatibility matrix     | `services/template-registry`                           | `template_registry.compatibility_records` | Config health metadata |
| Command operation trace  | `services/ledger-command` / existing operations schema | existing operation/audit schema           | Audit metadata         |
| Active holdings/balances | Canton ledger / projection worker                      | projection schemas                        | Projection only        |

Registry data lives in migration set `0100_template_registry`. It is separate from projection, audit, and general config schemas because it has its own lifecycle, but it is still classified as config/control-plane metadata under invariant 2.

### 3.3 Runtime integration

| Consumer                  | Registry use                                                                   | Failure behavior                                                        |
| ------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `services/ledger-command` | Resolve active package/template/choice binding for command construction.       | Fail closed before command submission; operation records registry miss. |
| Helm DAR upload Job       | Fetch upload manifest, expected checksum, package IDs, participant targets.    | Job fails; `ledger-command` readiness blocks command acceptance.        |
| Workbench/admin CLI       | Inspect package status, upgrade plans, compatibility matrix, rollback options. | Admin action blocked without scope and dual control where required.     |
| CI release workflow       | Publish signed DAR metadata and immutable artifact URI.                        | Release candidate remains unpublished.                                  |
| Observability             | Emit stale registry, compatibility, upload, and lookup metrics.                | Alert and block cutover when thresholds trip.                           |

### 3.4 P9.J06 supersession

Phase 09 defined `P9.J06` as a checksum-aware DAR upload Job. That was the correct deployment hook, but insufficient as a lifecycle authority. Phase 12 supersedes `P9.J06` policy ownership as follows:

| Concern                    | Phase 09 `P9.J06`                    | Phase 12 replacement                                  |
| -------------------------- | ------------------------------------ | ----------------------------------------------------- |
| Job rendering              | Helm chart template                  | Still Phase 09-owned                                  |
| DAR checksum verification  | Job-local checksum                   | Registry verified checksum and signed upload manifest |
| Package selection          | Chart values / release metadata      | `template_registry.package_versions` active pin       |
| Participant targeting      | Helm values                          | Compatibility matrix and upload plan                  |
| Upgrade choreography       | Not owned                            | `upgrade_plans` state machine                         |
| Rollback decision          | Manual redeploy/rerun                | Registry rollback flow and audit                      |
| Command-builder package ID | Implicit generated code/deploy state | Registry client lookup before command build           |

`P9.J06` therefore remains a dependency and executor, while Phase 12 owns the durable lifecycle model.

### 3.5 Deployment-mode behavior

| Mode                 | Registry placement                                                          | DAR distribution                                                                                         | Compatibility expectation                                                                               |
| -------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `hosted`             | Pillar-operated registry in cloud control plane and local data-plane cache. | Registry emits upload plan to Pillar-operated participants.                                              | All required participants must show uploaded/vetted package before cutover.                             |
| `customer-validator` | Pillar registry plus customer participant compatibility records.            | Customer-owned participant receives upload via registry-driven job or approved customer operator action. | Cutover blocks until customer participant evidence is current.                                          |
| `self-hosted`        | Local registry instance can operate from signed offline bundle.             | Upload manifests and DAR artifacts are synced through signed object storage or offline media.            | Local compatibility matrix is authoritative for local deployment; public `/v1` grammar stays identical. |

### 3.6 Upgrade choreography

```text
announce
  -> stage
     -> dual-publish
        -> cutover
           -> retire
```

| State          | Meaning                                                                                                | Entry criteria                                                                       | Exit criteria                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `announce`     | Registry records intended upgrade and target package set.                                              | Verified DAR, compatibility report, admin approval.                                  | Required tenants/participants identified.                                   |
| `stage`        | DAR uploaded to target participants but not active for new commands.                                   | Upload manifest emitted and executed.                                                | Compatibility records show uploaded/vetted package.                         |
| `dual_publish` | Old and new package versions coexist; command-builder can route canary tenants or operations.          | Both package sets visible and compatible.                                            | Canary success and no blocked participant.                                  |
| `cutover`      | New package version becomes active default for eligible tenants/environments.                          | Dual-publish evidence, approval, rollback point.                                     | Registry pin updated and command-builder lookup returns new active package. |
| `retire`       | Old version no longer accepted for new commands and can be deprecated after old contracts are handled. | No tenant active pin, no required legacy command routing, migration/replay evidence. | Status set to `retired` or `revoked` with audit.                            |

## 4. API / Object Model

### 4.1 Internal objects

The registry owns four canonical object families plus DAR upload records.

| Object                 | Purpose                                                                              | Public customer visible? | Admin visible? |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------ | -------------- |
| `template_descriptor`  | Stable description of a Pillar template family and command mapping surface.          | No                       | Yes            |
| `package_version`      | Immutable package/DAR version with package IDs, semver, status, checksum, signature. | No                       | Yes            |
| `upgrade_plan`         | State machine for staged package rollout and rollback decision.                      | No                       | Yes            |
| `compatibility_record` | Per-participant package visibility, vetting, and command compatibility.              | No                       | Yes            |
| `dar_upload`           | Ingest/upload audit record for a DAR artifact.                                       | No                       | Yes            |

### 4.2 `template_descriptor`

| Field             | Type            | Notes                                                        |
| ----------------- | --------------- | ------------------------------------------------------------ |
| `id`              | `tdesc_*`       | Stable internal ID.                                          |
| `template_family` | string          | Example: `pillar.asset.holding`, `pillar.transfer.intent`.   |
| `object_type`     | string          | Example: `holding`, `balance`, `transfer_intent`.            |
| `command_family`  | string          | Example: `transfer.confirm`, `issuance.create`.              |
| `daml_module`     | string          | Module FQN from package metadata.                            |
| `template_name`   | string          | Template name without package ID.                            |
| `interface_name`  | nullable string | Canonical interface when command builder targets interfaces. |
| `choice_names`    | string array    | Allowed choices for command builder.                         |
| `mapping_version` | string          | API object mapping version.                                  |
| `status`          | enum            | `draft`, `active`, `deprecated`, `retired`, `revoked`.       |
| `created_at`      | timestamp       | Audit timestamp.                                             |
| `updated_at`      | timestamp       | Audit timestamp.                                             |

### 4.3 `package_version`

| Field                    | Type               | Notes                                                                                             |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------- |
| `id`                     | `pkgv_*`           | Internal version ID.                                                                              |
| `template_descriptor_id` | FK                 | Links package to descriptor.                                                                      |
| `dar_upload_id`          | FK                 | Links to artifact ingest.                                                                         |
| `package_id`             | string             | Canton/Daml package ID, internal-only.                                                            |
| `package_name`           | string             | From DAR manifest / `daml.yaml`.                                                                  |
| `package_version`        | string             | Daml package version.                                                                             |
| `semver`                 | string             | Normalized semver used for release policy.                                                        |
| `sdk_version`            | string             | Daml SDK version.                                                                                 |
| `dar_sha256`             | string             | Immutable artifact checksum.                                                                      |
| `signature_key_id`       | string             | KMS/verifier key reference.                                                                       |
| `status`                 | enum               | `uploaded`, `verified`, `indexed`, `compatible`, `published`, `deprecated`, `retired`, `revoked`. |
| `compatibility_level`    | enum               | `patch`, `minor`, `major`, `blocked`.                                                             |
| `active_from`            | timestamp nullable | Cutover timestamp.                                                                                |
| `retired_at`             | timestamp nullable | Retirement timestamp.                                                                             |

### 4.4 `upgrade_plan`

| Field                       | Type              | Notes                                                                                        |
| --------------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| `id`                        | `upg_*`           | Internal upgrade plan ID.                                                                    |
| `source_package_version_id` | FK                | Current package.                                                                             |
| `target_package_version_id` | FK                | Candidate package.                                                                           |
| `tenant_scope`              | JSON              | Tenant/environment/product-family scope.                                                     |
| `deployment_modes`          | enum array        | Values: `hosted`, `customer-validator`, `self-hosted`.                                       |
| `state`                     | enum              | `announce`, `stage`, `dual_publish`, `cutover`, `retire`, `paused`, `rolled_back`, `failed`. |
| `requires_dual_control`     | boolean           | Production mutation gate.                                                                    |
| `rollback_strategy`         | enum              | `pin_revert`, `pause`, `unvet`, `roll_forward`, `compensating_operation`.                    |
| `created_by`                | actor ID          | Admin audit.                                                                                 |
| `approved_by`               | actor ID nullable | Dual-control audit.                                                                          |
| `created_at`                | timestamp         | Audit timestamp.                                                                             |
| `updated_at`                | timestamp         | Audit timestamp.                                                                             |

### 4.5 `compatibility_record`

| Field                | Type            | Notes                                                                              |
| -------------------- | --------------- | ---------------------------------------------------------------------------------- |
| `id`                 | `compat_*`      | Internal compatibility record.                                                     |
| `package_version_id` | FK              | Package being evaluated.                                                           |
| `participant_id`     | string          | Internal participant reference, never public customer API.                         |
| `validator_id`       | string nullable | Validator/operator label.                                                          |
| `deployment_mode`    | enum            | `hosted`, `customer-validator`, `self-hosted`.                                     |
| `environment`        | enum/string     | `sandbox`, `test`, `live`, or environment ID.                                      |
| `status`             | enum            | `missing`, `uploaded`, `vetted`, `compatible`, `incompatible`, `stale`, `revoked`. |
| `package_visible`    | boolean         | Package Service query result.                                                      |
| `vetting_status`     | string          | Canton/package vetting evidence when applicable.                                   |
| `last_checked_at`    | timestamp       | Staleness source.                                                                  |
| `evidence_ref`       | string          | Object storage/audit evidence pointer.                                             |

### 4.6 Optional admin endpoints

Admin endpoints are optional in Phase 12 and never customer-facing. If implemented, they use the existing Stripe-like route shape under admin scope:

| Endpoint                                                    | Method | Purpose                                                        | Scope                                                        |
| ----------------------------------------------------------- | ------ | -------------------------------------------------------------- | ------------------------------------------------------------ |
| `/v1/admin/template_registry/descriptors`                   | `GET`  | List descriptors.                                              | `admin:template_registry:read`                               |
| `/v1/admin/template_registry/packages`                      | `GET`  | List package versions and status.                              | `admin:template_registry:read`                               |
| `/v1/admin/template_registry/dars`                          | `POST` | Register a DAR artifact after signature/checksum verification. | `admin:template_registry:write`                              |
| `/v1/admin/template_registry/upgrade_plans`                 | `POST` | Create upgrade plan.                                           | `admin:template_registry:write` + dual control in production |
| `/v1/admin/template_registry/upgrade_plans/{id}/transition` | `POST` | Advance state machine.                                         | `admin:template_registry:approve`                            |
| `/v1/admin/template_registry/compatibility`                 | `GET`  | Inspect participant compatibility matrix.                      | `admin:template_registry:read`                               |

Forbidden for customer public API responses:

```text
package_id
template_id
participant_id
validator_id
command_id
contract_id
DAR
```

Admin responses may include internal identifiers only under privileged scope and audit.

## 5. Internal Runtime

### 5.1 DAR ingest path

DAR ingestion is a controlled internal workflow:

```text
artifact_uri + expected_sha256 + signature
  -> fetch artifact
  -> compute sha256
  -> verify signature with KMS-backed trust root
  -> parse manifest
  -> extract package metadata
  -> extract template descriptors
  -> run compatibility checks
  -> write dar_uploads/package_versions/template_descriptors
  -> emit upload manifest
```

| Step                | Required behavior                                                   | Failure handling                                         |
| ------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| Fetch               | Fetch only from approved object storage/OCI locations.              | Reject unapproved scheme or mutable tag-only reference.  |
| Checksum            | Compute SHA-256 and compare to expected digest.                     | Reject and audit `checksum_mismatch`.                    |
| Signature           | Verify detached/signature metadata against trusted KMS key.         | Reject and audit `signature_invalid`.                    |
| Manifest parse      | Read DAR manifest, package name/version, dependencies, SDK version. | Reject malformed artifact.                               |
| Metadata extraction | Extract templates, choices, interfaces, command shapes.             | Mark package `indexed` only after successful extraction. |
| Compatibility       | Classify Daml, Canton, Pillar mapping, webhook, SDK compatibility.  | Mark `blocked` and prevent publish when incompatible.    |
| Upload manifest     | Generate participant-targeted manifest for Helm Job.                | Do not allow direct job input without registry plan.     |

### 5.2 Package ID mapping

Command builders must never hard-code package IDs as deployment facts. They resolve package IDs through a typed registry adapter.

```text
tenant_id
environment_id
livemode
operation_type
object_type
template_family
requested_api_version
participant_route
  -> active package_version
  -> package_id
  -> template FQN
  -> choice name
  -> mapping version
  -> compatibility proof timestamp
```

Resolution rules:

| Rule                                                                 | Enforcement                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Exactly one active binding per tenant/environment/operation.         | Registry query returns one row or fails closed.                                                        |
| Active binding must be `published` or controlled `dual_publish`.     | Command-builder rejects `uploaded`, `indexed`, `deprecated`, `retired`, `revoked`.                     |
| Participant must report compatible package state.                    | Adapter checks compatibility record freshness.                                                         |
| Requested API version must map to compatible object mapping version. | Registry returns mapping version; API version mismatch is an internal error or admin misconfiguration. |
| Tenant pin cannot point at blocked package.                          | Mutation validator rejects pin write and upgrade transition.                                           |

### 5.3 Helm DAR upload Job integration

Phase 12 does not delete the Helm job. It changes its contract.

Old `P9.J06` input:

```text
DAR artifact ref + checksum + participant endpoint + auth refs
```

Phase 12 input:

```text
registry_upload_plan_id
expected_dar_sha256
expected_package_ids
participant_targets
registry_signature
ledger_auth_secret_refs
```

Job behavior:

1. Fetch upload plan from `services/template-registry` or mounted signed offline bundle.
2. Verify plan signature and checksum.
3. Fetch DAR artifact from plan URI.
4. Upload to target participant if package is missing.
5. Query package visibility and vetting/availability.
6. POST or write compatibility evidence back to registry.
7. Exit non-zero when expected package is not visible.

### 5.4 Tenant pinning

Tenant/environment pinning controls active package selection.

| Pin dimension        | Example                                   | Notes                             |
| -------------------- | ----------------------------------------- | --------------------------------- |
| `tenant_id`          | `ten_...`                                 | Required.                         |
| `environment_id`     | `env_live_apne2`                          | Required.                         |
| `livemode`           | `true`                                    | Prevents test/live bleed.         |
| `template_family`    | `pillar.asset.holding`                    | Required.                         |
| `operation_type`     | `transfer.confirm`                        | Required for command builder.     |
| `package_version_id` | `pkgv_...`                                | Must be compatible and published. |
| `pin_mode`           | `locked`, `canary`, `default`, `rollback` | Controls resolver behavior.       |

Production pin changes require audit and may require dual control depending on deployment policy.

### 5.5 Rollback flow

Rollback is state-aware. The registry must not imply that every upgrade can be reverted by redeploying an old DAR.

| Condition                                         | Allowed rollback                                 | Notes                                                                            |
| ------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| New package staged but not active                 | `pause`, `pin_revert`, `unvet`                   | Safe because no new commands use target package.                                 |
| Dual-publish canary with no new durable contracts | `pin_revert`, `pause`                            | Confirm no target-package contracts exist for scoped tenants.                    |
| New contracts created under target package        | `roll_forward`, `compensating_operation`         | Old package may remain for legacy contracts; corrected package usually required. |
| Signature/key compromise                          | `revoked`, `pause`, emergency cutover            | Requires security incident workflow.                                             |
| Participant split-brain                           | `pause`, block command-builder, reconcile matrix | Do not submit commands until compatibility converges.                            |

## 6. DB Schema

Migration set: `packages/db/migrations/0100_template_registry`.

Schema name: `template_registry`.

Ownership: config/control-plane metadata with audit links; no economic asset state.

### 6.1 Migration layout

```text
packages/db/migrations/0100_template_registry/
  0100_001_create_template_registry_schema.sql
  0100_002_create_dar_uploads.sql
  0100_003_create_template_descriptors.sql
  0100_004_create_package_versions.sql
  0100_005_create_upgrade_plans.sql
  0100_006_create_compatibility_records.sql
  0100_007_create_indexes_constraints.sql
  0100_008_create_registry_audit_views.sql
```

### 6.2 Tables

#### `template_registry.dar_uploads`

| Column             | Type        | Constraint          |
| ------------------ | ----------- | ------------------- |
| `id`               | text        | PK, `darup_*`       |
| `artifact_uri`     | text        | not null            |
| `dar_sha256`       | text        | unique, not null    |
| `signature`        | text        | not null            |
| `signature_key_id` | text        | not null            |
| `manifest_json`    | jsonb       | not null            |
| `package_ids`      | jsonb       | not null            |
| `uploaded_by`      | text        | not null            |
| `status`           | text        | not null check enum |
| `failure_code`     | text        | nullable            |
| `created_at`       | timestamptz | not null            |
| `verified_at`      | timestamptz | nullable            |

#### `template_registry.template_descriptors`

| Column            | Type        | Constraint          |
| ----------------- | ----------- | ------------------- |
| `id`              | text        | PK, `tdesc_*`       |
| `template_family` | text        | not null            |
| `object_type`     | text        | not null            |
| `command_family`  | text        | not null            |
| `daml_module`     | text        | not null            |
| `template_name`   | text        | not null            |
| `interface_name`  | text        | nullable            |
| `choice_names`    | jsonb       | not null            |
| `mapping_version` | text        | not null            |
| `status`          | text        | not null check enum |
| `created_at`      | timestamptz | not null            |
| `updated_at`      | timestamptz | not null            |

Unique key:

```text
(template_family, object_type, command_family, mapping_version)
```

#### `template_registry.package_versions`

| Column                   | Type        | Constraint          |
| ------------------------ | ----------- | ------------------- |
| `id`                     | text        | PK, `pkgv_*`        |
| `template_descriptor_id` | text        | FK                  |
| `dar_upload_id`          | text        | FK                  |
| `package_id`             | text        | not null            |
| `package_name`           | text        | not null            |
| `package_version`        | text        | not null            |
| `semver`                 | text        | not null            |
| `sdk_version`            | text        | not null            |
| `dar_sha256`             | text        | not null            |
| `status`                 | text        | not null check enum |
| `compatibility_level`    | text        | not null check enum |
| `active_from`            | timestamptz | nullable            |
| `retired_at`             | timestamptz | nullable            |
| `created_at`             | timestamptz | not null            |
| `updated_at`             | timestamptz | not null            |

Unique keys:

```text
(template_descriptor_id, package_id)
(template_descriptor_id, semver)
```

#### `template_registry.upgrade_plans`

| Column                      | Type        | Constraint                    |
| --------------------------- | ----------- | ----------------------------- |
| `id`                        | text        | PK, `upg_*`                   |
| `source_package_version_id` | text        | FK nullable for first publish |
| `target_package_version_id` | text        | FK not null                   |
| `tenant_scope`              | jsonb       | not null                      |
| `deployment_modes`          | jsonb       | not null                      |
| `state`                     | text        | not null check enum           |
| `requires_dual_control`     | boolean     | not null                      |
| `rollback_strategy`         | text        | not null check enum           |
| `created_by`                | text        | not null                      |
| `approved_by`               | text        | nullable                      |
| `created_at`                | timestamptz | not null                      |
| `updated_at`                | timestamptz | not null                      |

#### `template_registry.compatibility_records`

| Column               | Type        | Constraint                                                   |
| -------------------- | ----------- | ------------------------------------------------------------ |
| `id`                 | text        | PK, `compat_*`                                               |
| `package_version_id` | text        | FK not null                                                  |
| `participant_id`     | text        | not null internal ref                                        |
| `validator_id`       | text        | nullable internal ref                                        |
| `deployment_mode`    | text        | not null check `hosted`, `customer-validator`, `self-hosted` |
| `environment`        | text        | not null                                                     |
| `status`             | text        | not null check enum                                          |
| `package_visible`    | boolean     | not null                                                     |
| `vetting_status`     | text        | nullable                                                     |
| `last_checked_at`    | timestamptz | not null                                                     |
| `evidence_ref`       | text        | nullable                                                     |
| `created_at`         | timestamptz | not null                                                     |
| `updated_at`         | timestamptz | not null                                                     |

Unique key:

```text
(package_version_id, participant_id, environment)
```

### 6.3 Constraints and indexes

| Constraint/index                             | Purpose                                                             |
| -------------------------------------------- | ------------------------------------------------------------------- |
| Unique DAR checksum                          | Prevents duplicate mutable artifact records.                        |
| Unique descriptor mapping                    | Prevents ambiguous command-builder selection.                       |
| Unique package per descriptor                | Prevents duplicate package identity.                                |
| Partial index on active package versions     | Fast command-builder lookup.                                        |
| Partial index on stale compatibility records | Fast alert and cutover blocking.                                    |
| FK from package to DAR upload                | Ensures no package version exists without verified artifact record. |
| FK from upgrade plan target package          | Ensures upgrade targets are registry-owned packages.                |

### 6.4 Replay and restore

Registry restore uses:

1. Object storage DAR artifacts by `dar_sha256`.
2. Detached signatures and signer metadata.
3. `dar_uploads` audit records.
4. Upgrade plan audit transitions.
5. Compatibility evidence snapshots.

Restore invariant:

```text
For the same artifact set and audit log, active package selection must be deterministic.
```

## 7. Failure Modes

| Failure mode                                  | Detection                                                                          | Immediate behavior                                                                           | Recovery                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Stale registry cache                          | Registry lookup age exceeds threshold; cache version behind DB.                    | `ledger-command` fails closed or enters degraded mode for mutations requiring stale binding. | Refresh cache, replay registry audit, restart adapter if needed.                      |
| Package mismatch across participants          | Compatibility matrix shows mixed `missing/uploaded/vetted` for active package.     | Block cutover and block command routing to incompatible participant.                         | Re-run registry upload plan; verify PackageService response.                          |
| Signature verification failure                | DAR ingest fails KMS/trust-root verification.                                      | Reject package; do not create published package version.                                     | Re-sign artifact or rotate trusted key through security process.                      |
| Checksum mismatch                             | Computed SHA-256 differs from expected.                                            | Reject upload and mark `dar_upload` failed.                                                  | Replace artifact reference with immutable correct object.                             |
| Manifest parse failure                        | DAR metadata extractor cannot parse manifest/package IDs.                          | Mark artifact `uploaded` but not `indexed`; publish blocked.                                 | Rebuild DAR with valid manifest; do not hand-edit registry DB.                        |
| Registry partition during upgrade             | Writers/readers see inconsistent state or stale compatibility records.             | Pause upgrade plan; command-builder uses last known active compatible package until TTL.     | Restore quorum/connectivity; reconcile audit log.                                     |
| Rollback creating split-brain                 | Some participants or tenants use old package while others use target unexpectedly. | Pause plan; block new command submissions for affected scope.                                | Recompute pins and compatibility, then choose pin revert or roll-forward.             |
| Manual DAR side-channel                       | Participant reports package visible without matching registry upload plan.         | Alert; mark compatibility `side_channel_detected` or incompatible.                           | Investigate operator action, either ingest artifact formally or remove/unvet package. |
| Retiring package with active legacy contracts | Projection/ACS shows contracts still tied to old package.                          | Block retirement.                                                                            | Keep legacy command routing or migrate/roll-forward explicitly.                       |
| Admin endpoint misuse                         | Unauthorized or single-approver production mutation attempt.                       | Reject and audit.                                                                            | Enforce admin scope and dual control.                                                 |
| Compatibility checker false positive          | Runtime command fails after registry marked compatible.                            | Fail command; alert on registry/runtime mismatch.                                            | Add fixture, downgrade package status, rerun checker.                                 |
| Object storage restore gap                    | Artifact referenced by active package is missing.                                  | Mark registry restore incomplete; block upgrade/cutover.                                     | Restore from backup or revoke affected package.                                       |

Failure principle:

```text
When registry state is uncertain, submit fewer commands. Never guess a package_id.
```

## 8. Security / Compliance

### 8.1 DAR signing and verification

| Control                | Requirement                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Signing key custody    | DAR signing key is stored in KMS or approved signing service; raw private key is never in CI logs, Helm values, or service images. |
| Signature verification | Every DAR upload verifies detached signature before metadata extraction proceeds to publishable status.                            |
| Key identity           | `signature_key_id` is stored with every DAR upload and package version.                                                            |
| Key rotation           | Registry supports multiple trusted signing keys with not-before/not-after policy.                                                  |
| Compromise response    | A compromised key can mark related package versions `revoked` and block new command-builder selection.                             |

### 8.2 Mutation authorization

| Mutation                     | Required scope                      | Production dual control                                               |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| Register DAR                 | `admin:template_registry:write`     | Required for production package publish.                              |
| Publish package version      | `admin:template_registry:approve`   | Required.                                                             |
| Create upgrade plan          | `admin:template_registry:write`     | Required when target scope includes live tenants.                     |
| Cutover upgrade              | `admin:template_registry:approve`   | Required.                                                             |
| Retire/revoke package        | `admin:template_registry:approve`   | Required for live packages.                                           |
| Compatibility evidence write | service identity for DAR upload job | Not human dual control; evidence must be signed by workload identity. |

### 8.3 Audit requirements

Every registry mutation records:

| Field                      | Reason                                       |
| -------------------------- | -------------------------------------------- |
| Actor identity             | Accountability.                              |
| Scope                      | Tenant/environment/deployment mode affected. |
| Previous state             | Rollback and review.                         |
| New state                  | Replay and restore.                          |
| Request ID                 | Correlation with admin API or CLI action.    |
| Approval actor             | Dual-control evidence.                       |
| Artifact checksum          | Release provenance.                          |
| Signature key ID           | Supply-chain evidence.                       |
| Compatibility evidence ref | Participant package proof.                   |

### 8.4 Compliance posture

| Requirement            | Phase 12 implementation                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Supply-chain integrity | Signed DARs, immutable artifact URIs, checksum verification, registry provenance.                                   |
| Least privilege        | Runtime command-builder has read-only registry access; upload Job has scoped participant upload rights.             |
| Separation of duties   | Production publish/cutover/retire requires dual control.                                                            |
| Change traceability    | Upgrade plans and state transitions are auditable.                                                                  |
| Customer isolation     | Tenant pins and compatibility records are scoped by tenant/environment; no cross-tenant package activation bleed.   |
| No secret leakage      | KMS key refs and secret refs only; no raw signing keys, participant tokens, or mTLS private keys in DB/values/logs. |

## 9. Implementation Plan

Ticket rules:

- Ticket area letter: `N`.
- IDs: `P12.N01` through `P12.N10`.
- Dependencies are explicit comma-separated fully-qualified ticket IDs only.
- Migration range: `0100_template_registry`.
- Canonical service path: `services/template-registry/`.

| ID      | Title                                   | Path                                                                                                                                | Output                                                                                                                                                    | Deps                                                     | Acceptance                                                                                                                  | Risk   |
| ------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------ |
| P12.N01 | Template registry service skeleton      | `services/template-registry/`                                                                                                       | Kotlin/JVM service, internal API module, DB repository boundary, health endpoint, service identity config                                                 | P0.A01, P0.A02, P3.D07, P8.K01                           | Service starts locally, exposes internal health, reads DB config, and has no public customer route                          | medium |
| P12.N02 | `0100_template_registry` migrations     | `packages/db/migrations/0100_template_registry/`                                                                                    | Schema, tables, constraints, indexes, audit views for `dar_uploads`, `template_descriptors`, `package_versions`, `upgrade_plans`, `compatibility_records` | P3.D07, P8.K07                                           | Migration applies cleanly and creates only config/control-plane metadata tables                                             | high   |
| P12.N03 | DAR ingest and metadata extractor       | `services/template-registry/src/main/kotlin/ingest`                                                                                 | Artifact fetch, SHA-256 check, manifest parse, package ID extraction, template descriptor extraction                                                      | P12.N01, P12.N02, P1.B01, P1.B02, P1.B03, P1.B04, P1.B05 | Valid DAR produces `dar_uploads`, descriptors, and package versions; malformed DAR is rejected with audit                   | high   |
| P12.N04 | DAR signature verifier                  | `services/template-registry/src/main/kotlin/security`                                                                               | KMS/trust-root verifier, signer policy, key rotation metadata, failure audit                                                                              | P12.N01, P12.N03, P8.K01, P8.K02, P8.K03                 | Unsigned or untrusted DAR cannot reach publishable status; signature key ID is stored                                       | high   |
| P12.N05 | Command-builder consumer adapter        | `services/ledger-command/src/main/kotlin/template/registry-client`                                                                  | Registry client, active binding resolver, fail-closed command-builder integration, operation trace registry-version field                                 | P12.N02, P12.N03, P4.F02, P4.F04, P4.F05                 | `ledger-command` never submits with a `package_id` not present and active in registry                                       | high   |
| P12.N06 | Helm DAR Job registry integration       | `infra/helm/pillar/templates/dar-upload-job.yaml`                                                                                   | Registry upload manifest input, checksum/signature plan verification, package visibility writeback; supersedes ad-hoc `P9.J06` logic                      | P12.N03, P12.N04, P9.J04, P9.J06                         | DAR upload Job consumes registry plan and updates compatibility evidence before ledger-command readiness passes             | high   |
| P12.N07 | Upgrade choreography state machine      | `services/template-registry/src/main/kotlin/upgrade`                                                                                | announce → stage → dual-publish → cutover → retire transitions, rollback policy, dual-control hooks                                                       | P12.N02, P12.N04, P12.N05, P12.N06, P8.K06               | State machine blocks skipped transitions, unsafe retire, and live cutover without required approval                         | high   |
| P12.N08 | Compatibility matrix API                | `services/template-registry/src/main/kotlin/compatibility`                                                                          | Participant/package compatibility records, staleness detection, internal API, optional admin read endpoint                                                | P12.N02, P12.N06, P9.J06                                 | Cutover blocks when any required participant is missing/vetting stale/incompatible                                          | high   |
| P12.N09 | Admin CLI and Workbench surface         | `apps/workbench/src/template-registry/`, `apps/api/src/routes/v1/admin/template_registry/`, `packages/api-contracts/schemas/admin/` | Admin-only list/inspect/register/transition views and CLI commands with scopes                                                                            | P12.N07, P12.N08, P7.I01, P7.I02, P8.K04                 | Admin can inspect package status and propose/approve upgrades without exposing internals to customer APIs                   | medium |
| P12.N10 | Registry replay, restore, and telemetry | `services/template-registry/src/main/kotlin/replay`, `infra/observability/template-registry/`                                       | Restore from object storage/audit, metrics, alerts, dashboards, split-brain/manual side-channel detection                                                 | P12.N07, P12.N08, P9.J07, P10.L01                        | Restore recreates active package set; alerts fire for stale registry, package mismatch, signature failure, side-channel DAR | high   |

### 9.1 Ticket details

#### P12.N01 Template registry service skeleton

| Item     | Detail                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Inputs   | DB URL, service identity, internal auth config, environment ID.                                                    |
| Behavior | Starts Kotlin/JVM service with internal API, health, readiness, and repository boundary.                           |
| Exit     | `services/template-registry` exists and can be wired into local/Helm deployment without owning public API grammar. |

#### P12.N02 `0100_template_registry` migrations

| Item     | Detail                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| Inputs   | Canonical migration range registry.                                                                             |
| Behavior | Creates `template_registry` schema and tables with enum checks, FKs, unique constraints, active lookup indexes. |
| Exit     | Migration is classified as config/control-plane metadata and does not create economic asset authority.          |

#### P12.N03 DAR ingest and metadata extractor

| Item     | Detail                                                                                      |
| -------- | ------------------------------------------------------------------------------------------- |
| Inputs   | DAR artifact URI, expected checksum, manifest, Daml package metadata.                       |
| Behavior | Extracts package IDs, templates, choices, interface metadata, object mapping hints.         |
| Exit     | Registry can answer which template family and command family each package version supports. |

#### P12.N04 DAR signature verifier

| Item     | Detail                                                                                  |
| -------- | --------------------------------------------------------------------------------------- |
| Inputs   | Detached signature, KMS/trust-root config, signer policy.                               |
| Behavior | Verifies signature before publishable package state; records key identity and failures. |
| Exit     | Invalid signature blocks publish and creates audit evidence.                            |

#### P12.N05 Command-builder consumer adapter

| Item     | Detail                                                                                 |
| -------- | -------------------------------------------------------------------------------------- |
| Inputs   | Tenant/environment/operation/template family/requested API version/participant route.  |
| Behavior | Resolves active package binding and injects package/template/choice into command plan. |
| Exit     | Missing/stale/retired package blocks command before Canton submission.                 |

#### P12.N06 Helm DAR Job registry integration

| Item     | Detail                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| Inputs   | Registry upload plan ID and signed upload manifest.                           |
| Behavior | Executes participant upload and writes compatibility evidence.                |
| Exit     | `P9.J06` is no longer ad-hoc package policy; it is registry-driven execution. |

#### P12.N07 Upgrade choreography state machine

| Item     | Detail                                                                                |
| -------- | ------------------------------------------------------------------------------------- |
| Inputs   | Source/target package versions, tenant scope, deployment modes, approval policy.      |
| Behavior | Enforces announce → stage → dual-publish → cutover → retire; supports pause/rollback. |
| Exit     | Unsafe transition attempts fail with auditable reason.                                |

#### P12.N08 Compatibility matrix API

| Item     | Detail                                                                                    |
| -------- | ----------------------------------------------------------------------------------------- |
| Inputs   | Package query responses, upload Job evidence, participant target list.                    |
| Behavior | Tracks missing/uploaded/vetted/compatible/stale/incompatible per participant/environment. |
| Exit     | Cutover and command routing are blocked for incompatible participant scope.               |

#### P12.N09 Admin CLI and Workbench surface

| Item     | Detail                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------- |
| Inputs   | Admin scopes, upgrade plan state, compatibility API.                                              |
| Behavior | Provides controlled operator visibility and approvals.                                            |
| Exit     | Operators can inspect package lifecycle without using raw DB writes or participant side-channels. |

#### P12.N10 Registry replay, restore, and telemetry

| Item     | Detail                                                                   |
| -------- | ------------------------------------------------------------------------ |
| Inputs   | Object storage artifacts, signatures, audit log, compatibility evidence. |
| Behavior | Reconstructs registry state and emits metrics/alerts for runtime safety. |
| Exit     | Restore and monitoring prove registry is durable and observable.         |

### 9.2 Dependency ladder

```text
P12.N01
  -> P12.N02
     -> P12.N03
        -> P12.N04
           -> P12.N05
           -> P12.N06
              -> P12.N07
                 -> P12.N08
                    -> P12.N09
                    -> P12.N10
```

Parallelization notes:

| Work                    | Can parallelize after                  | Notes                                                        |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------ |
| Signature verifier      | P12.N03 interface defined              | Needs ingest contract.                                       |
| Command-builder adapter | P12.N02 schema and descriptor contract | Can stub client against internal API contract only in tests. |
| Helm integration        | P12.N03 upload manifest contract       | Must coordinate with Phase 09 chart ownership.               |
| Compatibility matrix    | P12.N06 evidence contract              | Reads upload evidence and participant query results.         |
| Admin UI                | P12.N07 and P12.N08 APIs               | Must not invent separate admin model.                        |
| Telemetry               | P12.N07 and P12.N08 states             | Metrics must map to real states, not log scraping only.      |

### 9.3 Acceptance matrix

| Acceptance item                                               | Covered by                           |
| ------------------------------------------------------------- | ------------------------------------ |
| File exists with all 11 sections                              | This document.                       |
| N01..N10 explicit tickets                                     | P12.N01 through P12.N10 table.       |
| `P9.J06` supersession                                         | Sections 3.4 and P12.N06.            |
| Migration `0100_template_registry`                            | Sections 6 and P12.N02.              |
| Registry of `(template, package_id, version, semver, status)` | Sections 4 and 6.                    |
| Command-builder package selection                             | Sections 5.2 and P12.N05.            |
| DAR signature/checksum verification                           | Sections 5.1, 8.1, P12.N03, P12.N04. |
| Upgrade choreography                                          | Sections 3.6 and P12.N07.            |
| Per-validator compatibility matrix                            | Sections 4.5, 5.3, P12.N08.          |
| Rollback flow                                                 | Sections 5.5 and P12.N07.            |

## 10. Open Questions

| Question                                        | Why it matters                                                                                                                   | Default for execution                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production dual-control requirement             | Determines whether every live registry mutation needs two human approvals or only publish/cutover/retire.                        | Require dual control for live publish, cutover, retire, revoke; allow ingest with single admin write plus automated signature checks.                                               |
| Customer visibility of registry status          | Customers may need assurance that package upgrades are staged safely, but exposing package IDs violates public API invisibility. | Expose high-level service health/version posture only; keep package IDs admin-only.                                                                                                 |
| Compatibility automation vs manual evidence     | Full Daml/API/webhook compatibility automation may lag first implementation.                                                     | Automate blocking checks for checksum, signature, manifest, package visibility, mapping presence; require explicit admin override only for documented non-blocking advisory checks. |
| Self-hosted offline bundle format               | Air-gapped environments need deterministic package distribution.                                                                 | Use signed registry upload bundle containing artifact URI or embedded artifact ref, checksum, package IDs, and compatibility requirements.                                          |
| Package vetting semantics per Canton deployment | Vetting/package visibility can differ by participant and Canton version.                                                         | Store generic `vetting_status` plus raw evidence ref; command-builder uses normalized compatibility status only.                                                                    |
| Retire criteria for legacy contracts            | Old package may remain needed for existing active contracts.                                                                     | Do not retire while projection/ACS indicates active contracts or command routes still require legacy package.                                                                       |
| Admin endpoint inclusion in Phase 12            | Internal service and CLI may be enough for first implementation.                                                                 | Optional `/v1/admin/template_registry/*` only when Workbench/admin tools require HTTP access.                                                                                       |

## 11. Agent-ready Checklist

### Build gate

- [ ] `services/template-registry` builds as a Kotlin/JVM internal service.
- [ ] `packages/db/migrations/0100_template_registry` applies cleanly from an empty dev database after prior migrations.
- [ ] Migration verification confirms `template_registry` tables are config/control-plane metadata only.
- [ ] DAR ingest test fixture verifies checksum, signature, manifest parse, package ID extraction, and descriptor creation.
- [ ] Invalid signature fixture is rejected before package publish state.
- [ ] `services/ledger-command` builds with registry client integration.
- [ ] Helm DAR upload Job renders with registry upload plan inputs and without raw secrets.
- [ ] Optional admin routes compile behind admin scope only.
- [ ] Observability resources for registry stale/mismatch/signature/upload failure render.

### Verify gate

- [ ] Registering a valid signed DAR creates `dar_uploads`, `template_descriptors`, and `package_versions` rows.
- [ ] Registering an unsigned, tampered, or checksum-mismatched DAR fails with audited reason.
- [ ] Command-builder resolves active package for a transfer/issuance/redemption command from registry data.
- [ ] Command-builder fails closed when active package is missing, stale, retired, revoked, blocked, or absent from compatibility records.
- [ ] `P9.J06` Helm DAR upload Job consumes registry upload manifest and writes participant compatibility evidence.
- [ ] Upgrade plan cannot transition directly from `announce` to `cutover`.
- [ ] Cutover is blocked while any required participant compatibility record is `missing`, `stale`, or `incompatible`.
- [ ] Retire is blocked while a tenant pin or active legacy contract requires the old package.
- [ ] Registry replay/restore recreates active package selection from signed artifacts and audit log.
- [ ] Manual DAR side-channel detection alerts when participant-visible package lacks registry upload plan.

### Invariant gate

- [ ] Canton Ledger remains the economic source of truth; registry metadata never authorizes balance, holding, settlement, redemption, or claim state.
- [ ] `template_registry` schema stores only configuration/control-plane metadata and audit evidence, not authoritative asset state.
- [ ] Public customer `/v1` responses do not expose `package_id`, `template_id`, `participant_id`, `validator_id`, `command_id`, `contract_id`, or DAR internals.
- [ ] Every command mutation still records `intent → operation → command_id → update_id/offset`, with registry package selection attached as internal audit metadata.
- [ ] `deploymentMode` values remain `hosted`, `customer-validator`, and `self-hosted`; mode changes DAR distribution wiring only.
- [ ] Webhook endpoint version pinning is preserved across package upgrades.
- [ ] Command-builder never submits a command with a `package_id` not present in the active registry.
- [ ] Command-builder never submits a command whose package is incompatible or not visible on the target participant.
- [ ] Rollback never creates split-brain package selection across participants for the same tenant/environment/operation scope.
- [ ] All production registry mutations are audited and require configured admin scope; live publish/cutover/retire/revoke require dual control unless the open question is resolved differently by ADR.
