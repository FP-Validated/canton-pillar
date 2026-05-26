# Phase 01 — Daml Source-of-Truth Model

> Build the internal Daml packages that make Canton Ledger the source of truth for Pillar assets, holdings, holds, intents, operation traces, and package-versioned workflows.

## 1. Executive Summary

Phase 01 delivers the Daml model for Pillar's first ledger-backed product surface. It maps to Phase 1 and milestone M2 in [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md): asset, holding, issue, transfer, hold, and redeem workflows with Daml Script coverage.

The output is not a public API. The Daml packages are internal source-of-truth packages consumed by later phases through generated bindings, ledger command runtime, projection workers, and Workbench-only trace views. `/v1` remains developer-friendly and Canton-invisible.

| Principle                                             | Phase 01 application                                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Canton Ledger is the source of truth                  | `AssetRules`, `Holding`, `Hold`, intent templates, and `OperationTrace` define canonical state.            |
| Pillar DB stores only Projection / Audit / Config     | No Phase 01 DB schema. Later projections mirror ledger state.                                              |
| External API must be developer-friendly and Canton-invisible | Daml `ContractId`, `Party`, package id, template id, and choice names are internal only.                   |
| Internal runtime must be Canton-native                | Templates, choices, signatories, observers, controllers, DARs, and package ids are first-class internally. |
| Operations must be ledger-traceable                   | Every intent path creates or updates `Pillar.Ops.OperationTrace`.                                          |
| Balance/Holding-first, not contract-first             | `Holding` and `Hold` model rights and locks; external reads aggregate later.                               |
| Intent-first, not transaction-first                   | issue, redeem, and transfer begin as intent contracts and progress through choices.                        |
| Webhook-first for async workflow                      | Daml events feed projections and webhooks in later phases; Phase 01 emits ledger facts only.               |
| API grammar must be polished from day one         | Daml uses stable external object ids in metadata, never contract ids as public ids.                        |
| Deployment model changes, API experience does not     | DAR/package selection is internal and tenant-pinned later; object grammar does not change.                 |

Architecture sources:

- [06 TransferIntent / SettlementIntent State Machine](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md)
- [07 Canton-native runtime](../Architecture/07_Canton-native%20runtime.md)
- [08 Daml Template Library](../Architecture/08_Daml%20Template%20Library.md)
- [17 Template Registry Versioning](../Architecture/17_Template%20Registry%20Versioning.md)
- [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)

Exit condition: `dpm build`, `dpm test`, and `tools/codegen/daml-codegen/generate.sh` succeed; Daml Script tests cover issue, transfer, hold, release, redeem, negative authorization, negative over-hold, and invalid transfer paths.

## 2. Goals / Non-goals

### Goals

| Goal                          | Requirement                                                                                                             | Source                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Compile the Daml workspace    | `daml/multi-package.yaml` includes all Phase 01 packages.                                                               | [23](../Architecture/23_Implementation%20Plan.md)                             |
| Define shared core types      | `Pillar.Core.TenantConfig`, `AccountRef`, metadata, status enums, amount types.                                         | [08](../Architecture/08_Daml%20Template%20Library.md)                         |
| Define asset source of truth  | `AssetRules`, `Holding`, `Hold` encode asset policy, ownership, availability, and lock lifecycle.                       | [08](../Architecture/08_Daml%20Template%20Library.md)                         |
| Define intent workflows       | `IssueIntent`, `RedeemIntent`, `TransferIntent` cover create, confirm, fail, cancel, settle paths.                      | [06](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md) |
| Define ledger trace templates | `OperationTrace` links intent, workflow id, command id placeholder, status transition, and update metadata.             | [07](../Architecture/07_Canton-native%20runtime.md)                           |
| Define token adapter boundary | `pillar-token-adapter` compiles as an internal interface boundary without leaking CN Token Standard details into `/v1`. | [08](../Architecture/08_Daml%20Template%20Library.md)                         |
| Provide Daml Script harness   | `pillar-test` exercises happy paths, negative paths, and upgrade compatibility examples.                                | [23](../Architecture/23_Implementation%20Plan.md)                             |
| Version DAR artifacts         | package names, semantic versions, DAR hashes, and generated bindings are stable inputs to registry work.                | [17](../Architecture/17_Template%20Registry%20Versioning.md)                  |

### Non-goals

| Non-goal                                 | Reason                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Public REST API                          | Phase 02 owns `/v1` contract and object grammar.                                                                |
| DB migrations                            | Phase 03 owns DB schema; Phase 01 only defines ledger facts.                                                    |
| Ledger command service                   | Phase 04 owns submission, command deduplication, completion tracking.                                           |
| Projection worker                        | Phase 05 owns projection from ledger/PQS into Postgres.                                                         |
| Webhook dispatcher                       | Phase 06 owns event normalization, signing, delivery, replay.                                                   |
| Workbench UI / SDK / CLI                 | Phase 07 owns public developer/operator tools.                                                                  |
| Direct CN Token Standard public adoption | Phase 01 keeps an adapter boundary and records the adoption timing question.                                    |
| Contract-first customer integration      | External customers must never submit `ContractId`, `templateId`, `choice`, `Party`, or DAR references to `/v1`. |

## 3. Architecture

### Package dependency graph

Canonical package flow:

```text
pillar-core
  └── pillar-assets
        ├── pillar-intents
        │     └── pillar-ops
        └── pillar-token-adapter

pillar-test depends on all packages above.
```

Required direction from the assignment:

```text
core ← assets ← intents ← ops
assets ← token-adapter
```

Interpretation:

| Package                     | Depends on                                       | Provides                                                     | May not depend on                        |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------- |
| `daml/pillar-core`          | Daml standard libraries only                     | shared refs, metadata, enums, tenant config                  | assets, intents, ops, token adapter      |
| `daml/pillar-assets`        | `pillar-core`                                    | asset policy, holding, hold lifecycle                        | intents, ops, token adapter              |
| `daml/pillar-intents`       | `pillar-core`, `pillar-assets`                   | issue, redeem, transfer intents                              | ops implementation details, API packages |
| `daml/pillar-ops`           | `pillar-core`, `pillar-assets`, `pillar-intents` | operation trace, workflow task                               | public API packages                      |
| `daml/pillar-token-adapter` | `pillar-core`, `pillar-assets`                   | adapter interfaces/views for token-standard interoperability | intents, ops, public API packages        |
| `daml/pillar-test`          | all Daml packages                                | Daml Script fixtures and assertions                          | production runtime services              |

The graph keeps `core` stable, keeps `assets` independent of workflow orchestration, and allows `ops` to observe/link workflows without turning operation trace into an asset dependency.

### Source tree

```text
daml/
├── multi-package.yaml
├── pillar-core/
│   ├── daml.yaml
│   ├── daml/Pillar/Core/
│   │   ├── Meta.daml
│   │   ├── Types.daml
│   │   ├── TenantConfig.daml
│   │   └── AccountRef.daml
│   └── test/
├── pillar-assets/
│   ├── daml.yaml
│   ├── daml/Pillar/Assets/
│   │   ├── AssetRules.daml
│   │   ├── Holding.daml
│   │   └── Hold.daml
│   └── test/
├── pillar-intents/
│   ├── daml.yaml
│   ├── daml/Pillar/Intents/
│   │   ├── IssueIntent.daml
│   │   ├── RedeemIntent.daml
│   │   ├── TransferIntent.daml
│   │   └── Status.daml
│   └── test/
├── pillar-ops/
│   ├── daml.yaml
│   ├── daml/Pillar/Ops/
│   │   ├── OperationTrace.daml
│   │   └── WorkflowTask.daml
│   └── test/
├── pillar-token-adapter/
│   ├── daml.yaml
│   ├── daml/Pillar/TokenStandard/
│   │   ├── Interfaces.daml
│   │   └── Adapter.daml
│   └── test/
└── pillar-test/
    ├── daml.yaml
    ├── daml/Pillar/Test/
    │   ├── Fixtures.daml
    │   ├── IssueScript.daml
    │   ├── TransferScript.daml
    │   ├── HoldScript.daml
    │   ├── RedeemScript.daml
    │   ├── AuthorizationNegativeScript.daml
    │   ├── OverHoldNegativeScript.daml
    │   └── InvalidTransferNegativeScript.daml
    └── test/
```

File names are implementation guidance. Ticket acceptance owns the required behavior; maintainers may split modules differently if package boundaries and public FQNs stay intact.

### DAR artifact strategy

| Artifact                             | Producer                                   | Consumer                                              | Rule                                                                              |
| ------------------------------------ | ------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pillar-core-<version>.dar`          | `dpm build` in `daml/pillar-core`          | all Daml packages, codegen, registry                  | Immutable by hash. Breaking changes require new version and compatibility report. |
| `pillar-assets-<version>.dar`        | `dpm build` in `daml/pillar-assets`        | intents, token adapter, projections, codegen          | Contains source-of-truth holding state.                                           |
| `pillar-intents-<version>.dar`       | `dpm build` in `daml/pillar-intents`       | ops, ledger-command, projection worker                | Contains canonical issue/redeem/transfer state machines.                          |
| `pillar-ops-<version>.dar`           | `dpm build` in `daml/pillar-ops`           | ledger-command, projection worker, Workbench          | Contains trace/task templates for observability.                                  |
| `pillar-token-adapter-<version>.dar` | `dpm build` in `daml/pillar-token-adapter` | token-standard adapter service, future CN integration | Boundary artifact; does not change public `/v1` grammar.                          |
| generated Java bindings              | `tools/codegen/daml-codegen/generate.sh`   | `services/ledger-command`, tests                      | Must be regenerated from built DARs.                                              |
| generated TypeScript bindings        | `tools/codegen/daml-codegen/generate.sh`   | Workbench/internal tooling tests                      | Internal/admin use only.                                                          |

DAR invariants:

1. DARs are build artifacts, not public API objects.
2. Public object ids never derive from `ContractId` or package id.
3. Each DAR release records package name, semantic version, SDK version, main package id, dependency package ids, and `sha256`.
4. Later registry work stores immutable artifacts and exposes package ids only to admin/Workbench surfaces.
5. CI must compare generated bindings to checked-in output so runtime code cannot lag the Daml model.

### Template versioning approach

From [17 Template Registry Versioning](../Architecture/17_Template%20Registry%20Versioning.md), Phase 01 Daml code must be ready for six independent version axes:

| Version axis               | Phase 01 requirement                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| DAR package version        | Every `daml.yaml` has package name/version; DAR hash is registry input.                            |
| Template family version    | Templates include `schemaVersion` and stable family naming such as `pillar.assets.holding`.        |
| API object mapping version | Ledger-visible metadata includes stable `objectId`; API mapping remains off-ledger and later.      |
| Webhook API version        | Template payloads contain enough stable state to produce thin events later without changing `/v1`. |
| SDK version                | Generated bindings are derived artifacts; SDKs never define ledger semantics.                      |
| Tenant template pin        | Templates support coexistence; active version selection is runtime config, not Daml branching.     |

Compatibility design rules:

| Change                                         | Allowed in patch/minor? | Required action                                           |
| ---------------------------------------------- | ----------------------- | --------------------------------------------------------- |
| Add optional field                             | Yes                     | Update tests and generated bindings.                      |
| Add choice                                     | Usually yes             | Verify controller and authorization discipline.           |
| Add enum/variant constructor                   | Usually yes             | Verify mapping/webhook compatibility later.               |
| Remove field                                   | No                      | New major version and migration plan.                     |
| Change field type                              | No                      | New major version and migration plan.                     |
| Remove template or choice                      | No                      | New major version and migration plan.                     |
| Change signatory/observer/controller semantics | Treat as high risk      | Compatibility report, tenant opt-in, mixed-version tests. |

Every template created in this phase must include a common metadata envelope with stable external object id, tenant id, API version, schema version, workflow id, optional request/idempotency hashes, livemode, timestamps, and PII-free metadata/reference fields.

## 4. API / Object Model

Phase 01 has no public `/v1` API. It defines internal Daml-visible templates/interfaces that later services bind to developer-friendly public objects.

### Daml-visible templates and interfaces

| FQN                                 | Package                | Public `/v1`? | Purpose                                                                                                   | Required choices / behavior                                                                                     |
| ----------------------------------- | ---------------------- | ------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Pillar.Core.TenantConfig`          | `pillar-core`          | No            | Ledger-visible tenant/environment config and parties required by the model.                               | `UpdateTenantConfig`, `ArchiveTenantConfig` or equivalent admin lifecycle.                                      |
| `Pillar.Core.AccountRef`            | `pillar-core`          | No            | Stable external account reference carried inside ledger templates without exposing Canton party ids.      | Data type/interface, not necessarily a template.                                                                |
| `Pillar.Assets.AssetRules`          | `pillar-assets`        | No            | Issuer/tenant asset policy: precision, issuer authority, transfer/redemption capability flags.            | `UpdateRules`, `SuspendAsset`, `ReactivateAsset`, `ArchiveRules`.                                               |
| `Pillar.Assets.Holding`             | `pillar-assets`        | No            | Canonical active asset holding for an account/asset. Projection later forms public holding/balance views. | `SplitHolding`, `MergeHolding`, `CreateHold`, `Transfer`, `Redeem` or narrower equivalent exercised by intents. |
| `Pillar.Assets.Hold`                | `pillar-assets`        | No            | Canonical lock/reservation against a holding amount.                                                      | `ReleaseHold`, `ConsumeHold`, `ExpireHold`.                                                                     |
| `Pillar.Intents.IssueIntent`        | `pillar-intents`       | No            | Intent-first issuance workflow.                                                                           | `ConfirmIssue`, `CancelIssue`, `FailIssue`, `MarkIssueSucceeded`.                                               |
| `Pillar.Intents.RedeemIntent`       | `pillar-intents`       | No            | Intent-first redemption workflow.                                                                         | `ConfirmRedeem`, `CancelRedeem`, `FailRedeem`, `MarkRedeemSucceeded`.                                           |
| `Pillar.Intents.TransferIntent`     | `pillar-intents`       | No            | Intent-first transfer workflow from source account/holding to destination account.                        | `ConfirmTransfer`, `CancelTransfer`, `FailTransfer`, `MarkTransferSucceeded`.                                   |
| `Pillar.Ops.OperationTrace`         | `pillar-ops`           | No            | Ledger-visible trace chain for request → intent → command/update/projection.                              | `RecordSubmitted`, `RecordCompleted`, `RecordFailed`, `LinkUpdate`.                                             |
| `Pillar.Ops.WorkflowTask`           | `pillar-ops`           | No            | Ledger-visible task for delayed/retry/manual workflow continuation.                                       | `StartTask`, `CompleteTask`, `FailTask`, `CancelTask`, `RetryTask`.                                             |
| `Pillar.TokenStandard.*` interfaces | `pillar-token-adapter` | No            | Internal adapter boundary for future CN Token Standard compatibility.                                     | Interface/view definitions compile without changing public API grammar.                                         |

### Internal-only rule

The following Daml concepts must not surface in `/v1` responses, requests, SDK arguments, or webhook payloads by default:

```text
ContractId
contract_id
templateId
template_id
packageId
package_id
Party
party_id
participant_id
synchronizer_id
DAR
choice
command_id
submission_id
update_id
ledger_offset
```

Workbench/admin debug views may show hashed or scoped internal trace data later. That does not make these fields public API grammar.

### Public object mapping guardrails for later phases

| Public object     | Derived from Phase 01 ledger facts                   | Must not use as id           |
| ----------------- | ---------------------------------------------------- | ---------------------------- |
| `asset`           | `AssetRules.meta.objectId`, issuer policy, precision | package id, template id      |
| `holding`         | active `Holding` plus active `Hold` contracts        | `ContractId`                 |
| `balance`         | aggregate of holdings and holds                      | ledger offset as business id |
| `issue_intent`    | `IssueIntent` status and operation trace             | choice name                  |
| `redeem_intent`   | `RedeemIntent` status and operation trace            | Daml constructor name        |
| `transfer_intent` | `TransferIntent` status and operation trace          | contract id                  |
| `event`           | projection over ledger update + operation trace      | raw update id as public id   |

## 5. Internal Runtime

### Daml Script test harness

`pillar-test` is the Phase 01 acceptance harness. It must create parties, tenant config, asset rules, holdings, intents, holds, and operation traces entirely through Daml Script.

```text
pillar-test
  ├── Fixtures
  │   ├── allocate operator, tenant, issuer, accountOwner, custodian, compliance
  │   ├── create TenantConfig
  │   ├── create AssetRules
  │   ├── seed AccountRef values
  │   └── assert metadata is PII-free and object IDs are stable
  ├── IssueScript
  │   ├── create IssueIntent
  │   ├── confirm issue
  │   ├── create/update OperationTrace
  │   └── assert Holding exists with expected amount
  ├── TransferScript
  │   ├── seed Holding
  │   ├── create TransferIntent
  │   ├── confirm transfer
  │   ├── consume source / create destination Holding
  │   └── assert operation trace transition
  ├── HoldScript
  │   ├── create Hold against Holding
  │   ├── release Hold
  │   ├── consume Hold for transfer/redeem
  │   └── assert locked amount cannot exceed available amount
  ├── RedeemScript
  │   ├── create RedeemIntent
  │   ├── confirm redeem
  │   ├── consume Holding or Hold
  │   └── assert final status and trace
  └── NegativeScripts
      ├── unauthorized actor cannot exercise controlled choice
      ├── invalid transfer fails
      ├── over-hold fails
      └── incompatible package example is rejected by upgrade check where supported
```

### Required commands

```bash
dpm build
dpm test
tools/codegen/daml-codegen/generate.sh
```

`dpm test` is the acceptance command for Daml Script behavior. It must fail if a negative path unexpectedly succeeds.

### Runtime handoff to later phases

| Runtime concern          | Phase 01 output                                     | Later owner                 |
| ------------------------ | --------------------------------------------------- | --------------------------- |
| Command envelopes        | Choice names, payload types, controllers            | Phase 04 ledger-command     |
| Completion tracking      | Operation trace fields ready to link command/update | Phase 04 ledger-command     |
| Projection               | Template payloads are projection-friendly           | Phase 05 projection-worker  |
| Webhooks                 | Ledger state transitions can map to thin events     | Phase 06 webhook-dispatcher |
| SDK / Workbench bindings | Java + TS generated bindings compile                | Phase 07 SDK/CLI/Workbench  |
| DAR deployment           | Versioned artifacts and metadata                    | Phase 09 CI/CD + Helm       |

### Package upgrade story

Phase 01 must not implement the full registry, but it must avoid blocking it.

| Requirement                             | Daml model action                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Mixed package versions can coexist      | Do not assume one global package id in template payloads.                                                      |
| Migration is explicit                   | Include `schemaVersion` and `migrationRef`; add future migration choices instead of hidden automatic mutation. |
| Optional additive changes are preferred | Reserve optional extension fields for new data.                                                                |
| Rollback is controlled                  | Avoid one-way package assumptions in tests except where business lifecycle requires archiving.                 |
| Binding drift is visible                | Regenerate Java/TS bindings after Daml changes and fail CI on diff later.                                      |
| Tenant pinning is external              | Do not encode tenant rollout strategy inside templates.                                                        |

### Command/choice semantics

| Choice category          | Controller discipline                                                        | Test expectation                                    |
| ------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| Admin config choices     | tenant/operator/admin parties only                                           | unauthorized account owner fails.                   |
| Asset policy choices     | issuer and required operator/compliance party                                | unrelated tenant fails.                             |
| Holding movement choices | parties whose rights are affected plus required platform/custodian authority | source-only and destination-only cases are covered. |
| Hold choices             | holder/compliance/intent controller depending on reason                      | over-hold and unauthorized release fail.            |
| Intent lifecycle choices | intent owner/controller and platform workflow party                          | invalid transition fails.                           |
| Operation trace choices  | platform/operator workflow party                                             | arbitrary customer cannot mutate trace.             |

## 6. DB Schema

No DB tables are introduced in Phase 01.

Pillar DB remains Projection / Audit / Config only. The Daml contracts created here are ledger source-of-truth facts. Later phases create relational tables that mirror or audit those facts.

| Ledger fact                  | Phase 01 source                 | Later DB projection / table              | Owner phase         |
| ---------------------------- | ------------------------------- | ---------------------------------------- | ------------------- |
| Asset policy                 | `Pillar.Assets.AssetRules`      | assets / asset projection                | Phase 05            |
| Holding ownership and amount | `Pillar.Assets.Holding`         | holdings, balances                       | Phase 05            |
| Locked amount                | `Pillar.Assets.Hold`            | holdings locked/pending balance          | Phase 05            |
| Issue status                 | `Pillar.Intents.IssueIntent`    | intents / operations                     | Phase 03 + Phase 05 |
| Redeem status                | `Pillar.Intents.RedeemIntent`   | intents / operations                     | Phase 03 + Phase 05 |
| Transfer status              | `Pillar.Intents.TransferIntent` | transfers / intents / operations         | Phase 03 + Phase 05 |
| Operation trace              | `Pillar.Ops.OperationTrace`     | `operations` projection                  | Phase 05            |
| Workflow task                | `Pillar.Ops.WorkflowTask`       | workflow task/audit projection if needed | Phase 05+           |

`OperationTrace` is on-ledger in Phase 01 and mirrored into the `operations` projection in Phase 05. The mirrored row is not authoritative for ledger state; it is a searchable trace/read model.

No migration file, SQL table, or persistence adapter should be added by this phase.

## 7. Failure Modes

| Failure mode                       | Where it appears                                                                      | Required Daml/test behavior                                                               | Later runtime handling                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Package id mismatch                | Generated binding submits command against DAR not uploaded/vetted or wrong tenant pin | Daml package metadata is versioned; tests do not hard-code public behavior to package id. | ledger-command resolves tenant pin and reports package deployment error.                     |
| Choice contention                  | Two commands exercise/archive the same holding/hold/intent concurrently               | Daml choices enforce active contract state and fail invalid second exercise.              | command runtime retries only idempotent intended changes; projection reconciles from ledger. |
| Upgrade incompatibility            | New template removes/changes fields or controller semantics                           | Model uses `schemaVersion`, optional additive fields, explicit migration refs.            | registry compatibility checker blocks or marks major.                                        |
| Unauthorized signatory             | Contract create or choice exercise submitted by party lacking authority               | Daml authorization fails; negative Daml Script asserts failure.                           | API maps to permission/authorization error without leaking party details.                    |
| Unauthorized observer overexposure | Too many observers reveal contract existence                                          | Template observers are minimal; no global observer pattern.                               | security review and registry metadata extractor flag risky observers.                        |
| Over-hold                          | Hold amount exceeds available holding amount                                          | `CreateHold` rejects; negative test passes only when failure occurs.                      | API returns domain error, not silent partial hold.                                           |
| Invalid transfer                   | Source/destination/asset/amount/status does not satisfy rules                         | `ConfirmTransfer` rejects invalid transition or amount.                                   | API returns intent failure and emits webhook later.                                          |
| Stale holding selection            | Transfer uses holding already consumed/archived                                       | Daml exercise fails on inactive contract.                                                 | ledger-command replans if operation is retryable and idempotency allows.                     |
| Trace missing                      | Intent path completes without operation trace                                         | Daml Script acceptance asserts trace creation/update.                                     | projection/reconciler alerts on missing trace link.                                          |
| PII leakage                        | Template metadata stores direct identifiers                                           | Fixtures assert no fixture uses names/emails/government ids in ledger metadata.           | compliance/security phases add scanners and policy.                                          |

Error mapping is not implemented here, but Daml failure shape must be deterministic enough for later services to classify failures without parsing arbitrary strings where avoidable.

## 8. Security / Compliance

### Signatory / observer discipline

| Template         | Signatories                                              | Observers                                        | Rule                                                    |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `TenantConfig`   | tenant and/or platform operator                          | limited admin/auditor parties                    | Config is not globally visible.                         |
| `AssetRules`     | issuer, tenant/platform as required                      | compliance/auditor only when policy requires     | Issuer authority is explicit.                           |
| `Holding`        | owner/custodian/tenant authority depending custody model | compliance/auditor only if required              | Counterparties do not see holdings by default.          |
| `Hold`           | holding authority and hold controller/compliance         | parties affected by lock                         | Hold visibility is reason-scoped.                       |
| `IssueIntent`    | issuer/tenant/platform parties required for issuance     | destination/custodian only as needed             | Issuance authority cannot be spoofed.                   |
| `RedeemIntent`   | holder/custodian/issuer/platform as required             | compliance/issuer as needed                      | Redemption burns/withdraws only under authority.        |
| `TransferIntent` | source authority plus platform/custodian as required     | destination gets only needed workflow visibility | Destination does not observe unrelated source holdings. |
| `OperationTrace` | platform/operator workflow party                         | tenant/auditor scoped to operation               | Trace visibility follows operation scope.               |
| `WorkflowTask`   | platform/operator workflow party                         | assigned actor/tenant if needed                  | Task visibility is minimal.                             |

No template should add a global observer for operational convenience. If observability is needed, use `OperationTrace` scoped to the tenant/operation or later projection/admin tooling.

### Controller authorization

| Choice family         | Controllers                                                            | Prohibited                                                          |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Config/admin          | tenant admin, platform operator                                        | account owner alone                                                 |
| Asset issuance/rules  | issuer and required platform/compliance authority                      | destination account alone                                           |
| Holding movement      | rights holder/custodian and workflow controller as modeled             | unrelated tenant/platform-only movement without delegated authority |
| Hold release/consume  | hold controller or authorized workflow/compliance party                | arbitrary holder if compliance hold is active                       |
| Intent confirm/cancel | authorized actor for that intent plus platform workflow where required | actor not bound to source/destination/tenant                        |
| Trace/task mutation   | platform workflow/operator                                             | external customer without scoped admin right                        |

Negative Daml Script tests must assert unauthorized exercises fail.

### PII and sensitive data

Ledger templates must not store direct PII by default:

```text
No names
No email addresses
No phone numbers
No street addresses
No government IDs
No full bank account details
No raw webhook payloads
No API keys
No client secrets
No plaintext idempotency keys
```

Allowed ledger-visible references:

| Data                     | Allowed representation                                                  |
| ------------------------ | ----------------------------------------------------------------------- |
| External object id       | Stable Pillar id such as `asset_*`, `acct_*`, `hld_*`, `int_*`.         |
| Idempotency key          | Hash only.                                                              |
| Customer/order reference | Bounded metadata value only if non-sensitive; otherwise hash/reference. |
| Evidence/document        | Encrypted off-ledger reference or hash.                                 |
| API request              | request id and hash, not raw body.                                      |
| Webhook                  | event id/status later, not endpoint secret or payload.                  |

### Compliance posture

Phase 01 creates the ledger primitives that later compliance and audit features rely on. It does not implement KYC, sanctions screening, policy decisioning, webhook signing, or audit export. It must leave enough hooks in metadata/status fields for those later phases without embedding sensitive data.

## 9. Implementation Plan

| ID     | Title                                   | Path                                                                       | Output                                                                                                                                                                                                                                                                                      | Deps                                                                                   | Acceptance                                                                                                                                                                                                                                                                                                                   | Risk |
| ------ | --------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| P1.B01 | Core Daml package                       | `daml/pillar-core`                                                         | `Pillar.Core.TenantConfig`; `Pillar.Core.AccountRef`; shared `PillarMeta`; status/amount/reference types; choices: `UpdateTenantConfig`, `ArchiveTenantConfig` where modeled                                                                                                                | P0.A03 Daml workspace                                                                  | `daml/pillar-test/daml/Pillar/Test/Fixtures.daml` creates tenant/operator/account refs; `dpm build` compiles package                                                                                                                                                                                                         | med  |
| P1.B02 | Asset Daml package                      | `daml/pillar-assets`                                                       | `Pillar.Assets.AssetRules`, `Pillar.Assets.Holding`, `Pillar.Assets.Hold`; choices: `UpdateRules`, `SuspendAsset`, `ReactivateAsset`, `CreateHold`, `ReleaseHold`, `ConsumeHold`, holding movement/split/merge as needed                                                                    | P1.B01                                                                                 | `daml/pillar-test/daml/Pillar/Test/HoldScript.daml` proves issue/hold/release and over-hold negative path                                                                                                                                                                                                                    | high |
| P1.B03 | Intent Daml package                     | `daml/pillar-intents`                                                      | `Pillar.Intents.IssueIntent`, `Pillar.Intents.RedeemIntent`, `Pillar.Intents.TransferIntent`; choices: `ConfirmIssue`, `CancelIssue`, `FailIssue`, `ConfirmRedeem`, `CancelRedeem`, `FailRedeem`, `ConfirmTransfer`, `CancelTransfer`, `FailTransfer`, success transition choices as needed | P1.B01, P1.B02                                                                         | `daml/pillar-test/daml/Pillar/Test/IssueScript.daml`, `TransferScript.daml`, and `RedeemScript.daml` cover full lifecycle scripts                                                                                                                                                                                            | high |
| P1.B04 | Ops trace package                       | `daml/pillar-ops`                                                          | `Pillar.Ops.OperationTrace`, `Pillar.Ops.WorkflowTask`; choices: `RecordSubmitted`, `RecordCompleted`, `RecordFailed`, `LinkUpdate`, `StartTask`, `CompleteTask`, `FailTask`, `CancelTask`, `RetryTask`                                                                                     | P1.B01, P1.B02, P1.B03                                                                 | `daml/pillar-test/daml/Pillar/Test/TransferScript.daml` asserts command/operation trace is visible and linked to intent workflow                                                                                                                                                                                             | med  |
| P1.B05 | Token adapter boundary                  | `daml/pillar-token-adapter`                                                | Internal adapter interfaces/views for Pillar asset/holding compatibility with future CN Token Standard; no public API coupling; choices only where required by interface examples                                                                                                           | P1.B01, P1.B02                                                                         | `daml/pillar-test/daml/Pillar/Test/Fixtures.daml` imports adapter package; `dpm build` compiles without introducing `/v1` object fields                                                                                                                                                                                      | med  |
| P1.B06 | Daml negative tests                     | `daml/pillar-test`                                                         | Negative scripts for invalid transfer, over-hold, unauthorized actor, and package/upgrade compatibility guard where supported                                                                                                                                                               | P1.B01, P1.B02, P1.B03, P1.B04, P1.B05                                                 | `daml/pillar-test/daml/Pillar/Test/InvalidTransferNegativeScript.daml`, `OverHoldNegativeScript.daml`, and `AuthorizationNegativeScript.daml` fail correctly under `dpm test`                                                                                                                                                | high |
| P1.B07 | TenantConfig template and admin choices | `daml/pillar-core/daml/Pillar/Core/TenantConfig.daml`                      | `Pillar.Core.TenantConfig` template with `PillarMeta`, tenant/environment parties, package pin fields, and choices: `UpdateTenantConfig`, `ArchiveTenantConfig`                                                                                                                             | P1.B01                                                                                 | `daml/pillar-test/daml/Pillar/Test/TenantConfigScript.daml` creates config, updates package pin metadata, archives through an authorized admin, and rejects unauthorized update under `dpm test`                                                                                                                             | med  |
| P1.B08 | AccountRef template/reference type      | `daml/pillar-core/daml/Pillar/Core/AccountRef.daml`                        | `Pillar.Core.AccountRef` serializable reference or template with `acct_` object id, tenant id, account capability/status references, and no raw `Party`/`ContractId` public fields                                                                                                          | P1.B01                                                                                 | `daml/pillar-test/daml/Pillar/Test/AccountRefScript.daml` creates fixture account refs, validates stable `acct_` ids, and imports them from asset/intent scripts under `dpm test`                                                                                                                                            | med  |
| P1.B09 | Core common type library                | `daml/pillar-core/daml/Pillar/Core/Common.daml`                            | Common types: `PillarMeta`, `AssetReference`, `Amount`, decimal scale/precision helpers, `NonNegativeAmount` validation, status enums, bounded metadata/reference helpers, and time helpers for expiry windows                                                                              | P1.B01                                                                                 | `daml/pillar-test/daml/Pillar/Test/CommonTypesScript.daml` asserts decimal scale validation, negative amount rejection, expiry helper behavior, and PII-free metadata fixtures under `dpm test`                                                                                                                              | med  |
| P1.B10 | Reusable Daml Script fixture harness    | `daml/pillar-test/daml/Pillar/Test/Fixtures.daml`                          | Reusable fixture functions for parties, tenant config, account refs, asset rules, holdings, holds, intents, operation traces, deterministic object ids, and authorization assertion helpers                                                                                                 | P1.B01, P1.B07, P1.B08, P1.B09                                                         | `daml/pillar-test/daml/Pillar/Test/FixturesScript.daml` exercises fixture bootstrap once and is imported by issue, transfer, redeem, hold, ops, adapter, and negative scripts under `dpm test`                                                                                                                               | med  |
| P1.B11 | AssetRules template and policy choices  | `daml/pillar-assets/daml/Pillar/Assets/AssetRules.daml`                    | `Pillar.Assets.AssetRules` template with issuer/tenant policy, precision, status, transfer/redemption flags, and choices: `UpdateRules`, `SuspendAsset`, `ReactivateAsset`, `ArchiveRules`                                                                                                  | P1.B02, P1.B07, P1.B09, P1.B10                                                         | `daml/pillar-test/daml/Pillar/Test/AssetRulesScript.daml` updates rules, suspends/reactivates asset, rejects issuance/transfer when suspended, and rejects unauthorized policy mutation under `dpm test`                                                                                                                     | high |
| P1.B12 | Holding template movement lifecycle     | `daml/pillar-assets/daml/Pillar/Assets/Holding.daml`                       | `Pillar.Assets.Holding` template with owner account ref, asset ref, amount, restrictions snapshot, and choices: `MoveHolding`, `SplitHolding`, `MergeHoldings`, `TransferOut`, `CloseHolding`                                                                                               | P1.B02, P1.B08, P1.B09, P1.B10, P1.B11                                                 | `daml/pillar-test/daml/Pillar/Test/HoldingScript.daml` seeds holdings, splits/merges them, moves amount to a destination account, rejects negative/dust-invalid amounts, and asserts source/destination visibility under `dpm test`                                                                                          | high |
| P1.B13 | Hold template lock lifecycle            | `daml/pillar-assets/daml/Pillar/Assets/Hold.daml`                          | `Pillar.Assets.Hold` template with holding ref, amount, reason, expiry, controller, and choices: `CreateHold`, `ReleaseHold`, `ConsumeHold`, `ExpireHold`, `AttachClaimRef`                                                                                                                 | P1.B02, P1.B09, P1.B10, P1.B11, P1.B12                                                 | `daml/pillar-test/daml/Pillar/Test/HoldScript.daml` creates/release/consume/expire holds, asserts locked amount changes, rejects over-hold, and rejects unauthorized release under `dpm test`                                                                                                                                | high |
| P1.B14 | Asset restriction policy module         | `daml/pillar-assets/daml/Pillar/Assets/Restrictions.daml`                  | Restriction data/functions for jurisdiction allow/deny rules, KYC-gated movement, sanctions-gated movement, compliance hold reasons, and policy evaluation results consumed by `AssetRules`, `Holding`, and `Hold`                                                                          | P1.B02, P1.B09, P1.B11, P1.B12, P1.B13                                                 | `daml/pillar-test/daml/Pillar/Test/RestrictionsScript.daml` validates jurisdiction, KYC, and sanctions decisions block issue/transfer/redeem fixture flows without storing direct PII under `dpm test`                                                                                                                       | high |
| P1.B15 | Asset rules versioning hooks            | `daml/pillar-assets/daml/Pillar/Assets/Versioning.daml`                    | Asset/template version hooks: `schemaVersion`, `policyVersion`, `migrationRef`, template family names, compatibility metadata, and registry-ready descriptors for P12 template registry ingestion                                                                                           | P1.B02, P1.B09, P1.B11, P1.B14                                                         | `daml/pillar-test/daml/Pillar/Test/AssetVersioningScript.daml` asserts policy version snapshot on holdings/intents and additive schema metadata suitable for template registry pinning under `dpm test`                                                                                                                      | med  |
| P1.B16 | IssueIntent lifecycle state machine     | `daml/pillar-intents/daml/Pillar/Intents/IssueIntent.daml`                 | `Pillar.Intents.IssueIntent` template with amount, destination account, asset ref, operation id, status, expiry, and choices: `ConfirmIssue`, `CancelIssue`, `FailIssue`, `ExpireIssue`, `MarkIssueSucceeded`                                                                               | P1.B03, P1.B08, P1.B09, P1.B10, P1.B11, P1.B12, P1.B14                                 | `daml/pillar-test/daml/Pillar/Test/IssueIntentScript.daml` covers created → processing → succeeded, canceled, failed, expired, invalid transition, and resulting holding assertions under `dpm test`                                                                                                                         | high |
| P1.B17 | RedeemIntent lifecycle state machine    | `daml/pillar-intents/daml/Pillar/Intents/RedeemIntent.daml`                | `Pillar.Intents.RedeemIntent` template with source account/holding, asset ref, amount, optional hold ref, operation id, status, expiry, and choices: `ConfirmRedeem`, `CancelRedeem`, `FailRedeem`, `ExpireRedeem`, `MarkRedeemSucceeded`                                                   | P1.B03, P1.B08, P1.B09, P1.B10, P1.B11, P1.B12, P1.B13, P1.B14                         | `daml/pillar-test/daml/Pillar/Test/RedeemIntentScript.daml` covers redeem success, cancel, fail, expire, hold consumption, insufficient available amount, and invalid transition under `dpm test`                                                                                                                            | high |
| P1.B18 | TransferIntent lifecycle state machine  | `daml/pillar-intents/daml/Pillar/Intents/TransferIntent.daml`              | `Pillar.Intents.TransferIntent` template with source/destination accounts, asset ref, amount, optional hold ref, operation id, status, expiry, and choices: `ConfirmTransfer`, `CancelTransfer`, `FailTransfer`, `ExpireTransfer`, `MarkTransferSucceeded`                                  | P1.B03, P1.B08, P1.B09, P1.B10, P1.B11, P1.B12, P1.B13, P1.B14                         | `daml/pillar-test/daml/Pillar/Test/TransferIntentScript.daml` covers transfer success, cancel, fail, expire, hold consumption, invalid destination/source, insufficient amount, and invalid transition under `dpm test`                                                                                                      | high |
| P1.B19 | SettlementIntent atomic workflow        | `daml/pillar-intents/daml/Pillar/Intents/SettlementIntent.daml`            | `Pillar.Intents.SettlementIntent` template for DvP/atomic swap workflow with settlement legs, lock refs, operation id, status, and choices: `AddSettlementLeg`, `AuthorizeLeg`, `LockLeg`, `ReleaseLeg`, `SettleAtomically`, `CancelSettlement`, `ExpireSettlement`, `FailSettlement`       | P1.B03, P1.B08, P1.B09, P1.B10, P1.B11, P1.B12, P1.B13, P1.B14, P1.B18                 | `daml/pillar-test/daml/Pillar/Test/SettlementIntentScript.daml` covers two-leg DvP lock/settle, cancel releases locks, expired settlement releases locks, and partial-leg failure preserves atomicity under `dpm test`                                                                                                       | high |
| P1.B20 | OperationTrace template choices         | `daml/pillar-ops/daml/Pillar/Ops/OperationTrace.daml`                      | `Pillar.Ops.OperationTrace` template with operation id, workflow id, request/idempotency hashes, intent refs, command/update placeholders, status, and choices: `RecordSubmitted`, `RecordCompleted`, `RecordFailed`, `LinkUpdate`                                                          | P1.B04, P1.B09, P1.B10, P1.B16, P1.B17, P1.B18, P1.B19                                 | `daml/pillar-test/daml/Pillar/Test/OperationTraceScript.daml` links issue/redeem/transfer/settlement fixture operations to submitted/completed/failed/update states and rejects customer trace mutation under `dpm test`                                                                                                     | med  |
| P1.B21 | WorkflowTask template retry lifecycle   | `daml/pillar-ops/daml/Pillar/Ops/WorkflowTask.daml`                        | `Pillar.Ops.WorkflowTask` template with task id, operation id, related object ref, assignee/controller, retry counters, due time, status, and choices: `StartTask`, `CompleteTask`, `FailTask`, `CancelTask`, `RetryTask`                                                                   | P1.B04, P1.B09, P1.B10, P1.B20                                                         | `daml/pillar-test/daml/Pillar/Test/WorkflowTaskScript.daml` covers start/complete/fail/cancel/retry, retry count bounds, due-time handling, and unauthorized task mutation under `dpm test`                                                                                                                                  | med  |
| P1.B22 | Token Standard Holding interface        | `daml/pillar-token-adapter/daml/Pillar/TokenStandard/HoldingI.daml`        | `Pillar.TokenStandard.HoldingI` interface/view mapping Pillar `Holding` fields to token-standard-compatible holding metadata without exposing token contract ids to `/v1` grammar                                                                                                           | P1.B05, P1.B09, P1.B11, P1.B12, P1.B15                                                 | `daml/pillar-test/daml/Pillar/Test/TokenHoldingInterfaceScript.daml` imports the interface, projects a Pillar holding view, checks asset/account/amount mapping, and verifies no public object field depends on contract id under `dpm test`                                                                                 | med  |
| P1.B23 | Token Standard Transfer interface       | `daml/pillar-token-adapter/daml/Pillar/TokenStandard/TransferI.daml`       | `Pillar.TokenStandard.TransferI` interface/view mapping Pillar transfer intent and holding movement semantics to token-standard-compatible transfer metadata without changing public transfer intent grammar                                                                                | P1.B05, P1.B09, P1.B12, P1.B18, P1.B22                                                 | `daml/pillar-test/daml/Pillar/Test/TokenTransferInterfaceScript.daml` maps a transfer intent fixture through the adapter, asserts amount/asset/account parity, and rejects contract-first adapter leakage under `dpm test`                                                                                                   | med  |
| P1.B24 | Adapter compatibility script            | `daml/pillar-token-adapter/daml/Pillar/TokenStandard/Adapter.daml`         | Adapter helper module that composes `HoldingI` and `TransferI` views, validates Pillar-native asset compatibility, and records unsupported token-standard features as explicit errors rather than silent fallbacks                                                                          | P1.B05, P1.B10, P1.B15, P1.B22, P1.B23                                                 | `daml/pillar-test/daml/Pillar/Test/AdapterCompatibilityScript.daml` runs Pillar-native holding/transfer fixtures through adapter compatibility checks and asserts unsupported cases fail deterministically under `dpm test`                                                                                                  | med  |
| P1.B25 | Required negative Daml scripts          | `daml/pillar-test/daml/Pillar/Test/NegativeScripts.daml`                   | Negative script suite for invalid transfer, over-hold, unauthorized actor, unauthorized asset policy update, invalid intent transition, and expired workflow exercise helpers                                                                                                               | P1.B06, P1.B10, P1.B11, P1.B12, P1.B13, P1.B16, P1.B17, P1.B18, P1.B20, P1.B21         | `daml/pillar-test/daml/Pillar/Test/InvalidTransferNegativeScript.daml`, `daml/pillar-test/daml/Pillar/Test/OverHoldNegativeScript.daml`, `daml/pillar-test/daml/Pillar/Test/AuthorizationNegativeScript.daml`, and `daml/pillar-test/daml/Pillar/Test/InvalidTransitionNegativeScript.daml` assert failures under `dpm test` | high |
| P1.B26 | Package upgrade compatibility script    | `daml/pillar-test/daml/Pillar/Test/PackageUpgradeCompatibilityScript.daml` | Daml package upgrade compatibility test using template family names, `schemaVersion`, `migrationRef`, asset policy version snapshots, and template registry pin epoch fields                                                                                                                | P1.B06, P1.B10, P1.B15, P1.B16, P1.B17, P1.B18, P1.B19, P1.B20, P1.B22, P1.B23, P1.B24 | `daml/pillar-test/daml/Pillar/Test/PackageUpgradeCompatibilityScript.daml` seeds v1 fixtures, verifies additive metadata compatibility, rejects incompatible template family/schema changes, and asserts tenant pin epoch behavior expected by P12 under `dpm test`                                                          | high |

### Ticket sequencing

```text
P1.B01
  ├── P1.B07
  ├── P1.B08
  ├── P1.B09
  └── P1.B10 after P1.B07-P1.B09
        └── P1.B02
              ├── P1.B11
              ├── P1.B12 after P1.B11
              ├── P1.B13 after P1.B12
              ├── P1.B14 after P1.B11-P1.B13
              ├── P1.B15 after P1.B11 and P1.B14
              └── P1.B03
                    ├── P1.B16 after P1.B11-P1.B14
                    ├── P1.B17 after P1.B12-P1.B14
                    ├── P1.B18 after P1.B12-P1.B14
                    ├── P1.B19 after P1.B18
                    └── P1.B04
                          ├── P1.B20 after P1.B16-P1.B19
                          └── P1.B21 after P1.B20

P1.B05 after P1.B11, P1.B12, P1.B15
  ├── P1.B22
  ├── P1.B23 after P1.B22 and P1.B18
  └── P1.B24 after P1.B22-P1.B23

P1.B06 after each behavior exists
  ├── P1.B25 after P1.B11-P1.B21
  └── P1.B26 after P1.B15-P1.B24
```

### Definition of done by package

| Package                | Done when                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `pillar-core`          | Shared types compile, metadata envelope exists, no dependency cycle.                       |
| `pillar-assets`        | Issuance can create holding, hold can lock/release/consume, invalid amounts fail.          |
| `pillar-intents`       | issue/redeem/transfer lifecycles are expressible through choices and statuses.             |
| `pillar-ops`           | each intent lifecycle can write/update operation trace and workflow task where applicable. |
| `pillar-token-adapter` | adapter boundary compiles and does not leak CN Token Standard into public model.           |
| `pillar-test`          | happy and negative Daml Script tests cover acceptance paths.                               |

### Generated binding handoff

```text
Daml source
  → dpm build
  → DAR artifacts
  → tools/codegen/daml-codegen/generate.sh
  → packages/ledger-types/generated/java
  → packages/ledger-types/generated/typescript
```

Bindings are internal. They may contain Canton concepts because runtime services need them; generated types must not be copied into public REST/SDK object grammar.

## 10. Open Questions

| Question                                                     | Current resolution                                                                                                                                                                                                                                                                                                                                               | Owner / timing                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Pillar-native vs CN Token Standard interface adoption timing | Phase 01 implements Pillar-native `AssetRules`/`Holding`/`Hold` and a separate `pillar-token-adapter` boundary. CN Token Standard adoption is not part of public `/v1` yet. Architecture [23](../Architecture/23_Implementation%20Plan.md) explicitly says first version prioritizes Pillar-native asset + adapter boundary, then CN Token Standard integration. | Revisit after Phase 05 projections and before Phase 09 deployment hardening. |
| Exact choice names vs implementation ergonomics              | Ticket table lists required choice intent. Implementers may use equivalent names only if tests and generated bindings remain clear and later command runtime can map them deterministically.                                                                                                                                                                     | Phase 01 implementer, reviewed in Phase 04 integration.                      |
| Whether `AccountRef` is a template or data type              | Architecture lists it as a core template/interface. If implementation makes it a serializable data type rather than a contract, preserve FQN semantics or document the compatibility choice in Daml package docs.                                                                                                                                                | Phase 01 implementer.                                                        |
| OperationTrace dependency direction                          | The assigned graph is `core ← assets ← intents ← ops`; therefore intents must not depend on ops. Intent scripts can create/update operation traces as separate ledger actions rather than embedding ops into intent package.                                                                                                                                     | Phase 01 implementer.                                                        |
| Package upgrade testing depth in M2                          | Phase 01 must include package-version fields and additive-change discipline. Full registry simulator and tenant pin resolver are Phase 09/registry work, not M2.                                                                                                                                                                                                 | Phase 09, with Phase 01 compatibility hooks.                                 |

## 11. Agent-ready Checklist

### Build gate

- [ ] `dpm build` succeeds from the Daml workspace and compiles P1.B07-P1.B24 modules across `pillar-core`, `pillar-assets`, `pillar-intents`, `pillar-ops`, and `pillar-token-adapter`.
- [ ] `dpm test` succeeds and includes P1.B10 fixture bootstrap; P1.B16 issue, P1.B17 redeem, P1.B18 transfer, P1.B19 settlement, P1.B13 hold lifecycle; P1.B20 trace; P1.B21 workflow task; P1.B24 adapter compatibility; P1.B25 negative scripts; and P1.B26 package upgrade compatibility.
- [ ] `tools/codegen/daml-codegen/generate.sh` produces Java + TS bindings from the built DARs including P1.B07-P1.B24 template/interface modules.
- [ ] Generated bindings are internal artifacts and are not treated as `/v1` public SDK models.

### Verify gate

- [ ] P1.B07-P1.B10 expose `daml/pillar-core/daml/Pillar/Core/TenantConfig.daml`, `AccountRef.daml`, `Common.daml`, and reusable fixture harness semantics with shared metadata/version fields.
- [ ] P1.B11-P1.B15 expose `daml/pillar-assets/daml/Pillar/Assets/AssetRules.daml`, `Holding.daml`, `Hold.daml`, `Restrictions.daml`, and `Versioning.daml` with policy, movement, lock, restriction, and registry-ready version behavior.
- [ ] P1.B16-P1.B19 expose `daml/pillar-intents/daml/Pillar/Intents/IssueIntent.daml`, `RedeemIntent.daml`, `TransferIntent.daml`, and `SettlementIntent.daml` lifecycle choices and state-machine scripts.
- [ ] P1.B20-P1.B21 expose `daml/pillar-ops/daml/Pillar/Ops/OperationTrace.daml` and `WorkflowTask.daml` and tests show trace/task visibility and authorization discipline.
- [ ] P1.B22-P1.B24 expose `daml/pillar-token-adapter/daml/Pillar/TokenStandard/HoldingI.daml`, `TransferI.daml`, and `Adapter.daml` as an adapter boundary without coupling the public API to CN Token Standard.
- [ ] P1.B25-P1.B26 Daml Script tests cover happy paths, invalid transfer, over-hold, unauthorized actor, invalid transition, and package upgrade compatibility.
- [ ] DAR artifacts have stable package name/version metadata, template family names, schema versions, migration refs, and pin epoch fields suitable for registry ingestion.

### Invariant gate

- [ ] Public API exposes no Canton contract-first fields.
- [ ] DB asset state is projection only.
- [ ] Every mutation path has stable operation trace metadata ready to link operation_id and command_id.
- [ ] Projection is rebuildable from ledger facts emitted by these templates.
- [ ] Deployment mode does not change `/v1` grammar.
