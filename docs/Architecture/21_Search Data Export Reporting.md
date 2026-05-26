# 21. Search / Data Export / Reporting — Pillar 설계안

## Executive Summary

Pillar의 Search, Data Export, Reporting 시스템은 **Canton Ledger를 원장 진실원(source of truth)** 으로 두고, Pillar DB에는 **Projection / Audit / Config** 만 저장하는 구조로 설계한다. 외부 고객은 Stripe처럼 `GET /v1/holdings/search`, `POST /v1/export_jobs`, `POST /v1/report_runs`를 사용하고, Canton/Daml contract ID, template, participant, synchronizer 같은 내부 개념은 기본적으로 보지 않는다. 내부 런타임은 Canton-native로 작동한다. 즉, ledger updates, command completions, ACS snapshot, ledger offsets를 기준으로 projection과 report를 생성한다.

공식 문서 리서치 기준은 다음과 같다. Stripe Search는 top-level resource 검색을 위한 별도 API이며 pagination보다 빠른 대안으로 설명되고, query clause, `AND`/`OR`, negation, numeric comparator, metadata query, freshness caveat를 명시한다. 특히 Search는 strict read-after-write에 쓰지 말아야 하고, 정상 조건에서는 보통 1분 이내 searchable하나 장애 시 최대 1시간 지연될 수 있다고 문서화되어 있다. ([Stripe 문서][1]) Stripe Metadata는 object에 key-value 정보를 붙이는 패턴이며, key/value 길이 제한과 민감정보 저장 금지 원칙이 있다. ([Stripe 문서][2]) Stripe Reports API는 financial reports를 CSV로 programmatic access할 수 있고, `ReportRun` 객체를 생성해 running 상태를 추적한 뒤 succeeded/failed webhook과 short-lived download URL로 결과를 받는 구조다. ([Stripe 문서][3]) Stripe Webhook은 live mode에서 exponential backoff로 최대 3일 자동 재시도하고, sandbox에서는 몇 시간 동안 3회 재시도하며, event ordering을 보장하지 않는다고 명시한다. ([Stripe 문서][4]) Stripe API versioning은 현재 문서상 `2026-04-22.dahlia`를 current version으로 제시하고, Workbench에서 기본 버전을 관리하거나 `Stripe-Version` header로 override하는 패턴을 제공한다. ([Stripe 문서][5]) Stripe CLI, Workbench, Sandbox 문서는 sandbox 기반 개발, webhook local forwarding, API Explorer, event destination 관리, health insight를 Stripe-grade developer experience의 기준으로 제시한다. ([Stripe 문서][6])

Canton/Daml 쪽 공식 문서는 Pillar 내부 설계의 근거다. Digital Asset Quickstart는 backend가 모든 ledger interaction을 중재하고, query는 PQS/Projection, command는 Ledger API gRPC로 처리하는 구조를 설명한다. ([Digital Asset][7]) Ledger API 문서는 `StateService.GetActiveContracts`로 active contract snapshot을 받고 이후 `UpdateService` stream으로 update를 이어가야 하며, active contract snapshot만 ledger end 상태라고 가정하면 안 된다고 설명한다. ([Digital Asset][8]) `UpdateService`는 ledger updates를 offset-indexed stream으로 제공하며, single synchronizer에서는 strong causal guarantee를 제공하지만 synchronizer 간에는 그렇지 않다고 명시한다. ([Digital Asset][8]) Command submission은 synchronous gRPC failure와 asynchronous completion failure가 모두 가능하고, completion stream을 먼저 subscribe해야 race를 줄일 수 있다. ([Digital Asset][8]) JSON Ledger API는 HTTP/JSON으로 gRPC Ledger API 기능 대부분을 제공하지만 production에서는 인터넷에 직접 노출하지 말라고 경고한다. ([Digital Asset][9]) DPM은 SDK components를 실행하는 CLI이고, Daml Assistant는 3.4.x부터 deprecated되어 3.5에서 dpm 사용을 권장하는 흐름이다. ([Digital Asset][10]) Sandbox는 Daml code를 올린 Canton ledger를 단일 participant/synchronizer topology로 실행하는 개발용 프로그램이다. ([Digital Asset][11])

**핵심 설계 결론:** Search는 ledger projection 위에서 빠르게 동작하되 freshness caveat를 명시한다. Export/Reporting은 단순 projection dump가 아니라 **ledger watermark / ledger offset / synchronizer-aware report context** 를 포함한다. 고객 경험은 Stripe-like이고, 내부 실행은 Canton-native이며, 모든 운영 결과는 ledger-traceable해야 한다.

---

## Goals / Non-goals

### Goals

1. **Stripe-like Search API**

   * per-resource search endpoint 제공.
   * Stripe-style query grammar 제공.
   * metadata search 제공.
   * `freshness` 정보를 response에 포함해 projection lag를 명시.

2. **Balance/Holding-first reporting**

   * 고객에게 contract list가 아니라 holding, balance snapshot, ledger transaction, intent 중심으로 제공.
   * 내부적으로만 contract/template/update trace를 유지.

3. **Ledger-traceable exports**

   * 모든 export/report row는 가능한 경우 `ledger_offset`, `ledger_update_id`, `ledger_record_time`, `synchronizer_id`, `intent_id`, `request_id`와 연결된다.
   * 외부 기본 export는 Canton-invisible, privileged audit export는 ledger trace 포함.

4. **Async-first export jobs**

   * 대량 export는 synchronous download가 아니라 `export_job` 또는 `report_run` 생성 후 webhook으로 완료 통지.
   * CSV, JSON/JSONL, Parquet 지원.
   * scheduled export 지원.

5. **Reconciliation-grade reports**

   * reconciliation report
   * ledger transaction report
   * webhook delivery report
   * balance snapshot report
   * audit export

6. **Same API across deployment models**

   * Sandbox, LocalNet, TestNet, production, self-hosted participant, managed participant 모두 동일한 public API grammar 유지.
   * API key와 environment만 다름.

### Non-goals

1. **Canton contract search를 public API로 직접 노출하지 않는다.**

   * `/v1/contracts/search`는 만들지 않는다.
   * contract ID는 internal audit/export scope에서만 제한적으로 노출한다.

2. **Search를 strict consistency read path로 사용하지 않는다.**

   * read-after-write는 object retrieve, intent status, webhook, 또는 `require_fresh=true`가 붙은 bounded freshness API로 처리한다.

3. **Pillar DB를 원장으로 만들지 않는다.**

   * DB는 projection, audit, config store다.
   * ledger-derived state는 언제든 ledger stream/ACS에서 재구축 가능해야 한다.

4. **Ad-hoc SQL을 외부 고객에게 제공하지 않는다.**

   * Search grammar는 Stripe-style field grammar다.
   * Sigma-like SQL은 별도 enterprise analytics product로 분리 가능하나 v1 scope 밖이다.

---

## Architecture

### 1. High-level architecture

```text
External Client / SDK / CLI / Workbench
        |
        v
Pillar Public API
  - /v1/*/search
  - /v1/export_jobs
  - /v1/report_runs
  - /v1/export_schedules
        |
        +-----------------------------+
        |                             |
        v                             v
Search Gateway                 Export/Report Orchestrator
  - Query parser                  - Async job lifecycle
  - Field catalog                 - Snapshot/watermark gating
  - RBAC predicate injection      - CSV/JSON/Parquet writers
  - Projection freshness          - File signing/delivery
        |                             |
        v                             v
Projection DB / Search Index     Object Storage
  - holdings                      - encrypted files
  - balances                      - checksums
  - intents                       - expiring URLs
  - ledger_transactions
  - webhook_deliveries
  - audit_log
        ^
        |
Ledger Projector / Runtime
  - ACS bootstrap
  - UpdateService stream
  - CommandCompletion stream
  - ledger offset cursor
  - synchronizer-aware ordering
        ^
        |
Canton Participant / Ledger API gRPC
```

### 2. Component responsibilities

| Component               | Responsibility                                                                                      | Source-of-truth stance                                |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Public API**          | Stripe-like API surface, auth, idempotency, pagination, versioning                                  | No ledger mutation unless it becomes a Canton command |
| **Search Gateway**      | Parse query grammar, enforce field catalog, inject tenant/RBAC filters, return projection freshness | Reads projection only                                 |
| **Ledger Projector**    | Consume ACS + UpdateService, materialize holdings, balances, transactions, events                   | Derived from ledger                                   |
| **Export Orchestrator** | Create export jobs, freeze report context, write files, emit webhooks                               | Reads projection at ledger watermark                  |
| **Report Engine**       | Reconciliation, ledger transaction, webhook delivery, balance snapshot, audit export                | Ledger-derived where applicable                       |
| **Webhook Dispatcher**  | Deliver async notifications and report delivery status                                              | Config + audit                                        |
| **Workbench**           | Dashboard/API explorer/query builder/report runner/webhook health                                   | UI over APIs                                          |
| **CLI**                 | Local and CI workflows: search, export, report, listen webhooks                                     | Same API as SDK                                       |
| **Sandbox Adapter**     | Local Canton/DPM sandbox + fake/test data + deterministic reports                                   | Same external API grammar                             |

### 3. Projection consistency model

Pillar exposes three freshness modes:

| Mode              | API behavior                                                                                  | Use case                                 |
| ----------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `eventual`        | Default. Uses current projection watermark. Returns `freshness` object.                       | Search, dashboard, exploratory reporting |
| `bounded`         | Client sets `max_lag_seconds`; API returns `409 search_stale` if lag exceeds threshold.       | Operational dashboards                   |
| `ledger_snapshot` | Export/report waits until projection is indexed through target ledger offset or interval end. | Accounting, reconciliation, audit        |

Example search response freshness:

```json
{
  "object": "search_result",
  "data": [],
  "has_more": false,
  "freshness": {
    "mode": "eventual",
    "projection_state": "current",
    "indexed_through": {
      "ledger_offset": "0000000000008f12",
      "ledger_record_time": "2026-05-26T04:12:31.481Z",
      "synchronizer_id": "sync_main"
    },
    "lag_seconds": 2
  }
}
```

### 4. Freshness caveat

Public docs must state:

> Search is backed by Pillar’s ledger projections and is not guaranteed for strict read-after-write flows. For immediate confirmation after creating or updating an object, retrieve the object by ID, inspect the intent status, or wait for the corresponding webhook. Search responses include the ledger projection watermark used to answer the query.

For exports/reports:

> A report is exact only relative to its stated `report_context`: interval, timezone, ledger watermark, synchronizer set, and projection catch-up status.

---

## API / Object Model

## 1. Search API

### Endpoints

```http
GET /v1/assets/search?query=...
GET /v1/accounts/search?query=...
GET /v1/holders/search?query=...
GET /v1/holdings/search?query=...
GET /v1/intents/search?query=...
GET /v1/transfers/search?query=...
GET /v1/ledger_transactions/search?query=...
GET /v1/balance_snapshots/search?query=...
GET /v1/events/search?query=...
GET /v1/webhook_deliveries/search?query=...
GET /v1/export_jobs/search?query=...
GET /v1/report_runs/search?query=...
GET /v1/audit_logs/search?query=...
```

Cross-object search is useful for Workbench and support tooling but should be gated:

```http
GET /v1/search?query=object:"holding" AND metadata["case_id"]:"CASE-123"
```

### Common query parameters

| Parameter         |    Type | Description                                          |
| ----------------- | ------: | ---------------------------------------------------- |
| `query`           |  string | Search grammar                                       |
| `limit`           | integer | Default `10`, max `100`                              |
| `page`            |  string | Opaque page token                                    |
| `expand[]`        |   array | Expand references, e.g. `asset`, `account`, `intent` |
| `freshness_mode`  |    enum | `eventual`, `bounded`                                |
| `max_lag_seconds` | integer | Required when `freshness_mode=bounded`               |
| `include[]`       |   array | Privileged fields, e.g. `ledger_trace`               |

### Query grammar

Pillar should implement a Stripe-style grammar, not raw SQL.

#### EBNF

```text
query       := clause (separator clause){0,9}
separator   := whitespace | whitespace? ("AND" | "OR") whitespace?
clause      := ["-"] field operator value
field       := identifier ("." identifier)* | metadata_field
metadata_field := "metadata" "[" quoted_key "]"
operator    := ":" | "~" | ">" | ">=" | "<" | "<=" | "="
value       := quoted_string | number | timestamp | boolean | "null"
```

#### Rules

| Rule            | Decision                                                                |
| --------------- | ----------------------------------------------------------------------- |
| Max clauses     | 10 clauses per query                                                    |
| Boolean logic   | Implicit `AND`; explicit `AND` or `OR`; no mixing `AND` and `OR` in v1  |
| Parentheses     | Not supported in v1                                                     |
| Exact match     | `field:"value"`                                                         |
| Substring match | `field~"substring"`; minimum 3 chars                                    |
| Negation        | `-field:"value"`                                                        |
| Presence        | `-metadata["key"]:null` means key exists                                |
| Absence         | `metadata["key"]:null` means key missing/null                           |
| Numeric compare | `amount.value>=100.00`, `created>1714521600`                            |
| Timestamp       | Unix seconds or RFC3339 string                                          |
| String escaping | `description:"Case \"Alpha\""`                                          |
| Metadata keys   | No `[` or `]`; normalized lowercase optional but original key preserved |

#### Examples

```http
GET /v1/holdings/search?query=asset:"ast_usdc" AND account:"acct_123"
```

```http
GET /v1/ledger_transactions/search?query=amount.value>=1000 AND asset:"ast_usdc"
```

```http
GET /v1/intents/search?query=status:"requires_action" AND created>"2026-05-01T00:00:00Z"
```

```http
GET /v1/transfers/search?query=metadata["order_id"]:"ord_9821" AND -metadata["case_id"]:null
```

```http
GET /v1/webhook_deliveries/search?query=status:"failed" AND endpoint:"we_123"
```

### Error model

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "invalid_search_query",
    "message": "Cannot mix AND and OR in the same query.",
    "param": "query",
    "request_id": "req_..."
  }
}
```

Important search errors:

| Code                          | Meaning                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `invalid_search_query`        | Parser failure                                                     |
| `unsupported_search_field`    | Field not searchable for resource                                  |
| `unsupported_search_operator` | Operator not supported for field type                              |
| `too_many_search_clauses`     | More than 10 clauses                                               |
| `search_stale`                | `bounded` freshness requested but projection lag exceeds threshold |
| `search_unavailable`          | Search index degraded; object retrieval still available            |
| `metadata_key_not_indexed`    | Metadata key exceeded policy or is not indexed                     |

---

## 2. Searchable objects

### Public searchable objects

| Object               | Prefix    | Search use                                                |
| -------------------- | --------- | --------------------------------------------------------- |
| `asset`              | `ast_`    | Canton-backed asset definition, issuer, scale, status     |
| `holder`             | `hldr_`   | End user/entity abstraction; party mapping hidden         |
| `account`            | `acct_`   | Customer-visible asset account/wallet abstraction         |
| `holding`            | `hld_`    | Balance/Holding-first object                              |
| `balance_snapshot`   | `bsnap_`  | Point-in-time holding snapshot                            |
| `intent`             | `int_`    | User/business intent before/after ledger execution        |
| `transfer`           | `trf_`    | Asset movement object                                     |
| `mint`               | `mnt_`    | Issuance object                                           |
| `burn`               | `brn_`    | Burn/destruction object                                   |
| `redemption`         | `rdm_`    | Redemption/withdrawal object                              |
| `ledger_transaction` | `ltxn_`   | Externalized transaction row, Canton-invisible by default |
| `event`              | `evt_`    | Pillar event object                                       |
| `webhook_delivery`   | `whd_`    | Delivery attempt/status                                   |
| `export_job`         | `exjob_`  | Export lifecycle                                          |
| `report_run`         | `reprun_` | Report lifecycle                                          |
| `audit_log`          | `aud_`    | Admin/security/audit events, privileged                   |

### Field catalog by object

#### `holding`

| Field                | Type              | Example                          |
| -------------------- | ----------------- | -------------------------------- |
| `id`                 | token             | `id:"hld_123"`                   |
| `asset`              | token             | `asset:"ast_usdc"`               |
| `account`            | token             | `account:"acct_123"`             |
| `holder`             | token             | `holder:"hldr_123"`              |
| `status`             | token             | `status:"active"`                |
| `balance.available`  | numeric           | `balance.available>1000`         |
| `balance.total`      | numeric           | `balance.total>=0`               |
| `updated`            | numeric/timestamp | `updated>"2026-05-01T00:00:00Z"` |
| `ledger_record_time` | numeric/timestamp | `ledger_record_time>1714521600`  |
| `metadata`           | token map         | `metadata["desk"]:"treasury"`    |

#### `ledger_transaction`

| Field                 | Type              | Example                           |
| --------------------- | ----------------- | --------------------------------- |
| `id`                  | token             | `id:"ltxn_123"`                   |
| `type`                | token             | `type:"transfer"`                 |
| `asset`               | token             | `asset:"ast_usdc"`                |
| `account`             | token             | `account:"acct_123"`              |
| `source_account`      | token             | `source_account:"acct_src"`       |
| `destination_account` | token             | `destination_account:"acct_dst"`  |
| `intent`              | token             | `intent:"int_123"`                |
| `amount.value`        | numeric           | `amount.value>1000`               |
| `created`             | timestamp         | `created>"2026-05-01"`            |
| `ledger_record_time`  | timestamp         | `ledger_record_time<"2026-06-01"` |
| `ledger_offset`       | token/numeric-ish | privileged                        |
| `metadata`            | token map         | `metadata["order_id"]:"ord_123"`  |

#### `webhook_delivery`

| Field               | Type      | Example                             |
| ------------------- | --------- | ----------------------------------- |
| `event`             | token     | `event:"evt_123"`                   |
| `endpoint`          | token     | `endpoint:"we_123"`                 |
| `status`            | token     | `status:"failed"`                   |
| `event_type`        | token     | `event_type:"report_run.succeeded"` |
| `attempt_count`     | numeric   | `attempt_count>3`                   |
| `last_attempted_at` | timestamp | `last_attempted_at>"2026-05-01"`    |
| `response_status`   | numeric   | `response_status>=500`              |

---

## 3. Metadata search

### Metadata policy

Pillar should adopt Stripe-like metadata constraints for predictability:

| Rule                 | Pillar decision           |
| -------------------- | ------------------------- |
| Metadata values      | Stored as strings         |
| Max keys per object  | 50                        |
| Max key length       | 40 chars                  |
| Max value length     | 500 chars                 |
| Disallowed key chars | `[` and `]`               |
| Sensitive data       | Prohibited                |
| Search syntax        | `metadata["key"]:"value"` |
| Presence             | `-metadata["key"]:null`   |
| Absence              | `metadata["key"]:null`    |

### Ledger source-of-truth treatment

Metadata must be classified:

| Metadata class                  | Storage                                         | Why                                                                      |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| **Ledger-semantic metadata**    | On-ledger Daml field or on-ledger metadata map  | Affects reconciliation, audit, or legal state                            |
| **External reference metadata** | On-ledger if attached to asset movement/intents | Must survive projection rebuild                                          |
| **Dashboard/config metadata**   | DB config/audit only                            | Applies to non-ledger objects such as webhook endpoints/export schedules |
| **Search-only alias**           | Disallowed unless derivable                     | Prevent DB becoming shadow source of truth                               |

For ledger-backed objects, metadata updates are ledger commands, not DB-only patches.

---

## 4. Export Jobs

### Object: `export_job`

```json
{
  "id": "exjob_123",
  "object": "export_job",
  "livemode": true,
  "status": "running",
  "type": "object_export",
  "format": "parquet",
  "compression": "zstd",
  "parameters": {
    "object": "ledger_transaction",
    "query": "asset:\"ast_usdc\" AND ledger_record_time>\"2026-05-01T00:00:00Z\"",
    "columns": ["id", "asset", "amount.value", "source_account", "destination_account"],
    "metadata_keys": ["order_id", "case_id"]
  },
  "consistency": {
    "mode": "ledger_snapshot",
    "target_ledger_offset": "0000000000008f12",
    "indexed_through": "0000000000008f12"
  },
  "result": null,
  "created": "2026-05-26T04:00:00Z",
  "started_at": "2026-05-26T04:00:02Z",
  "completed_at": null,
  "expires_at": null
}
```

### Endpoints

```http
POST /v1/export_jobs
GET  /v1/export_jobs/{id}
GET  /v1/export_jobs/{id}/download
POST /v1/export_jobs/{id}/cancel
GET  /v1/export_jobs?limit=...
GET  /v1/export_jobs/search?query=...
```

### Create export job

```json
{
  "type": "object_export",
  "object": "ledger_transaction",
  "query": "asset:\"ast_usdc\" AND ledger_record_time>\"2026-05-01T00:00:00Z\"",
  "format": "csv",
  "compression": "gzip",
  "columns": ["id", "created", "type", "asset", "amount.value", "source_account", "destination_account"],
  "metadata_keys": ["order_id", "case_id"],
  "consistency_mode": "ledger_snapshot"
}
```

### Export statuses

| Status                   | Meaning                                                  |
| ------------------------ | -------------------------------------------------------- |
| `queued`                 | Accepted, not started                                    |
| `waiting_for_projection` | Waiting until projection reaches target ledger watermark |
| `running`                | Generating file                                          |
| `succeeded`              | File ready                                               |
| `failed`                 | Terminal failure                                         |
| `canceled`               | Canceled by user/system                                  |
| `expired`                | File expired or deleted after retention                  |

### Export formats

| Format    | Usage                                          | Encoding                                                          |
| --------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `csv`     | Accounting, reconciliation, spreadsheet import | UTF-8, header row, RFC4180-ish escaping                           |
| `json`    | API consumers                                  | Default JSONL for large exports; `json_array=true` for small jobs |
| `parquet` | Data warehouse, lakehouse                      | Versioned schema, logical decimals/timestamps                     |

### Amount representation

Pillar should avoid ambiguity by exporting both human decimal and atomic quantum:

| Column           |       Example | Description                                |
| ---------------- | ------------: | ------------------------------------------ |
| `amount.value`   |    `"100.25"` | Decimal string in asset units              |
| `amount.quantum` | `"100250000"` | Integer string in asset quantum/base units |
| `amount.scale`   |           `6` | Asset decimal scale                        |
| `asset`          |    `ast_usdc` | Asset ID                                   |
| `asset.symbol`   |        `USDC` | Optional expanded display field            |

This is stricter than Stripe’s split between API minor units and CSV major units; Pillar should make both explicit in all exports.

---

## 5. Report Runs

### Object: `report_run`

```json
{
  "id": "reprun_123",
  "object": "report_run",
  "type": "balance_snapshot.summary.1",
  "status": "succeeded",
  "parameters": {
    "interval_start": "2026-05-01T00:00:00Z",
    "interval_end": "2026-06-01T00:00:00Z",
    "timezone": "UTC",
    "asset": "ast_usdc"
  },
  "report_context": {
    "ledger_offset_start": "0000000000007a00",
    "ledger_offset_end": "0000000000008f12",
    "synchronizers": ["sync_main"],
    "projection_state": "caught_up"
  },
  "result": {
    "file": "file_123",
    "content_type": "text/csv",
    "size": 204812,
    "sha256": "..."
  },
  "created": "2026-05-26T04:00:00Z",
  "completed_at": "2026-05-26T04:02:31Z"
}
```

### Endpoints

```http
POST /v1/report_runs
GET  /v1/report_runs/{id}
GET  /v1/report_runs/{id}/download
POST /v1/report_runs/{id}/cancel
GET  /v1/report_runs/search?query=...
GET  /v1/report_types
GET  /v1/report_types/{type}
```

### Report types

| Type                             | Description                                                      |
| -------------------------------- | ---------------------------------------------------------------- |
| `reconciliation.summary.1`       | Interval-level ledger/projection/external reconciliation summary |
| `reconciliation.itemized.1`      | Unmatched, mismatched, duplicate, late, and adjusted rows        |
| `ledger_transactions.itemized.1` | Ledger-derived transaction activity                              |
| `webhook_deliveries.itemized.1`  | Webhook event delivery attempts and outcomes                     |
| `balance_snapshot.summary.1`     | As-of balances by account/asset/holder                           |
| `balance_snapshot.itemized.1`    | Balance components and pending/reserved details                  |
| `audit_log.itemized.1`           | API/admin/ledger/webhook/export audit trail                      |

---

## 6. Reconciliation Report

### Purpose

Reconciliation report answers:

> “Given this interval and asset/account scope, do ledger-derived balances, Pillar projections, external references, and delivered operational events agree?”

### Inputs

```json
{
  "type": "reconciliation.itemized.1",
  "parameters": {
    "interval_start": "2026-05-01T00:00:00Z",
    "interval_end": "2026-06-01T00:00:00Z",
    "timezone": "UTC",
    "asset": "ast_usdc",
    "account": "acct_123",
    "external_reference_field": "metadata[\"order_id\"]",
    "external_file": "file_ext_123",
    "tolerance": {
      "amount": "0.000001"
    }
  },
  "format": "csv"
}
```

### Output sections

| Section                     | Description                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ |
| `summary`                   | Starting balance, ending balance, net movement, matched/unmatched counts       |
| `ledger_activity`           | Ledger-derived movements by type                                               |
| `projection_reconciliation` | Projection row count and ledger watermark agreement                            |
| `external_matching`         | Matched external reference rows                                                |
| `exceptions`                | Missing ledger row, missing external row, amount mismatch, duplicate reference |
| `late_arrivals`             | Events after interval cutoff but ledger-effective inside interval              |
| `adjustments`               | Manual/admin adjustment intents, if any, with ledger trace                     |

### Reconciliation statuses

| Status                | Meaning                                                      |
| --------------------- | ------------------------------------------------------------ |
| `matched`             | Ledger, projection, and external reference agree             |
| `ledger_only`         | Ledger movement exists without external match                |
| `external_only`       | External file/reference exists without ledger movement       |
| `amount_mismatch`     | Same reference, different amount                             |
| `duplicate_reference` | Same external reference maps to multiple ledger movements    |
| `late_projected`      | Ledger update arrived after export start but within interval |
| `projection_gap`      | Projection cursor cannot prove coverage                      |

---

## 7. Ledger Transaction Report

### Purpose

Ledger transaction report is the accounting-grade activity log for Canton-backed assets, expressed in Pillar terms.

### Default columns

| Column                | Description                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `id`                  | `ltxn_` transaction row ID                                                       |
| `created`             | Pillar-created timestamp                                                         |
| `ledger_record_time`  | Ledger record time                                                               |
| `type`                | `mint`, `burn`, `transfer`, `redemption`, `reservation`, `release`, `adjustment` |
| `intent`              | Originating intent ID                                                            |
| `asset`               | Asset ID                                                                         |
| `asset.symbol`        | Optional expanded symbol                                                         |
| `source_account`      | Source account, if any                                                           |
| `destination_account` | Destination account, if any                                                      |
| `amount.value`        | Decimal amount                                                                   |
| `amount.quantum`      | Atomic amount                                                                    |
| `status`              | `posted`, `reversed`, `pending_effect`, etc.                                     |
| `metadata.*`          | Requested metadata columns                                                       |

### Privileged `ledger_trace` columns

Only for `include[]=ledger_trace` and audit/reporting scopes:

| Column               | Description                                     |
| -------------------- | ----------------------------------------------- |
| `ledger_update_id`   | Canton update/transaction ID                    |
| `ledger_offset`      | Participant offset                              |
| `synchronizer_id`    | Synchronizer that ordered the update            |
| `command_id`         | Ledger command ID                               |
| `workflow_id`        | Internal workflow correlation ID                |
| `contract_event_ids` | Hashed or raw event IDs depending on permission |
| `template_id`        | Internal-only Daml template identifier          |

Public default remains **transaction-first / holding-first**, not contract-first.

---

## 8. Webhook Delivery Report

### Purpose

Webhook delivery report is the operational truth for async workflows.

### Columns

| Column                | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| `delivery_id`         | `whd_` ID                                                      |
| `event_id`            | `evt_` ID                                                      |
| `event_type`          | e.g. `report_run.succeeded`                                    |
| `endpoint_id`         | Webhook endpoint                                               |
| `api_version`         | Event payload API version                                      |
| `created`             | Event creation timestamp                                       |
| `attempt_count`       | Number of attempts                                             |
| `last_attempted_at`   | Last attempt timestamp                                         |
| `next_retry_at`       | Next scheduled retry                                           |
| `status`              | `pending`, `delivered`, `failed`, `exhausted`                  |
| `response_status`     | HTTP status                                                    |
| `response_latency_ms` | Delivery latency                                               |
| `failure_code`        | `timeout`, `tls_error`, `http_5xx`, `signature_rejected`, etc. |
| `request_id`          | Pillar outbound request ID                                     |

### Delivery behavior

Pillar should document:

* Webhook delivery is **at-least-once**.
* Ordering is **not guaranteed**.
* Consumers must deduplicate by `event.id`.
* Pillar signs payloads with timestamped HMAC.
* Endpoint API version is pinned at endpoint creation unless explicitly changed.
* Webhook delivery report is the authoritative operational report for retries and failures.

---

## 9. Balance Snapshot Report

### Purpose

Balance snapshot report answers:

> “What did each account/holder hold at this ledger point or business cutoff?”

### Parameters

```json
{
  "type": "balance_snapshot.summary.1",
  "parameters": {
    "as_of": "2026-05-31T23:59:59Z",
    "timezone": "UTC",
    "asset": "ast_usdc",
    "group_by": ["holder", "account", "asset"],
    "include_pending": true,
    "include_reserved": true
  },
  "format": "parquet"
}
```

### Balance components

| Component          | Meaning                                              |
| ------------------ | ---------------------------------------------------- |
| `available`        | Usable balance                                       |
| `pending_inbound`  | Ledger or intent-confirmed inbound pending           |
| `pending_outbound` | Outbound pending/reserved                            |
| `reserved`         | Compliance, dispute, pledge, or workflow reservation |
| `restricted`       | Policy-blocked holdings                              |
| `total`            | Sum of balance components according to asset policy  |

### Snapshot context

Every snapshot row includes:

```json
{
  "as_of": "2026-05-31T23:59:59Z",
  "ledger_offset": "0000000000008f12",
  "ledger_record_time": "2026-05-31T23:59:58.911Z",
  "projection_state": "caught_up"
}
```

---

## 10. Audit Export

### Purpose

Audit export is the full trace of operations across API, ledger commands, projection, webhooks, exports, and admin changes.

### Audit row classes

| Class            | Examples                                                           |
| ---------------- | ------------------------------------------------------------------ |
| `api_request`    | Create intent, retrieve holding, create export                     |
| `idempotency`    | First request, replay, parameter mismatch                          |
| `ledger_command` | Submitted, accepted, completed, rejected                           |
| `ledger_update`  | Update ingested, projection applied                                |
| `projection`     | Projection row upsert/delete/rebuild                               |
| `webhook`        | Event created, delivery attempted, delivered/failed                |
| `export`         | Job created, file written, download URL generated                  |
| `admin_config`   | API key changes, webhook endpoint changes, report schedule changes |
| `security`       | Auth failure, permission denied, suspicious access                 |

### Required audit fields

| Field                  | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `audit_id`             | `aud_` ID                                       |
| `created`              | Timestamp                                       |
| `actor_type`           | `api_key`, `user`, `system`, `ledger_projector` |
| `actor_id`             | Redacted/scoped actor ID                        |
| `request_id`           | Pillar request ID                               |
| `idempotency_key_hash` | Hash only                                       |
| `object_type`          | Target object type                              |
| `object_id`            | Target object ID                                |
| `operation`            | Operation name                                  |
| `before`               | Optional redacted JSON                          |
| `after`                | Optional redacted JSON                          |
| `ledger_trace`         | Optional privileged trace                       |
| `ip_address`           | For user/API actions                            |
| `user_agent`           | For user/API actions                            |
| `hash_prev`            | Tamper-evident chain pointer                    |
| `hash_current`         | Row hash                                        |

---

## 11. Scheduled Exports

### Object: `export_schedule`

```json
{
  "id": "exsch_123",
  "object": "export_schedule",
  "status": "active",
  "type": "report_run",
  "report_type": "balance_snapshot.summary.1",
  "format": "csv",
  "cron": "0 2 * * *",
  "timezone": "Asia/Seoul",
  "parameters": {
    "asset": "ast_usdc",
    "group_by": ["account", "asset"]
  },
  "destination": {
    "type": "webhook"
  },
  "created": "2026-05-26T04:00:00Z"
}
```

### Endpoints

```http
POST /v1/export_schedules
GET  /v1/export_schedules/{id}
POST /v1/export_schedules/{id}
POST /v1/export_schedules/{id}/pause
POST /v1/export_schedules/{id}/resume
DELETE /v1/export_schedules/{id}
GET  /v1/export_schedules/search?query=...
```

### Schedule guarantees

* `unique(schedule_id, period_start, period_end)` prevents duplicate scheduled runs.
* Schedule-created jobs use idempotency key:

  * `schedule:{schedule_id}:{period_start}:{period_end}`
* Missed schedules are marked `skipped`, `delayed`, or `backfilled`.
* Backfills are explicit jobs with `backfill_of=exsch_...`.

---

## Internal Runtime

### 1. Ledger projector

The projector has two ingestion paths:

1. **Bootstrap**

   * Call `StateService.GetActiveContracts`.
   * Build initial projection state.
   * Capture `active_at_offset`.
   * Start `UpdateService.GetUpdates` from that offset.

2. **Continuous updates**

   * Consume `UpdateService.GetUpdates`.
   * Convert create/archive/exercise events into Pillar domain deltas.
   * Write projection rows and ledger cursor in one DB transaction.
   * Emit Pillar events after durable projection commit.

### 2. Projection transaction pattern

```text
BEGIN;

INSERT INTO ledger_updates (...)
ON CONFLICT DO NOTHING;

UPSERT holdings / balances / ledger_transactions / intents;

UPSERT search_documents;

UPDATE ledger_cursors
SET offset = :offset,
    ledger_record_time = :record_time,
    synchronizer_id = :synchronizer_id;

INSERT INTO event_outbox (...);

COMMIT;
```

Then:

```text
Webhook Dispatcher reads event_outbox
  -> creates event
  -> creates webhook_delivery rows
  -> sends signed HTTPS requests
  -> updates delivery status
```

### 3. Command and idempotency linkage

For mutating API requests:

```text
Idempotency-Key
  -> request hash
  -> intent_id
  -> ledger command_id
  -> command completion
  -> ledger update_id
  -> projection update
  -> event/webhook
```

Pillar should use a deterministic ledger `command_id` derived from:

```text
command_id = "pillar:" + tenant_id + ":" + endpoint + ":" + sha256(idempotency_key)
```

Canton command deduplication has participant-scoped guarantees, so Pillar must keep ledger submission sticky to the same participant where possible and retain HTTP idempotency state independently. Canton docs note command deduplication is only guaranteed if commands are submitted to the same Participant Node. ([Digital Asset][12])

### 4. Search execution

Search pipeline:

```text
HTTP request
  -> authenticate
  -> parse query
  -> validate field catalog
  -> inject tenant/account/RBAC predicates
  -> choose index path
       - exact/numeric: projection SQL indexes
       - string substring: tsvector/trigram or search engine
       - metadata: metadata_index
  -> execute
  -> attach freshness watermark
  -> return paginated result
```

### 5. Export/report execution

Report pipeline:

```text
POST /v1/report_runs
  -> validate report type and parameters
  -> create report_run queued
  -> determine interval and target ledger watermark
  -> wait for projection if consistency_mode=ledger_snapshot
  -> stream rows from projection DB
  -> write chunks
  -> finalize CSV/JSON/Parquet
  -> compute checksum
  -> store encrypted file
  -> mark succeeded
  -> emit report_run.succeeded webhook
```

### 6. Workbench / CLI / SDK

#### SDK

SDKs expose typed methods:

```ts
const result = await pillar.holdings.search({
  query: 'asset:"ast_usdc" AND balance.available>100',
  limit: 25
});

const run = await pillar.reportRuns.create({
  type: 'balance_snapshot.summary.1',
  parameters: { asset: 'ast_usdc', as_of: '2026-05-31T23:59:59Z' },
  format: 'parquet'
}, {
  idempotencyKey: crypto.randomUUID()
});
```

#### CLI

```bash
pillar holdings search 'asset:"ast_usdc" AND balance.available>100'
pillar report-runs create balance_snapshot.summary.1 --asset ast_usdc --as-of 2026-05-31T23:59:59Z --format csv
pillar export-jobs download exjob_123 --output report.csv
pillar listen --forward-to localhost:4242/webhooks
```

#### Workbench

Workbench must include:

* Search query builder
* Field catalog explorer
* Report type explorer
* Report run console
* Export file browser
* Webhook event/delivery inspector
* API request logs
* Projection freshness dashboard
* Ledger trace viewer for privileged users
* Sandbox switcher

#### Sandbox

Sandbox must run:

* Local Pillar API
* Local Canton/DPM sandbox
* Seeded DARs/assets/accounts
* Fake webhook endpoint listener
* Deterministic report fixtures
* CLI examples

The external API remains identical across sandbox and production.

---

## DB Schema

Below schema is conceptual; actual implementation should use UUID/ULID surrogate keys plus public IDs.

### 1. Ledger cursor and updates

```sql
CREATE TABLE ledger_cursors (
  tenant_id             TEXT NOT NULL,
  participant_id        TEXT NOT NULL,
  synchronizer_id       TEXT NOT NULL,
  cursor_name           TEXT NOT NULL,
  ledger_offset         TEXT NOT NULL,
  ledger_record_time    TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, participant_id, synchronizer_id, cursor_name)
);

CREATE TABLE ledger_updates (
  tenant_id             TEXT NOT NULL,
  ledger_update_id      TEXT NOT NULL,
  ledger_offset         TEXT NOT NULL,
  synchronizer_id       TEXT NOT NULL,
  ledger_record_time    TIMESTAMPTZ NOT NULL,
  command_id            TEXT,
  workflow_id           TEXT,
  update_type           TEXT NOT NULL,
  raw_ref               JSONB,
  ingested_at           TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, ledger_update_id)
);

CREATE INDEX idx_ledger_updates_offset
  ON ledger_updates (tenant_id, synchronizer_id, ledger_offset);
```

### 2. Domain projections

```sql
CREATE TABLE assets (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  symbol                TEXT NOT NULL,
  asset_code            TEXT,
  issuer_id             TEXT,
  scale                 INT NOT NULL,
  status                TEXT NOT NULL,
  metadata              JSONB NOT NULL DEFAULT '{}',
  ledger_update_id      TEXT,
  ledger_offset         TEXT,
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE accounts (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  holder_id             TEXT NOT NULL,
  status                TEXT NOT NULL,
  external_reference    TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE holdings (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  account_id            TEXT NOT NULL,
  holder_id             TEXT NOT NULL,
  asset_id              TEXT NOT NULL,
  available_quantum     NUMERIC(78,0) NOT NULL,
  pending_in_quantum    NUMERIC(78,0) NOT NULL,
  pending_out_quantum   NUMERIC(78,0) NOT NULL,
  reserved_quantum      NUMERIC(78,0) NOT NULL,
  restricted_quantum    NUMERIC(78,0) NOT NULL,
  total_quantum         NUMERIC(78,0) NOT NULL,
  status                TEXT NOT NULL,
  metadata              JSONB NOT NULL DEFAULT '{}',
  ledger_update_id      TEXT NOT NULL,
  ledger_offset         TEXT NOT NULL,
  ledger_record_time    TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, account_id, asset_id)
);

CREATE INDEX idx_holdings_account_asset
  ON holdings (tenant_id, account_id, asset_id);

CREATE INDEX idx_holdings_asset_available
  ON holdings (tenant_id, asset_id, available_quantum);
```

### 3. Ledger transactions

```sql
CREATE TABLE ledger_transactions (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  type                  TEXT NOT NULL,
  intent_id             TEXT,
  asset_id              TEXT NOT NULL,
  source_account_id     TEXT,
  destination_account_id TEXT,
  amount_quantum        NUMERIC(78,0) NOT NULL,
  amount_scale          INT NOT NULL,
  status                TEXT NOT NULL,
  metadata              JSONB NOT NULL DEFAULT '{}',
  ledger_update_id      TEXT NOT NULL,
  ledger_offset         TEXT NOT NULL,
  synchronizer_id       TEXT NOT NULL,
  ledger_record_time    TIMESTAMPTZ NOT NULL,
  command_id            TEXT,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX idx_ltxn_asset_time
  ON ledger_transactions (tenant_id, asset_id, ledger_record_time);

CREATE INDEX idx_ltxn_accounts
  ON ledger_transactions (tenant_id, source_account_id, destination_account_id);
```

### 4. Search documents and metadata index

```sql
CREATE TABLE search_documents (
  tenant_id             TEXT NOT NULL,
  object_type           TEXT NOT NULL,
  object_id             TEXT NOT NULL,
  document              JSONB NOT NULL,
  text_vector           TSVECTOR,
  ledger_offset         TEXT,
  ledger_record_time    TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, object_type, object_id)
);

CREATE INDEX idx_search_documents_doc
  ON search_documents USING GIN (document);

CREATE INDEX idx_search_documents_text
  ON search_documents USING GIN (text_vector);

CREATE TABLE metadata_index (
  tenant_id             TEXT NOT NULL,
  object_type           TEXT NOT NULL,
  object_id             TEXT NOT NULL,
  key                   TEXT NOT NULL,
  value                 TEXT,
  value_normalized      TEXT,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, object_type, object_id, key)
);

CREATE INDEX idx_metadata_lookup
  ON metadata_index (tenant_id, object_type, key, value_normalized);
```

### 5. Idempotency and API audit

```sql
CREATE TABLE idempotency_records (
  tenant_id             TEXT NOT NULL,
  api_key_id            TEXT NOT NULL,
  idempotency_key_hash  TEXT NOT NULL,
  method                TEXT NOT NULL,
  path                  TEXT NOT NULL,
  request_hash          TEXT NOT NULL,
  response_status       INT,
  response_body         JSONB,
  status                TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  expires_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, api_key_id, idempotency_key_hash)
);

CREATE TABLE api_requests (
  tenant_id             TEXT NOT NULL,
  request_id            TEXT NOT NULL,
  api_key_id            TEXT,
  method                TEXT NOT NULL,
  path                  TEXT NOT NULL,
  request_hash          TEXT,
  response_status       INT,
  idempotency_key_hash  TEXT,
  ip_address            INET,
  user_agent            TEXT,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, request_id)
);
```

### 6. Events and webhook delivery

```sql
CREATE TABLE events (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  type                  TEXT NOT NULL,
  api_version           TEXT NOT NULL,
  object_type           TEXT,
  object_id             TEXT,
  request_id            TEXT,
  idempotency_key_hash  TEXT,
  payload               JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE webhook_endpoints (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  url                   TEXT NOT NULL,
  status                TEXT NOT NULL,
  api_version           TEXT NOT NULL,
  enabled_events        TEXT[] NOT NULL,
  secret_ref            TEXT NOT NULL,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE webhook_deliveries (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  event_id              TEXT NOT NULL,
  endpoint_id           TEXT NOT NULL,
  status                TEXT NOT NULL,
  attempt_count         INT NOT NULL DEFAULT 0,
  last_attempted_at     TIMESTAMPTZ,
  next_retry_at         TIMESTAMPTZ,
  response_status       INT,
  response_latency_ms   INT,
  failure_code          TEXT,
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX idx_webhook_deliveries_status
  ON webhook_deliveries (tenant_id, status, next_retry_at);
```

### 7. Export jobs, report runs, schedules

```sql
CREATE TABLE export_jobs (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  type                  TEXT NOT NULL,
  status                TEXT NOT NULL,
  format                TEXT NOT NULL,
  compression           TEXT,
  parameters            JSONB NOT NULL,
  consistency_mode      TEXT NOT NULL,
  target_ledger_offset  TEXT,
  indexed_through       TEXT,
  file_id               TEXT,
  error                 JSONB,
  created_at            TIMESTAMPTZ NOT NULL,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE report_runs (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  report_type           TEXT NOT NULL,
  status                TEXT NOT NULL,
  parameters            JSONB NOT NULL,
  report_context        JSONB,
  file_id               TEXT,
  error                 JSONB,
  created_at            TIMESTAMPTZ NOT NULL,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE export_files (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  storage_uri           TEXT NOT NULL,
  content_type          TEXT NOT NULL,
  size_bytes            BIGINT NOT NULL,
  sha256                TEXT NOT NULL,
  encryption_key_ref    TEXT,
  created_at            TIMESTAMPTZ NOT NULL,
  expires_at            TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE export_schedules (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  status                TEXT NOT NULL,
  schedule_type         TEXT NOT NULL,
  cron                  TEXT NOT NULL,
  timezone              TEXT NOT NULL,
  parameters            JSONB NOT NULL,
  destination           JSONB NOT NULL,
  next_run_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE export_schedule_runs (
  tenant_id             TEXT NOT NULL,
  schedule_id           TEXT NOT NULL,
  period_start          TIMESTAMPTZ NOT NULL,
  period_end            TIMESTAMPTZ NOT NULL,
  export_job_id         TEXT,
  report_run_id         TEXT,
  status                TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, schedule_id, period_start, period_end)
);
```

### 8. Audit log

```sql
CREATE TABLE audit_log_entries (
  tenant_id             TEXT NOT NULL,
  id                    TEXT NOT NULL,
  class                 TEXT NOT NULL,
  operation             TEXT NOT NULL,
  actor_type            TEXT NOT NULL,
  actor_id              TEXT,
  request_id            TEXT,
  object_type           TEXT,
  object_id             TEXT,
  before_redacted       JSONB,
  after_redacted        JSONB,
  ledger_trace          JSONB,
  ip_address            INET,
  user_agent            TEXT,
  hash_prev             TEXT,
  hash_current          TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX idx_audit_object
  ON audit_log_entries (tenant_id, object_type, object_id, created_at);
```

---

## Failure Modes

| Failure mode                                 | Impact                                            | Mitigation                                                                                    |
| -------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Projection lag                               | Search/report may miss recent ledger state        | Return freshness watermark; `bounded` mode; report waits in `waiting_for_projection`          |
| Ledger stream gap                            | Projection cannot prove continuity                | Stop affected reports; rebuild from ACS + updates; mark `projection_gap`                      |
| Ledger pruning before projection catch-up    | Historical report incomplete                      | Enforce projector lag SLO; archival ledger update store; backup projection snapshots          |
| Multi-synchronizer ordering ambiguity        | Cross-synchronizer report order may be misleading | Report per-synchronizer ordering plus record time; disclose synchronizer set                  |
| Command submitted but completion missed      | Intent stuck                                      | Completion stream first; periodic command status reconciliation; retrieve update by ID/offset |
| Idempotency key reused with different params | Duplicate/incorrect operation risk                | Request hash compare; return `idempotency_error`                                              |
| Search index corruption                      | Wrong search results                              | Rebuild `search_documents` from projection; checksum index batches                            |
| Metadata cardinality explosion               | Slow queries/index bloat                          | Key limits, per-tenant quotas, metadata index allow/deny list                                 |
| Export job worker crash                      | Partial file                                      | Chunked writes; temp URI; finalize only after checksum; idempotent job resume                 |
| Object storage failure                       | Export unavailable                                | Retry, secondary region, fail job with retriable code                                         |
| Download URL leaked                          | Data exposure                                     | Short-lived signed URLs, scoped auth, audit downloads                                         |
| CSV formula injection                        | Spreadsheet risk                                  | Escape cells beginning with `=`, `+`, `-`, `@` when `csv_safe=true`                           |
| Webhook delivery timeout                     | Async workflow delay                              | Fast retry, exponential backoff, delivery report, manual resend                               |
| Webhook out of order                         | Consumer state mismatch                           | Event IDs, object retrieval, idempotent consumer guidance                                     |
| Scheduled export duplicated                  | Duplicate files/webhooks                          | Unique schedule period key; deterministic idempotency key                                     |
| Report parameter timezone error              | Accounting cutoff mismatch                        | Explicit timezone in report context; default UTC; immutable run parameters                    |
| Privileged ledger trace exposed              | Canton internals leakage                          | Scope-gated `include[]=ledger_trace`; audit every access                                      |
| Audit hash chain break                       | Compliance failure                                | Daily anchor hash, WORM storage, alert on verification failure                                |

---

## Security / Compliance

### 1. Access control

* Every search/export/report query is tenant-scoped.
* API keys have granular scopes:

  * `search_read`
  * `exports_read`
  * `exports_write`
  * `reports_read`
  * `reports_write`
  * `audit_read`
  * `ledger_trace_read`
  * `webhook_read`
* `ledger_trace_read` is never granted to ordinary customer-facing keys by default.
* Report rows are filtered by account/holder/asset entitlements before export.

### 2. Metadata safety

* Metadata must not contain secrets, private keys, full bank details, government IDs, or raw personal identifiers.
* Metadata is searchable, exportable, and can appear in reports; therefore it must be treated as customer-provided non-secret annotation.

### 3. File security

* Export files encrypted at rest with tenant-scoped KMS keys.
* Download URLs are short-lived and regenerate through authenticated API calls.
* Every file has SHA-256 checksum.
* File downloads create audit log entries.
* Optional WORM retention for regulated customers.
* Parquet files include schema version and report context footer metadata.

### 4. Audit security

* Audit logs are append-only.
* Rows are hash-chained per tenant/day.
* Daily root hash can be anchored externally or to a privileged audit contract if required.
* Before/after payloads are redacted by schema policy.
* Idempotency keys are stored as hashes, not plaintext.

### 5. Webhook security

* HMAC signature with timestamp.
* Replay tolerance window, e.g. 5 minutes.
* Secret rotation with overlapping active secrets.
* Per-endpoint API version pinning.
* Delivery attempts logged and exportable.
* Payload includes `event.id`; consumers must deduplicate.

### 6. Canton boundary security

* Public API never exposes JSON Ledger API directly.
* Ledger API credentials stay server-side.
* Canton party IDs are mapped internally to Pillar holders/accounts.
* Projection queries must honor Canton visibility and Pillar entitlements.
* Internal Daml template/package details are redacted unless `ledger_trace_read` is granted.

---

## Implementation Plan

### Phase 0 — Specification hardening

Deliverables:

* Search grammar RFC.
* Field catalog for each resource.
* Metadata policy.
* Report type catalog.
* Export file schema conventions.
* API versioning and webhook event type matrix.

Acceptance criteria:

* Every searchable field has type, operators, index path, RBAC policy.
* Every report has parameters, columns, consistency mode, and example output.
* Public docs include freshness caveat.

### Phase 1 — Ledger projection foundation

Deliverables:

* Ledger projector with ACS bootstrap.
* UpdateService ingestion.
* Cursor table.
* Holdings, balances, intents, ledger transactions projections.
* Projection rebuild command.

Acceptance criteria:

* Projection can rebuild from ledger source.
* Every projection row has ledger trace.
* Projector lag dashboard exists.
* Search disabled or marked stale when cursor continuity is broken.

### Phase 2 — Search API v1

Deliverables:

* Parser and AST.
* Field catalog validation.
* Metadata index.
* `/v1/{resource}/search`.
* Pagination and freshness response.
* Search errors.

Acceptance criteria:

* Invalid grammar returns deterministic errors.
* Metadata search works.
* RBAC predicates cannot be bypassed.
* Search result includes projection watermark.

### Phase 3 — Export jobs

Deliverables:

* `export_job` object.
* CSV, JSONL, Parquet writers.
* Encrypted object storage.
* Download URL generation.
* `export_job.succeeded` / `export_job.failed` webhooks.

Acceptance criteria:

* Large exports stream without loading full result in memory.
* Failed jobs are resumable or terminal with clear error.
* Export file checksum verified before success.

### Phase 4 — Report engine

Deliverables:

* Reconciliation report.
* Ledger transaction report.
* Balance snapshot report.
* Webhook delivery report.
* Audit export.

Acceptance criteria:

* Every report has immutable `report_context`.
* Ledger snapshot reports wait for projection catch-up.
* Reconciliation report detects unmatched, duplicate, and amount mismatch cases.

### Phase 5 — Scheduled exports

Deliverables:

* `export_schedule` object.
* Cron/timezone scheduler.
* Backfill support.
* Duplicate prevention.
* Schedule run audit.

Acceptance criteria:

* No duplicate scheduled run for same schedule/period.
* Missed runs are visible.
* Backfills are explicit and auditable.

### Phase 6 — Developer experience

Deliverables:

* SDK methods for search/export/report.
* CLI:

  * `pillar search`
  * `pillar export-jobs`
  * `pillar report-runs`
  * `pillar listen`
* Workbench:

  * query builder
  * report explorer
  * webhook delivery inspector
  * projection freshness view
* Sandbox:

  * local Canton/DPM sandbox
  * seeded test data
  * deterministic reports

Acceptance criteria:

* Same API examples run in sandbox and production.
* CLI can trigger webhook test events and download reports.
* Workbench can inspect report failures and webhook delivery failures.

---

## Open Questions

1. **Search backend**

   * Postgres-only with JSONB/trigram/tsvector, or dedicated OpenSearch/Elasticsearch?
   * Recommendation: start Postgres for exact financial search; add OpenSearch only for large-scale substring/global search.

2. **Metadata source-of-truth**

   * Should all metadata for ledger-backed objects be on-ledger?
   * Recommendation: yes for asset movement, holding, transaction, intent metadata. DB-only metadata only for config objects.

3. **Ledger trace exposure**

   * Which customer roles can see `ledger_offset`, `synchronizer_id`, `update_id`, contract event hashes?
   * Recommendation: expose trace IDs to enterprise/audit roles; keep Daml template/contract IDs internal by default.

4. **Report retention**

   * Default export file retention: 7, 30, or 90 days?
   * Recommendation: 7 days default, configurable to 90+ with compliance add-on.

5. **Parquet schema registry**

   * Internal schema registry only, or public schema docs with version pinning?
   * Recommendation: public report schema versions plus internal compatibility tests.

6. **External reconciliation inputs**

   * Should Pillar accept uploaded external files for reconciliation v1?
   * Recommendation: yes, but gate with file validation, column mapping, and explicit `external_file` object.

7. **Multi-synchronizer reporting**

   * Should reports support cross-synchronizer aggregation v1?
   * Recommendation: yes for summary, but disclose synchronizer set and avoid implying total causal ordering across synchronizers.

8. **Sandbox parity**

   * Should sandbox produce deterministic ledger offsets?
   * Recommendation: not required; deterministic report fixtures should assert semantic rows, not literal offsets.

---

## Agent-ready Checklist

### Search

* [ ] Define resource field catalog.
* [ ] Implement query parser.
* [ ] Enforce max 10 clauses.
* [ ] Support `:`, `~`, `>`, `>=`, `<`, `<=`, `=`.
* [ ] Support implicit `AND`.
* [ ] Support explicit `AND` / `OR` but reject mixed logic.
* [ ] Reject parentheses in v1.
* [ ] Support negation with `-`.
* [ ] Support `null` presence/absence.
* [ ] Support `metadata["key"]:"value"`.
* [ ] Implement metadata key/value limits.
* [ ] Inject tenant and RBAC predicates.
* [ ] Return `freshness` object.
* [ ] Implement `bounded` freshness mode.
* [ ] Add `search_stale` error.
* [ ] Document read-after-write caveat.

### Projection

* [ ] Implement ACS bootstrap.
* [ ] Implement UpdateService ingestion.
* [ ] Persist ledger cursor by participant/synchronizer.
* [ ] Persist ledger updates.
* [ ] Build holdings projection.
* [ ] Build ledger transactions projection.
* [ ] Build search documents.
* [ ] Build metadata index.
* [ ] Implement rebuild command.
* [ ] Detect cursor gaps.
* [ ] Add projector lag metrics.

### Export Jobs

* [ ] Create `export_job` object.
* [ ] Implement `POST /v1/export_jobs`.
* [ ] Implement `GET /v1/export_jobs/{id}`.
* [ ] Implement download endpoint.
* [ ] Implement cancel endpoint.
* [ ] Write CSV exporter.
* [ ] Write JSONL exporter.
* [ ] Write Parquet exporter.
* [ ] Add compression.
* [ ] Add SHA-256 checksum.
* [ ] Add encrypted storage.
* [ ] Add short-lived signed URLs.
* [ ] Emit lifecycle webhooks.

### Reports

* [ ] Define `report_type` registry.
* [ ] Implement `report_run` object.
* [ ] Implement reconciliation summary.
* [ ] Implement reconciliation itemized.
* [ ] Implement ledger transaction report.
* [ ] Implement webhook delivery report.
* [ ] Implement balance snapshot report.
* [ ] Implement audit export.
* [ ] Attach immutable report context.
* [ ] Gate privileged ledger trace columns.
* [ ] Add report schema versioning.

### Webhooks

* [ ] Create event object with API version.
* [ ] Pin endpoint API version.
* [ ] Implement signed delivery.
* [ ] Implement retry schedule.
* [ ] Implement delivery status table.
* [ ] Implement manual resend.
* [ ] Export webhook delivery report.
* [ ] Document at-least-once and unordered delivery.

### Scheduled Exports

* [ ] Create `export_schedule` object.
* [ ] Implement cron/timezone parser.
* [ ] Implement schedule run uniqueness.
* [ ] Implement pause/resume/delete.
* [ ] Implement backfill.
* [ ] Emit schedule run events.
* [ ] Add schedule audit trail.

### Security / Compliance

* [ ] Hash idempotency keys.
* [ ] Add scoped API keys.
* [ ] Add `ledger_trace_read` permission.
* [ ] Redact audit payloads.
* [ ] Hash-chain audit logs.
* [ ] Audit file downloads.
* [ ] Escape CSV formula cells.
* [ ] Add DLP validation for metadata and exports.
* [ ] Add WORM retention option.

### Developer Experience

* [ ] Add SDK search helpers.
* [ ] Add SDK export/report helpers.
* [ ] Add CLI search command.
* [ ] Add CLI report-run command.
* [ ] Add CLI webhook listen command.
* [ ] Add Workbench query builder.
* [ ] Add Workbench report explorer.
* [ ] Add Workbench webhook delivery inspector.
* [ ] Add sandbox seeded report fixtures.
* [ ] Ensure sandbox/test/prod API grammar is identical.

[1]: https://docs.stripe.com/search "docs.stripe.com"
[2]: https://docs.stripe.com/api/metadata "docs.stripe.com"
[3]: https://docs.stripe.com/reports/api "docs.stripe.com"
[4]: https://docs.stripe.com/webhooks "docs.stripe.com"
[5]: https://docs.stripe.com/api/versioning?utm_source=chatgpt.com "Versioning | Stripe API Reference"
[6]: https://docs.stripe.com/cli/listen "docs.stripe.com"
[7]: https://docs.digitalasset.com/build/3.5/quickstart/configure/project-structure-overview.html "Canton Network quickstart project structure — Digital Asset’s platform documentation"
[8]: https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html "gRPC Ledger API Reference — Digital Asset’s platform documentation"
[9]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html "JSON Ledger API Service V2 — Digital Asset’s platform documentation"
[10]: https://docs.digitalasset.com/build/3.4/dpm/dpm.html "Digital Asset Package Manager (Dpm) — Digital Asset’s platform documentation"
[11]: https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html "Sandbox — Digital Asset’s platform documentation"
[12]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
