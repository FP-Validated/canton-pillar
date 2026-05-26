# Phase 13 — Dashboard, Docs, and Customer Onboarding

> Ship Pillar's customer-facing product surfaces: the customer dashboard, the public documentation site, and the guided onboarding path from tenant creation to first successful sandbox transfer.

## 1. Executive Summary

Phase 13 closes the gap between Pillar's internal/developer tools and the product surfaces customers use every day.

| Surface             | Mission                                                                                                 | Primary path                            | Canonical owner     |
| ------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------- |
| Customer dashboard  | Day-to-day operational UI for accounts, keys, balances, activity, events, webhooks, and billing summary | `apps/dashboard`                        | Product UI          |
| Public docs site    | API, SDK, guides, changelog, and versioned reference generated from the canonical contract              | `apps/docs`                             | Developer education |
| Customer onboarding | Guided first-run workflow for tenant, KYB, party mapping, sandbox, first key, and first transfer        | `services/onboarding`, `apps/dashboard` | Activation runtime  |

The customer dashboard is not the Workbench. Workbench remains the admin/developer operations console from [16 Pillar Workbench UX](../Architecture/16_Pillar%20Workbench%20UX.md): API explorer, ledger trace, webhook inspector, request replay, projection health, and support-grade diagnostics. Dashboard is the customer account console: useful, safe, and Canton-invisible by default.

The docs site is the public integration contract. It renders `packages/api-contracts/openapi/pillar-v1.yaml`, SDK reference material, handwritten guides, examples, and changelog entries. Its output must be reproducible in CI and version-aware so customers can pin docs to the same API version as SDKs, webhook endpoints, and dashboard request flows.

Onboarding orchestrates activation. It creates or attaches a tenant, collects KYB state through the Phase 08 compliance path, maps the initial account/party abstraction, provisions sandbox resources, creates the first restricted API key, and drives the first transfer test without exposing Canton participant, party, package, template, contract, command, or offset internals.

Phase 13 enforces these mission invariants directly:

| README invariant                                                                       | Phase 13 enforcement                                                                                                               |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1. Canton Ledger is the single economic source of truth                                | Dashboard reads balances/activity from `/v1` projection responses only; onboarding first transfer proves ledger-backed completion. |
| 2. Pillar DB stores only Projection / Audit / Config                                   | Onboarding stores tenant workflow state as config/audit state, not asset state.                                                    |
| 3. Public `/v1` API never exposes Canton internals                                     | Dashboard, docs examples, onboarding responses, and public guides are forbidden from showing Canton raw identifiers.               |
| 4. Every mutation goes through `intent -> operation -> command_id -> update_id/offset` | Onboarding first transfer uses normal `/v1` intent flow; dashboard does not shortcut writes.                                       |
| 6. Events are emitted from projected ledger state                                      | Dashboard recent activity and onboarding completion events consume event projections.                                              |
| 7. Webhooks are signed, versioned, retried, replayable                                 | Dashboard webhook-health panels render Phase 06 delivery state and docs teach signature verification.                              |
| 8. `deploymentMode` changes infrastructure wiring only                                 | Dashboard/docs/onboarding behavior is identical for `hosted`, `customer-validator`, and `self-hosted`.                             |
| 10. Projection must be rebuildable from Canton Ledger / PQS                            | Dashboard degraded-state copy and tests treat projections as rebuildable read models.                                              |

Phase 13 satisfies these regression clauses from [REGRESSION_CONTRACT.md §2](./REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable):

| Clause | Phase 13 obligation                                                                |
| ------ | ---------------------------------------------------------------------------------- |
| IC-01  | No customer UI turns DB rows into economic authority.                              |
| IC-02  | Onboarding state is config/audit workflow state only.                              |
| IC-03  | Public docs examples and dashboard JSON panes pass forbidden-substring scans.      |
| IC-04  | Onboarding first transfer traces through the normal mutation spine.                |
| IC-06  | Dashboard activity and webhook-health panels render projected events only.         |
| IC-07  | Docs and dashboard use webhook endpoint version/signature semantics from Phase 06. |
| IC-08  | UI behavior does not fork by deployment mode.                                      |
| IC-10  | Projection freshness and degraded-read messaging are visible in dashboard panels.  |

Primary architecture sources:

| Source                                                                  | Phase 13 dependency                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [15 SDK Design](../Architecture/15_SDK%20Design.md)                     | OpenAPI-driven docs, SDK reference, snippets, version pinning, webhook verification guides |
| [16 Pillar Workbench UX](../Architecture/16_Pillar%20Workbench%20UX.md) | Workbench/dashboard split, public API-only UI execution, Canton-invisible UX               |
| [19 Compliance](../Architecture/19_Compliance.md)                       | KYB, policy decision evidence, compliance adapter, evidence file references                |
| [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)   | `apps/dashboard`, `apps/docs`, service boundaries, public `/v1`, DB responsibilities       |

## 2. Goals / Non-goals

### Goals

| Goal                      | Concrete Phase 13 output                                                                                   | Source                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Customer dashboard MVP    | Next.js app with overview, balances, recent activity, webhook health, API keys, and billing summary panels | [16 Workbench UX](../Architecture/16_Pillar%20Workbench%20UX.md)          |
| Dashboard/Workbench split | Dashboard is customer account UI; Workbench remains admin/developer operations console                     | [16 Workbench UX](../Architecture/16_Pillar%20Workbench%20UX.md)          |
| Customer SSO              | OIDC login/session flow gated by Phase 08 security controls                                                | [19 Compliance](../Architecture/19_Compliance.md)                         |
| Safe API proxy            | SSR/API route proxy calls `/v1` with tenant-scoped session context and no browser secret keys              | [15 SDK Design](../Architecture/15_SDK%20Design.md)                       |
| Docs site generation      | Static site generated from OpenAPI, Markdown guides, SDK docs, changelog, and examples                     | [15 SDK Design](../Architecture/15_SDK%20Design.md)                       |
| OpenAPI-to-docs pipeline  | CI job fails when rendered reference diverges from `packages/api-contracts/openapi/pillar-v1.yaml`         | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)     |
| Versioned docs UX         | API version selector aligns reference, changelog, examples, and SDK pinning notes                          | [15 SDK Design](../Architecture/15_SDK%20Design.md)                       |
| Onboarding wizard         | UI steps for organization, KYB, sandbox, first key, webhook test, and first transfer                       | [19 Compliance](../Architecture/19_Compliance.md)                         |
| Onboarding service        | TypeScript service orchestrates tenant config, KYB, sandbox, first key, and first transfer checks          | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)     |
| Activation event          | Onboarding emits `onboarding.completed` only after ledger-backed first transfer completion is observed     | [10 Event / Webhook System](../Architecture/10_Event_Webhook%20System.md) |

### Non-goals

| Non-goal                                     | Reason                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Re-implement Workbench                       | Workbench already owns API Explorer, ledger trace, webhook inspector, request replay, and projection health.              |
| Expose Canton internals                      | Dashboard, docs, and onboarding must preserve developer-friendly, Canton-invisible public grammar.                               |
| Host customer marketing site                 | Phase 13 builds product docs, dashboard, and onboarding, not homepage/SEO/marketing CMS.                                  |
| Build a billing ledger                       | Dashboard billing summary consumes Phase 14 usage/billing APIs once available; it does not create billing economic state. |
| Add new balance/holding/event resources      | Dashboard consumes existing `/v1` resources.                                                                              |
| Create a second docs contract                | OpenAPI remains canonical; docs are rendered artifacts.                                                                   |
| Auto-approve KYB                             | Onboarding can collect and poll status but compliance decisions remain Phase 08/vendor owned.                             |
| Auto-issue full-scope keys                   | First key is restricted and scoped to sandbox/onboarding flows.                                                           |
| Embed customer private keys in browser state | Dashboard SSR proxy and session context mediate privileged operations.                                                    |
| Fork behavior by deployment mode             | `hosted`, `customer-validator`, and `self-hosted` differ in wiring, not customer UX or `/v1` semantics.                   |

### Entry prerequisites

| Prerequisite        | Required state                                                                    |
| ------------------- | --------------------------------------------------------------------------------- |
| API contract        | P2 schemas, errors, versioning, account/asset routes available.                   |
| DB config/audit     | P3 config, audit, idempotency, operation trace, event/webhook tables available.   |
| Projection          | P5 balance, holding, event, operation projections available.                      |
| Webhooks            | P6 endpoint, delivery, replay, and event routes available.                        |
| SDK/Workbench       | P7 generated SDKs and Workbench links available for docs/deep-link parity.        |
| Security/compliance | P8 API keys, audit enrichment, compliance adapter, evidence references available. |
| Deployment          | P9 Helm/CI/CD can package apps and services.                                      |

## 3. Architecture

Phase 13 adds customer-facing web and activation surfaces without changing Pillar's economic source of truth.

```text
Customer user
  |
  v
apps/dashboard (Next.js)
  - OIDC session
  - SSR data fetching
  - scoped API proxy
  - dashboard panels
  - onboarding wizard
  |
  v
Pillar /v1 API
  - accounts
  - balances
  - events
  - webhook endpoints
  - API keys
  - billing summary when Phase 14 is present
  - onboarding admin endpoints
  |
  +--> services/onboarding
  |      - tenant workflow state
  |      - KYB orchestration
  |      - sandbox provisioning
  |      - first key delivery
  |      - first transfer verification
  |
  +--> services/compliance-adapter
  +--> services/webhook-dispatcher
  +--> services/projection-worker
  +--> Canton Ledger / Daml runtime

apps/docs (Astro or Docusaurus static site)
  - OpenAPI reference
  - SDK docs
  - handwritten guides
  - changelog
  - version selector
  - CDN/static hosting
```

### 3.1 Dashboard product boundary

| Dashboard owns                                      | Dashboard must not own                         |
| --------------------------------------------------- | ---------------------------------------------- |
| Customer account overview                           | Ledger trace graph                             |
| Balances and recent activity read views             | Raw command/submission/update identity         |
| Webhook health summary                              | Full webhook inspector/replay operator console |
| API key create/list/revoke for scoped customer keys | Root/admin key material or pepper management   |
| Billing summary and usage status                    | Invoice ledger or usage metering correctness   |
| Onboarding wizard shell                             | Compliance final decision logic                |
| Customer help links and docs deep-links             | Public docs source of authority                |

Dashboard is intentionally narrower than Workbench:

| Surface   | Audience                                  | Default data                         | Privileged operations                               | Canton visibility         |
| --------- | ----------------------------------------- | ------------------------------------ | --------------------------------------------------- | ------------------------- |
| Dashboard | Customer operators, finance, developers   | `/v1` customer objects and summaries | API key lifecycle, webhook config, onboarding steps | None                      |
| Workbench | Developers, support, SRE, admin operators | `/v1` plus trace/support views       | API explorer, replay, ledger trace, diagnostics     | Admin-only trace metadata |
| Docs      | Public developers                         | Generated contract and guides        | None                                                | None                      |

### 3.2 Dashboard runtime

| Layer         | Decision                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js under `apps/dashboard`.                                                                             |
| Rendering     | SSR for authenticated pages, static shell where safe, route-level cache disabled for tenant-sensitive data. |
| API access    | Server-side proxy uses session principal and tenant context; browser never sees secret API keys.            |
| Auth          | OIDC login and session handling gated by P8 controls.                                                       |
| Data fetching | `/v1` only; no direct DB, Canton, participant, or internal service calls from UI components.                |
| Environment   | Project/environment selector mirrors `/v1` environment semantics and `livemode`, not deployment topology.   |
| Error model   | Public error envelope with `request_id`, customer-safe code, and docs link.                                 |
| Degraded mode | Shows projection lag and read degradation without allowing unsafe writes.                                   |

### 3.3 Docs site runtime

| Layer               | Decision                                                                  |
| ------------------- | ------------------------------------------------------------------------- |
| Framework           | Astro or Docusaurus static site under `apps/docs`.                        |
| API reference input | `packages/api-contracts/openapi/pillar-v1.yaml`.                          |
| Guide input         | Markdown under `apps/docs/guides`.                                        |
| SDK reference input | Generated/handwritten SDK docs from Phase 07 package metadata.            |
| Changelog input     | Versioned changelog entries under `apps/docs/changelog`.                  |
| Output              | Static artifact deployable to CDN or Helm-served static container.        |
| CI gate             | Build fails when OpenAPI rendering, examples, or version manifests drift. |
| Public auth         | None. Docs are public and must contain no secrets.                        |

### 3.4 Onboarding runtime

`services/onboarding` is a TypeScript orchestration service. It does not perform ledger commands directly. It calls the same public/internal API boundaries that normal product flows use.

```text
POST /v1/onboarding/sessions
  -> create onb_* session
  -> attach tenant and environment context
  -> persist onboarding_state in config/audit table

POST /v1/onboarding/sessions/{id}/steps/kyb
  -> create compliance adapter case
  -> store evidence references via P8.K05 pattern
  -> mark requires_action or pending_review

POST /v1/onboarding/sessions/{id}/steps/sandbox
  -> provision sandbox project/environment through existing config APIs
  -> create restricted API key via P8.K01

POST /v1/onboarding/sessions/{id}/steps/first_transfer
  -> create normal transfer intent through /v1
  -> wait/poll/observe projected completion
  -> emit onboarding.completed event after ledger-backed success
```

### 3.5 Deployment modes

| Mode                 | Dashboard/docs/onboarding behavior                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `hosted`             | Pillar hosts dashboard, docs CDN, and onboarding service; OIDC issuer is Pillar-managed or customer federation.                          |
| `customer-validator` | Same dashboard/docs/onboarding UX; participant wiring points to customer validator behind existing runtime.                              |
| `self-hosted`        | Helm packages dashboard, docs static server, and onboarding service; customer config supplies OIDC, CDN/ingress, KYB vendor credentials. |

No mode may change `/v1` path grammar, object fields, onboarding response shape, docs examples, SDK method names, or dashboard panel semantics.

## 4. API / Object Model

Dashboard consumes existing `/v1` resources only. It does not create new balance, holding, event, webhook, key, billing, or ledger trace resources.

| Dashboard panel | Source resource                                                 | Rule                                                     |
| --------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| Overview        | `/v1/accounts`, `/v1/balances`, `/v1/events`                    | Read-only projection summaries.                          |
| Balances        | `/v1/balances`, `/v1/holdings`                                  | Show projection freshness and customer-safe stale state. |
| Recent activity | `/v1/events`                                                    | Projected event timeline only.                           |
| Webhook health  | `/v1/webhook_endpoints`, `/v1/events` replay/delivery summaries | No secrets after create/rotate.                          |
| API keys        | `/v1/api_keys`                                                  | Secret reveal once; list omits secret.                   |
| Billing summary | Phase 14 usage/billing endpoints                                | Display-only until Phase 14 is present.                  |

Docs site has no runtime object model. It is a build artifact derived from canonical inputs:

| Artifact      | Canonical input                                                      | Public output                |
| ------------- | -------------------------------------------------------------------- | ---------------------------- |
| API reference | `packages/api-contracts/openapi/pillar-v1.yaml`                      | Versioned endpoint reference |
| Schemas       | `packages/api-contracts/schemas/`                                    | Object reference pages       |
| Examples      | `packages/api-contracts/examples/`, `packages/api-contracts/golden/` | Request/response snippets    |
| SDK docs      | Phase 07 SDK package metadata                                        | Language reference pages     |
| Changelog     | `apps/docs/changelog`                                                | Version timeline             |

Onboarding adds admin-scoped `/v1/onboarding/*` endpoints. These endpoints are not Canton resources. They represent activation workflow state.

| Object                 | Prefix                               | Source of truth               | Public exposure                           |
| ---------------------- | ------------------------------------ | ----------------------------- | ----------------------------------------- |
| Onboarding session     | `onb_`                               | Config/audit workflow state   | Admin-scoped `/v1/onboarding/sessions`    |
| Onboarding step        | embedded                             | Config/audit workflow state   | Session response `steps[]`                |
| KYB evidence reference | `file_` or existing evidence file ID | P8 evidence storage reference | Linked, not embedded bytes                |
| First key              | `ak_`                                | P8 API key lifecycle          | Secret returned once during delivery step |
| Completion event       | `evt_`                               | Projected event outbox        | `onboarding.completed` event              |

### 4.1 Onboarding endpoints

| Endpoint                                            | Method | Purpose                                | Idempotency  | Deps                   |
| --------------------------------------------------- | ------ | -------------------------------------- | ------------ | ---------------------- |
| `/v1/onboarding/sessions`                           | POST   | Create or resume activation workflow   | Required     | P2.C04, P3.D03         |
| `/v1/onboarding/sessions/{id}`                      | GET    | Retrieve session state                 | Not required | P2.C02                 |
| `/v1/onboarding/sessions/{id}/steps/organization`   | POST   | Capture tenant/org basics              | Required     | P3.D01                 |
| `/v1/onboarding/sessions/{id}/steps/kyb`            | POST   | Submit KYB facts/evidence refs         | Required     | P8.K04, P8.K05         |
| `/v1/onboarding/sessions/{id}/steps/sandbox`        | POST   | Provision sandbox config               | Required     | P9.J01                 |
| `/v1/onboarding/sessions/{id}/steps/api_key`        | POST   | Create restricted first key            | Required     | P8.K01                 |
| `/v1/onboarding/sessions/{id}/steps/webhook`        | POST   | Register/test initial webhook endpoint | Required     | P6.H01, P6.H03         |
| `/v1/onboarding/sessions/{id}/steps/first_transfer` | POST   | Drive first sandbox transfer           | Required     | P4.E06, P5.G05, P6.H03 |
| `/v1/onboarding/sessions/{id}/complete`             | POST   | Mark completion after all gates pass   | Required     | P13.O13                |

### 4.2 Onboarding session shape

```json
{
  "id": "onb_01J...",
  "object": "onboarding_session",
  "created": 1770000000,
  "updated": 1770000100,
  "livemode": false,
  "metadata": {},
  "tenant": "tn_01J...",
  "environment": "env_01J...",
  "status": "requires_action",
  "current_step": "kyb",
  "steps": [
    {
      "name": "organization",
      "status": "succeeded"
    },
    {
      "name": "kyb",
      "status": "requires_action",
      "required_action": "submit_beneficial_owner_evidence"
    }
  ],
  "next_action": {
    "type": "dashboard_redirect",
    "url": "/onboarding/kyb"
  }
}
```

Allowed statuses:

| Status            | Meaning                                                |
| ----------------- | ------------------------------------------------------ |
| `not_started`     | Session exists but no durable step has completed.      |
| `requires_action` | Customer must provide data, evidence, or approval.     |
| `pending_review`  | KYB/vendor/compliance or provisioning is asynchronous. |
| `processing`      | Pillar is executing a step.                            |
| `succeeded`       | Step/session completed.                                |
| `failed`          | Non-retryable failure occurred.                        |
| `canceled`        | Customer or admin canceled the session.                |

Forbidden in onboarding responses and docs examples: `contractId`, `templateId`, `partyId`, `participantId`, `packageId`, `commandId`, `submissionId`, `updateId`.

## 5. Internal Runtime

### 5.1 Dashboard runtime

| Component         | Path                                            | Responsibility                                                      |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| Next.js app shell | `apps/dashboard/src/app`                        | authenticated routes, navigation, dashboard layout                  |
| Auth/session      | `apps/dashboard/src/auth`                       | OIDC login, callback, logout, session refresh, CSRF protection      |
| API proxy         | `apps/dashboard/src/server/pillar-api-proxy.ts` | tenant-scoped `/v1` calls using server credentials/session mapping  |
| Data loaders      | `apps/dashboard/src/server/loaders`             | typed loaders for balances, events, webhooks, keys, billing summary |
| Components        | `apps/dashboard/src/components`                 | panels and tables with no direct fetch side effects                 |
| E2E tests         | `apps/dashboard/test/e2e`                       | dashboard smoke and onboarding wizard scenarios                     |

Dashboard deployment options:

| Option                    | Use case                                       | Constraints                                                      |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| Helm-hosted Next.js       | self-hosted and customer-validator deployments | Must use same `/v1` grammar and OIDC contract.                   |
| Vercel/static edge option | hosted SaaS dashboard                          | Must keep server-side API proxy and secret isolation.            |
| Static export             | docs-like public pages only                    | Authenticated dashboard pages cannot rely on pure static export. |

### 5.2 Docs runtime

| Component          | Path                                                       | Responsibility                                  |
| ------------------ | ---------------------------------------------------------- | ----------------------------------------------- |
| Static site        | `apps/docs`                                                | Astro/Docusaurus app and content routing        |
| OpenAPI renderer   | `apps/docs/src/openapi`                                    | Converts canonical OpenAPI into reference pages |
| Guide content      | `apps/docs/guides`                                         | Handwritten tutorials and integration paths     |
| SDK docs embed     | `apps/docs/src/sdk`                                        | Pulls generated SDK reference metadata          |
| Changelog renderer | `apps/docs/src/changelog`                                  | Renders versioned changelog entries             |
| Versioning UI      | `apps/docs/src/versioning`                                 | API version selector and manifest routing       |
| CI pipeline        | `.github/workflows/docs.yml` or release workflow extension | Builds docs and checks drift                    |

Docs deployment options:

| Option              | Use case           | Constraints                                                |
| ------------------- | ------------------ | ---------------------------------------------------------- |
| CDN static artifact | public hosted docs | No auth, no secrets, immutable versioned assets.           |
| Helm static server  | self-hosted docs   | Same build artifact served from chart.                     |
| Preview deploy      | docs PR review     | Must pin generated OpenAPI artifact and changelog version. |

### 5.3 Onboarding service runtime

| Component             | Path                                                 | Responsibility                                                    |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| Service entrypoint    | `services/onboarding/src/server.ts`                  | HTTP/internal worker entrypoint                                   |
| Session store         | `services/onboarding/src/store`                      | `onboarding_state` read/write in config/audit schema              |
| Step engine           | `services/onboarding/src/steps`                      | deterministic step transitions and retry guards                   |
| Compliance client     | `services/onboarding/src/integrations/compliance.ts` | Phase 08 compliance adapter calls                                 |
| Sandbox provisioner   | `services/onboarding/src/integrations/sandbox.ts`    | project/environment/test fixture setup                            |
| API key deliverer     | `services/onboarding/src/steps/api-key.ts`           | restricted first key creation and one-time delivery envelope      |
| First transfer runner | `services/onboarding/src/steps/first-transfer.ts`    | uses normal `/v1` transfer intent path and projection observation |
| Event publisher       | `services/onboarding/src/events`                     | emits onboarding events through Phase 06 outbox semantics         |

The onboarding service consumes Phase 08 hooks:

| Hook                               | Phase 13 use                                                          |
| ---------------------------------- | --------------------------------------------------------------------- |
| P8.K01 API key lifecycle           | create restricted first key and verify list/revoke behavior in wizard |
| P8.K03 audit enrichment            | store who performed onboarding step and decision evidence             |
| P8.K04 compliance adapter          | start/poll KYB decision flow                                          |
| P8.K05 evidence storage references | attach KYB evidence references without storing blob bytes             |
| P8.K06 secret rotation             | ensure onboarding-delivered credentials follow rotation policy        |
| P8.K07 pen-test checklist          | run dashboard/docs/onboarding leakage and auth checks                 |

## 6. DB Schema

Phase 13 should prefer extending `0010_config` rather than adding a new migration range. Onboarding state is configuration/workflow state scoped to tenant/environment. It is not economic state and must never become balance, holding, or transfer authority.

### 6.1 Preferred migration approach

| Migration                                     | Change                                                                          | Reason                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/db/migrations/0010_config`          | Add `onboarding_state` table or JSONB column associated with tenant/environment | Keeps activation state with tenant config and avoids range sprawl. |
| `packages/db/migrations/0020_audit`           | Reuse existing audit/request tables for step execution evidence                 | Onboarding actions are privileged workflow mutations.              |
| `packages/db/migrations/0060_events_webhooks` | Reuse event outbox for onboarding events                                        | Avoids a parallel event system.                                    |
| `packages/db/migrations/0082_evidence_files`  | Reuse evidence references                                                       | KYB evidence must follow P8.K05 pattern.                           |

No new migration range is allocated for Phase 13 unless the implementation proves `0010_config` cannot express tenant-scoped onboarding state without violating existing migration boundaries. If a new range becomes necessary, it must be added to the registry before implementation; this phase does not reserve one.

### 6.2 Candidate `onboarding_state` table

| Column                     | Type                 | Rule                                                                                                        |
| -------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`                       | text                 | Public `onb_*` session ID.                                                                                  |
| `tenant_id`                | text                 | Tenant scoped; indexed.                                                                                     |
| `environment_id`           | text                 | Sandbox/test/live environment context.                                                                      |
| `status`                   | text                 | One of `not_started`, `requires_action`, `pending_review`, `processing`, `succeeded`, `failed`, `canceled`. |
| `current_step`             | text                 | Current customer-actionable step.                                                                           |
| `step_state`               | jsonb                | Customer-safe step state; no raw secrets, no blob bytes, no Canton internals.                               |
| `kyb_decision_id`          | text nullable        | Reference to compliance decision/audit row.                                                                 |
| `evidence_file_ids`        | text[]               | References only; no evidence blob.                                                                          |
| `first_api_key_id`         | text nullable        | `ak_*`; never raw secret.                                                                                   |
| `first_transfer_intent_id` | text nullable        | Public intent ID.                                                                                           |
| `completion_event_id`      | text nullable        | `evt_*` once emitted.                                                                                       |
| `created_at`               | timestamptz          | Audit timestamp.                                                                                            |
| `updated_at`               | timestamptz          | Audit timestamp.                                                                                            |
| `completed_at`             | timestamptz nullable | Set only after completion gates pass.                                                                       |

### 6.3 Data minimization rules

| Data class           | Storage rule                                                                         |
| -------------------- | ------------------------------------------------------------------------------------ |
| Raw KYB documents    | Object storage only; DB stores evidence reference and hash per P8.K05.               |
| API key secret       | Returned once through P8.K01 creation response; never persisted in onboarding state. |
| OIDC tokens          | Session store only; not copied into onboarding state.                                |
| Canton internals     | Not stored in onboarding state or exposed through onboarding API.                    |
| First transfer proof | Store public intent/event IDs and audit refs, not raw command/update identifiers.    |

## 7. Failure Modes

| Failure mode                                                | Customer symptom                                               | Detection                                              | Mitigation                                                                    | Owner   |
| ----------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- | ------- |
| Dashboard auth flow drifts from Workbench/security controls | Customer can log into one UI but not another, or scopes differ | OIDC integration tests and session claim comparison    | Centralize OIDC config and shared auth policy package                         | P13.O05 |
| Dashboard bypasses `/v1` and reads DB/internal service      | UI shows fields not in public contract or leaks internals      | forbidden-import lint and e2e response scan            | API proxy permits `/v1` only                                                  | P13.O01 |
| Dashboard shows stale balance as final truth                | Customer relies on stale projection for asset movement         | projection freshness panel and stale-state tests       | label stale/degraded states and block unsafe write shortcuts                  | P13.O02 |
| Docs site OpenAPI version mismatch                          | Docs show endpoint/schema not in shipped API                   | docs CI compares rendered manifest to OpenAPI checksum | fail build and publish only immutable versioned docs                          | P13.O06 |
| Docs examples leak Canton internals                         | Public docs expose raw contract/party/command identifiers      | forbidden-substring scan over docs artifact            | block CI, regenerate examples from public golden fixtures                     | P13.O06 |
| SDK docs drift from released packages                       | Snippets fail for pinned SDK version                           | SDK docs manifest check                                | embed package version metadata and changelog cross-links                      | P13.O07 |
| Changelog not tied to API versions                          | Customers cannot map changes to their pinned version           | version manifest validation                            | require every changelog entry to declare API/SDK impact                       | P13.O08 |
| Onboarding stuck in `requires_action`                       | Customer cannot complete activation                            | step-age metric and session status dashboard           | next-action contract, reminders, support escalation                           | P13.O09 |
| KYB vendor outage                                           | KYB step remains pending                                       | compliance adapter outage metric                       | retry/backoff, pending_review state, no auto-approval                         | P13.O11 |
| Evidence upload reference missing                           | KYB review cannot verify evidence                              | P8.K05 missing-object verification                     | block step completion and request re-upload                                   | P13.O11 |
| Sandbox not provisioning                                    | Customer cannot test integration                               | provisioner health and session failure reason          | rollback partial config and allow retry                                       | P13.O12 |
| First key not delivered to customer                         | Customer cannot call API                                       | one-time delivery acknowledgment and key list audit    | recreate restricted key after revoking orphaned key                           | P13.O13 |
| First transfer never completes                              | Activation cannot prove ledger-backed flow                     | transfer intent status timeout and event absence       | show processing, poll projection, support escalation, never fake completion   | P13.O14 |
| Onboarding emits completion before ledger projection        | Customer appears active before actual success                  | event source check and e2e test                        | emit only after projected event/intent success                                | P13.O14 |
| Dashboard billing summary absent before Phase 14            | UI shows broken billing panel                                  | feature-availability contract                          | display unavailable/coming-soon state backed by capability flag, no fake data | P13.O04 |

## 8. Security / Compliance

| Control                  | Requirement                                                                                           | Ticket           |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------- |
| OIDC authentication      | Dashboard uses customer SSO via OIDC; unauthenticated pages redirect before data fetch.               | P13.O05          |
| Session-scoped proxy     | Dashboard server proxy maps user/session/tenant scope to `/v1`; no browser secret key.                | P13.O01          |
| Scoped keys              | API key panel and onboarding first key create restricted keys only.                                   | P13.O03, P13.O13 |
| No full-scope auto-issue | Onboarding never creates root/admin/full-scope keys automatically.                                    | P13.O13          |
| Docs public safety       | Docs require no auth and publish no secrets, private tenant data, or raw Canton identifiers.          | P13.O06          |
| KYB evidence             | Evidence follows P8.K05 reference pattern; DB stores references/hashes, not blob bytes.               | P13.O11          |
| KYB decisions            | Vendor/compliance decision remains P8.K04 owned; onboarding only orchestrates and displays status.    | P13.O11          |
| Audit trail              | Every onboarding mutation records request ID, principal, tenant, step, outcome, and evidence refs.    | P13.O09          |
| Webhook safety           | Dashboard displays webhook health without endpoint secrets or raw sensitive payloads.                 | P13.O03          |
| Deployment invariance    | No security behavior depends on `hosted`, `customer-validator`, or `self-hosted` API grammar changes. | P13.O05          |

### 8.1 Dashboard permissions

| Action                                | Minimum scope                                | Notes                                               |
| ------------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| View balances/activity                | `read:balances`, `read:events`               | Projection reads only.                              |
| View webhook health                   | `read:webhooks`, `read:events`               | No secret exposure.                                 |
| Create/rotate webhook endpoint secret | `write:webhooks`                             | Secret reveal follows Phase 06 rules.               |
| List API keys                         | `read:api_keys`                              | Secret omitted.                                     |
| Create restricted API key             | `write:api_keys`                             | Secret reveal once.                                 |
| Revoke API key                        | `write:api_keys`                             | Audit-required.                                     |
| Continue onboarding                   | `write:onboarding` plus step-specific scopes | KYB upload requires compliance evidence permission. |

### 8.2 Docs security requirements

| Requirement                                 | Enforcement                                                       |
| ------------------------------------------- | ----------------------------------------------------------------- |
| No secrets in static artifact               | static scan over `apps/docs/dist`.                                |
| No Canton internals in public examples      | forbidden-substring scan using REGRESSION_CONTRACT §3.2 list.     |
| No undocumented `/v1` endpoints             | generated route inventory compared with OpenAPI paths.            |
| No stale SDK install commands               | package/version manifest compared with release artifact metadata. |
| No private preview routes in public sitemap | sitemap validation.                                               |

### 8.3 Onboarding compliance requirements

| Requirement                            | Enforcement                                                            |
| -------------------------------------- | ---------------------------------------------------------------------- |
| KYB is explicit and auditable          | session step records compliance decision ID and evidence refs.         |
| KYB outage cannot become approval      | pending_review/requires_action states block completion.                |
| Evidence blobs are not stored in DB    | P8.K05 object reference verification.                                  |
| First transfer uses sandbox by default | session `livemode=false` until live enablement is separately approved. |
| Completion event is ledger-backed      | completion requires projected first transfer success event.            |

## 9. Implementation Plan

| ID      | Title                                          | Path                                                                                    | Output                                                                                                                       | Deps                                                                         | Acceptance                                                                                                                                | Risk   |
| ------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P13.O01 | Dashboard skeleton and `/v1` proxy             | `apps/dashboard`                                                                        | Next.js app shell, authenticated layout, server-side `/v1` proxy, tenant/environment context                                 | P2.C01, P2.C02, P2.C04, P2.C05, P8.K01                                       | Dashboard home loads via proxy; no component imports DB/internal service/Canton clients; unauthenticated request redirects                | high   |
| P13.O02 | Dashboard balances and activity panels         | `apps/dashboard/src/components`, `apps/dashboard/src/server/loaders`                    | Balance cards, holdings summary, recent projected event timeline, projection freshness indicator                             | P13.O01, P5.E07, P5.G05, P6.E08                                              | Sandbox account shows balances and events from `/v1`; stale projection state is visibly degraded and not treated as final authority       | medium |
| P13.O03 | Dashboard webhook and API key management       | `apps/dashboard/src/components/webhooks`, `apps/dashboard/src/components/api-keys`      | Webhook health, endpoint list, test delivery summary, key create/list/revoke UI                                              | P13.O01, P6.H01, P6.H03, P6.H05, P8.K01, P8.K03                              | User creates restricted key with one-time reveal; webhook health panel shows delivery status without secrets                              | high   |
| P13.O04 | Dashboard billing summary panel                | `apps/dashboard/src/components/billing`, `apps/dashboard/src/server/loaders/billing.ts` | Billing/usage summary panel with capability-aware empty state and Phase 14 integration boundary                              | P13.O01                                                                      | Without Phase 14 endpoint, panel renders explicit unavailable state; with fixture endpoint, panel renders usage summary without fake data | low    |
| P13.O05 | Dashboard OIDC integration                     | `apps/dashboard/src/auth`, `apps/dashboard/test/e2e/auth.spec.ts`                       | OIDC provider config, login/callback/logout/session refresh, CSRF protection, scope mapping                                  | P13.O01, P8.K01, P8.K02, P8.K03, P9.J02                                      | OIDC login grants tenant-scoped session; invalid scope blocks API key creation; audit row records principal                               | high   |
| P13.O06 | Docs site generator                            | `apps/docs`, `apps/docs/src/openapi`                                                    | Astro/Docusaurus site, OpenAPI reference renderer, example embedding, static artifact build                                  | P2.C01, P2.C02, P2.C03, P2.C05                                               | Docs build renders every OpenAPI path; artifact scan contains no forbidden Canton substrings or secrets                                   | high   |
| P13.O07 | OpenAPI to docs CI pipeline and SDK docs embed | `.github/workflows/docs.yml`, `apps/docs/src/sdk`                                       | CI workflow, OpenAPI checksum manifest, SDK reference embedding from Phase 07 metadata                                       | P13.O06, P7.I01, P7.I02, P7.I03                                              | CI fails when rendered OpenAPI checksum differs; SDK pages show pinned package version and install command                                | medium |
| P13.O08 | Docs changelog renderer and versioning UI      | `apps/docs/changelog`, `apps/docs/src/versioning`                                       | Changelog schema, version selector, API/SDK/webhook version manifests, previous-version routing                              | P13.O07, P2.C05, P6.H01                                                      | User can select API version; endpoint reference, changelog, examples, and SDK pinning note switch together                                | medium |
| P13.O09 | Onboarding service skeleton and state store    | `services/onboarding`, `packages/db/migrations/0010_config`                             | TypeScript service, `onb_*` session model, config-backed state store, admin-scoped route registration                        | P2.C01, P2.C02, P2.C04, P3.D01, P3.D02, P3.D03, P8.K03                       | Create/retrieve onboarding session works idempotently; DB stores config/audit state only; response uses `onb_*`                           | high   |
| P13.O10 | Onboarding wizard UI                           | `apps/dashboard/src/app/onboarding`, `apps/dashboard/src/components/onboarding`         | Wizard shell, step state rendering, next-action handling, resume flow                                                        | P13.O01, P13.O05, P13.O09                                                    | User can create/resume onboarding session and navigate organization/KYB/sandbox/key/transfer steps                                        | medium |
| P13.O11 | KYB integration and evidence references        | `services/onboarding/src/steps/kyb.ts`, `apps/dashboard/src/app/onboarding/kyb`         | Compliance adapter integration, evidence file reference attachment, pending/requires_action states                           | P13.O09, P13.O10, P8.K04, P8.K05                                             | KYB approved fixture advances step; missing evidence object blocks completion; outage leaves pending_review, not approved                 | high   |
| P13.O12 | Sandbox provisioner                            | `services/onboarding/src/steps/sandbox.ts`, `infra/helm/pillar`                         | Sandbox project/environment provisioning, fixture seeding hook, retry/rollback semantics, Helm values for onboarding service | P13.O09, P9.J01, P9.J04, P9.J05                                              | Provisioning creates sandbox environment or rolls back partial config; retry is idempotent                                                | high   |
| P13.O13 | First-key delivery and webhook setup           | `services/onboarding/src/steps/api-key.ts`, `services/onboarding/src/steps/webhook.ts`  | Restricted API key creation, one-time delivery envelope, initial webhook endpoint/test event step                            | P13.O11, P13.O12, P8.K01, P6.H01, P6.H02, P6.H03                             | First key is sandbox-scoped and revealed once; webhook test delivery verifies signature and stores no endpoint secret in wizard state     | high   |
| P13.O14 | End-to-end onboarding completion test          | `apps/dashboard/test/e2e/onboarding.spec.ts`, `services/onboarding/test/e2e`            | E2E test from OIDC login through KYB fixture, sandbox, first key, webhook test, first transfer, completion event             | P13.O02, P13.O03, P13.O10, P13.O11, P13.O12, P13.O13, P4.E06, P5.G05, P6.H03 | Test proves `onboarding.completed` emits only after projected first transfer success; no Canton internals in UI/API snapshots             | high   |

### Dependency graph

```text
P13.O01 Dashboard skeleton
  ├─ P13.O02 balances/activity
  ├─ P13.O03 webhooks/keys
  ├─ P13.O04 billing summary
  └─ P13.O05 OIDC
       └─ P13.O10 onboarding wizard

P13.O06 docs generator
  └─ P13.O07 docs CI + SDK embed
       └─ P13.O08 changelog + versioning

P13.O09 onboarding service/state
  ├─ P13.O10 onboarding wizard
  ├─ P13.O11 KYB/evidence
  │    └─ P13.O12 sandbox provisioner
  │         └─ P13.O13 first key + webhook setup
  │              └─ P13.O14 e2e onboarding test
  └─ P13.O14 e2e onboarding test
```

### Ticket execution notes

| Ticket  | Notes                                                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P13.O01 | Use generated `/v1` client types where available. Block imports from `packages/db`, ledger clients, Canton adapters, and internal service packages in UI code.                     |
| P13.O02 | Balance and activity panels must show `livemode`, environment, and projection freshness without exposing raw offsets unless already in public API as opaque `as_of_ledger_offset`. |
| P13.O03 | API key creation must use restricted scopes by default; never show existing secrets. Webhook test must use Phase 06 test semantics.                                                |
| P13.O04 | Do not synthesize usage or invoice values. Until Phase 14 exists, render a capability-gated empty state.                                                                           |
| P13.O05 | Treat OIDC claim mapping as security-sensitive. Session cookies must be HTTP-only, Secure in non-local profiles, SameSite appropriate, and CSRF-protected.                         |
| P13.O06 | Generate docs from canonical OpenAPI, not copied endpoint tables. The docs artifact is disposable and reproducible.                                                                |
| P13.O07 | SDK docs must identify package version and API version. CI must compare checksums rather than timestamps.                                                                          |
| P13.O08 | Changelog entries must declare `api_version`, SDK impact, webhook impact, and migration notes where applicable.                                                                    |
| P13.O09 | `onb_*` ID is public workflow state; it must not encode tenant ID or internal runtime IDs.                                                                                         |
| P13.O10 | Wizard should be resumable and server-driven by `next_action`; do not hardcode progression that can bypass service state.                                                          |
| P13.O11 | KYB fixture can approve in tests, but production code must support pending/requires_action without fake approval fallback.                                                         |
| P13.O12 | Provisioner must tolerate partial failure and retry using idempotency/session state.                                                                                               |
| P13.O13 | First key must be restricted to sandbox/onboarding permissions and can be revoked/recreated if delivery is not acknowledged.                                                       |
| P13.O14 | Completion is blocked until first transfer's projected success and associated event are visible through normal `/v1` paths.                                                        |

## 10. Open Questions

| Question                          | Options                                                 | Default for Phase 13                                                                | Blocks design freeze? | Owner               |
| --------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------- | ------------------- |
| Dashboard hosting                 | Vercel/edge hosted, Helm self-hosted Next.js, both      | Support both: Helm as portable baseline, Vercel as hosted optimization              | Yes                   | Product/platform    |
| Docs framework/CMS                | Astro, Docusaurus, custom Next static, headless CMS     | Static framework only; no CMS required for Phase 13                                 | Yes                   | Developer education |
| Onboarding UI ownership           | Pillar-hosted dashboard, customer-embedded wizard, both | Pillar dashboard owns Phase 13; embedded flow can reuse APIs later                  | No                    | Product             |
| KYB vendor contract               | Mock adapter, single vendor, pluggable vendors          | Use P8 compliance adapter abstraction; no vendor-specific UI in dashboard           | No                    | Compliance          |
| Billing summary source before P14 | Hide, empty state, static sample                        | Capability-gated empty state; no sample values                                      | No                    | Product             |
| Docs version naming               | Date-only, date+codename, semver overlay                | Use API version from P2/P7 contract; docs do not invent version IDs                 | Yes                   | API governance      |
| Onboarding live enablement        | Included in first flow or separate compliance step      | First flow provisions sandbox only; live enablement remains explicit later approval | No                    | Compliance/product  |

## 11. Agent-ready Checklist

### Build gate

| Check                       | Command or proof                           | Required result                                                                    |
| --------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Dashboard build             | `pnpm --filter @pillar/dashboard build`    | Next.js build succeeds with no server/client secret leakage warnings.              |
| Dashboard lint/import guard | `pnpm --filter @pillar/dashboard lint`     | UI code imports `/v1` client/proxy only; no DB/Canton/internal service imports.    |
| Docs build                  | `pnpm --filter @pillar/docs build`         | Static docs artifact renders OpenAPI, guides, changelog, and SDK pages.            |
| Docs contract check         | `pnpm --filter @pillar/docs check:openapi` | Rendered OpenAPI checksum matches `packages/api-contracts/openapi/pillar-v1.yaml`. |
| Onboarding service build    | `pnpm --filter @pillar/onboarding build`   | TypeScript service builds and exports route/worker entrypoints.                    |
| Migration verify            | `pnpm --filter @pillar/db migrator verify` | `0010_config` onboarding state extension is present and checksummed.               |
| Helm render                 | `helm lint infra/helm/pillar`              | Dashboard, docs static server, and onboarding service values/templates render.     |

### Verify gate

| Check                     | Scenario                                                                                                                                  | Required result                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Dashboard smoke           | OIDC login, load overview, balances, recent activity, webhook health, API key page                                                        | All data loads through `/v1` proxy; unauthenticated user cannot fetch tenant data.                  |
| Dashboard/Workbench split | Attempt to access ledger trace/replay/admin diagnostics from dashboard                                                                    | Dashboard links to Workbench/docs where allowed but does not implement admin trace/replay views.    |
| Docs generation           | Build docs from OpenAPI, SDK metadata, changelog, guides                                                                                  | Every `/v1` path has a reference page; examples validate against schemas.                           |
| Docs forbidden scan       | Scan rendered docs artifact and dashboard snapshots                                                                                       | No forbidden Canton internals or secrets appear.                                                    |
| Onboarding happy path     | OIDC login → session create → KYB fixture approve → sandbox provision → first restricted key → webhook test → first transfer → completion | `onboarding.completed` emitted only after projected first transfer success.                         |
| Onboarding KYB outage     | Compliance adapter unavailable                                                                                                            | Session remains `pending_review` or `requires_action`; no key/live approval/full completion occurs. |
| Sandbox provisioner retry | Inject partial provisioning failure and retry same session                                                                                | Retry converges or cleanly fails without duplicate tenant/environment/key artifacts.                |
| First key delivery        | Create first key and refresh/retrieve session                                                                                             | Secret is shown once only; subsequent session state contains only `ak_*`.                           |

### Invariant gate

| Invariant                       | Review question                                                                  | Pass condition                                                     |
| ------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Ledger source of truth          | Did dashboard/onboarding authorize economic movement from DB state?              | No; first transfer uses normal intent/ledger/projection path.      |
| Projection/Audit/Config DB only | Did Phase 13 add economic source tables?                                         | No; onboarding state is config/audit workflow state.               |
| Canton-invisible public API     | Do dashboard, docs, and onboarding expose raw Canton identifiers?                | No; scans cover UI snapshots, docs artifact, onboarding responses. |
| Intent-first mutation           | Does onboarding first transfer bypass intent/operation flow?                     | No; it creates normal `/v1` transfer intent with idempotency.      |
| Event authority                 | Does onboarding completion emit from optimistic state?                           | No; completion waits for projected success event.                  |
| Webhook-first async             | Are webhook health/docs based on signed/versioned/replayable Phase 06 semantics? | Yes; no parallel callback model.                                   |
| Deployment invariance           | Does hosting mode change `/v1` grammar or docs examples?                         | No; only base URL/OIDC/infra wiring changes.                       |
| Key safety                      | Does onboarding auto-issue broad or persistent visible keys?                     | No; first key is restricted, sandbox-scoped, one-time reveal.      |
| Evidence safety                 | Are KYB blobs stored in DB or docs artifacts?                                    | No; only P8.K05 references/hashes are persisted.                   |
| Workbench split                 | Did dashboard duplicate Workbench admin trace/replay functionality?              | No; dashboard remains customer operational UI.                     |
