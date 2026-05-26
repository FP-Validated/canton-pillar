# Phase 14 — Usage Metering and Billing

> Turn Pillar from a ledger runtime into an operable paid SaaS by metering tenant usage, aggregating billable units, exposing customer usage/invoice APIs, and integrating hosted billing without contaminating Canton economic source-of-truth semantics.

## 1. Executive Summary

Phase 14 fills the commercial operating gap for Pillar as the The payments runtime for Canton-backed assets.

Pillar SaaS pricing requires per-tenant usage metering for:

| Meter                     | Why it matters                                           |
| ------------------------- | -------------------------------------------------------- |
| API calls                 | Base platform consumption and support load               |
| Intents created           | Primary customer value unit for asset movement workflows |
| Webhook deliveries        | Async workflow fan-out and retry cost                    |
| Projection storage        | Read-model footprint and retention cost                  |
| Search/export volume      | Reporting and data-egress cost                           |
| Ledger commands submitted | Canton participant/runtime cost driver                   |

Billing behavior depends on deployment mode:

| Deployment mode      | Phase 14 billing behavior                                                                    | Rationale                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `hosted`             | Full usage metering, invoice generation, billing portal, hosted provider integration         | Pillar operates the data plane and can bill directly for SaaS consumption.                   |
| `customer-validator` | Limited usage visibility and advisory rollups; billing is governed by contract/license terms | Customer-controlled validator creates shared responsibility and possible off-platform usage. |
| `self-hosted`        | License-only entitlement reporting; no direct usage invoices in v1                           | Customer operates the data plane; control-plane license model is authoritative.              |

Without this phase, Pillar cannot operate as a paid product even if ledger semantics are complete. Architecture currently emphasizes ledger correctness, idempotency, projection, webhooks, deployment, and compliance; Phase 14 adds the product-revenue plane while preserving the existing invariants.

Primary source inputs:

| Source                                                                   | Phase 14 dependency                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [01 Product Strategy](../Architecture/01_Pillar%20Product%20Strategy.md) | polished commercial product positioning and SaaS expectations                      |
| [18 Deployment](../Architecture/18_Deployment.md)                        | deployment-mode separation, control/data plane boundaries, license/entitlement concept |
| [19 Compliance](../Architecture/19_Compliance.md)                        | audit retention, invoicing evidence, tax/provider responsibility boundaries            |
| [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)    | service boundaries, DB migration style, API/service patterns                           |
| [04 Object Model](../Architecture/04_Object%20Model.md)                  | public object grammar, ID prefix discipline, Canton-invisible API constraints          |

Phase 14 is not an economic ledger feature. Usage and invoices are commercial/accounting records about Pillar platform consumption. They must never become asset state, settlement state, balance authority, or command approval authority.

### Commercial outcome

| Outcome                               | Required behavior                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Metered hosted SaaS                   | Every accepted hosted mutation emits usage without blocking the response path.                   |
| Customer usage transparency           | Admin users can retrieve usage rollups and invoices through `/v1`.                               |
| External billing provider integration | Hosted invoices are generated through billing or an equivalent provider.                          |
| Deployment-aware billing              | Hosted bills by usage; customer-validator and self-hosted defer to license/control-plane models. |
| Dashboard handoff                     | Phase 13 dashboard consumes usage and invoice APIs without inventing a second billing model.     |

### Invariants directly enforced

| README invariant                                                                                   | Phase 14 enforcement                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1. Canton Ledger is the single economic source of truth                                            | Usage billing records platform consumption only; they never authorize asset movement.                                               |
| 2. Pillar DB stores only Projection / Audit / Config                                               | `usage_events`, rollups, plans, invoices, and customer billing settings are audit/config/commercial records, not ledger state.      |
| 3. Public `/v1` API never exposes Canton internals                                                 | Usage and invoice responses expose no `contractId`, `templateId`, `partyId`, `participantId`, `packageId`, or `commandId`.          |
| 8. `deploymentMode` changes infrastructure wiring only                                             | `/v1/usage`, `/v1/invoices`, and `/v1/billing/portal_url` retain one grammar across modes while capabilities differ by entitlement. |
| 9. Idempotency-Key + request hash + tenant key uniquely determines response and operation identity | Usage emission derives stable usage event dedupe keys from accepted request/operation context.                                      |

### Regression contract clauses satisfied

| Clause | Phase 14 satisfaction                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------- |
| IC-01  | Billing is separated from ledger economic truth.                                                         |
| IC-02  | Usage/billing DB records are audit/config/commercial records and do not store authoritative asset state. |
| IC-03  | Public billing APIs pass forbidden-substring checks.                                                     |
| IC-08  | Deployment modes share `/v1` grammar while billing capabilities are policy-driven.                       |
| IC-09  | Usage event dedupe keys preserve mutation idempotency semantics.                                         |

## 2. Goals / Non-goals

### Goals

| Goal                                    | Concrete Phase 14 output                                                                       | Source                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Emit usage events from API gateway      | Middleware records accepted mutations and sampled reads to a non-blocking usage stream         | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) |
| Emit usage events from runtime services | Ledger command, webhook dispatcher, projection/search/export services emit per-operation usage | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) |
| Persist raw usage events                | Migration `0110_usage_metering` creates monthly-partitioned `usage_events`                     | Shared migration registry                                             |
| Aggregate billable usage                | `usage_rollups` stores hourly, daily, and monthly rollups by tenant/meter/deployment mode      | Product SaaS requirement                                              |
| Expose customer usage API               | `/v1/usage` returns paginated rollups and current-period summaries                             | polished API grammar                                              |
| Expose invoice API                      | `/v1/invoices` returns provider-backed invoice objects with stable `inv_*` IDs                 | Commercial SaaS requirement                                           |
| Provide billing portal endpoint         | `/v1/billing/portal_url` creates a billing-hosted portal link for admin keys                    | PCI scope reduction                                                   |
| Integrate billing provider              | `services/billing-adapter` reconciles rollups with billing or equivalent nightly                | Hosted billing model                                                  |
| Support dashboard panel                 | Phase 13 consumes usage summary, invoice list, and current-period forecast                     | Dashboard handoff                                                     |
| Preserve hot-path latency               | Usage event emission is asynchronous and must not block API responses                          | Runtime invariant                                                     |

### Non-goals

| Non-goal                                                            | Reason                                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Replacing the customer's accounting system                          | Pillar produces invoices and usage evidence, not ERP/general-ledger accounting.                                                     |
| Multi-currency tax calculation in v1                                | Tax determination and jurisdictional rules are delegated to billing Tax, Chargebee, or equivalent.                                   |
| Enforcing credit limits in v1                                       | Credit limit checks are advisory only; they must not reject asset-moving ledger workflows.                                          |
| Making invoices Canton ledger records                               | Invoices are commercial SaaS records, not Canton-backed asset events.                                                               |
| Billing all customer-validator/self-hosted usage by raw meter in v1 | These modes use contracts/license entitlements because data-plane locality and offline operation change trust boundaries.           |
| Adding a new public billing API grammar per deployment mode         | API grammar remains stable; entitlement controls behavior.                                                                          |
| Capturing business payload in usage events                          | Usage events contain counts, sizes, classifications, and trace references only.                                                     |
| Charging for failed ledger economic state as if it succeeded        | Billing units distinguish accepted API requests, submitted commands, committed operations, rejected commands, and webhook attempts. |
| Building an in-house payment processor                              | Card data, payment methods, tax invoices, and portal UX live in an external billing provider.                                       |

### Entry prerequisites

| Prerequisite           | Required state                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| P2 API contract        | `/v1` object grammar, errors, pagination, auth, and versioning patterns exist.            |
| P3 DB/idempotency      | tenant, request, idempotency, migration, and audit patterns are established.              |
| P4 command runtime     | ledger command request/attempt/completion trace is available as an internal event source. |
| P5 projection          | projection storage and reconciliation metrics exist for storage/rollup metering.          |
| P6 webhooks            | webhook delivery attempts and retries are durable and observable.                         |
| P8 security/compliance | admin key scopes, audit retention, and metadata/PII policy exist.                         |
| P9 deployment          | `deploymentMode` is canonical: `hosted`, `customer-validator`, `self-hosted`.             |
| P13 dashboard          | usage panel integration target is ready or tracked as a handoff.                          |

## 3. Architecture

Phase 14 adds two services and one API surface extension:

| Component         | Path                                                                                                   | Responsibility                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Usage meter       | `services/usage-meter/`                                                                                | Consume usage stream, validate event contract, write raw events, aggregate rollups. |
| Billing adapter   | `services/billing-adapter/`                                                                            | Map rollups/plans/customers to billing or equivalent provider, reconcile invoices.   |
| Public API routes | `apps/api/src/routes/v1/usage*`, `apps/api/src/routes/v1/invoices*`, `apps/api/src/routes/v1/billing*` | Serve usage, invoices, and portal URLs using developer-friendly grammar.                   |

### 3.1 Topology

```text
Client / SDK / Dashboard
        |
        v
apps/api
  - auth / API version / idempotency
  - usage emission middleware
  - /v1/usage
  - /v1/invoices
  - /v1/billing/portal_url
        |
        +------------------------------+
        |                              |
        v                              v
Usage Stream                    Billing Provider API
Kafka / Redis Stream            billing or equivalent
        |                              ^
        v                              |
services/usage-meter             services/billing-adapter
  - event validation                - customer sync
  - dedupe                          - subscription/item sync
  - raw event inserts               - invoice import
  - hourly/daily/monthly rollups    - reconciliation
        |
        v
Postgres
  - usage_events monthly partitions
  - usage_rollups
  - pricing_plans
  - customer_billing
  - invoices
```

### 3.2 Service responsibility split

| Concern               | Owner                                                 | Notes                                                      |
| --------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| Event emission        | API gateway and runtime services                      | Emitters do not compute billing amounts.                   |
| Event transport       | Kafka or Redis stream                                 | At-least-once delivery; usage-meter performs dedupe.       |
| Event persistence     | `services/usage-meter/`                               | Writes raw events to partitioned Postgres.                 |
| Rollup aggregation    | `services/usage-meter/`                               | Computes meter quantities by tenant/period/mode.           |
| Pricing plan registry | API/config DB + billing adapter                       | Stores plan metadata and external provider IDs.            |
| Invoice generation    | External provider through `services/billing-adapter/` | Hosted mode only for v1.                                   |
| Invoice read model    | `invoices` table                                      | Imported from provider and exposed through `/v1/invoices`. |
| Billing portal        | External provider through API route                   | Admin-only, short-lived portal URLs.                       |
| Dashboard usage panel | `apps/dashboard/` in Phase 13                         | Consumes APIs defined here.                                |

### 3.3 Deployment-mode matrix

| Behavior                             | `hosted`                   | `customer-validator`                             | `self-hosted`                                    |
| ------------------------------------ | -------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| Raw usage event emission             | Required                   | Required for local visibility if enabled         | Optional/local only                              |
| Raw event export to Pillar Cloud     | Internal                   | Policy-controlled                                | Not required in v1                               |
| Rollups                              | Required                   | Required local/advisory                          | Optional/license reporting                       |
| `/v1/usage`                          | Full                       | Advisory/contractual                             | License entitlement and local usage if enabled   |
| `/v1/invoices`                       | Full provider invoices     | Contract/license invoices only if synced         | License invoices only if control plane connected |
| `/v1/billing/portal_url`             | Enabled for billing admins | Usually disabled unless contract supports portal | Disabled or license portal only                  |
| External provider invoice generation | Required                   | Not default                                      | Not default                                      |
| Credit limit enforcement             | Advisory only              | Advisory only                                    | Advisory only                                    |

### 3.4 Meter taxonomy

| Meter key                      | Unit      | Emitted by                                     | Billable default            |
| ------------------------------ | --------- | ---------------------------------------------- | --------------------------- |
| `api.request.accepted`         | count     | API middleware                                 | Yes for hosted              |
| `api.request.read_sampled`     | count     | API middleware                                 | Optional, sampled           |
| `intent.created`               | count     | intent routes/orchestrator                     | Yes                         |
| `ledger.command.submitted`     | count     | `services/ledger-command/`                     | Yes                         |
| `ledger.command.rejected`      | count     | `services/ledger-command/`                     | Optional/non-billable in v1 |
| `webhook.delivery.attempted`   | count     | `services/webhook-dispatcher/`                 | Yes                         |
| `webhook.delivery.succeeded`   | count     | `services/webhook-dispatcher/`                 | Informational               |
| `projection.storage.byte_hour` | byte-hour | projection storage sampler                     | Yes above included quota    |
| `search.query.executed`        | count     | `services/search-indexer/` / API search routes | Yes if Phase 11 enabled     |
| `export.byte.generated`        | bytes     | `services/export-worker/`                      | Yes                         |

### 3.5 Provider boundary

`services/billing-adapter` talks to billing or equivalent. The adapter boundary hides provider-specific products, prices, usage records, invoices, customer portal sessions, tax objects, and webhook signatures from the rest of Pillar.

| Adapter input                              | Adapter output                               |
| ------------------------------------------ | -------------------------------------------- |
| `usage_rollups` for closed billing periods | Provider usage records or invoice line items |
| `pricing_plans`                            | Provider product/price IDs                   |
| `customer_billing`                         | Provider customer/subscription IDs           |
| Provider invoice webhooks/imports          | Canonical `invoice` rows with `inv_*` IDs    |
| Portal session request                     | Short-lived hosted portal URL                |

### 3.6 Data classification

Usage data is operational/commercial telemetry. It is not customer business payload and not ledger state.

| Data class                     | Allowed in usage event?                               | Examples                                                            |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Tenant/environment identifiers | Yes                                                   | `tenant_id`, `environment_id`, `livemode`                           |
| Public object references       | Yes when needed                                       | `operation_id`, `event_id`, `webhook_endpoint_id`                   |
| Canton internals               | Internal-only if needed for diagnostics; never public | command/update references must not appear in `/v1` billing APIs     |
| Business payload               | No                                                    | transfer amount details, recipient identity, asset payload metadata |
| PII                            | No                                                    | names, emails, addresses, payment method details                    |
| Billing provider IDs           | Internal and admin-only                               | billing customer/subscription/invoice IDs                            |

## 4. API / Object Model

Phase 14 defines internal usage emission objects and public billing/usage objects.

### 4.1 Internal `usage_event`

`usage_event` is internal-only. It is emitted by services and persisted in `usage_events`. It is not a public `/v1` object.

| Field               | Type            | Rule                                                                    |
| ------------------- | --------------- | ----------------------------------------------------------------------- |
| `usage_event_id`    | string          | Internal stable ID, dedupe key source; may use `uev_*` internally only. |
| `tenant_id`         | string          | Required.                                                               |
| `environment_id`    | string          | Required.                                                               |
| `deployment_mode`   | enum            | `hosted`, `customer-validator`, or `self-hosted`.                       |
| `livemode`          | boolean         | Derived from key/environment, not deployment mode.                      |
| `meter`             | string          | One of the registered meter keys.                                       |
| `quantity`          | decimal/integer | Non-negative; unit defined by meter.                                    |
| `unit`              | string          | `count`, `bytes`, `byte_hour`, or future registered unit.               |
| `source_service`    | string          | Emitting service name.                                                  |
| `source_event_time` | timestamp       | Time event occurred at source.                                          |
| `operation_id`      | string nullable | Public `op_*` when applicable.                                          |
| `request_id`        | string nullable | API request trace when applicable.                                      |
| `dedupe_key`        | string          | Unique per tenant/meter/source event.                                   |
| `attributes`        | jsonb           | Low-cardinality billing dimensions only.                                |

Rules:

1. `usage_event` emission must not block API response path.
2. Duplicate `dedupe_key` rows are ignored, not double-counted.
3. Events must not contain business payload or PII.
4. Public API presenters never expose raw usage event rows.
5. Accepted mutations are metered even if downstream asynchronous execution later fails, but rollups must distinguish accepted, submitted, committed, rejected, and delivered meters.

### 4.2 Public `usage_rollup` object

Public ID prefix: `uro_*`.

| Field             | Type            | Rule                                                         |
| ----------------- | --------------- | ------------------------------------------------------------ |
| `id`              | string          | `uro_*`.                                                     |
| `object`          | string          | `usage_rollup`.                                              |
| `created`         | timestamp       | Rollup row creation time.                                    |
| `livemode`        | boolean         | Environment mode.                                            |
| `metadata`        | object          | Empty object by default.                                     |
| `period_start`    | timestamp       | Inclusive.                                                   |
| `period_end`      | timestamp       | Exclusive.                                                   |
| `granularity`     | enum            | `hour`, `day`, `month`.                                      |
| `deployment_mode` | enum            | Canonical deployment mode.                                   |
| `meter`           | string          | Registered meter key.                                        |
| `quantity`        | string/decimal  | Decimal-safe representation.                                 |
| `unit`            | string          | Meter unit.                                                  |
| `billable`        | boolean         | Whether the rollup contributes to hosted invoice generation. |
| `pricing_plan`    | string nullable | `plan_*` when mapped.                                        |

### 4.3 Public `invoice` object

Public ID prefix: `inv_*`.

| Field                | Type            | Rule                                                                        |
| -------------------- | --------------- | --------------------------------------------------------------------------- |
| `id`                 | string          | `inv_*`.                                                                    |
| `object`             | string          | `invoice`.                                                                  |
| `created`            | timestamp       | Invoice creation time.                                                      |
| `livemode`           | boolean         | Environment mode.                                                           |
| `metadata`           | object          | Empty object by default.                                                    |
| `status`             | enum            | `draft`, `open`, `paid`, `void`, `uncollectible`, `disputed`.               |
| `period_start`       | timestamp       | Billing period inclusive.                                                   |
| `period_end`         | timestamp       | Billing period exclusive.                                                   |
| `currency`           | string          | ISO currency from billing provider/plan.                                    |
| `subtotal`           | string          | Decimal string in major units or minor-unit policy defined by API contract. |
| `tax`                | string nullable | Provider-calculated tax amount.                                             |
| `total`              | string          | Decimal string.                                                             |
| `amount_due`         | string          | Decimal string.                                                             |
| `hosted_invoice_url` | string nullable | Provider-hosted invoice URL when allowed.                                   |
| `pdf_url`            | string nullable | Provider-hosted PDF URL when allowed.                                       |
| `lines`              | array           | Line summaries grouped by meter/plan.                                       |

### 4.4 Public `pricing_plan` object

Public ID prefix: `plan_*`.

| Field              | Type      | Rule                        |
| ------------------ | --------- | --------------------------- |
| `id`               | string    | `plan_*`.                   |
| `object`           | string    | `pricing_plan`.             |
| `created`          | timestamp | Creation time.              |
| `livemode`         | boolean   | Environment mode.           |
| `metadata`         | object    | Empty object by default.    |
| `name`             | string    | Customer-visible plan name. |
| `deployment_modes` | array     | Supported deployment modes. |
| `meters`           | array     | Meter pricing entries.      |
| `included_usage`   | object    | Included quotas by meter.   |
| `active`           | boolean   | Whether selectable.         |

### 4.5 Public/admin `customer_billing` object

Public ID prefix: `cb_*`.

| Field             | Type      | Rule                                                        |
| ----------------- | --------- | ----------------------------------------------------------- |
| `id`              | string    | `cb_*`.                                                     |
| `object`          | string    | `customer_billing`.                                         |
| `created`         | timestamp | Creation time.                                              |
| `livemode`        | boolean   | Environment mode.                                           |
| `metadata`        | object    | Empty object by default.                                    |
| `tenant`          | string    | Public tenant/account reference, not Canton party.          |
| `deployment_mode` | enum      | Canonical mode.                                             |
| `pricing_plan`    | string    | `plan_*`.                                                   |
| `billing_status`  | enum      | `active`, `past_due`, `paused`, `license_only`, `disabled`. |
| `provider`        | string    | `billing`, `chargebee`, or configured adapter key.           |
| `portal_enabled`  | boolean   | Whether portal URL can be created.                          |

### 4.6 Public APIs

| Endpoint                 | Method | Purpose                                                      | Auth scope                  |
| ------------------------ | ------ | ------------------------------------------------------------ | --------------------------- |
| `/v1/usage`              | GET    | List usage rollups for the authenticated tenant/environment. | `usage:read` or admin key   |
| `/v1/invoices`           | GET    | List invoices.                                               | `billing:read` or admin key |
| `/v1/invoices/{invoice}` | GET    | Retrieve one invoice by `inv_*`.                             | `billing:read` or admin key |
| `/v1/billing/portal_url` | POST   | Create short-lived provider-hosted portal URL.               | `billing:admin` admin key   |

Cursor pagination uses the mission-wide grammar: `limit`, `starting_after`, `ending_before`, and `has_more`.

### 4.7 Example `/v1/usage` response

```json
{
  "object": "list",
  "url": "/v1/usage",
  "has_more": false,
  "data": [
    {
      "id": "uro_01JZusagehour",
      "object": "usage_rollup",
      "created": "2026-05-26T10:00:00Z",
      "livemode": true,
      "metadata": {},
      "period_start": "2026-05-26T09:00:00Z",
      "period_end": "2026-05-26T10:00:00Z",
      "granularity": "hour",
      "deployment_mode": "hosted",
      "meter": "ledger.command.submitted",
      "quantity": "1842",
      "unit": "count",
      "billable": true,
      "pricing_plan": "plan_01JZhostedpro"
    }
  ]
}
```

### 4.8 Example portal response

```json
{
  "object": "billing_portal_url",
  "created": "2026-05-26T10:00:00Z",
  "livemode": true,
  "url": "https://billing.example-provider.test/session/...",
  "expires_at": "2026-05-26T10:30:00Z"
}
```

## 5. Internal Runtime

### 5.1 Emission path

API gateway and runtime services emit usage events to Kafka or Redis stream after the source action has been accepted for processing.

```text
Accepted source action
        |
        v
Build usage event envelope
        |
        v
Best-effort non-blocking stream publish
        |
        +--> success: continue normally
        |
        +--> publish unavailable: increment local metric and enqueue bounded fallback if configured
```

Emission rules:

| Rule                         | Required behavior                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Non-blocking response path   | API response must not wait for usage stream ack beyond a tiny bounded local enqueue.                                    |
| No synthetic billing success | Emission failure must be visible operationally and may under-bill; it must not fabricate events later without evidence. |
| Dedupe required              | Every event has deterministic `dedupe_key`.                                                                             |
| Source owns semantics        | Emitters choose meter and quantity; usage-meter validates against registry.                                             |
| Billing owns money           | Emitters never compute price, tax, invoice totals, or credit balance.                                                   |

### 5.2 API gateway meters

| Route class                                                        | Usage behavior                                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Mutating `/v1` requests accepted after auth/idempotency validation | Emit `api.request.accepted` and domain meter such as `intent.created` when applicable. |
| Idempotent replay returning cached response                        | Do not double-count domain meter; optionally emit non-billable `api.request.replayed`. |
| Validation failures before accepted mutation                       | Not billable; may emit operational metric outside usage billing.                       |
| Read requests                                                      | Sample for capacity analytics; billable only if plan explicitly prices reads.          |
| Dashboard/API explorer requests                                    | Attribute to tenant/environment, not to human PII.                                     |

### 5.3 Runtime service meters

| Service                           | Meter responsibilities                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `services/ledger-command/`        | `ledger.command.submitted`, `ledger.command.rejected`, optional command retry counters. |
| `services/webhook-dispatcher/`    | delivery attempted, succeeded, failed, DLQ entries.                                     |
| `services/projection-worker/`     | projection storage byte-hours and rebuild volume.                                       |
| `services/search-indexer/`        | indexed object count and query execution when Phase 11 is enabled.                      |
| `services/export-worker/`         | export bytes generated and file retention when Phase 11 is enabled.                     |
| `services/workflow-orchestrator/` | scheduled workflow tasks only when separately priced.                                   |

### 5.4 Usage-meter worker

`services/usage-meter/` runs four loops:

| Loop            | Frequency  | Responsibility                                                           |
| --------------- | ---------- | ------------------------------------------------------------------------ |
| Stream consumer | continuous | Consume events, validate, dedupe, insert into current monthly partition. |
| Hourly rollup   | hourly     | Aggregate closed hours by tenant/environment/meter/deployment mode.      |
| Daily rollup    | daily      | Aggregate closed days and reconcile against hourly totals.               |
| Monthly close   | monthly    | Freeze invoiceable rollups for billing adapter.                          |

### 5.5 Billing adapter worker

`services/billing-adapter/` runs hosted-only billing loops:

| Loop                    | Frequency                               | Responsibility                                                              |
| ----------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Customer sync           | nightly and on customer billing changes | Ensure provider customer/subscription matches `customer_billing`.           |
| Usage export            | nightly                                 | Send closed rollups to provider as usage records or invoice line inputs.    |
| Invoice import          | provider webhook and polling fallback   | Import provider invoices into canonical `invoices`.                         |
| Reconciliation          | nightly                                 | Compare rollups, provider usage, provider invoices, and local invoice rows. |
| Portal session creation | on request                              | Create short-lived hosted portal session for admin-scoped caller.           |

### 5.6 Reconciliation model

| Comparison                            | Failure meaning                  | Action                                                        |
| ------------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| raw events vs hourly rollups          | aggregation bug or partition gap | rebuild affected rollup window.                               |
| hourly vs daily totals                | rollup compaction bug            | block monthly close for affected tenant/meter.                |
| monthly rollups vs provider usage     | billing export drift             | retry export or issue adjustment before invoice finalization. |
| provider invoice vs local invoice row | import/provider webhook gap      | poll provider and update local canonical row.                 |
| disputed invoice vs usage evidence    | customer support workflow        | attach usage summaries and provider invoice evidence.         |

## 6. DB Schema

Migration set: `0110_usage_metering`.

Migration location follows the existing migration convention established by P3 and later phases. The migration must be one canonical set, not scattered billing-specific migrations.

### 6.1 Tables

| Table              | Purpose                                                    | DB class                    |
| ------------------ | ---------------------------------------------------------- | --------------------------- |
| `usage_events`     | Raw immutable usage event fact table, monthly partitioned. | Audit/commercial telemetry  |
| `usage_rollups`    | Hour/day/month aggregates by tenant/meter/period.          | Audit/commercial projection |
| `pricing_plans`    | Plan and meter pricing registry.                           | Config                      |
| `customer_billing` | Tenant billing/provider/subscription mapping.              | Config/audit                |
| `invoices`         | Canonical imported/generated invoice read model.           | Audit/commercial record     |

### 6.2 `usage_events`

Partitioned by month on `source_event_time`.

| Column              | Type          | Rule                                                       |
| ------------------- | ------------- | ---------------------------------------------------------- |
| `id`                | uuid/text     | Internal row ID.                                           |
| `tenant_id`         | text          | Required.                                                  |
| `environment_id`    | text          | Required.                                                  |
| `deployment_mode`   | text          | Check enum: `hosted`, `customer-validator`, `self-hosted`. |
| `livemode`          | boolean       | Required.                                                  |
| `meter`             | text          | Required, references meter registry.                       |
| `quantity`          | numeric       | Required, non-negative.                                    |
| `unit`              | text          | Required.                                                  |
| `source_service`    | text          | Required.                                                  |
| `source_event_time` | timestamptz   | Partition key.                                             |
| `ingested_at`       | timestamptz   | Default now.                                               |
| `request_id`        | text nullable | API trace reference.                                       |
| `operation_id`      | text nullable | `op_*` reference if applicable.                            |
| `dedupe_key`        | text          | Unique per partition/month and tenant.                     |
| `attributes`        | jsonb         | Low-cardinality dimensions only.                           |

Partition strategy:

| Requirement        | Rule                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Monthly partitions | Create one partition per calendar month, e.g. `usage_events_2026_05`.                                    |
| Retention          | Raw event retention follows commercial/tax evidence policy; rollups retain longer than raw if permitted. |
| Indexes            | Tenant/time/meter and dedupe indexes on every partition.                                                 |
| Backfill           | Backfill writes to the correct historical partition and marks source as `backfill`.                      |
| Partition creation | Migration creates bootstrap partition; worker/admin job creates future partitions before month boundary. |

### 6.3 `usage_rollups`

| Column               | Type                 | Rule                                      |
| -------------------- | -------------------- | ----------------------------------------- |
| `id`                 | text                 | Public `uro_*`.                           |
| `tenant_id`          | text                 | Required.                                 |
| `environment_id`     | text                 | Required.                                 |
| `deployment_mode`    | text                 | Required.                                 |
| `livemode`           | boolean              | Required.                                 |
| `meter`              | text                 | Required.                                 |
| `unit`               | text                 | Required.                                 |
| `granularity`        | text                 | `hour`, `day`, `month`.                   |
| `period_start`       | timestamptz          | Required.                                 |
| `period_end`         | timestamptz          | Required.                                 |
| `quantity`           | numeric              | Required.                                 |
| `billable`           | boolean              | Required.                                 |
| `pricing_plan_id`    | text nullable        | `plan_*`.                                 |
| `source_event_count` | bigint               | Number of raw events aggregated.          |
| `closed_at`          | timestamptz nullable | Set when period is immutable for billing. |
| `created_at`         | timestamptz          | Required.                                 |
| `updated_at`         | timestamptz          | Required.                                 |

Uniqueness:

```text
tenant_id + environment_id + deployment_mode + meter + granularity + period_start + period_end
```

### 6.4 `pricing_plans`

| Column                | Type          | Rule                                                    |
| --------------------- | ------------- | ------------------------------------------------------- |
| `id`                  | text          | `plan_*`.                                               |
| `name`                | text          | Customer-visible.                                       |
| `active`              | boolean       | Required.                                               |
| `deployment_modes`    | text[]        | Allowed modes.                                          |
| `currency`            | text          | Plan currency; multi-currency tax is provider-owned.    |
| `meter_config`        | jsonb         | Meter price references, included usage, billable flags. |
| `provider`            | text          | `billing`, `chargebee`, or adapter key.                  |
| `provider_product_id` | text nullable | External product ID.                                    |
| `provider_price_map`  | jsonb         | Meter to provider price/item mapping.                   |
| `created_at`          | timestamptz   | Required.                                               |
| `updated_at`          | timestamptz   | Required.                                               |

### 6.5 `customer_billing`

| Column                     | Type          | Rule                                                                |
| -------------------------- | ------------- | ------------------------------------------------------------------- |
| `id`                       | text          | `cb_*`.                                                             |
| `tenant_id`                | text          | Unique per environment unless multi-subscription is later approved. |
| `environment_id`           | text          | Required.                                                           |
| `deployment_mode`          | text          | Required.                                                           |
| `pricing_plan_id`          | text          | References `pricing_plans`.                                         |
| `billing_status`           | text          | `active`, `past_due`, `paused`, `license_only`, `disabled`.         |
| `provider`                 | text          | Adapter key.                                                        |
| `provider_customer_id`     | text nullable | External provider ID.                                               |
| `provider_subscription_id` | text nullable | External provider subscription ID.                                  |
| `portal_enabled`           | boolean       | Required.                                                           |
| `tax_profile_ref`          | text nullable | External provider/customer tax configuration reference.             |
| `created_at`               | timestamptz   | Required.                                                           |
| `updated_at`               | timestamptz   | Required.                                                           |

### 6.6 `invoices`

| Column                | Type             | Rule                                                          |
| --------------------- | ---------------- | ------------------------------------------------------------- |
| `id`                  | text             | `inv_*`.                                                      |
| `tenant_id`           | text             | Required.                                                     |
| `environment_id`      | text             | Required.                                                     |
| `customer_billing_id` | text             | `cb_*`.                                                       |
| `provider`            | text             | Adapter key.                                                  |
| `provider_invoice_id` | text nullable    | External provider invoice ID.                                 |
| `status`              | text             | `draft`, `open`, `paid`, `void`, `uncollectible`, `disputed`. |
| `period_start`        | timestamptz      | Required.                                                     |
| `period_end`          | timestamptz      | Required.                                                     |
| `currency`            | text             | Required.                                                     |
| `subtotal`            | numeric          | Required.                                                     |
| `tax`                 | numeric nullable | Provider-calculated.                                          |
| `total`               | numeric          | Required.                                                     |
| `amount_due`          | numeric          | Required.                                                     |
| `hosted_invoice_url`  | text nullable    | Provider URL.                                                 |
| `pdf_url`             | text nullable    | Provider URL.                                                 |
| `lines`               | jsonb            | Meter/plan line summaries.                                    |
| `dispute_status`      | text nullable    | Support workflow marker.                                      |
| `created_at`          | timestamptz      | Required.                                                     |
| `updated_at`          | timestamptz      | Required.                                                     |

### 6.7 Migration acceptance

| Check              | Required proof                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Migration name     | `0110_usage_metering` exists and is the only Phase 14 migration set.                            |
| Partitioning       | `usage_events` is partitioned by month.                                                         |
| Dedupe             | Duplicate event insert is impossible or idempotently ignored.                                   |
| No asset authority | No table stores authoritative asset balances, ownership, settlement, or command approval state. |
| Public prefixes    | `uro_*`, `inv_*`, `plan_*`, `cb_*` do not collide with existing prefixes.                       |

## 7. Failure Modes

| Failure mode                           | Risk                                          | Required mitigation                                                                                 | Owner ticket              |
| -------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------- |
| Lost usage event                       | Under-billing and incomplete usage dashboard  | Non-blocking emit metrics, bounded fallback queue, reconciliation against source counters           | P14.Q01, P14.Q02, P14.Q09 |
| Duplicate usage event                  | Over-billing                                  | Deterministic dedupe key, unique constraints, rollup rebuild idempotency                            | P14.Q02, P14.Q03          |
| Usage stream outage                    | Under-billing or delayed dashboard            | Emit health metric, DLQ/fallback, alert, never block API response path                              | P14.Q01, P14.Q02          |
| billing/provider API outage             | Invoice generation delay                      | Retry with idempotency keys, mark billing sync degraded, do not mutate usage rollups                | P14.Q05, P14.Q09          |
| Provider webhook missed                | Stale invoice status                          | Polling fallback and provider reconciliation                                                        | P14.Q05, P14.Q09          |
| Currency/tax misclassification         | Incorrect invoice/tax record                  | Delegate tax to provider, store tax profile reference, compliance review before go-live             | P14.Q04, P14.Q05          |
| Retroactive plan change                | Customer dispute or incorrect invoice         | Version pricing plans, apply changes from effective period only unless adjustment workflow approved | P14.Q04, P14.Q10          |
| Rollup compaction bug                  | Incorrect invoice totals                      | Rebuild rollup from raw events and compare source counts before monthly close                       | P14.Q03, P14.Q09          |
| Partition creation failure             | Raw event ingestion failure at month boundary | Pre-create future partitions, alert before boundary, fallback admin job                             | P14.Q02                   |
| Billing portal misuse                  | Unauthorized access to provider portal        | Admin-only scope, short-lived URL, audit request                                                    | P14.Q08                   |
| Invoice dispute                        | Revenue leakage/support burden                | Customer dispute workflow with usage evidence and adjustment path                                   | P14.Q10                   |
| Self-hosted usage expectation mismatch | Customer confusion                            | Expose license-only billing semantics and document that raw provider invoices are hosted-only       | P14.Q04, P14.Q06, P14.Q07 |

### Failure-handling principles

1. Under-billing is preferable to blocking the API response path.
2. Over-billing is a correctness incident and must be reversible through invoice adjustments or credits.
3. Usage reconstruction may use durable source records, but it must not invent events beyond observed evidence.
4. Invoice finalization must be blocked if rollup/provider reconciliation is red for the tenant/period.
5. Billing incidents must not affect ledger command submission unless a separate explicit business decision introduces enforcement after v1.

## 8. Security / Compliance

### 8.1 Data minimization

Usage events contain no PII and no business payload. They contain counts, units, low-cardinality dimensions, tenant/environment identifiers, public operational references, and meter names.

Forbidden in usage event `attributes`:

| Forbidden data                            | Reason                                     |
| ----------------------------------------- | ------------------------------------------ |
| Customer names, emails, addresses         | PII not needed for metering.               |
| Payment method data                       | PCI scope must remain with provider.       |
| Transfer memo/business payload            | Not needed for platform usage.             |
| Raw Canton identifiers in public surfaces | Violates public API invisibility contract. |
| Full webhook payload bodies               | Could contain business data and secrets.   |
| API request body                          | Unnecessary and high-risk.                 |

### 8.2 Access control

| Surface                              | Required scope                                           |
| ------------------------------------ | -------------------------------------------------------- |
| GET `/v1/usage`                      | `usage:read` or admin key for tenant.                    |
| GET `/v1/invoices`                   | `billing:read` or admin key for tenant.                  |
| GET `/v1/invoices/{invoice}`         | `billing:read` or admin key for tenant.                  |
| POST `/v1/billing/portal_url`        | `billing:admin` admin key only.                          |
| Internal usage ingestion             | service identity with meter-emitter allowlist.           |
| Billing adapter provider credentials | secret manager/KMS only; never config bundle raw secret. |

### 8.3 PCI scope

Pillar must not collect, transmit, store, or render card data. Billing portal sessions are hosted by billing or equivalent. Pillar stores only provider customer/subscription/invoice references and provider-hosted URLs.

### 8.4 Tax/invoicing compliance

| Concern             | Phase 14 rule                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Tax calculation     | External provider owns jurisdictional tax calculation in v1.                               |
| Invoice retention   | Retain invoice records and provider references according to tax law and compliance policy. |
| Adjustments/credits | Performed through provider and imported into canonical invoice/adjustment view.            |
| Audit evidence      | Store rollups, invoice import timestamps, provider IDs, reconciliation results.            |
| Customer disputes   | Support workflow links invoice, rollups, source meters, and provider adjustment evidence.  |

### 8.5 Security invariants

| Invariant                             | Enforcement                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Usage cannot authorize ledger actions | No billing status check rejects ledger commands in v1.                               |
| Billing APIs are tenant-scoped        | All queries include authenticated tenant/environment boundaries.                     |
| Portal URLs are short-lived           | API returns a provider URL with expiry; URL is not persisted as a long-lived secret. |
| Provider webhooks are verified        | Billing adapter verifies provider webhook signatures before invoice import.          |
| No Canton leakage                     | Public examples and golden fixtures are scanned for forbidden substrings.            |

## 9. Implementation Plan

| ID      | Title                                                     | Path                                                                                                                               | Output                                                                                                                                  | Deps                               | Acceptance                                                                                                                                                 | Risk   |
| ------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P14.Q01 | Add usage event emission middleware                       | `apps/api/src/middleware/`, `apps/api/src/routes/v1/`                                                                              | Non-blocking middleware emitting `api.request.accepted`, `api.request.read_sampled`, and domain usage envelopes after accepted requests | P2.C02, P2.C03, P3.D03, P8.K02     | Route tests prove accepted mutation emits one usage event, idempotent replay does not double-count domain meter, and stream outage does not block response | high   |
| P14.Q02 | Build usage stream consumer                               | `services/usage-meter/`, `infra/compose/`, `infra/helm/pillar/`                                                                    | TypeScript `usage-meter` service consuming Kafka/Redis stream, validating meter registry, deduping, and writing `usage_events`          | P14.Q01, P3.D05, P9.J03            | Consumer integration test inserts event once, ignores duplicate `dedupe_key`, rejects unknown meter, and writes to current monthly partition               | high   |
| P14.Q03 | Implement rollup worker                                   | `services/usage-meter/src/rollups/`, `services/usage-meter/test/`                                                                  | Hourly/daily/monthly aggregation into `usage_rollups` with rebuild-safe idempotency                                                     | P14.Q02                            | Rollup test aggregates raw events into exact hourly/daily/monthly totals and repeated run produces byte-equal rows                                         | high   |
| P14.Q04 | Add pricing plan registry                                 | `apps/api/src/routes/v1/pricing*`, `packages/api-contracts/schemas/`, `db/migrations/0110_usage_metering*`                         | `pricing_plans` schema, `plan_*` object presenter, meter config validation, deployment-mode applicability                               | P14.Q03, P8.K04, P9.J04            | Unit tests reject unregistered meter, invalid deployment mode, retroactive plan mutation without effective period, and prefix collision                    | medium |
| P14.Q05 | Integrate billing adapter with billing-compatible provider | `services/billing-adapter/`, `infra/helm/pillar/`, `packages/api-contracts/schemas/`                                               | Provider adapter boundary for customers, usage records, invoices, webhook verification, and reconciliation imports                      | P14.Q03, P14.Q04, P8.K05           | Provider sandbox test or contract test exports closed monthly rollup with idempotency key and imports provider invoice into `invoices`                     | high   |
| P14.Q06 | Add `/v1/usage` API                                       | `apps/api/src/routes/v1/usage.ts`, `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/examples/usage/`       | Paginated usage rollup list/current-period summary returning `usage_rollup` objects                                                     | P14.Q03, P14.Q04, P2.C02, P2.C03   | API tests verify tenant scoping, cursor pagination, date filtering, no raw usage events, and no forbidden Canton fields                                    | medium |
| P14.Q07 | Add `/v1/invoices` API                                    | `apps/api/src/routes/v1/invoices.ts`, `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/examples/invoices/` | Paginated invoice list and invoice retrieve returning `inv_*` objects                                                                   | P14.Q05, P2.C02, P8.K02            | API tests verify invoice tenant scoping, status filtering, hosted URL policy, and no provider secret leakage                                               | medium |
| P14.Q08 | Add `/v1/billing/portal_url` endpoint                     | `apps/api/src/routes/v1/billing.ts`, `services/billing-adapter/src/portal/`, `packages/api-contracts/openapi/pillar-v1.yaml`       | Admin-only endpoint creating short-lived hosted billing portal URL                                                                      | P14.Q05, P14.Q07, P8.K02           | Route tests prove non-admin key is rejected, hosted tenant receives portal URL, self-hosted license-only tenant receives structured unsupported error      | medium |
| P14.Q09 | Build reconciliation job                                  | `services/billing-adapter/src/reconciliation/`, `services/usage-meter/src/reconciliation/`, `infra/observability/`                 | Nightly reconciliation comparing raw events, rollups, provider usage, provider invoices, and local invoice rows                         | P14.Q03, P14.Q05, P10.L01          | Reconciliation test detects missing provider usage, duplicate rollup, stale invoice import, and blocks monthly close for mismatched tenant/period          | high   |
| P14.Q10 | Add customer dispute workflow                             | `apps/api/src/routes/v1/invoices.ts`, `apps/dashboard/src/usage/`, `docs/Dev/Phase_13_Dashboard_Docs_Onboarding.md`                | Invoice dispute status, support evidence export, dashboard handoff contract for usage panel                                             | P14.Q06, P14.Q07, P14.Q09, P13.O04 | Support test retrieves invoice evidence pack with rollup lines and dispute status without exposing raw payloads or Canton internals                        | medium |

### Ticket dependency graph

```text
P14.Q01
  -> P14.Q02
      -> P14.Q03
          -> P14.Q04
          -> P14.Q06
          -> P14.Q09
P14.Q04
  -> P14.Q05
      -> P14.Q07
          -> P14.Q08
      -> P14.Q09
P14.Q06 + P14.Q07 + P14.Q09
  -> P14.Q10
```

### Implementation sequencing notes

1. `0110_usage_metering` lands before service code that writes usage tables.
2. Middleware lands with a no-blocking stream abstraction and tests before rollups exist.
3. `services/usage-meter/` owns raw event validation and rollup computation; API routes only read rollups.
4. `services/billing-adapter/` owns provider integration; API routes never call billing directly except through adapter client.
5. P14.Q10 is the Phase 13 handoff point for customer-visible usage panel behavior.

## 10. Open Questions

| Question                               | Options                                                                                                            | Blocks design freeze?                        | Notes                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Billing provider                       | billing, Chargebee, Maxio, in-house provider adapter                                                                | Yes                                          | v1 should choose one primary hosted provider while preserving adapter boundary.                              |
| Pricing model                          | Per-API-call, per-intent, per-ledger-command, per-balance-volume, per-webhook-delivery, per-storage, bundled tiers | Yes                                          | Pricing model is explicitly open; plan registry must support multiple meters before final prices are chosen. |
| Self-hosted license metering mechanism | Offline license file, signed usage summaries, control-plane heartbeat, customer-attested reporting                 | Yes for self-hosted commercial launch        | Must not require hot-path control-plane dependency.                                                          |
| Tax provider integration               | billing Tax, provider-native tax, Avalara, manual enterprise invoicing                                              | Yes for paid hosted launch                   | v1 must not implement in-house multi-currency tax logic.                                                     |
| Currency representation                | Major-unit decimal strings vs minor-unit integers                                                                  | Yes for API freeze                           | Must align with existing API decimal conventions.                                                            |
| Read request billing                   | Unbilled sampled analytics vs billable API call meter                                                              | No                                           | Can be configured per pricing plan.                                                                          |
| Failed ledger command billing          | Bill accepted API/intent only vs also bill submitted command attempts                                              | Yes for fairness policy                      | Rollups must distinguish meter types either way.                                                             |
| Customer-validator usage export        | Local advisory only vs signed aggregate export to control plane                                                    | No for hosted launch                         | Contract-driven.                                                                                             |
| Invoice adjustment public object       | Model adjustments inside `invoice.lines` vs separate `credit_note` object                                          | No for v1 if provider portal handles details | May require later phase/ADR.                                                                                 |
| Billing status enforcement             | Advisory only vs soft warning vs hard block after v1                                                               | No for v1                                    | v1 explicitly does not enforce credit limits.                                                                |

## 11. Agent-ready Checklist

### Build gate

| Gate item         | Required check                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration         | `0110_usage_metering` applies cleanly and creates `usage_events` monthly partitioning plus rollup/config/invoice tables.                     |
| Services          | `services/usage-meter` and `services/billing-adapter` build with the workspace package manager.                                              |
| API contract      | OpenAPI includes `/v1/usage`, `/v1/invoices`, `/v1/invoices/{invoice}`, and `/v1/billing/portal_url`.                                        |
| Object schemas    | `usage_rollup`, `invoice`, `pricing_plan`, and `customer_billing` schemas include `id`, `object`, `created`, `livemode`, and `metadata`.     |
| Deployment wiring | Compose/Helm values can enable usage-meter and billing-adapter for hosted mode without enabling provider billing for self-hosted by default. |

### Verify gate

| Gate item             | Required check                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Non-blocking emission | Usage event emission must not block API response path; stream outage test still returns the accepted API response. |
| Dedupe                | Duplicate usage event `dedupe_key` is not double-counted.                                                          |
| Rollup correctness    | Hourly, daily, and monthly rollups equal raw event sums for a test tenant/period.                                  |
| Provider sync         | Billing adapter exports closed hosted rollup to provider with idempotency and imports invoice status.              |
| Public usage API      | `/v1/usage` returns tenant-scoped `uro_*` objects with cursor pagination.                                          |
| Public invoice API    | `/v1/invoices` returns tenant-scoped `inv_*` objects and no provider secrets.                                      |
| Portal endpoint       | `/v1/billing/portal_url` is admin-only and returns structured unsupported errors for license-only modes.           |
| Reconciliation        | Nightly job detects raw/rollup/provider/invoice mismatch and blocks monthly close.                                 |
| Dashboard handoff     | Phase 13 panel can consume usage summary, invoice list, and current-period forecast without private DB access.     |

### Invariant gate

| Invariant                    | Required proof                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| No ledger authority          | Billing status, usage events, invoices, and plan rows do not approve, reject, or mutate Canton asset operations in v1.              |
| No asset state in billing DB | `0110_usage_metering` contains no authoritative balance, holding, settlement, or ownership tables.                                  |
| No Canton public leakage     | Golden examples for `/v1/usage`, `/v1/invoices`, and portal endpoint contain none of the forbidden public substrings.               |
| Deployment grammar stable    | Hosted, customer-validator, and self-hosted use the same endpoint/object grammar; only entitlement/status behavior changes.         |
| No PII in usage events       | Tests validate usage event attributes reject PII/business-payload fields and raw request bodies.                                    |
| API idempotency preserved    | Accepted mutation emits at most one billable domain usage event across idempotent replay.                                           |
| Commercial failure isolated  | Provider outage, usage stream outage, or invoice dispute cannot corrupt ledger projection or block ledger command submission in v1. |
