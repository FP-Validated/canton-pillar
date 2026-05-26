# Pillar Release Plan

## 1. Versioning model

| Surface                  | Version format                                                                                  | Pin owner               | Compatibility rule                                                                                         | Release artifact                                                  | Primary authority                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Public API               | Date-pinned `YYYY-MM-DD` selected by `Pillar-Version`, account default, or webhook endpoint pin | API contract owner      | Additive changes may reuse the current date-pinned version; breaking changes require a new date            | OpenAPI bundle, schemas, golden fixtures, changelog               | [Phase 02](./Phase_02_API_Contract.md), [REGRESSION_CONTRACT.md](./REGRESSION_CONTRACT.md)       |
| SDK                      | Semver package version pinned to one API date plus SDK patch level                              | SDK owner               | SDK minor tracks API minor/additive capability; SDK patch cannot change default API behavior               | Node/Python/Java packages, SDK manifest                           | [Phase 07](./Phase_07_SDK_CLI_Workbench.md)                                                      |
| CLI / Workbench snippets | Semver package/app version with default API date                                                | SDK/Workbench owner     | CLI/Workbench must expose explicit API version selection and never silently upgrade a breaking API version | CLI package, Workbench release notes                              | [Phase 07](./Phase_07_SDK_CLI_Workbench.md), [Phase_13](./Phase_13_Dashboard_Docs_Onboarding.md) |
| DAR / Daml package       | Semver DAR/package version plus Pillar `template_semver`                                        | Template registry owner | DAR patch cannot change public object grammar; DAR breaking requires registry choreography                 | Signed DAR, checksum, manifest, package IDs, template descriptors | [Phase 12](./Phase_12_Template_Registry_Versioning.md)                                           |
| Helm chart               | Semver chart version                                                                            | Release engineering     | Chart patch must be rollback-safe and preserve `/v1`; chart minor may add values/resources                 | OCI chart, provenance, values schema, rendered manifest snapshots | [Phase 09](./Phase_09_CICD_Helm_Deployment.md)                                                   |
| Container images         | Immutable digest plus semver-compatible tag                                                     | Release engineering     | Tags are convenience only; deploys pin digests                                                             | Signed images, SBOM, attestations                                 | [Phase 09](./Phase_09_CICD_Helm_Deployment.md)                                                   |
| Daml SDK                 | Exact Daml SDK version pin per Pillar release                                                   | Daml/platform owner     | Pin changes require Daml build, codegen, DAR, and participant compatibility proof                          | Toolchain lock, generated bindings, DAR manifest                  | [Phase 01](./Phase_01_Daml_Model.md), [Phase 12](./Phase_12_Template_Registry_Versioning.md)     |
| Compliance ruleset       | Ruleset semver plus effective date                                                              | Compliance owner        | Ruleset update may change decision outcomes only through audited policy rollout                            | Signed rules bundle, evidence mapping                             | [Phase 08](./Phase_08_Security_Compliance.md)                                                    |

| Rule                                      | Binding release behavior                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| API date is customer contract             | A shipped API date is supported as a stable customer contract and cannot receive breaking behavior under the same date. |
| SDK semver is delivery vehicle            | SDK semver communicates SDK package compatibility; the SDK default API date remains explicit in the SDK manifest.       |
| DAR version is runtime package contract   | DAR/package versions are internal runtime contracts; they must never leak into public `/v1` objects.                    |
| Helm chart version is deployment contract | Chart semver governs Kubernetes resources, values, hooks, and release mechanics, not public API grammar.                |
| Daml SDK pin is release-scoped            | Each release readiness packet records the exact Daml SDK pin used to build and validate DARs.                           |
| Immutable artifacts win over tags         | Images, DARs, charts, config bundles, and rulesets are promoted by digest/checksum/signature, not mutable tags.         |
| Deployment mode is not version mode       | `hosted`, `customer-validator`, and `self-hosted` share the same `/v1` contract; only wiring and responsibility differ. |

| Public version selector         | Applies to                                  | Default source                     | Override allowed                           | Breaking auto-upgrade allowed |
| ------------------------------- | ------------------------------------------- | ---------------------------------- | ------------------------------------------ | ----------------------------- |
| `Pillar-Version` request header | API request rendering and validation        | Account/environment default        | Yes, per request where supported           | No                            |
| Account default API version     | Requests without header                     | Config registry / account settings | Yes, by explicit customer upgrade workflow | No                            |
| Webhook endpoint API version    | Event payload shape for endpoint deliveries | Endpoint config at create/upgrade  | Yes, by endpoint upgrade workflow          | No                            |
| SDK default API version         | SDK-generated requests                      | SDK manifest                       | Yes, client option                         | No                            |
| Workbench selected API version  | API Explorer, snippets, test runs           | Environment profile                | Yes, operator selection                    | No                            |

| Release packet field | Required value                                                             |
| -------------------- | -------------------------------------------------------------------------- |
| `api_version`        | Date-pinned API contract exercised by OpenAPI, SDKs, tests, and changelog. |
| `sdk_versions`       | Node/Python/Java package versions and their default API date.              |
| `helm_chart_version` | Chart semver, OCI digest, provenance verification result.                  |
| `image_digests`      | Runtime service image digests and cosign verification result.              |
| `dar_versions`       | DAR semver, `template_semver`, package IDs, SHA-256, signer key ID.        |
| `daml_sdk_version`   | Exact Daml SDK pin and generated binding checksum.                         |
| `migration_range`    | Applied migration range and rollback classification.                       |
| `ruleset_version`    | Compliance ruleset semver, signer, effective date, evidence diff.          |
| `rollback_plan`      | Per-surface rollback path and stop conditions.                             |

## 2. Release types

| Release type              | Definition                                                            | Version effect                                                                              | Allowed changes                                                                                                                 | Explicitly forbidden                                                                        |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| API minor (additive)      | Backward-compatible expansion under current API date                  | Same `YYYY-MM-DD`; OpenAPI artifact revision increments                                     | New optional request fields, new response fields that old clients ignore, new endpoints, new enum values documented as additive | Removing fields, changing meanings, requiring new fields, changing idempotency semantics    |
| API breaking              | Contract change requiring customer opt-in                             | New `YYYY-MM-DD` API date                                                                   | Renamed/removed fields, changed validation, changed status/error grammar, breaking event payload shape                          | Automatic customer upgrade, mutation of old date behavior                                   |
| SDK patch                 | Bugfix for generated/wrapper SDKs                                     | SDK patch increments; default API date unchanged                                            | Type fixes, retry bugfixes, docs/snippet correction, packaging fix                                                              | New default API date, changed resource semantics, hidden retry of unsafe calls              |
| SDK minor                 | SDK support for API minor/additive capability                         | SDK minor increments; default API date may remain or advance only when non-breaking         | New resource helpers, additive models, new examples, generated types for additive API                                           | Breaking method rename/removal without major, silent API breaking upgrade                   |
| Helm chart                | Kubernetes deployment package release                                 | Chart semver increments                                                                     | Template fixes, values additions, hooks, resources, observability, mode wiring                                                  | Public API grammar change, unpinned images, raw secrets in values/logs                      |
| DAR patch                 | Daml package/template fix compatible with current template family     | DAR semver patch; same `template_semver` compatibility class unless registry says otherwise | Non-breaking template/runtime fixes, metadata corrections, package upload retry                                                 | Public API shape change, unsafe choice/signature change, bypassing registry ingest          |
| DAR breaking              | Runtime/template compatibility change requiring registry upgrade plan | DAR semver major/minor and/or new `template_semver`                                         | New template family/version, command mapping change, migration requiring dual-publish/cutover                                   | Direct participant upload outside registry, skipped compatibility checks                    |
| Hotfix                    | Urgent security/reliability fix for affected release surface          | Smallest required version increment                                                         | Targeted patch to API implementation, SDK, chart, image, DAR, ruleset                                                           | Scope bundling, unrelated feature work, weakening gates without incident commander approval |
| Compliance ruleset update | Signed policy/rules bundle update                                     | Ruleset semver and effective date                                                           | New sanctions/KYC/transfer rules, policy thresholds, evidence mapping                                                           | Unreviewed production activation, unaudited decision changes, public API grammar changes    |

| Release type              | Required owner approvals                                  | Minimum artifacts                                               | Required evidence                                                                            |
| ------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| API minor (additive)      | API contract, SDK, security if auth/data shape touched    | OpenAPI, schemas, golden fixtures, changelog, SDK matrix update | Contract diff shows additive-only; forbidden-internals scan clean; endpoint smoke green      |
| API breaking              | API contract, SDK, Workbench, security, customer success  | New OpenAPI date, migration guide, changelog, SDK release plan  | Old date golden fixtures unchanged; upgrade preview passes; no automatic upgrade path exists |
| SDK patch                 | SDK language owner                                        | Package tarball/wheel/JAR, manifest, checksum                   | Unit/integration sample passes against pinned API date                                       |
| SDK minor                 | SDK language owners, API contract                         | Packages for supported languages, snippets, docs metadata       | Generated API surface matches OpenAPI; common walkthrough passes in Node/Python/Java         |
| Helm chart                | Release engineering, SRE, security for secrets/network    | OCI chart, provenance, values schema, rendered snapshots        | `helm lint`, `helm template`, deploy smoke, rollback smoke                                   |
| DAR patch                 | Template registry, ledger-command, release engineering    | Signed DAR, checksum, registry descriptor, upload plan          | Registry ingest/signature/compatibility pass; command-builder lookup pass                    |
| DAR breaking              | Template registry, ledger-command, SRE, customer success  | Upgrade plan, signed DARs, compatibility matrix, rollback plan  | P12 choreography state evidence through stage/dual-publish/cutover gates                     |
| Hotfix                    | Incident commander, owning component, release engineering | Minimal patched artifact set                                    | Reproduction fixed, regression test added or documented evidence, rollback path verified     |
| Compliance ruleset update | Compliance, security, release engineering                 | Signed rules bundle, policy diff, evidence map                  | Decision diff reviewed; dry-run sample set; audit event emitted                              |

## 3. Release cadence

| Release type              | Cadence                                                                 | Window                                                                                    | Freeze rules                                                                                                        | Rollback policy                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API minor (additive)      | Monthly release train unless no additive surface is ready               | Standard weekday regional rollout window after staging soak                               | Freeze begins 5 business days before release; OpenAPI/schema/golden fixtures locked except blocker fixes            | Roll forward preferred if additive field/endpoint is faulty; disable endpoint/feature flag if available; never remove shipped field from same API date |
| API breaking              | Scheduled no more than quarterly unless required by regulation/security | Customer-noticed upgrade window; sandbox preview available before live                    | Design freeze 30 days before publish; customer notice freeze 45 days before default upgrade offer                   | Do not roll back old versions; pause new-version opt-ins and keep existing pinned customers on prior date                                              |
| SDK patch                 | On demand, usually bundled weekly                                       | Any low-risk package publish window after CI green                                        | Freeze only changed language package at release candidate cut                                                       | Yank/replace only if package registry permits and no customer install impact; otherwise publish newer patch                                            |
| SDK minor                 | Follows API minor release train                                         | Publish after API artifact is immutable and before customer changelog sends               | SDK generated surface freezes with OpenAPI freeze                                                                   | Publish corrective SDK patch/minor; do not change API date behavior in-place                                                                           |
| Helm chart                | Biweekly or tied to infra/runtime changes                               | Maintenance window per deployment mode; hosted first, then customer-validator/self-hosted | Chart values schema and migration hook freeze 5 business days before production                                     | `helm rollback` to previous chart and image digests when DB/DAR compatibility permits; otherwise use documented forward fix                            |
| DAR patch                 | Monthly or on demand for Daml/runtime defect                            | Registry-controlled package upload window                                                 | Registry descriptor and checksum freeze after signature; compatibility matrix must be current                       | Pause route, revert registry pin before new contracts exist; after new contracts exist, roll forward or dual-route per P12 rollback                    |
| DAR breaking              | Planned release train only                                              | Announce/stage/dual-publish/cutover/retire windows per tenant and participant             | Announcement freeze 30 days before stage; cutover freeze after compatibility sign-off                               | Follow P12 rollback: pause, pin revert if safe, unvet if needed, or corrected DAR roll-forward; never mutate ledger state from DB                      |
| Hotfix                    | On demand for incident/security/blocker                                 | Incident-controlled expedited window                                                      | Only affected artifact may change; unrelated work frozen                                                            | Roll back exact artifact if safe; otherwise forward hotfix with incident commander approval and evidence                                               |
| Compliance ruleset update | Monthly scheduled plus emergency regulatory updates                     | Policy effective-date window, preferably before business day start per jurisdiction       | Ruleset content freezes 3 business days before scheduled effective date; emergency freeze waived by compliance lead | Revert to previous signed ruleset only if lawful; otherwise publish corrective ruleset and preserve audit trail                                        |

| Freeze class        | Scope                                 | Allowed during freeze                                 | Blocked during freeze                                                     |
| ------------------- | ------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Contract freeze     | API, SDK, webhook/event schemas       | Blocker fixes that preserve published contract        | New endpoints, renamed fields, new required fields, enum behavior changes |
| Artifact freeze     | Images, chart, DAR, ruleset bundle    | Rebuild from same source only if provenance is broken | New commits, dependency upgrades, manifest changes                        |
| Cutover freeze      | Production rollout state              | Rollback, pause, incident mitigation                  | Feature rollout, tenant expansion, default version upgrades               |
| Error-budget freeze | Component exceeding budget thresholds | Reliability fixes, observability, rollback            | Risky deploys, non-critical releases, load-increasing changes             |

## 4. API version lifecycle

| Lifecycle state | Meaning                                                | Entry criteria                                                         | Customer behavior                                                                             | Exit criteria                                         |
| --------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Preview         | API date visible in sandbox/Workbench for testing only | OpenAPI candidate generated, additive/breaking classification complete | Customers may test explicitly; no live default                                                | Contract approved or abandoned                        |
| Current         | Recommended API date for new integrations              | Release-readiness gate passed; SDKs published                          | New accounts/environments default to this date unless customer policy overrides               | Superseded by later current date                      |
| Supported       | Non-current API date still maintained                  | Shipped to customers and within support window                         | Existing pinned customers keep exact behavior                                                 | Support window expires and notice complete            |
| Deprecated      | API date scheduled for retirement                      | Replacement exists; notice sent; migration guide published             | Requests continue to work; warnings in Workbench/support channels                             | Retirement date reached and exception review complete |
| Retired         | API date no longer accepted for normal traffic         | Minimum support and notice completed                                   | Requests are rejected with structured version error except approved legal/incident exceptions | N/A                                                   |

| Policy item                | Binding rule                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum support window     | Every public API date is supported for at least 18 months from first GA availability.                                                                      |
| Deprecation notice         | Customers receive at least 180 days notice before retirement of a GA API date.                                                                             |
| Breaking auto-upgrade      | Never allowed. Accounts, webhook endpoints, SDK defaults, and Workbench profiles are not automatically moved to a breaking API date.                       |
| Additive auto-availability | Additive endpoints/fields may become available under the same API date only when old clients remain compatible and golden fixtures prove no breaking diff. |
| Request override           | `Pillar-Version` may request a supported date per request where allowed; unsupported/retired dates return a structured version error.                      |
| Webhook endpoint pin       | Webhook endpoint payload version remains pinned until the customer explicitly upgrades that endpoint.                                                      |
| Account default upgrade    | Default API version changes require explicit customer action or contractually agreed managed upgrade; breaking defaults are never changed silently.        |
| SDK default                | SDK releases declare a default API date; upgrading SDK package does not silently upgrade a customer's configured API date if the customer pins one.        |
| Notice channels            | Changelog, Workbench, account contact, support ticket/advisory for regulated deployments, self-hosted release bundle metadata.                             |
| Emergency exception        | Security/legal emergency may block unsafe operations, but must preserve clear error grammar and cannot pretend to be a compatible API upgrade.             |

| Change class                                    | Requires new API date?                                     | Customer opt-in required? | Examples                                                           |
| ----------------------------------------------- | ---------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| Add optional response field                     | No                                                         | No                        | `balance.pending_reason` added with null/omitted-safe semantics    |
| Add endpoint                                    | No                                                         | No                        | New list endpoint with independent resource family                 |
| Add optional request parameter                  | No                                                         | No                        | `expand[]=latest_operation` where absence keeps old behavior       |
| Add enum value                                  | Usually no, if clients are documented to handle unknowns   | No                        | New terminal reason code in extensible field                       |
| Rename/remove field                             | Yes                                                        | Yes                       | `available` renamed to `available_amount`                          |
| Change default sort/order/pagination            | Yes                                                        | Yes                       | List endpoint changes cursor ordering semantics                    |
| Change idempotency identity                     | Yes and ADR required                                       | Yes                       | Request hash includes new required semantic input                  |
| Change webhook event payload shape incompatibly | Yes for endpoint pin                                       | Yes per endpoint          | `data.object` type renamed or required nested field changed        |
| Expose Canton internal identifiers publicly     | Not allowed without ADR and privileged/admin-only boundary | N/A                       | `packageId`, `templateId`, `commandId` in public customer response |

## 5. SDK release matrix

| API version                   | OpenAPI artifact                     | Node SDK                                  | Python SDK                                | Java SDK                                  | Publish order                                               | Default behavior                                                                      |
| ----------------------------- | ------------------------------------ | ----------------------------------------- | ----------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `2026-05-26`                  | `pillar-v1-2026-05-26.yaml`          | `@pillar/pillar-js 1.x`                   | `pillar-sdk 1.x`                          | `com.pillar:pillar-java 1.x`              | OpenAPI -> Node -> Python -> Java -> CLI/Workbench snippets | SDK constructors default to `2026-05-26` unless caller provides `apiVersion`          |
| Next additive under same date | Same API date, new artifact revision | SDK minor or patch based on surface       | SDK minor or patch                        | SDK minor or patch                        | OpenAPI diff -> generated SDKs -> common walkthrough        | Existing callers keep compatible behavior; new helpers are opt-in                     |
| New breaking date             | `pillar-v1-YYYY-MM-DD.yaml`          | New SDK minor/major release line decision | New SDK minor/major release line decision | New SDK minor/major release line decision | Preview SDKs -> sandbox tests -> GA SDKs -> docs migration  | Caller must explicitly select new API date or install/configure new default knowingly |

| Sequence step      | Node                                                                 | Python                                     | Java                                          | Gate                                                          |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------- |
| 1. Generate        | OpenAPI types/resources/webhook helpers                              | OpenAPI models/client/webhook helpers      | OpenAPI models/client/webhook helpers         | Generated output contains no Canton public types              |
| 2. Package         | npm package with manifest default API date                           | wheel/sdist with manifest default API date | Maven artifact with manifest default API date | Package metadata includes API date and SDK semver             |
| 3. Smoke           | Create/retrieve/list intent flow, webhook verify, idempotency option | Same common walkthrough                    | Same common walkthrough                       | Sandbox smoke passes against release API date                 |
| 4. Publish         | npm registry                                                         | PyPI/internal registry                     | Maven Central/internal registry               | Checksums/provenance recorded                                 |
| 5. Docs/snippets   | TypeScript examples                                                  | Python examples                            | Java examples                                 | Workbench/docs snippets match published package versions      |
| 6. Patch readiness | Patch branch/tag retained                                            | Patch branch/tag retained                  | Patch branch/tag retained                     | Hotfix can publish language-specific patch without API change |

| SDK compatibility rule  | Requirement                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Node/Python/Java parity | Any release supporting a new API date must publish all three supported SDKs or explicitly mark a language as blocked in release notes. |
| Webhook verifier        | Every SDK release includes HMAC-SHA256 verifier behavior compatible with endpoint-pinned payload versions.                             |
| Idempotency helper      | Mutating methods expose explicit idempotency key support and never hide unsafe retries.                                                |
| Version override        | Every SDK supports constructor/request-level API version override where the API supports `Pillar-Version`.                             |
| Canton invisibility     | Public SDK models must not expose `contractId`, `templateId`, `partyId`, `participantId`, `packageId`, `commandId`.                    |
| Patch scope             | SDK patch releases may fix client bugs but may not alter default API date or public resource semantics.                                |

## 6. Helm chart release

| Artifact                | Required for chart release                                                         | Signing/provenance                             | Storage                                  |
| ----------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| Helm chart package      | `pillar-platform-<version>.tgz`                                                    | Helm provenance plus registry signature        | OCI registry                             |
| Values schema           | `values.schema.json`                                                               | Included in chart digest                       | OCI chart layer / source tag             |
| Rendered manifests      | Mode-specific `helm template` snapshots                                            | Release evidence checksum                      | Release readiness packet                 |
| Container image digests | API, workflow, ledger-command, projection, webhook, reconciler, migrator, adapters | Cosign signatures and SBOM attestations        | OCI image registry                       |
| Migration image/job     | Migrator image digest and hook manifest                                            | Cosign + chart provenance                      | OCI registry                             |
| DAR upload job manifest | Registry-driven upload plan consumer                                               | Chart provenance plus DAR signature separately | OCI registry and P12 registry            |
| Observability resources | ServiceMonitor, rules, dashboards, alert routes                                    | Chart provenance                               | OCI registry / observability config repo |
| Network/security policy | NetworkPolicy, RBAC, PodSecurity, secret refs                                      | Chart provenance                               | OCI registry                             |
| Release metadata        | Chart, image, DAR, migration, config bundle digest map                             | Signed release manifest                        | Release registry                         |

| Helm release control | Policy                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OCI registry         | Charts are published to an OCI registry with immutable digest references; deploy automation pins digest, not mutable tags.                                         |
| Signing              | Chart provenance, container signatures, SBOM attestations, and release manifest signatures are mandatory before production promotion.                              |
| Mode parity          | `hosted`, `customer-validator`, and `self-hosted` values render the same `/v1` services and API grammar.                                                           |
| Secret handling      | Raw API keys, webhook secrets, participant JWTs, mTLS private keys, and vendor credentials must not appear in chart values, rendered manifests, logs, or examples. |
| Migration hook       | DB migrator runs as a pre-install/pre-upgrade hook and must complete before runtime pods accept work.                                                              |
| DAR hook             | DAR upload job is registry-driven and must verify expected package visibility before `ledger-command` readiness.                                                   |
| Rollback smoke       | Every chart release candidate runs deploy then rollback smoke in staging using previous chart/image digest set.                                                    |
| Drift detection      | Rendered manifests and live cluster resources are compared for release-owned objects before promotion.                                                             |

| Air-gapped / self-hosted mirror policy | Requirement                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundle contents                        | OCI chart, container images, signed release manifest, SBOMs, DARs, rulesets, checksums, public verification keys, Daml SDK/toolchain pin.         |
| Mirror target                          | Customer-controlled OCI registry and object store; installation uses mirrored digests only.                                                       |
| Verification offline                   | Customer can verify signatures, checksums, chart provenance, DAR signatures, and SBOM attestations without Pillar network access.                 |
| No hot-path dependency                 | Self-hosted transaction path must not depend on Pillar control plane for existing configured transactions.                                        |
| Update discovery                       | New release discovery may use offline media or signed sync channel; failure to sync must not mutate local runtime behavior.                       |
| Entitlement/license                    | Offline license or entitlement bundle is signed, versioned, and expiry-policy governed.                                                           |
| Mirror drift                           | Release tooling compares source manifest digests to mirrored registry digests before install/upgrade.                                             |
| Emergency revocation                   | Revocation advisory is shipped as signed metadata; local operator decides activation per legal/operational policy unless contract says otherwise. |

## 7. DAR release choreography

DAR lifecycle is governed by [Phase 12 — Template Registry, Versioning, and DAR Lifecycle](./Phase_12_Template_Registry_Versioning.md), especially `P12.N03` through `P12.N10`. Phase 09's chart job remains an executor; Phase 12 owns DAR policy, compatibility, state, and rollback.

| Choreography state | Purpose                                                                       | Required P12 ticket references             | Entry gate                                                            | Exit gate                                                               | Rollback posture                                                                                     |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Announce           | Record intended DAR/package/template change and affected tenants/participants | `P12.N03`, `P12.N04`, `P12.N07`            | DAR ingested, checksum/signature verified, metadata extracted         | Upgrade plan approved and target scope identified                       | Abandon plan; no participant/runtime effect                                                          |
| Stage              | Upload/vet package where required without routing new commands                | `P12.N06`, `P12.N08`                       | Registry upload manifest emitted; chart job ready                     | Compatibility records show uploaded/vetted/current package evidence     | Remove staged package/vetting where safe; keep old route active                                      |
| Dual-publish       | Old and new package versions coexist; canary routing possible                 | `P12.N05`, `P12.N07`, `P12.N08`            | Both package sets visible; command-builder can resolve explicit route | Canary operations and projection/webhook checks pass                    | Revert active pin/canary route if no unsafe new contracts; otherwise route old operations separately |
| Cutover            | New package becomes active default for eligible scope                         | `P12.N05`, `P12.N07`, `P12.N08`, `P12.N10` | Approval, compatibility matrix green, rollback point captured         | Registry active pin updated; command-builder lookup returns new package | Pause affected route; pin revert only if safe; otherwise corrected roll-forward                      |
| Retire             | Old package no longer used for new commands                                   | `P12.N07`, `P12.N08`, `P12.N10`            | No tenant active pin or required legacy routing remains               | Status set retired/revoked with audit and replay/restore evidence       | Unretire only if compatibility and ledger state permit; otherwise roll forward                       |

| DAR release invariant          | Enforcement                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Registry first                 | No production DAR is uploaded directly to participants outside registry ingest/signature/compatibility flow.                 |
| Public API stable              | DAR changes must not expose package/template/participant identifiers in public `/v1` responses or webhooks.                  |
| Command-builder fail-closed    | `services/ledger-command` refuses to submit when active binding is missing, retired, incompatible, or unverified.            |
| Compatibility matrix current   | Cutover blocks if any required participant/validator evidence is stale, missing, or incompatible.                            |
| Ledger remains source of truth | DAR rollback never edits projected DB state to correct economic state.                                                       |
| Self-hosted parity             | Offline bundles carry the same registry metadata and signatures; local registry state is authoritative for local deployment. |

## 8. Customer-facing changelog policy

| Changelog section              | Required content                                                                             | Forbidden content                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Summary                        | Customer-impacting change in plain operational language                                      | Internal code names as only explanation                               |
| API changes                    | API date, additive/breaking classification, affected endpoints, migration guidance           | Canton internals, package IDs, command IDs, participant topology      |
| SDK changes                    | Language versions, install commands, default API date, upgrade notes                         | Unverified package status, hidden behavior changes                    |
| Webhook changes                | Event types, endpoint API version behavior, replay/verification guidance                     | Secret values, raw delivery internals                                 |
| Deployment/self-hosted changes | Chart version, image digest manifest location, mirror instructions, required operator action | Mutable tags as install instruction                                   |
| DAR/runtime changes            | Customer-visible impact and operator action if self-hosted/customer-validator                | Public exposure of package/template IDs unless in admin-only appendix |
| Compliance changes             | Effective date, policy impact category, customer action                                      | Sensitive watchlist/vendor internals                                  |
| Known issues                   | Scope, mitigation, rollback/upgrade advice                                                   | Undocumented silent degradation                                       |

| Audience                       | Delivery channel                                                                    | Timing                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Hosted customers               | Changelog, Workbench notification, support advisory for breaking/deprecated changes | Before production rollout for material changes                             |
| Customer-validator customers   | Changelog plus validator/operator advisory                                          | Before stage/cutover windows requiring customer participant action         |
| Self-hosted customers          | Signed release bundle notes, operator runbook, mirror manifest                      | With release bundle and before recommended install window                  |
| SDK consumers                  | Package registry release notes and docs                                             | At package publish                                                         |
| Regulated/compliance customers | Formal advisory with evidence references                                            | Before effective date unless emergency law/security requires faster action |

| Changelog rule   | Requirement                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Breaking API     | Must include old behavior, new behavior, migration steps, support window, no-auto-upgrade statement. |
| Additive API     | Must identify whether SDK update is optional or recommended.                                         |
| Helm/self-hosted | Must include chart version, digest verification command reference, and air-gapped mirror notes.      |
| DAR              | Must state whether customer-validator/self-hosted operators must upload/vet/stage packages.          |
| Hotfix           | Must identify affected versions, severity, customer action, and whether rollback is recommended.     |

## 9. Internal release notes policy

| Internal section    | Required fields                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Release identity    | Release ID, release type, owner, approvers, artifact versions, commit/source refs.                       |
| Version matrix      | API date, SDK versions, chart version, image digests, DAR versions, Daml SDK pin, ruleset version.       |
| Diff summary        | Component-level diff, migrations, config changes, endpoint/schema changes, operational behavior changes. |
| Risk assessment     | Known risks, mitigations, error-budget state, customer impact blast radius.                              |
| Test evidence       | Build, contract, integration, e2e, chaos/perf where applicable, helm, DAR registry, SDK smoke.           |
| Regression contract | Applicable clauses from [REGRESSION_CONTRACT.md](./REGRESSION_CONTRACT.md) and pass/fail evidence.       |
| Rollback            | Exact rollback procedure, stop conditions, data compatibility, expected customer behavior.               |
| Deployment plan     | Environment order, canary scope, monitoring dashboards, alert gates, status page plan.                   |
| Customer comms      | Changelog link, notice recipients, self-hosted bundle notes, support macros.                             |
| Audit               | Approval timestamps, signer identities, artifact signature verification, exception approvals.            |

| Internal note rule      | Requirement                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Evidence over assertion | Every readiness claim links to command output, dashboard snapshot, release packet item, or signed artifact. |
| No orphan artifact      | Every artifact in deployment must be listed with digest/checksum and signer.                                |
| No unowned exception    | Any skipped gate needs named approver, expiration, compensating control, and follow-up ticket.              |
| Incident tie-in         | Hotfix notes link incident, reproduction, fix evidence, and post-incident action.                           |
| Searchability           | Notes include ticket IDs from §13 and component labels for later audit/search.                              |

## 10. Release-readiness gate

This gate mirrors the Phase 10 GA gate but applies to every incremental release. The release cannot promote while any applicable gate is red.

| Gate                | Applies to                                      | Required proof                                                                                           | Blocker examples                                                                                            |
| ------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Contract gate       | API, SDK, webhook, Workbench, changelog         | OpenAPI/schema/golden diff classified; forbidden-internals scan clean; API lifecycle decision recorded   | Breaking change under same API date; missing SDK matrix; webhook endpoint pin drift                         |
| Build gate          | All release types                               | Reproducible build from locked source; generated artifacts checked; signatures prepared                  | Unpinned dependency/toolchain, failed Daml build/codegen, missing Daml SDK pin                              |
| Test gate           | All changed components                          | Unit/integration/e2e smoke relevant to changed surface; SDK walkthroughs; chart smoke; DAR compatibility | Narrow test only for plumbing while behavior branch untested                                                |
| Invariant gate      | All public/runtime releases                     | IC-01..IC-10 applicability reviewed; affected clauses pass                                               | Public response exposes Canton internals; DB becomes asset authority; idempotency identity changes unsafely |
| Security gate       | Auth, secrets, webhooks, chart, ruleset, hotfix | Secret scan, signature verification, RBAC/scope review, webhook verifier unchanged or tested             | Raw secret in values/logs; unsigned artifact; weakened HMAC/timestamp behavior                              |
| Observability gate  | Runtime/chart/DAR/hotfix                        | Dashboards/alerts/runbooks updated; release metrics visible by version                                   | No rollback dashboard; missing alert route for changed component                                            |
| Deployment gate     | Helm, image, DAR, migrations                    | Staging deploy, migration hook, chart render/lint, rollback smoke, canary plan                           | Migration cannot roll back/forward safely; chart values break one deployment mode                           |
| Customer gate       | Customer-facing changes                         | Changelog, notice, support macro, self-hosted bundle notes                                               | Breaking API without notice; air-gapped instructions absent                                                 |
| Release packet gate | All production releases                         | Packet contains artifacts/evidence/decisions/rollback plan                                               | Missing image digest, DAR checksum, SDK version, rollback plan                                              |

| Release type              | Minimum incremental readiness checks                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| API minor (additive)      | Contract diff additive-only; golden fixtures; SDK generation check; changelog.                       |
| API breaking              | New API date; old date parity tests; migration guide; customer notice; SDK preview/GA plan.          |
| SDK patch                 | Language package smoke; pinned API date unchanged; package provenance.                               |
| SDK minor                 | Generated SDK parity; common walkthrough Node/Python/Java; docs snippets.                            |
| Helm chart                | `helm lint/template`, values schema, staging deploy, rollback smoke, signatures.                     |
| DAR patch                 | Registry ingest/signature, compatibility matrix, command-builder lookup, rollback classification.    |
| DAR breaking              | Full P12 choreography gates through intended state; customer/operator notice; rollback plan.         |
| Hotfix                    | Reproduction fixed, minimal diff, targeted regression, incident approval, rollback/forward fix plan. |
| Compliance ruleset update | Signed bundle, dry-run impact diff, compliance approval, audit event, effective-date plan.           |

## 11. Rollback policy per release type

| Release type              | Primary rollback                                              | Safe when                                                                                | Unsafe when                                                                                   | Fallback                                                                      |
| ------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| API minor (additive)      | Disable new endpoint/field producer or roll back serving code | No customer depends on new additive behavior or compatibility preserved                  | Removing shipped field would break clients under same API date                                | Keep field stable and publish corrective patch                                |
| API breaking              | Pause opt-in/default offer for new API date                   | Customers remain pinned to old date                                                      | Attempting to move opted-in customers back changes their selected contract unexpectedly       | Customer-specific downgrade only by explicit request and compatibility review |
| SDK patch                 | Publish newer patch; yank only if registry-safe and unused    | Package registry supports yank and install impact is controlled                          | Customers may have pinned bad patch or registry disallows safe removal                        | Publish superseding patch and advisory                                        |
| SDK minor                 | Publish corrective minor/patch                                | API behavior remains compatible                                                          | SDK generated wrong models for default API date in a way customers installed                  | Superseding release plus migration note                                       |
| Helm chart                | `helm rollback` to previous chart/image digests               | DB migration/DAR/config are backward-compatible or unused                                | Migration is non-reversible, new DAR contracts exist, or old image cannot read current config | Forward fix with runtime pause/read-only as needed                            |
| DAR patch                 | Registry pin revert and route pause                           | New package has not created incompatible live contracts or command routes can dual-route | Ledger contains new contract shapes old runtime cannot handle                                 | Corrected DAR roll-forward under P12 plan                                     |
| DAR breaking              | Pause route, dual-route old/new, or corrected roll-forward    | Cutover still in stage/dual-publish or no incompatible ledger state exists               | Retired package needed for live contract handling or old route cannot process new state       | P12 rollback/roll-forward decision with ledger-command paused                 |
| Hotfix                    | Revert exact artifact or forward hotfix                       | Revert restores prior safe state and does not reintroduce critical vulnerability         | Old version is vulnerable, corrupts data, or breaks ledger trace/idempotency                  | Forward fix and keep mitigation controls active                               |
| Compliance ruleset update | Revert to prior signed ruleset                                | Law/policy allows prior decision behavior and audit approves                             | Regulatory requirement makes old rules illegal/unsafe                                         | Corrective ruleset with effective-date/audit evidence                         |

| Rollback invariant         | Requirement                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No DB-as-ledger correction | Rollback never edits projection DB to manufacture asset ownership/balance truth.                                                                              |
| Idempotency preservation   | Rollback must preserve idempotency records, `operation_id`, stable `command_id`, and retry safety.                                                            |
| Webhook consistency        | Rollback must not reuse event IDs for different payloads; endpoint version pins remain honored.                                                               |
| Deployment parity          | Rollback cannot introduce deployment-mode-specific `/v1` grammar.                                                                                             |
| Evidence capture           | Before rollback, capture release version, affected scope, in-flight command count, projection lag, webhook backlog, and package/chart/image/ruleset versions. |
| Customer communication     | Customer-impacting rollback triggers status/changelog/support notice according to impact.                                                                     |

## 12. Coordination with customer-validator and self-hosted customers

| Deployment mode    | Release discovery                                          | Customer action                                                                                         | Pillar responsibility                                                          | Customer responsibility                                                                                   |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Hosted             | Pillar release registry and internal deployment plan       | Usually none except API version opt-in/breaking migration                                               | Operate chart/images/DARs/config, monitor, rollback, notify                    | Validate integration in sandbox and respond to notices                                                    |
| Customer-validator | Pillar release registry plus validator/operator advisory   | Participant/DAR upload/vetting windows, endpoint connectivity checks, customer approvals where required | Provide artifacts, upload manifests, compatibility expectations, support       | Maintain participant availability/auth material, approve windows, provide evidence when customer-operated |
| Self-hosted        | Signed release bundle, OCI/object mirror, offline advisory | Mirror artifacts, verify signatures, run upgrade/rollback, maintain local registry                      | Publish signed bundle, docs, checksums, compatibility matrix, support guidance | Operate cluster, data stores, participant, observability, DR, local registry, air-gapped mirror           |

| Coordination area     | Requirement                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API breaking          | Customer-validator and self-hosted customers receive same 180-day retirement notice and explicit opt-in path as hosted.                                           |
| Helm chart            | Self-hosted bundle includes chart provenance, values schema changes, migration notes, rollback limits, and rendered manifest diff guidance.                       |
| DAR                   | Customer-validator/self-hosted customers receive P12 upgrade plan state, upload/vetting expectations, compatibility matrix criteria, and rollback classification. |
| Air-gapped            | Release bundle is complete for offline verification/install: no fetch from Pillar registry is required during upgrade.                                            |
| Participant readiness | DAR and ledger-command cutovers require participant package visibility/vetting evidence before routing new commands.                                              |
| Support handoff       | Release notes identify which runbook is customer-operated versus Pillar-operated by deployment mode.                                                              |
| Status semantics      | Customer-facing status distinguishes Pillar control-plane issue from customer participant/self-hosted local issue where known.                                    |
| Emergency hotfix      | Self-hosted/customer-validator advisory includes affected versions, exploitability/impact, minimal artifact set, and verification steps.                          |

| Customer-validator/DAR cutover checklist                                 | Owner                                      |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| Share planned package/template change and cutover window                 | Pillar                                     |
| Verify customer participant Ledger API/package management reachability   | Customer + Pillar support                  |
| Execute registry-driven upload/vet plan or customer-approved equivalent  | Customer or Pillar per contract            |
| Confirm compatibility matrix current before dual-publish/cutover         | Pillar template registry owner             |
| Pause command route if participant evidence becomes stale during rollout | Pillar SRE / customer operator             |
| Capture post-cutover command/projection/webhook evidence                 | Pillar + customer operator for local stack |

| Self-hosted air-gapped install checklist                          | Requirement                |
| ----------------------------------------------------------------- | -------------------------- |
| Import OCI chart and images into local registry by digest         | Mandatory                  |
| Import signed DARs, rulesets, release manifest, verification keys | Mandatory                  |
| Verify manifest digests match local mirror                        | Mandatory                  |
| Run chart render/lint against local values                        | Mandatory                  |
| Run migration dry-run/backup check per local policy               | Mandatory                  |
| Run registry compatibility check against local participant        | Mandatory for DAR releases |
| Preserve rollback artifact set locally before cutover             | Mandatory                  |
| Record local release evidence for support/audit                   | Mandatory                  |

## 13. Release-related ticket map

| Area                      | Ticket(s)                                                                              | Release relevance                                                                                           | Artifact / gate              |
| ------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------- |
| API contract              | `P2.C01`, `P2.C02`, `P2.C03`                                                           | API versioned OpenAPI, schema, golden fixtures, forbidden-internals enforcement                             | Contract gate                |
| Idempotency               | `P3.D03`, `P3.D04`                                                                     | Idempotency replay/conflict and operation trace preserved across release                                    | Invariant gate               |
| Ledger command runtime    | `P4.F03`, `P4.F04`, `P4.F05`                                                           | Command identity, retry/dedup, completion correlation during release/rollback                               | Runtime gate                 |
| Projection/reconciliation | `P5.G05`, `P5.G06`, `P5.G07`                                                           | Event authority, rebuild, reconciliation evidence after deploy/DAR changes                                  | Observability/invariant gate |
| Webhooks                  | `P6.H01`, `P6.H02`, `P6.H03`, `P6.H04`, `P6.H05`                                       | Endpoint version pinning, signatures, delivery/replay compatibility                                         | Contract/security gate       |
| SDK/CLI                   | `P7.I01`, `P7.I02`, `P7.I03`, `P7.I04`, `P7.I05`, `P7.I06`                             | SDK generation, package publishing, CLI/Workbench version behavior                                          | SDK matrix gate              |
| Security/compliance       | `P8.K01`, `P8.K02`, `P8.K03`, `P8.K06`, `P8.K07`                                       | Keys, authz, audit, rotation, leakage checks for release artifacts                                          | Security gate                |
| Helm/release              | `P9.J01`, `P9.J02`, `P9.J03`, `P9.J04`, `P9.J05`, `P9.J06`, `P9.J07`, `P9.J08`         | Build artifacts, chart, images, secrets, deployment modes, DAR job, Terraform, promotion                    | Deployment gate              |
| GA hardening              | `P10.L01`, `P10.L02`, `P10.L03`, `P10.L04`, `P10.L05`, `P10.L06`, `P10.L07`, `P10.L08` | Chaos/perf/SLO/runbook/release-readiness proof                                                              | Release packet gate          |
| Search/export/reporting   | `P11.M01` through `P11.M10`                                                            | Reporting/export changes must preserve projection authority and release evidence                            | Data/export gate             |
| Template registry / DAR   | `P12.N01` through `P12.N10`                                                            | DAR ingest, signature, command-builder binding, Helm upload, choreography, compatibility, restore/telemetry | DAR gate                     |
| Dashboard/docs/onboarding | `P13.O01` through `P13.O10`                                                            | Customer-facing changelog, Workbench release notices, onboarding docs                                       | Customer gate                |
| Usage metering/billing    | `P14.Q01` through `P14.Q10`                                                            | Metering/billing release changes and customer-visible reports                                               | Billing/data gate            |

| Release type              | Primary ticket dependencies                                                 | Notes                                                           |
| ------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| API minor (additive)      | `P2.C01`, `P2.C02`, `P2.C03`, `P7.I01`, `P7.I02`, `P7.I03`, `P13.O*`        | SDK/docs/changelog must ship with contract evidence.            |
| API breaking              | `P2.C01`, `P2.C02`, `P2.C03`, `P7.I01`-`P7.I06`, `P13.O*`, `P10.L08`        | New API date, migration guide, support window, no auto-upgrade. |
| SDK patch/minor           | `P7.I01`, `P7.I02`, `P7.I03`, `P7.I04`, `P7.I05`, `P7.I06`                  | Language package releases must record pinned API date.          |
| Helm chart                | `P9.J01`-`P9.J08`, `P10.L01`, `P10.L05`, `P10.L08`                          | Chart/image/migration/rollback evidence required.               |
| DAR patch/breaking        | `P12.N03`, `P12.N04`, `P12.N05`, `P12.N06`, `P12.N07`, `P12.N08`, `P12.N10` | P12 choreography is binding; P9.J06 is executor only.           |
| Hotfix                    | Owning component ticket plus `P10.L08` and affected regression clauses      | Scope must remain minimal and evidence-backed.                  |
| Compliance ruleset update | `P8.K03`, `P8.K06`, `P8.K07`, related compliance adapter tickets            | Signed ruleset, decision diff, audit evidence mandatory.        |

| Release evidence path                    | Contents                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `release-readiness/<version>/artifacts/` | DAR checksums, image digests, chart version, SDK/CLI versions, Daml SDK pin, ruleset version.                  |
| `release-readiness/<version>/evidence/`  | Contract diffs, test results, chaos/perf where applicable, dashboard links, alert route tests, runbook review. |
| `release-readiness/<version>/decisions/` | Scope freeze, known risks, rollback plan, exception approvals, customer notice plan.                           |
