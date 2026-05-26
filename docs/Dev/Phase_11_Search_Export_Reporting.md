# Phase 11 — Search / Export / Reporting

> Expose ledger-traceable search, bulk export, scheduled reporting, and regulator-grade audit export over Pillar projections without exposing Canton internals.

## 1. Executive Summary

Phase 11 fills the Search / Data Export / Reporting gap described in [21 Search Data Export Reporting](../Architecture/21_Search%20Data%20Export%20Reporting.md). The phase adds the public and internal surfaces needed for customers to query projected Pillar objects, create asynchronous export jobs, schedule repeatable exports, and produce regulator-grade evidence packets from ledger-derived projections.

The mission is narrow: **Pillar exposes ledger-traceable search and bulk export over projection tables without exposing Canton internals**. The Canton Ledger remains the economic source of truth. Pillar DB remains Projection / Audit / Config only. Search and export read from PQS-backed projection tables, not from Ledger API raw contract state.

Primary dependencies:

| Dependency                                                                | Required capability                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [P3 DB + Idempotency](./Phase_03_DB_Idempotency.md)                       | migration substrate, request audit, idempotency, object identity helpers |
| [P5 Projection + Reconciliation](./Phase_05_Projection_Reconciliation.md) | balances, holdings, events, operations, checkpoints, rebuildability      |
| [P6 Webhook-first Event System](./Phase_06_Webhook_Event_System.md)       | async job completion events and delivery audit                           |
| [P8 Security & Compliance](./Phase_08_Security_Compliance.md)             | scoped API keys, audit controls, PII redaction, compliance evidence      |

Primary architecture sources:

| Source                                                                                      | Phase 11 dependency                                                               |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [21 Search Data Export Reporting](../Architecture/21_Search%20Data%20Export%20Reporting.md) | search grammar, export job lifecycle, reporting model, freshness caveats          |
| [04 Object Model](../Architecture/04_Object%20Model.md)                                     | public object conventions, ID prefixes, Canton-invisible response rules           |
| [05 Asset Read Model](../Architecture/05_asset%20read%20model.md)                           | projection substrate for balances, holdings, balance transactions, ledger entries |
| [22 Pillar Observability](../Architecture/22_Pillar%20Observability.md)                     | export volume telemetry, projection lag SLOs, redacted logging                    |
| [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)                       | monorepo paths, service boundaries, Kotlin/JVM service pattern                    |

Phase 11 directly enforces these [README §0 invariants](./README.md#cross-phase-invariants-never-violate):

| Invariant                                               | Phase 11 enforcement                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1. Canton Ledger is the single economic source of truth | Search/export read derived projection rows and include ledger watermarks for traceability.                                |
| 2. Pillar DB stores only Projection / Audit / Config    | `0090_search_reporting` stores job/config/checkpoint rows, never authoritative asset state.                               |
| 3. Public `/v1` API never exposes Canton internals      | Search results, export metadata, CLI/SDK examples use Pillar object IDs; privileged regulator export is scoped.           |
| 6. Events are emitted from projected ledger state       | `export_job.succeeded` and report events are emitted after materialization from projection snapshots.                     |
| 8. Deployment mode changes infrastructure only          | `/v1/search`, `/v1/exports`, `/v1/report_templates` behave identically for `hosted`, `customer-validator`, `self-hosted`. |
| 10. Projection must be rebuildable                      | Search indexes are rebuildable from projection/PQS checkpoints and never become the source of truth.                      |

Phase 11 satisfies these [REGRESSION_CONTRACT §2 clauses](./REGRESSION_CONTRACT.md#2-invariant-clauses-numbered-atomic-testable):

| Clause | Phase 11 satisfaction                                                                          |
| ------ | ---------------------------------------------------------------------------------------------- |
| IC-01  | Export consistency is expressed as ledger watermark + projection checkpoint, not DB authority. |
| IC-02  | New tables are projection/index checkpoint, audit, config, and job control records only.       |
| IC-03  | OpenAPI examples and golden exports forbid public Canton identifiers.                          |
| IC-06  | Async export/report events are generated after projected job state transitions.                |
| IC-08  | API grammar and object models are deployment-invariant.                                        |
| IC-10  | Search index rebuild, checkpoint replay, and export snapshot proofs are phase gates.           |

Phase 11 delivers:

| Deliverable      | Output                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Search API       | `/v1/search` with typed object filters, cursor pagination, freshness metadata, and redacted query logs                                    |
| Search indexer   | `services/search-indexer/` Kotlin/JVM pipeline reading PQS + projection changes and writing OpenSearch or Postgres FTS indexes            |
| Export API       | `/v1/exports` create/list/retrieve/cancel/download flow with async lifecycle and signed URLs                                              |
| Export worker    | `services/export-worker/` Kotlin/JVM paginator that materializes CSV, Parquet, and JSONL into object storage                              |
| Report templates | `/v1/report_templates` API for saved query/export definitions and scheduled runs                                                          |
| DB migration     | `packages/db/migrations/0090_search_reporting/` with `export_jobs`, `report_templates`, `search_index_checkpoints`, `export_destinations` |
| Evidence         | golden examples, chaos/perf coverage, audit export profile, SDK/CLI surface                                                               |

## 2. Goals / Non-goals

### Goals

| Goal                         | Concrete Phase 11 output                                                                                           | Source                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Typed search                 | `/v1/search` supports accounts, balances, holdings, intents, events, operations, export jobs, and report templates | [21 Search](../Architecture/21_Search%20Data%20Export%20Reporting.md#api--object-model)  |
| Cursor pagination            | Search and export listing use bounded cursor pagination with deterministic ordering at a projection watermark      | [REGRESSION_CONTRACT §3.4](./REGRESSION_CONTRACT.md#34-cursor-pagination-grammar)        |
| Freshness disclosure         | Every search response includes `freshness.mode`, `indexed_through`, and `lag_seconds`                              | [21 Search](../Architecture/21_Search%20Data%20Export%20Reporting.md#architecture)       |
| Async exports                | `export_job` supports CSV, Parquet, and JSONL materialization with job state transitions                           | [21 Export Jobs](../Architecture/21_Search%20Data%20Export%20Reporting.md#4-export-jobs) |
| Signed delivery              | Export download URLs are short-lived, auditable, scoped, and revocable                                             | [08 Security](./Phase_08_Security_Compliance.md)                                         |
| Scheduled exports            | Report templates can create scheduled export jobs through workflow-orchestrator integration                        | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)                    |
| Regulator-grade audit export | Privileged export profile includes ledger trace context, checksums, manifest, and audit log evidence               | [19 Compliance](../Architecture/19_Compliance.md)                                        |
| Report templates             | Saved parameterized definitions for repeatable reports and exports                                                 | [21 Search](../Architecture/21_Search%20Data%20Export%20Reporting.md)                    |
| Export telemetry             | Metrics cover row count, byte count, duration, failures, signed URL downloads, and deadline misses                 | [22 Observability](../Architecture/22_Pillar%20Observability.md)                         |
| SDK/CLI coverage             | Generated SDK methods and `pillar search/export/report-template` CLI commands exercise the same public API         | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)                    |

Typed search includes these object families:

| Object family       | Public object                                              | Search posture                                                               |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Identity/config     | `account`                                                  | searchable by public ID, status, metadata, created time                      |
| Balance read model  | `balance`                                                  | searchable by account, asset, available/locked/pending amounts, updated time |
| Position read model | `holding`                                                  | searchable by account, asset, holder, status, updated time, metadata         |
| Intent workflow     | `transfer_intent`, `issue_intent`, `redeem_intent`, `hold` | searchable by status, asset, amount, created time, operation                 |
| Events              | `event`, `webhook_delivery`                                | searchable by event type, delivery status, endpoint, attempts                |
| Operations          | `operation`                                                | searchable by public operation ID, request ID, status, created time          |
| Reporting           | `export_job`, `report_template`, `export_destination`      | searchable by status, object, schedule, owner, destination                   |

### Non-goals

| Non-goal                        | Reason                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger-direct queries           | Public customers must not query Ledger API, ACS, contract payloads, templates, parties, participants, synchronizers, or offsets as first-class API grammar. |
| Contract field exposure         | Search field catalogs are Pillar object fields only; raw Daml contract fields remain internal.                                                              |
| Real-time analytics OLAP        | Phase 11 is operational search/export, not a warehouse, BI cube, stream processor, or arbitrary SQL product.                                                |
| Strict read-after-write search  | Search is projection-indexed and returns freshness metadata; immediate confirmation remains object retrieve, intent status, or webhook.                     |
| Customer ad-hoc SQL             | Search grammar is typed, bounded, and parseable; no SQL passthrough is exposed.                                                                             |
| Mutating exports                | Export jobs materialize read-only data; they never correct balances, holdings, ledger rows, or projections.                                                 |
| Permanent public download links | Signed URLs are short TTL delivery mechanisms, not durable file hosting APIs.                                                                               |
| PII query logging               | Query text is classified, redacted, and hashed where needed; sensitive values are not written to normal logs.                                               |
| Search backend decision freeze  | OpenSearch vs Postgres FTS remains an open question until benchmark evidence is available.                                                                  |

### Entry prerequisites

| Prerequisite            | Required state                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| P3 schema substrate     | `packages/db/migrations/` structure, advisory lock convention, tenant key columns, audit tables available |
| P5 projection substrate | balance/holding/event/operation projection tables and checkpoint model available                          |
| P6 webhook substrate    | event type registration and dispatcher route for async job completion available                           |
| P8 security substrate   | scoped API keys, redaction, audit policy, customer KMS reference model available                          |
| Object model            | public ID prefixes and forbidden public field contract stable                                             |

## 3. Architecture

Phase 11 adds two runtime services and three public API surfaces while preserving the existing source-of-truth split.

```text
Customer / SDK / CLI / Workbench
        |
        v
apps/api
  - GET/POST /v1/search
  - /v1/exports
  - /v1/report_templates
        |
        +------------------------------+
        |                              |
        v                              v
services/search-indexer          services/export-worker
  Kotlin/JVM                       Kotlin/JVM
  PQS + projection reader          projection paginator
  field catalog compiler           file writer
  RBAC predicate compiler          checksum + manifest
  OpenSearch/Postgres FTS          object storage signer
        |                              |
        v                              v
Projection DB / Search Index      Object Storage
  balances, holdings, events       CSV / Parquet / JSONL
  operations, audit projections     manifest + checksums
        ^                              |
        |                              v
services/projection-worker         services/webhook-dispatcher
  ledger/PQS checkpoints            export_job.* events
        ^                              |
        |                              v
Canton Ledger / PQS              Customer webhook endpoint
```

### Component responsibilities

| Component                         | Responsibility                                                                                         | Source-of-truth stance                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `apps/api` search routes          | authenticate, parse public query envelope, validate object catalog, enforce pagination, render results | reads projection/search index only               |
| `apps/api` export routes          | create export jobs, list/retrieve/cancel jobs, create signed download URLs                             | creates audit/config/job rows, no economic state |
| `apps/api` report template routes | CRUD saved report templates and destinations, validate schedule envelopes                              | config only                                      |
| `services/search-indexer/`        | consume projection changes, maintain search index, track per-resource checkpoint                       | rebuildable derived index                        |
| `services/export-worker/`         | claim queued jobs, wait for projection watermark, paginate rows, write object, finalize job            | derived output with ledger watermark             |
| `services/workflow-orchestrator/` | trigger scheduled exports from report templates                                                        | orchestration over config rows                   |
| `services/webhook-dispatcher/`    | deliver `export_job.succeeded`, `export_job.failed`, and schedule failure events                       | async event plane from projected/job state       |
| Object storage                    | encrypted export blobs, manifests, checksums, TTL lifecycle                                            | delivery artifact, not source of truth           |
| Observability plane               | metrics/logs/traces for lag, volume, failures, deadlines, downloads                                    | operational evidence                             |

### Public API surfaces

| Surface          | Endpoints                                                                                                                                                                | Contract                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Search           | `GET /v1/search`, optional `POST /v1/search` for large query bodies                                                                                                      | typed, bounded query grammar, cursor pagination, freshness metadata |
| Exports          | `POST /v1/exports`, `GET /v1/exports/{id}`, `GET /v1/exports`, `POST /v1/exports/{id}/cancel`, `POST /v1/exports/{id}/download_url`                                      | async job lifecycle, idempotent create, signed URL retrieval        |
| Report templates | `POST /v1/report_templates`, `GET /v1/report_templates/{id}`, `GET /v1/report_templates`, `POST /v1/report_templates/{id}/run`, `POST /v1/report_templates/{id}/archive` | saved parameters, schedule integration, destination policy          |

### Search backend abstraction

Phase 11 must hide backend choice behind a service boundary:

| Backend candidate | Strength                                                  | Risk                                         | Required abstraction                                                  |
| ----------------- | --------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| Postgres FTS      | fewer services, transactional proximity, easier local dev | weaker large tenant relevance/search scaling | `SearchIndexWriter`, `SearchQueryPlanner`, `SearchExplain` interfaces |
| OpenSearch        | high-volume query and relevance features                  | operational complexity, index drift risk     | same interfaces plus replay/rebuild harness                           |

The API contract and tickets must not expose the backend decision. Benchmarks can switch the backing implementation without changing `/v1/search`.

### Consistency model

| Mode              | Search behavior                                            | Export behavior                      | Failure response                                    |
| ----------------- | ---------------------------------------------------------- | ------------------------------------ | --------------------------------------------------- |
| `eventual`        | default; answer from current indexed checkpoint            | not valid for regulator exports      | include freshness metadata                          |
| `bounded`         | require `max_lag_seconds`; fail if index lag exceeds bound | optional for operational exports     | `409 search_stale` or `409 export_projection_stale` |
| `ledger_snapshot` | optional support for exact point-in-time search pages      | required for audit/regulator exports | wait, timeout, or fail with checkpoint reason       |

### Deployment modes

| `deploymentMode`     | Search behavior                                       | Export behavior                                             |
| -------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| `hosted`             | managed index and managed object storage              | hosted object storage, hosted signer, customer KMS optional |
| `customer-validator` | same `/v1/search`; index may run in customer boundary | destination policy may require customer bucket or KMS key   |
| `self-hosted`        | same `/v1/search`; backend chosen by Helm values      | object storage and signer configured by operator            |

The enum is exactly `hosted`, `customer-validator`, `self-hosted`.

## 4. API / Object Model

### Public objects

| Object               | Prefix                  | Source                               | Public posture                                        |
| -------------------- | ----------------------- | ------------------------------------ | ----------------------------------------------------- |
| `search_query`       | none; request object    | transient API envelope               | not persisted by default; redacted audit record only  |
| `search_result`      | none; response envelope | derived from search index/projection | includes `data`, `has_more`, `next_page`, `freshness` |
| `export_job`         | `exp_*`                 | `export_jobs` audit/job table        | public async object; no raw storage path              |
| `report_template`    | `rpt_*`                 | `report_templates` config table      | public saved definition object                        |
| `export_destination` | `expdest_*`             | `export_destinations` config table   | public destination reference; secrets hidden          |

### `search_query`

```json
{
  "object": "search_query",
  "resource": "transfer",
  "query": "status:\"succeeded\" AND asset:\"asst_usdc\" AND created>=\"2026-05-01T00:00:00Z\"",
  "limit": 25,
  "starting_after": null,
  "freshness_mode": "bounded",
  "max_lag_seconds": 30,
  "expand": ["asset", "source_account", "destination_account"]
}
```

Search requests must support cursor pagination. The public grammar uses `limit`, `starting_after`, and `ending_before` for list-compatible SDK behavior. The implementation may translate cursors into index sort keys, but cursors remain opaque and stable for the projection watermark that created them.

### Transfer search example

```http
GET /v1/search?resource=transfer&query=status:%22succeeded%22%20AND%20asset:%22asst_usdc%22&limit=2
Pillar-Version: 2026-05-26
Authorization: Bearer sk_live_...
```

```json
{
  "object": "search_result",
  "data": [
    {
      "id": "trf_01jz7m9q2t7x8k5c2x4r9v6a01",
      "object": "transfer",
      "created": "2026-05-26T04:12:31Z",
      "livemode": true,
      "metadata": {
        "order_id": "ord_9821"
      },
      "status": "succeeded",
      "asset": "asst_usdc",
      "amount": {
        "value": "100.25",
        "quantum": "100250000",
        "scale": 6
      },
      "source_account": "acct_src_123",
      "destination_account": "acct_dst_456"
    }
  ],
  "has_more": true,
  "next_page": "srchcur_eyJ3YXRlcm1hcmsiOiIwMDAwMDAwMDAwMDA4ZjEyIn0",
  "freshness": {
    "mode": "bounded",
    "projection_state": "current",
    "indexed_through": {
      "ledger_offset": "0000000000008f12",
      "ledger_record_time": "2026-05-26T04:12:31.481Z"
    },
    "lag_seconds": 2
  }
}
```

### `export_job`

```json
{
  "id": "exp_01jz7n0etk4r3a8b9c2d6e7f8g",
  "object": "export_job",
  "created": "2026-05-26T04:20:00Z",
  "livemode": true,
  "metadata": {},
  "status": "queued",
  "resource": "transfer",
  "format": "csv",
  "compression": "gzip",
  "query": "asset:\"asst_usdc\" AND created>=\"2026-05-01T00:00:00Z\"",
  "columns": ["id", "created", "asset", "amount.value", "source_account", "destination_account"],
  "consistency": {
    "mode": "ledger_snapshot",
    "target_ledger_offset": "0000000000008f12",
    "indexed_through": null
  },
  "destination": null,
  "result": null,
  "expires_at": null
}
```

`export_job.status` values are:

| Status      | Meaning                                                                       | Terminal |
| ----------- | ----------------------------------------------------------------------------- | -------- |
| `queued`    | accepted and waiting for worker claim                                         | no       |
| `running`   | worker claimed and is waiting for checkpoint or writing output                | no       |
| `succeeded` | file, manifest, checksum, and audit records are complete                      | yes      |
| `failed`    | unrecoverable validation, projection, storage, timeout, or permission failure | yes      |
| `expired`   | completed file was removed or URL window ended after retention                | yes      |

The runtime may keep internal substates such as `waiting_for_projection` or `uploading`, but the public state machine is `queued -> running -> succeeded -> failed -> expired`.

### Async export create example

```http
POST /v1/exports
Idempotency-Key: 67720dc8-35d8-4b4e-b079-e75cfef5235a
Pillar-Version: 2026-05-26
Authorization: Bearer sk_live_...
Content-Type: application/json
```

```json
{
  "resource": "transfer",
  "query": "asset:\"asst_usdc\" AND created>=\"2026-05-01T00:00:00Z\"",
  "format": "parquet",
  "compression": "zstd",
  "columns": ["id", "created", "status", "asset", "amount.value", "amount.quantum"],
  "consistency_mode": "ledger_snapshot",
  "destination": {
    "type": "signed_url",
    "ttl_seconds": 900
  },
  "metadata": {
    "case_id": "case_2026_05_close"
  }
}
```

### `report_template`

```json
{
  "id": "rpt_01jz7n7yvrk3q7s4t9v2w1x0yz",
  "object": "report_template",
  "created": "2026-05-26T04:30:00Z",
  "livemode": true,
  "metadata": {},
  "name": "Monthly USDC transfers",
  "resource": "transfer",
  "query": "asset:\"asst_usdc\" AND created>=:interval_start AND created<:interval_end",
  "format": "csv",
  "columns": ["id", "created", "asset", "amount.value", "source_account", "destination_account"],
  "schedule": {
    "cron": "0 2 1 * *",
    "timezone": "UTC"
  },
  "destination": "expdest_01jz7n8bd2qh9h6y8e4m3p2k1j",
  "status": "active"
}
```

### `export_destination`

```json
{
  "id": "expdest_01jz7n8bd2qh9h6y8e4m3p2k1j",
  "object": "export_destination",
  "created": "2026-05-26T04:31:00Z",
  "livemode": true,
  "metadata": {},
  "type": "customer_s3",
  "name": "Treasury S3 bucket",
  "kms_key_ref": "kmsref_01jz7n8t5kq6w2r3e4y5u6i7o8",
  "status": "active"
}
```

### Error model

| Code                             | HTTP | Meaning                                                     |
| -------------------------------- | ---: | ----------------------------------------------------------- |
| `invalid_search_query`           |  400 | parser failure or unsupported boolean structure             |
| `unsupported_search_field`       |  400 | field is not in the resource catalog                        |
| `unsupported_search_operator`    |  400 | operator is not valid for field type                        |
| `too_many_search_clauses`        |  400 | query exceeds clause limit                                  |
| `search_stale`                   |  409 | bounded freshness cannot be satisfied                       |
| `export_projection_stale`        |  409 | export cannot reach requested snapshot before timeout       |
| `export_destination_unavailable` |  424 | configured customer destination is unreachable              |
| `signed_url_blocked`             |  424 | customer firewall or policy blocks download verification    |
| `export_deadline_missed`         |  500 | regulator or schedule deadline was missed by platform fault |

## 5. Internal Runtime

### Search indexer pipeline

```text
projection change committed
        |
        v
search-indexer polls projection checkpoint
        |
        v
load changed public object rows from projection/PQS-backed tables
        |
        v
apply field catalog + redaction + tenant/RBAC predicates
        |
        v
write OpenSearch document or Postgres FTS row
        |
        v
commit search_index_checkpoints(resource, tenant, projection_checkpoint)
```

| Stage     | Responsibility                                                  | Failure handling                                                          |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Detect    | read projection checkpoint and changed object ranges            | retry with backoff; do not advance checkpoint                             |
| Transform | convert projection rows to searchable public documents          | quarantine malformed row; emit metric; block checkpoint if invariant risk |
| Redact    | remove forbidden fields and PII-classified query/index fields   | fail closed if field classification missing                               |
| Index     | write to backend with deterministic document ID                 | idempotent upsert keyed by tenant/resource/public ID                      |
| Commit    | persist `search_index_checkpoints` after successful index write | transactionally compare previous checkpoint                               |

### Export job state machine

```text
queued
  |
  v
running
  |-- projection catches target watermark
  |-- paginator streams rows
  |-- writer emits object + manifest + checksum
  |-- audit row records query hash, requester, row count, bytes, watermark
  |
  +--> succeeded --> expired
  |
  +--> failed
```

Internal worker leases prevent duplicate materialization:

| Control      | Rule                                                                                 |
| ------------ | ------------------------------------------------------------------------------------ |
| Claim        | worker atomically claims `queued` jobs with `locked_by`, `locked_until`              |
| Heartbeat    | worker extends lease while writing chunks                                            |
| Idempotence  | object key includes `export_job.id` and generation attempt; final pointer moves once |
| Cancellation | cancel is honored before finalization; completed jobs are immutable                  |
| Expiration   | expiration removes downloadable blob but retains audit metadata and manifest digest  |

### Scheduled exports

Scheduled exports integrate with `services/workflow-orchestrator/`:

| Step     | Owner                             | Output                                                                  |
| -------- | --------------------------------- | ----------------------------------------------------------------------- |
| Register | `apps/api` report template route  | active `report_template` with schedule and destination                  |
| Tick     | `services/workflow-orchestrator/` | due template event, idempotency key derived from template ID + interval |
| Create   | `apps/api` internal export client | `export_job` with resolved interval parameters                          |
| Run      | `services/export-worker/`         | materialized file or failure event                                      |
| Notify   | `services/webhook-dispatcher/`    | `export_job.succeeded` or `export_job.failed`                           |

Schedule drift is measured as `actual_export_job_created_at - scheduled_fire_time` and must be emitted as a metric.

### Regulator export profile

Regulator exports are privileged jobs with an explicit profile:

| Profile feature | Required behavior                                                                           |
| --------------- | ------------------------------------------------------------------------------------------- |
| Scope           | limited to authorized compliance/admin scopes                                               |
| Watermark       | `ledger_snapshot` required                                                                  |
| Manifest        | includes query hash, schema version, row count, byte count, checksum, projection checkpoint |
| Ledger trace    | includes allowed ledger trace columns or separate privileged trace file                     |
| Audit           | every create, read, download URL generation, and destination delivery is audit logged       |
| Retention       | retention policy follows compliance configuration, not default short TTL                    |

## 6. DB Schema

Phase 11 owns migration set `packages/db/migrations/0090_search_reporting/` and no other migration range.

### Migration ownership

| Migration               | Owner | Tables                                                                               |
| ----------------------- | ----- | ------------------------------------------------------------------------------------ |
| `0090_search_reporting` | P11   | `export_jobs`, `report_templates`, `search_index_checkpoints`, `export_destinations` |

### Schema sketch

```sql
CREATE TYPE export_job_status AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed',
  'expired'
);

CREATE TYPE export_format AS ENUM (
  'csv',
  'parquet',
  'jsonl'
);

CREATE TABLE export_jobs (
  id text PRIMARY KEY CHECK (id LIKE 'exp_%'),
  tenant_id text NOT NULL,
  livemode boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_api_key_id text NOT NULL,
  request_id text NOT NULL,
  idempotency_key_hash text,
  status export_job_status NOT NULL DEFAULT 'queued',
  resource text NOT NULL,
  query text NOT NULL,
  query_hash text NOT NULL,
  format export_format NOT NULL,
  compression text,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  consistency_mode text NOT NULL,
  target_ledger_offset text,
  indexed_through_ledger_offset text,
  destination_id text,
  object_storage_key text,
  result_content_type text,
  result_size_bytes bigint,
  result_row_count bigint,
  result_sha256 text,
  manifest_sha256 text,
  failure_code text,
  failure_message text,
  locked_by text,
  locked_until timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
);

CREATE INDEX export_jobs_tenant_created_idx
  ON export_jobs (tenant_id, created_at DESC, id DESC);

CREATE INDEX export_jobs_tenant_status_idx
  ON export_jobs (tenant_id, status, created_at DESC);

CREATE TABLE report_templates (
  id text PRIMARY KEY CHECK (id LIKE 'rpt_%'),
  tenant_id text NOT NULL,
  livemode boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_api_key_id text NOT NULL,
  name text NOT NULL,
  description text,
  resource text NOT NULL,
  query_template text NOT NULL,
  format export_format NOT NULL,
  compression text,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  schedule jsonb,
  destination_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('active', 'archived'))
);

CREATE INDEX report_templates_tenant_status_idx
  ON report_templates (tenant_id, status, created_at DESC);

CREATE TABLE search_index_checkpoints (
  tenant_id text NOT NULL,
  resource text NOT NULL,
  backend text NOT NULL,
  projection_checkpoint text NOT NULL,
  ledger_offset text,
  ledger_record_time timestamptz,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  lag_seconds integer NOT NULL DEFAULT 0,
  document_count bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, resource, backend)
);

CREATE TABLE export_destinations (
  id text PRIMARY KEY CHECK (id LIKE 'expdest_%'),
  tenant_id text NOT NULL,
  livemode boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_api_key_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('signed_url', 'customer_s3', 'customer_gcs', 'sftp')),
  name text NOT NULL,
  config jsonb NOT NULL,
  secret_ref text,
  kms_key_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('active', 'disabled', 'failed'))
);

CREATE INDEX export_destinations_tenant_status_idx
  ON export_destinations (tenant_id, status, created_at DESC);
```

### Storage classification

| Table                      | Classification              | Rebuildability                                                                                   |
| -------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `export_jobs`              | Audit/runtime job state     | job metadata retained; output can be regenerated only if source projections and retention permit |
| `report_templates`         | Config                      | not ledger-derived; tenant configuration                                                         |
| `search_index_checkpoints` | Projection/index checkpoint | rebuildable from projection/PQS                                                                  |
| `export_destinations`      | Config + secret reference   | secrets stored only in secret manager; DB stores references                                      |

### DB invariants

| Invariant                    | Enforcement                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| No authoritative asset state | no balances, holdings, ownership, or ledger-effective rights are introduced in `0090_search_reporting`   |
| Public IDs only              | table primary keys use `exp_*`, `rpt_*`, `expdest_*`; raw object storage keys are never public responses |
| Query audit redaction        | store `query_hash`; raw query storage is allowed only if PII policy permits and logs remain redacted     |
| Tenant isolation             | every table includes `tenant_id`; all API queries predicate by tenant before cursor or search conditions |
| Cursor stability             | list indexes include `(tenant_id, created_at DESC, id DESC)` for deterministic pagination                |

## 7. Failure Modes

| Failure mode                        | Customer-visible symptom                                         | Detection                                                   | Mitigation                                                                | Owner ticket |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- | ------------ |
| Index lag                           | search omits recently projected object or `bounded` search fails | `search_index_lag_seconds` over threshold                   | freshness metadata, `409 search_stale`, indexer replay                    | P11.M02      |
| Blob storage outage                 | exports remain running or fail before signed URL                 | object storage write/sign metrics and worker exceptions     | retry, fail job with code, webhook notification                           | P11.M04      |
| Export timeout                      | large export fails or misses window                              | `export_duration_seconds`, lease timeout, row/page counters | chunked writer, resume-safe pagination, timeout classification            | P11.M04      |
| Schedule drift                      | scheduled exports are late                                       | workflow-orchestrator drift metric                          | idempotent schedule tick, alert, catch-up policy                          | P11.M07      |
| Regulator deadline miss             | compliance export not available by deadline                      | deadline SLO and job metadata                               | priority queue, alert, incident evidence, failure event                   | P11.M08      |
| PII leakage in export               | sensitive data appears in output or logs                         | schema classification tests, golden forbidden scans         | field catalog redaction, scoped privileged profiles                       | P11.M08      |
| Customer firewall blocks signed URL | customer cannot download completed export                        | download verification failure, customer support signal      | alternate destination, signed URL diagnostics, CLI download retries       | P11.M06      |
| Search backend unavailable          | `/v1/search` returns unavailable while object retrieve works     | health check and query failure rate                         | fail closed with `search_unavailable`; no fallback to stale hidden source | P11.M02      |
| Projection gap                      | export cannot prove coverage of requested ledger watermark       | checkpoint comparator                                       | fail with `export_projection_stale`; do not emit partial audit export     | P11.M04      |
| Duplicate worker claim              | same export is generated twice                                   | lease conflict metrics, object generation conflict          | atomic claim, generation key, single final pointer update                 | P11.M04      |
| Cursor corruption                   | pagination skips or repeats rows                                 | golden pagination tests and invariant checks                | opaque signed cursor with watermark and sort tuple                        | P11.M03      |
| Query abuse                         | expensive queries degrade tenant or shared backend               | rate-limit and query cost metrics                           | clause limit, field catalog, tenant quota, backend timeout                | P11.M03      |

## 8. Security / Compliance

### API scopes

| Scope                       | Allows                                                             | Denies                                                                         |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `search:read`               | `/v1/search` over permitted resources                              | exports, report template mutation, privileged trace fields                     |
| `exports:write`             | create/cancel export jobs                                          | destination secret retrieval, privileged regulator profile unless paired scope |
| `exports:read`              | list/retrieve export metadata and create signed URL for owned jobs | raw object storage key, expired blob access                                    |
| `report_templates:write`    | create/archive templates and schedules                             | customer KMS key mutation unless destination scope permits                     |
| `report_templates:read`     | list/retrieve templates                                            | destination secrets                                                            |
| `exports:regulator`         | regulator export profile and privileged audit columns              | use by normal API keys                                                         |
| `export_destinations:write` | create/disable destinations                                        | secret material readback                                                       |

Scoped API keys gate `/v1/exports`. A key with only read access cannot create export jobs. A key with export write access cannot automatically request privileged ledger trace columns.

### Signed URL policy

| Control        | Rule                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| TTL            | default 15 minutes; max configured by security policy; regulator profile may use controlled destination instead |
| Binding        | URL is bound to `export_job.id`, tenant, content hash, and requester audit context                              |
| Revocation     | expiration or job revocation blocks new signed URLs; already issued URLs rely on short TTL                      |
| Logging        | signed URL value is never logged; only URL generation event and hash are recorded                               |
| Download audit | every URL generation and destination delivery writes an audit event                                             |

### KMS and destination controls

| Control                  | Required behavior                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Platform encryption      | all object storage exports encrypted at rest                                       |
| Customer KMS reference   | optional `kms_key_ref` on `export_destination`; timing remains open question       |
| Secret storage           | destination credentials live in secret manager; DB stores `secret_ref` only        |
| Destination verification | create/update validates reachability without exposing secret material              |
| Retention                | object lifecycle is policy-driven per tenant, format, profile, and compliance tier |

### PII and query log controls

| Surface          | Rule                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Application logs | no raw query values when field classified as PII; log query hash and field names only             |
| Metrics          | no labels containing user query text, object IDs at high cardinality, or customer metadata values |
| Search index     | only field catalog entries marked searchable are indexed                                          |
| Export output    | columns are explicit; defaults are least-privilege and public-object-only                         |
| Regulator export | privileged fields require scope, profile, and audit reason                                        |

### Compliance evidence

Every export job must produce durable audit evidence:

| Evidence         | Required content                                                                 |
| ---------------- | -------------------------------------------------------------------------------- |
| Request audit    | API key object, tenant, request ID, idempotency hash, normalized parameters hash |
| Projection proof | checkpoint, ledger watermark, projection state, lag at job start/finalization    |
| Output proof     | format, compression, schema version, row count, byte count, SHA-256 digest       |
| Delivery proof   | signed URL generation or destination delivery attempt, status, timestamp         |
| Event proof      | emitted event ID and webhook delivery IDs where configured                       |

## 9. Implementation Plan

| ID      | Title                                               | Path                                                                                                                            | Output                                                                                                                                                   | Deps                               | Acceptance                                                                                                                               | Risk   |
| ------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P11.M01 | Add search/export OpenAPI contract                  | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/`, `packages/api-contracts/examples/`          | `/v1/search`, `/v1/exports`, `/v1/report_templates`, schemas for `search_query`, `export_job`, `report_template`, `export_destination`, errors, examples | P2.C01, P2.C02, P2.C03, P8.K02     | OpenAPI snapshot includes all Phase 11 paths; examples contain `exp_*`, `rpt_*`, `expdest_*`; forbidden public substrings scan is clean  | high   |
| P11.M02 | Build search-indexer service                        | `services/search-indexer/`, `packages/domain/src/search/`, `infra/compose/`                                                     | Kotlin/JVM service, field catalog compiler, projection checkpoint consumer, backend abstraction for OpenSearch/Postgres FTS                              | P5.G01, P5.G02, P5.G06, P10.L03    | local compose starts indexer; fixture projection changes produce searchable documents; checkpoint replay is idempotent                   | high   |
| P11.M03 | Implement search API route                          | `apps/api/src/routes/v1/search/`, `apps/api/src/controllers/search/`, `apps/api/src/presenters/search/`                         | authenticated `/v1/search` with query parsing, tenant predicates, cursor pagination, freshness metadata, error model                                     | P11.M01, P11.M02, P8.K02, P8.K07   | route tests cover valid transfer search, unsupported field, stale bounded search, cursor pagination, and no Canton internal fields       | high   |
| P11.M04 | Build export-worker service                         | `services/export-worker/`, `packages/domain/src/exports/`, `infra/compose/`                                                     | Kotlin/JVM worker with job leasing, projection paginator, CSV/Parquet/JSONL writers, checksum manifest, object storage adapter                           | P3.D05, P5.G02, P5.G06, P11.M01    | worker claims one queued job, materializes deterministic fixture export, records row/byte counts and SHA-256, and finalizes exactly once | high   |
| P11.M05 | Implement export API route                          | `apps/api/src/routes/v1/exports/`, `apps/api/src/controllers/exports/`, `apps/api/src/presenters/exports/`                      | create/list/retrieve/cancel/download URL routes for `export_job` with idempotent create and scope checks                                                 | P11.M01, P11.M04, P3.D03, P8.K02   | API tests cover idempotent create replay, cancel before run, retrieve succeeded job, scope denial, and signed URL creation audit         | high   |
| P11.M06 | Add signed URL service                              | `apps/api/src/services/export-downloads/`, `packages/security/src/`, `infra/helm/pillar/`                                       | short-TTL signer abstraction, audit log hooks, URL redaction, firewall diagnostic error mapping                                                          | P11.M05, P8.K04, P8.K06, P9.J04    | signer tests prove TTL bounds, URL values are never logged, and expired jobs cannot mint new URLs                                        | medium |
| P11.M07 | Implement report template API and scheduled exports | `apps/api/src/routes/v1/report_templates/`, `services/workflow-orchestrator/src/main/kotlin/`, `packages/domain/src/reporting/` | CRUD/archive/run endpoints, cron schedule model, orchestrator job creation integration                                                                   | P11.M01, P11.M05, P6.H03, P10.L02  | scheduled fixture creates exactly one export per interval with derived idempotency key; drift metric emitted                             | medium |
| P11.M08 | Add regulator export profile                        | `services/export-worker/src/main/kotlin/profiles/`, `packages/compliance/`, `packages/api-contracts/examples/exports/`          | privileged profile with ledger trace columns, manifest, reason/audit requirement, redaction rules                                                        | P11.M04, P11.M05, P8.K03, P8.K05   | regulator fixture includes manifest/checksum/projection proof; normal API key cannot request privileged profile                          | high   |
| P11.M09 | Wire DB migration `0090_search_reporting`           | `packages/db/migrations/0090_search_reporting/`, `packages/db/src/`                                                             | migration files for `export_jobs`, `report_templates`, `search_index_checkpoints`, `export_destinations`, typed accessors                                | P3.D01, P3.D05, P8.K01             | migration applies from clean DB; schema verifier classifies all new tables as Projection/Audit/Config                                    | high   |
| P11.M10 | Add SDK and CLI search/export surface               | `packages/sdk-node/`, `packages/sdk-python/`, `packages/sdk-java/`, `apps/workbench/`, `packages/cli/`                          | SDK methods and CLI commands for search, export create/list/download, report template run                                                                | P11.M01, P11.M03, P11.M05, P7.I02  | generated SDK smoke tests and CLI golden output show cursor pagination and async export flow without Canton internals                    | medium |
| P11.M11 | Add golden examples and documentation fixtures      | `packages/api-contracts/golden/search/`, `packages/api-contracts/golden/exports/`, `packages/api-contracts/examples/`           | golden JSON for transfer search, async export, scheduled report, regulator audit export, errors                                                          | P11.M01, P11.M03, P11.M05, P11.M08 | golden verifier passes forbidden-field scan and checksum snapshots are stable                                                            | medium |
| P11.M12 | Add chaos, perf, and telemetry coverage             | `services/search-indexer/src/test/`, `services/export-worker/src/test/`, `infra/observability/`, `packages/testing/chaos/`      | index lag tests, storage outage tests, export timeout tests, metrics dashboards, k6 export/search scenarios                                              | P11.M02, P11.M04, P11.M06, P10.L01 | tests simulate index lag, blob outage, timeout, schedule drift, and prove metrics/alerts fire with expected labels                       | high   |

### Dependency graph

```text
P11.M01 ──► P11.M03 ──► P11.M10 ──► P11.M11
   │             ▲             ▲
   │             │             │
   ├──► P11.M02 ─┘             │
   │                           │
   ├──► P11.M04 ──► P11.M05 ───┤
   │             │       │     │
   │             │       ├──► P11.M06
   │             │       └──► P11.M07
   │             └──► P11.M08
   └──► P11.M09

P11.M02 + P11.M04 + P11.M06 ──► P11.M12
```

### Ticket execution notes

| Rule            | Application                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Ticket IDs      | all Phase 11 tickets use `P11.Mnn` only                                                        |
| Dependencies    | every `Deps` cell uses explicit comma-separated fully-qualified ticket IDs                     |
| Migration path  | only `packages/db/migrations/0090_search_reporting/` is owned by Phase 11                      |
| Public examples | use `exp_*` for export jobs, `rpt_*` for report templates, `expdest_*` for destinations        |
| Backend choice  | tickets must keep Postgres FTS vs OpenSearch behind interfaces until open question is resolved |

## 10. Open Questions

| Question                                   | Decision needed                                                                                                        | Blocks                                                | Default until decided                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Search backend: Postgres FTS vs OpenSearch | choose backend for production default based on query volume, tenant isolation, operational cost, and benchmark results | design freeze for P11.M02 production deployment       | implement backend abstraction and local Postgres FTS profile                                                   |
| Export format priority: CSV vs Parquet     | decide default format and first-class docs ordering                                                                    | public docs examples and performance tuning           | CSV for accounting examples; Parquet for large warehouse profile; JSONL for API-native consumers               |
| Customer-supplied KMS key timing           | decide whether v1 supports customer KMS references for all destinations or only hosted enterprise                      | P11.M06 and P11.M07 enterprise destination acceptance | include `kms_key_ref` nullable field; enable only when P8 policy permits                                       |
| Regulator-specific export profiles         | decide named profiles and jurisdiction-specific field sets                                                             | P11.M08 profile catalog                               | implement generic `regulator_audit.1` profile with manifest and trace controls                                 |
| Raw query retention                        | decide whether raw query strings are stored in DB or only hashed/redacted                                              | audit search usability vs PII minimization            | store query hash and normalized field list; raw query stored only in export job parameters when policy permits |
| Signed URL max TTL                         | set tenant/default max and regulator exception path                                                                    | P11.M06 security acceptance                           | default 15 minutes, max 1 hour without compliance exception                                                    |
| Search over audit logs                     | decide whether `audit_log` search is admin-only in v1                                                                  | P11.M03 route authorization                           | admin/compliance scope only                                                                                    |
| Export cancellation semantics              | decide whether cancel can expire a succeeded file or only queued/running jobs                                          | P11.M05 route semantics                               | cancel affects queued/running only; succeeded files use expiration/revocation policy                           |

## 11. Agent-ready Checklist

### Build gate

| Gate item           | Required proof                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAPI contract    | `/v1/search`, `/v1/exports`, `/v1/report_templates` compile into generated API artifacts with schemas and examples                                      |
| DB migration        | `0090_search_reporting` applies cleanly and is the only Phase 11 migration path                                                                         |
| Services build      | `services/search-indexer/` and `services/export-worker/` compile with shared domain/security packages                                                   |
| API routes build    | search/export/report-template route modules compile and register under `/v1`                                                                            |
| SDK/CLI build       | generated SDKs and CLI commands compile against the Phase 11 OpenAPI contract                                                                           |
| Helm/compose wiring | search-indexer, export-worker, optional search backend, object storage settings, and metrics ports are configurable without deployment-mode API changes |

### Verify gate

| Gate item               | Required proof                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Search correctness      | fixture transfer, holding, balance, event, and operation rows are searchable by typed fields with deterministic cursor pagination         |
| Freshness behavior      | eventual search returns freshness; bounded search returns `409 search_stale` when lag exceeds threshold                                   |
| Export lifecycle        | async export moves `queued -> running -> succeeded`, writes CSV/Parquet/JSONL fixture outputs, records manifest/checksum, and emits event |
| Export failure coverage | blob outage, timeout, projection gap, customer firewall blocked signed URL, and duplicate claim scenarios are tested                      |
| Scheduled exports       | workflow-orchestrator creates one export per due template interval and emits schedule drift telemetry                                     |
| Regulator export        | privileged profile includes ledger/projection proof, manifest, checksums, and audit evidence; normal key is denied                        |
| Golden examples         | transfer search and async export create examples match schema snapshots and public ID prefixes                                            |
| Telemetry               | metrics exist for index lag, export rows/bytes/duration, signed URL creation, failures, deadline misses, and schedule drift               |

### Invariant gate

| Invariant                        | Required proof                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger source of truth           | exports identify projection watermark and never treat export output or search index as economic authority                                   |
| Projection / Audit / Config only | `0090_search_reporting` contains only job, template, checkpoint, destination, audit/config/projection state                                 |
| Canton-invisible public API      | golden examples, schemas, SDK output, CLI output, and webhook payloads contain no forbidden public Canton substrings                        |
| Projection rebuildability        | deleting/rebuilding search index from projection checkpoints produces equivalent searchable fixture results                                 |
| Webhook-first async              | export completion notifications are events/webhooks generated after job finalization, not optimistic API acceptance                         |
| Deployment-invariant grammar     | hosted, customer-validator, and self-hosted configs expose identical `/v1/search`, `/v1/exports`, and `/v1/report_templates` contracts      |
| Security scoping                 | scoped keys gate every export/report-template operation; signed URLs are short TTL and never logged                                         |
| PII minimization                 | query logs, metrics labels, golden examples, and export defaults exclude sensitive metadata unless privileged profile explicitly permits it |
