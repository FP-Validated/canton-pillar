# Phase 02 — API Contract and Object Grammar

> Define the public `/v1` contract so Pillar is Stripe-like externally, Canton-native internally, and free of contract-first leakage.

## 1. Executive Summary

Phase 02 turns the architecture contract into executable API grammar:

- Canonical OpenAPI source: `packages/api-contracts/openapi/pillar-v1.yaml`.
- Public route skeletons: `apps/api/src/routes/v1/*`.
- Presenter layer: `apps/api/src/presenters/*` renders DB/runtime records into stable public objects.
- Schema package: `packages/api-contracts/schemas/*` owns Zod-compatible object contracts.
- Golden examples: `packages/api-contracts/examples/*.json` and `packages/api-contracts/golden/*.json` prevent drift.
- Fastify is the server runtime; Zod/OpenAPI generation is the contract-generation path.
- Canton Ledger remains the source of truth; DB-backed endpoints in this phase are config/projection/audit only.

Implemented architecture references:

- [03 Pillar API Grammar v1](../Architecture/03_Pillar%20API%20Grammar%20v1.md)
- [04 Object Model](../Architecture/04_Object%20Model.md)
- [05 Asset Read Model](../Architecture/05_asset%20read%20model.md)
- [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)

Core principles embedded in this phase:

| Principle                                        | Phase 02 rule                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Canton Ledger is the source of truth             | Mutation responses expose intent/operation state, not final ledger state.     |
| Pillar DB stores Projection / Audit / Config     | Account/asset CRUD-lite is DB-only config; balances/holdings are projections. |
| External API is Stripe-like and Canton-invisible | `/v1` resources, IDs, metadata, pagination, idempotency, events.              |
| Internal runtime is Canton-native                | Operation IDs later map to stable ledger command identity in Phase 04.        |
| Operations are ledger-traceable                  | Every mutation object includes `operation` or `latest_operation`.             |
| Balance/Holding-first                            | Reads expose `balance` and `holding`, never fragments.                        |
| Intent-first                                     | Writes create `*_intent` objects or config objects.                           |
| Webhook-first                                    | Async completion is represented by `event` and webhook endpoint contracts.    |
| API grammar is Stripe-grade from day one         | Golden examples and OpenAPI validation are required gates.                    |
| Deployment changes do not change API             | `/v1` grammar is independent of hosted/customer/self-hosted deployment.       |

## 2. Goals / Non-goals

### Goals

| Goal                         | Required output                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Publish API grammar          | OpenAPI 3.1 file at `packages/api-contracts/openapi/pillar-v1.yaml`.                                                             |
| Define public object schemas | Zod/OpenAPI schemas for account, asset, balance, holding, intents, hold, operation, event, webhook endpoint, API key descriptor. |
| Freeze ID grammar            | Prefix validation for `acct_`, `asst_`, `bal_`, `hld_`, `issint_`, `redint_`, `trint_`, `hold_`, `op_`, `evt_`, `we_`, `ak_`.    |
| Freeze status grammar        | Intent, operation, and webhook delivery enums match [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md).       |
| Provide golden examples      | Request/response payloads validate against schemas and snapshots.                                                                |
| Define error model           | Single typed error envelope for 4xx/5xx.                                                                                         |
| Implement version middleware | `Pillar-Version` header overrides account default; SDKs pin defaults.                                                            |
| Establish route layout       | `apps/api/src/routes/v1/` mirrors the `/v1` resource tree.                                                                       |
| Keep ledger invisible        | No public examples expose Daml/Canton internals.                                                                                 |

### Non-goals

| Non-goal                                                      | Deferred to                             |
| ------------------------------------------------------------- | --------------------------------------- |
| Ledger command submission for intents                         | Phase 04 Ledger Command Runtime.        |
| Idempotency persistence and crash recovery                    | Phase 03 DB Migrations and Idempotency. |
| Projection worker implementation                              | Phase 05 Projection and Reconciliation. |
| Webhook delivery worker                                       | Phase 06 Webhook-first Workflow.        |
| SDK generation and CLI packaging                              | Phase 07 SDK / CLI / Workbench.         |
| Security hardening beyond contract headers and metadata rules | Phase 08 Security / Compliance.         |
| Helm/production deployment                                    | Phase 09 CI/CD + Helm.                  |

## 3. Architecture

### Source layout

```text
packages/api-contracts/
  openapi/
    pillar-v1.yaml
  schemas/
    ids.ts
    common.ts
    account.ts
    asset.ts
    balance.ts
    holding.ts
    intents.ts
    hold.ts
    operation.ts
    event.ts
    webhook-endpoint.ts
    api-key.ts
    error.ts
  examples/
    transfer-intent-create.request.json
    transfer-intent-create.response.json
    account.response.json
    asset.response.json
    balance.response.json
    holding.response.json
    event.response.json
  golden/
    pillar-v1.openapi.json
    transfer-intent-create.response.json

apps/api/src/
  server.ts
  routes/v1/
    index.ts
    accounts.ts
    assets.ts
    balances.ts
    holdings.ts
    issue-intents.ts
    redeem-intents.ts
    transfer-intents.ts
    holds.ts
    operations.ts
    events.ts
    webhook-endpoints.ts
  middleware/
    auth.ts
    api-version.ts
    idempotency.ts
    rate-limit.ts
  presenters/
    account-presenter.ts
    asset-presenter.ts
    balance-presenter.ts
    holding-presenter.ts
    intent-presenter.ts
    hold-presenter.ts
    operation-presenter.ts
    event-presenter.ts
    webhook-endpoint-presenter.ts
  errors/
    pillar-error.ts
    error-presenter.ts
```

### Route ownership

| Route file             | Public resources                                                    | Phase 02 behavior                                                        |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `accounts.ts`          | `/v1/accounts`, `/v1/accounts/:id`                                  | CRUD-lite against DB config only.                                        |
| `assets.ts`            | `/v1/assets`, `/v1/assets/:id`                                      | Create/retrieve/list config/projection summary only.                     |
| `balances.ts`          | `/v1/balances`, `/v1/balances/:id`                                  | Contract only; real projection reads land in Phase 05.                   |
| `holdings.ts`          | `/v1/holdings`, `/v1/holdings/:id`                                  | Contract only; real projection reads land in Phase 05.                   |
| `issue-intents.ts`     | `/v1/issue_intents`, `/v1/issue_intents/:id`                        | Contract only; ledger submission is Phase 04.                            |
| `redeem-intents.ts`    | `/v1/redeem_intents`, `/v1/redeem_intents/:id`                      | Contract only; ledger submission is Phase 04.                            |
| `transfer-intents.ts`  | `/v1/transfer_intents`, `/v1/transfer_intents/:id`                  | Contract only; full create example required.                             |
| `holds.ts`             | `/v1/holds`, `/v1/holds/:id`, `/v1/holds/:id/release`               | Contract only; ledger lock/release is Phase 04.                          |
| `operations.ts`        | `/v1/operations/:id`                                                | Contract-level read shape only.                                          |
| `events.ts`            | `/v1/events`, `/v1/events/:id`                                      | Contract-level immutable event shape only.                               |
| `webhook-endpoints.ts` | `/v1/webhook_endpoints`, `/v1/webhook_endpoints/:id`, rotate secret | Contract-level config route only.                                        |
| `api-keys.ts`          | `/v1/api_keys`, `/v1/api_keys/:id`, rotate/revoke/expire actions    | Contract-level security route only; real secret persistence is Phase 08. |
| `openapi.ts`           | `/v1/openapi.json`                                                  | Admin-scoped contract document serving.                                  |
| `health.ts`            | `/v1/health`                                                        | Deployment-mode-neutral API health envelope.                             |

### Presenter pattern

Presenters are the only layer allowed to serialize public JSON. Controllers/services return internal records; presenters enforce the external contract.

```ts
export function presentTransferIntent(record: TransferIntentRecord): TransferIntent {
  return {
    id: record.publicId,
    object: 'transfer_intent',
    created: record.createdAt.toISOString(),
    livemode: record.livemode,
    status: record.status,
    amount: record.amountDecimal,
    asset: record.assetId,
    from_account: record.fromAccountId,
    to_account: record.toAccountId,
    metadata: record.metadata,
    operation: record.operationId,
    latest_event: record.latestEventId ?? null,
  };
}
```

Presenter rules:

- Public fields use `snake_case`.
- Timestamps use RFC3339 UTC strings unless a legacy architecture excerpt is explicitly being reproduced.
- Decimal quantities are strings.
- `metadata` is present on mutable public objects.
- Unknown internal fields are dropped by default.
- Ledger debug fields are not emitted by default.
- Examples and golden snapshots are generated from presenter output, not hand-written controller objects.

### OpenAPI generation path

```text
Zod schemas
  -> OpenAPI registry
  -> packages/api-contracts/openapi/pillar-v1.yaml
  -> OpenAPI validator
  -> generated examples / golden snapshots
  -> SDK generation in Phase 07
```

`pillar-v1.yaml` is the source consumed by validators and SDK generation. Route code must either reference schema modules directly or fail contract tests when it drifts.

## 4. API / Object Model

### Base headers

```http
Authorization: Bearer plr_sk_test_51HY...
Pillar-Version: 2026-05-26
Idempotency-Key: 9f2d1c8e-7a9c-4e6a-9fb9-f1a5c9f88b31
```

```http
Pillar-Request-Id: req_01HY8P6Z4J5N3T2R1Q0P9M8L7K
Pillar-Version: 2026-05-26
Pillar-Mode: test
```

### Public resource inventory

| Resource                                  | Methods            | ID prefix | Object value       | Mutation? | Idempotency required? |
| ----------------------------------------- | ------------------ | --------- | ------------------ | --------- | --------------------- |
| `/v1/accounts`                            | `POST`, `GET` list | `acct_`   | `account`          | yes       | yes on `POST`         |
| `/v1/accounts/:id`                        | `GET`              | `acct_`   | `account`          | no        | no                    |
| `/v1/assets`                              | `POST`, `GET` list | `asst_`   | `asset`            | yes       | yes on `POST`         |
| `/v1/assets/:id`                          | `GET`              | `asst_`   | `asset`            | no        | no                    |
| `/v1/balances`                            | `GET` list         | `bal_`    | `balance`          | no        | no                    |
| `/v1/balances/:id`                        | `GET`              | `bal_`    | `balance`          | no        | no                    |
| `/v1/holdings`                            | `GET` list         | `hld_`    | `holding`          | no        | no                    |
| `/v1/holdings/:id`                        | `GET`              | `hld_`    | `holding`          | no        | no                    |
| `/v1/issue_intents`                       | `POST`             | `issint_` | `issue_intent`     | yes       | yes                   |
| `/v1/issue_intents/:id`                   | `GET`              | `issint_` | `issue_intent`     | no        | no                    |
| `/v1/redeem_intents`                      | `POST`             | `redint_` | `redeem_intent`    | yes       | yes                   |
| `/v1/redeem_intents/:id`                  | `GET`              | `redint_` | `redeem_intent`    | no        | no                    |
| `/v1/transfer_intents`                    | `POST`             | `trint_`  | `transfer_intent`  | yes       | yes                   |
| `/v1/transfer_intents/:id`                | `GET`              | `trint_`  | `transfer_intent`  | no        | no                    |
| `/v1/holds`                               | `POST`             | `hold_`   | `hold`             | yes       | yes                   |
| `/v1/holds/:id`                           | `GET`              | `hold_`   | `hold`             | no        | no                    |
| `/v1/holds/:id/release`                   | `POST`             | `hold_`   | `hold`             | yes       | yes                   |
| `/v1/operations/:id`                      | `GET`              | `op_`     | `operation`        | no        | no                    |
| `/v1/events`                              | `GET` list         | `evt_`    | `event`            | no        | no                    |
| `/v1/events/:id`                          | `GET`              | `evt_`    | `event`            | no        | no                    |
| `/v1/webhook_endpoints`                   | `POST`             | `we_`     | `webhook_endpoint` | yes       | yes                   |
| `/v1/webhook_endpoints/:id`               | `GET`              | `we_`     | `webhook_endpoint` | no        | no                    |
| `/v1/webhook_endpoints/:id/rotate_secret` | `POST`             | `we_`     | `webhook_endpoint` | yes       | yes                   |

### Canonical object IDs

| Object             | Prefix    | Example                             |
| ------------------ | --------- | ----------------------------------- |
| account            | `acct_`   | `acct_sender`                       |
| asset              | `asst_`   | `asst_usdc`                         |
| balance            | `bal_`    | `bal_01HY8P6Z4J5N3T2R1Q0P9M8L7K`    |
| holding            | `hld_`    | `hld_01HY8P6Z4J5N3T2R1Q0P9M8L7K`    |
| issue intent       | `issint_` | `issint_01HY8P6Z4J5N3T2R1Q0P9M8L7K` |
| redeem intent      | `redint_` | `redint_01HY8P6Z4J5N3T2R1Q0P9M8L7K` |
| transfer intent    | `trint_`  | `trint_01HY8P6Z4J5N3T2R1Q0P9M8L7K`  |
| hold               | `hold_`   | `hold_01HY8P6Z4J5N3T2R1Q0P9M8L7K`   |
| operation          | `op_`     | `op_01HY8P6Z4J5N3T2R1Q0P9M8L7K`     |
| event              | `evt_`    | `evt_01HY8P6Z4J5N3T2R1Q0P9M8L7K`    |
| webhook endpoint   | `we_`     | `we_01HY8P6Z4J5N3T2R1Q0P9M8L7K`     |
| API key descriptor | `ak_`     | `ak_01HY8P6Z4J5N3T2R1Q0P9M8L7K`     |

### Status models

Intent status model, reproduced from [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md):

```text
requires_action
processing
succeeded
failed
canceled
expired
```

Operation status model, reproduced from [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md):

```text
received
queued
submitted
in_flight
ledger_committed
projected
failed
unknown
reconciled
```

Webhook delivery status model, reproduced from [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md):

```text
pending
delivered
failed
retrying
dead_lettered
manually_replayed
```

Additional resource status enums for contract validation:

| Resource         | Status enum                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| account          | `active`, `restricted`, `suspended`, `closed`                               |
| asset            | `draft`, `active`, `paused`, `retired`                                      |
| holding          | `active`, `partially_reserved`, `reserved`, `frozen`, `redeeming`, `closed` |
| hold             | `requires_action`, `active`, `released`, `expired`, `failed`                |
| webhook_endpoint | `enabled`, `disabled`                                                       |
| api_key          | `active`, `expired`, `revoked`                                              |

### Object schemas

#### Account

```json
{
  "id": "acct_sender",
  "object": "account",
  "created": "2026-05-26T08:00:00.000Z",
  "livemode": false,
  "display_name": "Sender Treasury",
  "status": "active",
  "metadata": {
    "customer_ref": "cust_sender"
  }
}
```

#### Asset

```json
{
  "id": "asst_usdc",
  "object": "asset",
  "created": "2026-05-26T08:00:00.000Z",
  "livemode": false,
  "code": "USDC",
  "name": "USD Coin",
  "scale": 2,
  "status": "active",
  "transferable": true,
  "redeemable": true,
  "metadata": {}
}
```

#### Balance

```json
{
  "id": "bal_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "object": "balance",
  "created": "2026-05-26T08:10:00.000Z",
  "livemode": false,
  "account": "acct_merchant",
  "asset": "asst_usdc",
  "available": "1000.00",
  "pending": "50.00",
  "reserved": "200.00",
  "settled": "1200.00",
  "as_of_ledger_offset": "000000000000123456",
  "as_of_ledger_time": "2026-05-26T08:10:00.000Z",
  "metadata": {}
}
```

#### Holding

```json
{
  "id": "hld_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "object": "holding",
  "created": "2026-05-26T08:10:00.000Z",
  "livemode": false,
  "account": "acct_merchant",
  "asset": "asst_usdc",
  "amount": "500.00",
  "status": "active",
  "restrictions": [],
  "source_intent": "issint_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "metadata": {}
}
```

#### Intent base

| Field          | Type        | Required | Notes                                    |
| -------------- | ----------- | -------- | ---------------------------------------- |
| `id`           | string      | yes      | `issint_`, `redint_`, or `trint_`.       |
| `object`       | string      | yes      | Intent object value.                     |
| `created`      | timestamp   | yes      | RFC3339 UTC.                             |
| `livemode`     | boolean     | yes      | Determined by API key.                   |
| `status`       | enum        | yes      | Intent status model above.               |
| `amount`       | string      | yes      | Decimal string.                          |
| `asset`        | string      | yes      | `asst_` ID.                              |
| `metadata`     | object      | yes      | String key/value only.                   |
| `operation`    | string      | yes      | `op_` ID for ledger-traceable operation. |
| `latest_event` | string/null | yes      | `evt_` ID when emitted.                  |

#### Transfer intent full request and response

Request:

```http
POST /v1/transfer_intents HTTP/1.1
Authorization: Bearer plr_sk_test_51HY...
Pillar-Version: 2026-05-26
Idempotency-Key: 9f2d1c8e-7a9c-4e6a-9fb9-f1a5c9f88b31
Content-Type: application/json
```

```json
{
  "amount": "100.00",
  "asset": "asst_usdc",
  "from_account": "acct_sender",
  "to_account": "acct_receiver",
  "metadata": {
    "order_id": "ord_123"
  }
}
```

Response:

```http
HTTP/1.1 200 OK
Pillar-Request-Id: req_01HY8P6Z4J5N3T2R1Q0P9M8L7K
Pillar-Version: 2026-05-26
Pillar-Mode: test
Content-Type: application/json
```

```json
{
  "id": "trint_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "object": "transfer_intent",
  "created": "2026-05-26T08:10:00.000Z",
  "livemode": false,
  "status": "processing",
  "amount": "100.00",
  "asset": "asst_usdc",
  "from_account": "acct_sender",
  "to_account": "acct_receiver",
  "metadata": {
    "order_id": "ord_123"
  },
  "operation": "op_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "latest_event": "evt_01HY8P6Z4J5N3T2R1Q0P9M8L7K"
}
```

This shape matches the implementation-plan API/Object Model fields while using Pillar key prefixes and RFC3339 timestamps for the phase contract.

#### Hold

```json
{
  "id": "hold_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "object": "hold",
  "created": "2026-05-26T08:10:00.000Z",
  "livemode": false,
  "status": "active",
  "amount": "25.00",
  "asset": "asst_usdc",
  "account": "acct_sender",
  "expires_at": "2026-05-27T08:10:00.000Z",
  "purpose": "transfer_reservation",
  "operation": "op_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "metadata": {}
}
```

#### Operation

Default public `operation` is safe and does not expose ledger debug details.

```json
{
  "id": "op_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "object": "operation",
  "created": "2026-05-26T08:10:00.000Z",
  "livemode": false,
  "intent": "trint_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "status": "ledger_committed",
  "ledger": {
    "backend": "canton",
    "update_reference": "upd_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
    "offset": "000000000000123456"
  },
  "metadata": {}
}
```

#### Event

```json
{
  "id": "evt_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "object": "event",
  "created": "2026-05-26T08:10:02.000Z",
  "livemode": false,
  "type": "transfer_intent.succeeded",
  "api_version": "2026-05-26",
  "data": {
    "object": {
      "id": "trint_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
      "object": "transfer_intent",
      "status": "succeeded"
    },
    "previous_attributes": {
      "status": "processing"
    }
  },
  "request": {
    "id": "req_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
    "idempotency_key": "9f2d1c8e-7a9c-4e6a-9fb9-f1a5c9f88b31"
  },
  "metadata": {}
}
```

#### Webhook endpoint

```json
{
  "id": "we_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "object": "webhook_endpoint",
  "created": "2026-05-26T08:00:00.000Z",
  "livemode": false,
  "url": "https://example.com/pillar/webhooks",
  "enabled_events": ["transfer_intent.succeeded", "ledger_operation.failed"],
  "api_version": "2026-05-26",
  "status": "enabled",
  "metadata": {}
}
```

#### API key descriptor

```json
{
  "id": "ak_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
  "object": "api_key",
  "created": "2026-05-26T08:00:00.000Z",
  "livemode": false,
  "name": "CI test key",
  "prefix": "plr_sk_test_",
  "last4": "8b31",
  "scopes": ["accounts:write", "assets:write", "intents:create"],
  "status": "active",
  "metadata": {}
}
```

### List grammar

```http
GET /v1/holdings?limit=10&starting_after=hld_01HY8P6Z4J5N3T2R1Q0P9M8L7K
```

```json
{
  "object": "list",
  "url": "/v1/holdings",
  "has_more": true,
  "data": [
    {
      "id": "hld_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
      "object": "holding",
      "created": "2026-05-26T08:10:00.000Z",
      "livemode": false,
      "account": "acct_merchant",
      "asset": "asst_usdc",
      "amount": "500.00",
      "status": "active",
      "restrictions": [],
      "source_intent": "issint_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
      "metadata": {}
    }
  ]
}
```

List rules:

- `limit`: default `10`, min `1`, max `100`.
- `starting_after`: exclusive cursor ID.
- `ending_before`: exclusive cursor ID.
- Default order: `created desc, id desc`.
- List wrapper fields: `object`, `url`, `has_more`, `data`.

## 5. Internal Runtime

### Fastify runtime

`apps/api` uses Fastify for:

- route registration under `/v1`;
- request/response schema validation;
- middleware composition;
- typed error handling;
- request ID generation;
- OpenAPI route registration compatibility.

Recommended boot chain:

```text
createFastifyServer
  -> register request ID hook
  -> register auth middleware
  -> register API version middleware
  -> register rate limit middleware
  -> register idempotency middleware for mutating POST
  -> register /v1 routes
  -> register error handler
```

### Zod/OpenAPI generator

Schema modules in `packages/api-contracts/schemas` define runtime validation and OpenAPI metadata once. `pillar-v1.yaml` must be generated from the same schema graph that route tests use.

```text
Zod object schema
  -> Fastify route schema adapter
  -> OpenAPI component schema
  -> example validation
  -> golden snapshot validation
```

### Version resolution chain

Version resolution order:

```text
1. Pillar-Version request header
2. account default API version
3. SDK pinned API version supplied by official SDK metadata
```

Rules:

- Header override wins when the requested version is supported for the account and mode.
- Account default is required once account provisioning exists.
- SDK-pinned version is the fallback only when a request came through an official SDK and no header/default is available.
- Webhook endpoints pin event payload version at endpoint creation time.
- Resolved version is returned in `Pillar-Version` response header.
- Unsupported versions fail with `version_error`.

### Error envelope

All errors use one envelope:

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "missing_required_parameter",
    "message": "Missing required parameter: amount.",
    "param": "amount",
    "request_id": "req_01HY8P6Z4J5N3T2R1Q0P9M8L7K",
    "doc_url": "https://docs.pillar.example/errors/missing_required_parameter"
  }
}
```

Error types:

| Type                    | HTTP class  | Meaning                                                  |
| ----------------------- | ----------- | -------------------------------------------------------- |
| `invalid_request_error` | 400         | Bad parameter, malformed request, unsupported expansion. |
| `authentication_error`  | 401         | Missing or invalid API key.                              |
| `permission_error`      | 403         | Authenticated key lacks required scope.                  |
| `not_found_error`       | 404         | Object absent or not visible to caller.                  |
| `idempotency_error`     | 400/409     | Key conflict, invalid reuse, or missing key on mutation. |
| `rate_limit_error`      | 429         | Quota or concurrency exceeded.                           |
| `version_error`         | 400         | Unsupported or incompatible API version.                 |
| `ledger_error`          | 409/422/502 | Ledger-backed command rejected or unavailable.           |
| `projection_error`      | 409/503     | Projection stale, unavailable, or inconsistent.          |
| `webhook_error`         | 400/422     | Webhook endpoint config or delivery issue.               |
| `api_error`             | 500         | Internal service error.                                  |

Contract-level error codes:

```text
invalid_parameter
missing_required_parameter
unsupported_expand
metadata_too_large
idempotency_key_required
idempotency_key_reused
insufficient_holding
asset_not_transferable
intent_already_final
ledger_command_rejected
ledger_completion_timeout
projection_lag_exceeded
rate_limit_exceeded
api_key_expired
api_version_unsupported
webhook_signature_verification_failed
```

## 6. DB Schema

Not in scope for this phase. See Phase 03.

Phase 02 may rely on existing or temporary DB-backed repositories only for account and asset CRUD-lite route acceptance, but it must not define new canonical tables beyond [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md).

The API contract assumes these future storage categories:

| Category   | Objects                                                  | Ownership                       |
| ---------- | -------------------------------------------------------- | ------------------------------- |
| Config     | accounts, assets, webhook endpoints, API key descriptors | DB config tables.               |
| Audit      | requests, operations, events                             | DB audit/outbox tables.         |
| Projection | balances, holdings                                       | Rebuildable from Canton Ledger. |
| Control    | idempotency keys, projection watermarks                  | Phase 03/05 runtime tables.     |

## 7. Failure Modes

### Schema drift

| Drift                                   | Example                                                   | Detection                  | Required response                              |
| --------------------------------------- | --------------------------------------------------------- | -------------------------- | ---------------------------------------------- |
| Route accepts field absent from OpenAPI | `foo` on transfer intent create                           | request validation test    | reject unless schema is updated intentionally. |
| Presenter emits undocumented field      | `internal_status` in response                             | golden snapshot diff       | remove field or classify versioned addition.   |
| OpenAPI omits route                     | `GET /v1/events/:id` missing                              | OpenAPI path coverage test | add path before route merges.                  |
| Enum drift                              | operation emits `committed` instead of `ledger_committed` | enum schema test           | map internally or update versioned contract.   |
| Prefix drift                            | asset uses `asset_` instead of `asst_`                    | ID schema tests            | reject generated ID.                           |

### Golden snapshot drift

Golden snapshots are contract artifacts, not visual aids.

| Snapshot change                       | Classification                                      |
| ------------------------------------- | --------------------------------------------------- |
| Add optional nullable response field  | Compatible if documented and version policy allows. |
| Add required request field            | Breaking.                                           |
| Rename field                          | Breaking.                                           |
| Remove field                          | Breaking.                                           |
| Change enum closed set                | Breaking unless enum is explicitly open.            |
| Change example ID prefix              | Breaking.                                           |
| Change error `type` or `code` meaning | Breaking.                                           |
| Change pagination ordering            | Breaking.                                           |
| Expose Canton/Daml internals          | Forbidden, not merely breaking.                     |

Snapshot workflow:

```text
1. Generate OpenAPI from schemas.
2. Validate examples against OpenAPI.
3. Render golden responses through presenters.
4. Diff golden output.
5. If changed, classify as compatible, breaking, or forbidden.
6. Require section/changelog note before accepting compatible or breaking drift.
```

### Breaking-change classification

| Change                               | Compatible?                               | Version action                 |
| ------------------------------------ | ----------------------------------------- | ------------------------------ |
| Add new optional response field      | yes                                       | same behavior version allowed. |
| Add new endpoint                     | yes                                       | same behavior version allowed. |
| Add new event type                   | yes if wildcard subscribers are protected | document event type.           |
| Add enum value to closed enum        | no                                        | new behavior version.          |
| Change requiredness                  | no                                        | new behavior version.          |
| Change field meaning                 | no                                        | new behavior version.          |
| Change amount precision semantics    | no                                        | new behavior version.          |
| Expose ledger implementation details | no                                        | reject change.                 |

## 8. Security / Compliance

### API key bearer auth

Header shape:

```http
Authorization: Bearer plr_sk_test_51HY...
```

Accepted key families for contract validation:

| Key family       | Prefix         | Public use                                          |
| ---------------- | -------------- | --------------------------------------------------- |
| Secret test      | `plr_sk_test_` | Server-side test API.                               |
| Secret live      | `plr_sk_live_` | Server-side live API.                               |
| Restricted test  | `plr_rk_test_` | Scoped test key.                                    |
| Restricted live  | `plr_rk_live_` | Scoped live key.                                    |
| Publishable test | `plr_pk_test_` | Limited non-mutating client flows where documented. |
| Publishable live | `plr_pk_live_` | Limited live client flows where documented.         |

Rules:

- API key determines `livemode`.
- Secret and restricted keys must be sent only over HTTPS.
- Stored key material is hash + prefix + last4 only.
- Error responses never echo full keys.
- `ak_` objects are descriptors; newly created secret material is returned only once in the relevant future phase.

### Idempotency-Key requirement

All mutating `POST` endpoints require:

```http
Idempotency-Key: 9f2d1c8e-7a9c-4e6a-9fb9-f1a5c9f88b31
```

Contract rules:

- Required on account create, asset create, all intent create endpoints, hold create/release, webhook endpoint create, secret rotation.
- Length: 1–255 characters.
- High-entropy UUID/ULID recommended.
- Scope: account, livemode, method, path, key.
- Same key with different normalized request body returns `idempotency_error`.
- Missing key on mutation returns `idempotency_key_required`.
- Keys must not contain PII, asset holder names, secrets, or business-sensitive identifiers.

### Metadata size and PII rules

Metadata contract:

```json
{
  "metadata": {
    "order_id": "ord_123",
    "customer_ref": "cust_456"
  }
}
```

Rules:

- Object of string keys to string values.
- Maximum 50 keys.
- Maximum key length: 40 characters.
- Maximum value length: 500 characters.
- Keys cannot contain `[` or `]`.
- Empty string unsets a value where updates are supported.
- Metadata is correlation data only.
- Metadata must not contain regulated personal data, secrets, private keys, bank account numbers, government IDs, sanctions-screening details, or confidential ledger participant details.
- Metadata never changes authorization, compliance decisions, settlement semantics, or ledger command construction.

## 9. Implementation Plan

| ID     | Title                                                    | Path                                                                                                                                                            | Output                                                                                                                                                                                        | Deps                                                                                                           | Acceptance                                                                                                                                                                                                                                                                            | Risk   |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P2.C01 | OpenAPI base                                             | `packages/api-contracts/openapi`                                                                                                                                | `pillar-v1.yaml` with all `/v1` paths and components                                                                                                                                          | —                                                                                                              | `pnpm --filter @pillar/api-contracts build` emits valid OpenAPI; validator passes                                                                                                                                                                                                     | medium |
| P2.C02 | Object schemas                                           | `packages/api-contracts/schemas`                                                                                                                                | Zod/OpenAPI schemas for account, asset, balance, holding, issue/redeem/transfer intent, hold, operation, event, webhook endpoint, API key, error                                              | P2.C01                                                                                                         | examples validate against schemas; ID prefixes and status enums are tested                                                                                                                                                                                                            | medium |
| P2.C03 | Golden examples                                          | `packages/api-contracts/examples`, `packages/api-contracts/golden`                                                                                              | request/response JSON snapshots for core resources, especially transfer intent create                                                                                                         | P2.C02                                                                                                         | golden snapshot test runner is green; examples contain no forbidden internals                                                                                                                                                                                                         | medium |
| P2.C04 | Error model                                              | `apps/api/src/errors`, `packages/api-contracts/schemas/error.ts`                                                                                                | typed error classes and error presenter matching envelope                                                                                                                                     | P2.C02                                                                                                         | 4xx/5xx route tests match schema and include `request_id`                                                                                                                                                                                                                             | medium |
| P2.C05 | Version middleware                                       | `apps/api/src/middleware/api-version.ts`                                                                                                                        | resolver for header, account default, SDK pinned version                                                                                                                                      | P2.C01                                                                                                         | header override, account default, unsupported version tests pass                                                                                                                                                                                                                      | medium |
| P2.E01 | API server skeleton                                      | `apps/api`                                                                                                                                                      | Fastify server with health endpoint, request ID, error handler, `/v1` registration                                                                                                            | P2.C01                                                                                                         | health endpoint passes; routes are discoverable by OpenAPI tests                                                                                                                                                                                                                      | low    |
| P2.E04 | Account CRUD-lite routes                                 | `apps/api/src/routes/v1/accounts.ts`, `apps/api/src/presenters/account-presenter.ts`                                                                            | create/retrieve/list account routes backed only by DB config/repository abstraction                                                                                                           | P2.E01, P2.C02, P2.C04, P2.C05                                                                                 | OpenAPI route tests pass; mutation requires `Idempotency-Key`; response uses `acct_`                                                                                                                                                                                                  | medium |
| P2.E05 | Asset CRUD-lite routes                                   | `apps/api/src/routes/v1/assets.ts`, `apps/api/src/presenters/asset-presenter.ts`                                                                                | create/retrieve/list asset routes backed only by DB config/projection summary abstraction                                                                                                     | P2.E01, P2.C02, P2.C04, P2.C05                                                                                 | OpenAPI route tests pass; response uses `asst_`; no ledger internals exposed                                                                                                                                                                                                          | medium |
| P2.C06 | Account OpenAPI paths + schema + examples                | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/account.ts`, `packages/api-contracts/examples/account*.json`                   | create/retrieve/list/update account path items, `Account` schema, request/response examples, and golden account list snapshot                                                                 | P2.C01, P2.C02, P2.C03                                                                                         | OpenAPI contains `POST /v1/accounts`, `GET /v1/accounts`, `GET /v1/accounts/{id}`, `POST /v1/accounts/{id}` with `acct_` schema and examples validating without forbidden internals                                                                                                   | medium |
| P2.C07 | Asset OpenAPI paths + schema + examples                  | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/asset.ts`, `packages/api-contracts/examples/asset*.json`                       | create/retrieve/list/update asset path items, `Asset` schema, request/response examples, and golden asset list snapshot                                                                       | P2.C01, P2.C02, P2.C03                                                                                         | OpenAPI contains `POST /v1/assets`, `GET /v1/assets`, `GET /v1/assets/{id}`, `POST /v1/assets/{id}` with `asst_` schema, issuer/default expansion fields, and examples validating without ledger internals                                                                            | medium |
| P2.C08 | Balance OpenAPI paths + schema + examples                | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/balance.ts`, `packages/api-contracts/examples/balance*.json`                   | read-only retrieve/list balance path items, `Balance` schema, `consistency=` query parameter, and golden projection examples                                                                  | P2.C01, P2.C02, P2.C03                                                                                         | OpenAPI contains `GET /v1/balances`, `GET /v1/balances/{id}`; examples include `available`, `pending`, `reserved`, `settled`, `as_of_ledger_offset`, `as_of_ledger_time`; `consistency` accepts documented reserved values only                                                       | medium |
| P2.C09 | Holding OpenAPI paths + schema + examples                | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/holding.ts`, `packages/api-contracts/examples/holding*.json`                   | read-only retrieve/list holding path items, `Holding` schema, expansion whitelist, and golden holding list example                                                                            | P2.C01, P2.C02, P2.C03                                                                                         | OpenAPI contains `GET /v1/holdings`, `GET /v1/holdings/{id}` with `hld_` schema; examples validate and expose holding abstractions, not contract fragments                                                                                                                            | medium |
| P2.C10 | IssueIntent OpenAPI paths + schema + examples            | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/intents.ts`, `packages/api-contracts/examples/issue-intent*.json`              | create/retrieve/list/confirm/cancel issue intent path items, request schemas, response schema, and golden examples                                                                            | P2.C01, P2.C02, P2.C03, P2.C19, P2.C25                                                                         | OpenAPI contains all issue intent endpoints from API*MATRIX; mutating routes require `Idempotency-Key`; examples include `issint*`, `op\_`, and `latest_event` fields                                                                                                                 | high   |
| P2.C11 | RedeemIntent OpenAPI paths + schema + examples           | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/intents.ts`, `packages/api-contracts/examples/redeem-intent*.json`             | create/retrieve/list/confirm/cancel redeem intent path items, request schemas, response schema, and golden examples                                                                           | P2.C01, P2.C02, P2.C03, P2.C19, P2.C25                                                                         | OpenAPI contains all redeem intent endpoints from API*MATRIX; mutating routes require `Idempotency-Key`; examples include `redint*`, source holding/lock fields where applicable, and no raw ledger identifiers                                                                       | high   |
| P2.C12 | TransferIntent OpenAPI paths + schema + examples         | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/intents.ts`, `packages/api-contracts/examples/transfer-intent*.json`           | create/retrieve/list/confirm/cancel transfer intent path items, request schemas, response schema, and golden examples                                                                         | P2.C01, P2.C02, P2.C03, P2.C19, P2.C25                                                                         | OpenAPI contains all transfer intent endpoints from API_MATRIX; create and confirm examples validate; status enum matches section 4 and `operation` is present on mutation responses                                                                                                  | high   |
| P2.C13 | Hold OpenAPI paths + release action + examples           | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/hold.ts`, `packages/api-contracts/examples/hold*.json`                         | create/retrieve/list/release/cancel hold path items, `Hold` schema, action request schemas, and golden examples                                                                               | P2.C01, P2.C02, P2.C03, P2.C19, P2.C25                                                                         | OpenAPI contains `POST /v1/holds`, `GET /v1/holds`, `GET /v1/holds/{id}`, `POST /v1/holds/{id}/release`, `POST /v1/holds/{id}/cancel`; release action requires idempotency and returns `hold_` object                                                                                 | high   |
| P2.C14 | Operation OpenAPI paths + expand semantics + examples    | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/operation.ts`, `packages/api-contracts/examples/operation*.json`               | retrieve/list operation path items, `Operation` schema, `expand[]=ledger`/`ledger_trace` admin-only semantics, and golden examples                                                            | P2.C01, P2.C02, P2.C03, P2.C19                                                                                 | OpenAPI contains `GET /v1/operations`, `GET /v1/operations/{id}`; default examples are public-safe; privileged ledger expansion is documented as role-gated and excluded from customer examples                                                                                       | high   |
| P2.C15 | Event OpenAPI paths + cursor pagination + examples       | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/event.ts`, `packages/api-contracts/examples/event*.json`                       | retrieve/list/resend/replay event path items, immutable `Event` schema, cursor pagination parameters, and golden examples                                                                     | P2.C01, P2.C02, P2.C03, P2.C19, P2.C25                                                                         | OpenAPI contains event endpoints from API_MATRIX; list uses `limit`, `starting_after`, `ending_before`; resend/replay require `Idempotency-Key`; examples match EVENT_CATALOG envelope                                                                                                | high   |
| P2.C16 | WebhookEndpoint OpenAPI paths + rotate secret + examples | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/webhook-endpoint.ts`, `packages/api-contracts/examples/webhook-endpoint*.json` | create/retrieve/list/update/delete/enable/disable/rotate_secret/test/deliveries path items, schemas, and golden examples                                                                      | P2.C01, P2.C02, P2.C03, P2.C19, P2.C25                                                                         | OpenAPI contains webhook endpoint endpoints from API_MATRIX; `rotate_secret` response documents one-time secret material policy; endpoint version pinning fields validate                                                                                                             | high   |
| P2.C17 | ApiKey OpenAPI paths + create secret once + examples     | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/api-key.ts`, `packages/api-contracts/examples/api-key*.json`                   | create/retrieve/list/rotate/revoke/expire API key path items, descriptor schema, one-time secret response schema, and golden examples                                                         | P2.C01, P2.C02, P2.C03, P2.C19, P2.C25                                                                         | OpenAPI contains API key endpoints from API_MATRIX; create/rotate schemas return raw secret only in immediate response examples and descriptor examples never expose full key material                                                                                                | high   |
| P2.C18 | Reserved additive skeleton paths                         | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/common.ts`                                                                     | additive reserved path shells for files, evidence files, export jobs, report templates, usage events, invoices, onboarding, and admin template registry                                       | P2.C01, P2.C19, P2.C25                                                                                         | OpenAPI reserves `/v1/files`, `/v1/evidence_files`, `/v1/export_jobs`, `/v1/report_templates`, `/v1/usage_events`, `/v1/invoices`, `/v1/onboarding`, `/v1/admin/template_registry/templates`, and template version subpaths with stable path grammar and additive ADR follow-up notes | medium |
| P2.C19 | OpenAPI common components                                | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/common.ts`, `packages/api-contracts/schemas/error.ts`                          | shared error envelope, pagination envelope, expand parameter schema, ID prefix patterns, and closed status enum unions                                                                        | P2.C01, P2.C02                                                                                                 | Component tests prove every path references common error/list/id/status schemas; enum unions match section 4; `operationId` values are unique and deterministic                                                                                                                       | medium |
| P2.C20 | Tenant headers and health envelope components            | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/common.ts`                                                                     | tenant-scoped request/response header components and deployment-mode-neutral health response schema                                                                                           | P2.C01, P2.C19                                                                                                 | OpenAPI declares `Authorization`, `Pillar-Version`, `Idempotency-Key`, `Pillar-Request-Id`, `Pillar-Mode`, and health envelope without hosted/customer/self-hosted grammar forks                                                                                                      | medium |
| P2.C21 | Golden snapshot runner config                            | `packages/api-contracts/golden`, `packages/api-contracts/package.json`, `packages/api-contracts/scripts`                                                        | snapshot diff tool configuration, deterministic fixture ordering, and documented regeneration command                                                                                         | P2.C02, P2.C03, P2.C06, P2.C07, P2.C08, P2.C09, P2.C10, P2.C11, P2.C12, P2.C13, P2.C14, P2.C15, P2.C16, P2.C17 | `pnpm --filter @pillar/api-contracts test:golden` fails on unclassified drift and `pnpm --filter @pillar/api-contracts golden:update` regenerates deterministic snapshots                                                                                                             | medium |
| P2.C22 | OpenAPI to schema package codegen                        | `packages/api-contracts/schemas`, `packages/api-contracts/src/codegen`, `packages/api-contracts/package.json`                                                   | OpenAPI-to-Zod or OpenAPI-to-io-ts codegen wiring consumed by route tests and SDK generation                                                                                                  | P2.C01, P2.C02, P2.C19                                                                                         | `pnpm --filter @pillar/api-contracts codegen` emits schema package artifacts from `pillar-v1.yaml` and route tests import generated validators instead of duplicating contracts                                                                                                       | medium |
| P2.C23 | Forbidden-substring lint for examples                    | `packages/api-contracts/scripts`, `packages/api-contracts/examples`, `packages/api-contracts/golden`                                                            | lint that scans OpenAPI examples and golden fixtures for `contractId`, `templateId`, `partyId`, `participantId`, `packageId`, `commandId`, `submissionId`, `updateId` and snake/case variants | P2.C03, P2.C19, P2.C21                                                                                         | `pnpm --filter @pillar/api-contracts lint:public-contract` fails on forbidden Canton/Daml substrings and reports the offending file/path                                                                                                                                              | high   |
| P2.C24 | Pillar-Version resolver tests                            | `apps/api/src/middleware/api-version.ts`, `apps/api/test/api-version.test.ts`                                                                                   | resolver tests for header override, account default, SDK pinned fallback, unsupported versions, and response header echo                                                                      | P2.C05, P2.C20                                                                                                 | Tests prove resolution order is `Pillar-Version` header > account default > SDK pinned version and unsupported versions return structured `version_error`                                                                                                                             | medium |
| P2.C25 | Idempotency-Key OpenAPI requirement flags                | `packages/api-contracts/openapi/pillar-v1.yaml`, `packages/api-contracts/schemas/common.ts`, `apps/api/test/openapi-idempotency.test.ts`                        | per-route mutating-operation metadata and tests requiring `Idempotency-Key` on all POST/action/DELETE reserved mutations                                                                      | P2.C01, P2.C19, P2.C20                                                                                         | Contract test enumerates API_MATRIX mutating routes and fails when any mutating operation lacks required `Idempotency-Key` header or missing-key error response                                                                                                                       | high   |
| P2.E02 | Request ID middleware                                    | `apps/api/src/middleware/request-id.ts`, `apps/api/test/request-id.test.ts`                                                                                     | middleware that accepts valid inbound `X-Request-Id`, generates `req_` IDs when absent, and sets `Pillar-Request-Id` on every response                                                        | P2.E01, P2.C20                                                                                                 | Tests cover pass-through, generation, malformed inbound replacement, and error responses carrying the same request ID                                                                                                                                                                 | low    |
| P2.E03 | Audit middleware base                                    | `apps/api/src/middleware/audit.ts`, `apps/api/src/repositories/api-requests.ts`, `apps/api/test/audit-middleware.test.ts`                                       | request audit hook interface that records masked request metadata to an `api_requests` repository abstraction without Phase 03 persistence                                                    | P2.E01, P2.E02, P2.C04                                                                                         | Tests prove audit hook is called for success and error responses, masks auth/idempotency values, and does not require canonical migrations                                                                                                                                            | medium |
| P2.E09 | Pagination helper                                        | `apps/api/src/http/pagination.ts`, `apps/api/test/pagination.test.ts`                                                                                           | cursor encode/decode and list response helper for `limit`, `starting_after`, `ending_before`, `has_more`, `url`, deterministic ordering inputs                                                | P2.E01, P2.C19                                                                                                 | Unit tests cover bounds, invalid cursor error envelope, exclusive cursor semantics, and list wrapper rendering                                                                                                                                                                        | medium |
| P2.E10 | Expand helper                                            | `apps/api/src/http/expand.ts`, `apps/api/test/expand.test.ts`                                                                                                   | `expand[]=` parser, dotted/list expansion normalization, allowlist validation, and presenter/projector application hook                                                                       | P2.E01, P2.C19                                                                                                 | Tests cover duplicate expansions, max depth, unsupported expansion `unsupported_expand`, list `data.*` grammar, and admin-only ledger expansion rejection by default                                                                                                                  | medium |
| P2.E11 | Error envelope renderer                                  | `apps/api/src/errors/error-presenter.ts`, `apps/api/test/error-presenter.test.ts`                                                                               | central presenter that renders every thrown `PillarError` and unknown exception into the section 5 error envelope                                                                             | P2.E01, P2.C04, P2.E02                                                                                         | Tests cover 400/401/403/404/409/429/500 classes, `request_id` inclusion, `param` preservation, and no raw stack leakage                                                                                                                                                               | medium |
| P2.E12 | OpenAPI doc-serving route                                | `apps/api/src/routes/v1/openapi.ts`, `apps/api/test/openapi-route.test.ts`                                                                                      | admin-scoped `GET /v1/openapi.json` route serving the generated contract with cache/version headers                                                                                           | P2.E01, P2.C01, P2.C20                                                                                         | Route test retrieves valid OpenAPI JSON, requires admin scope, sets resolved `Pillar-Version`, and never exposes deployment-mode-specific variants                                                                                                                                    | low    |
| P2.E13 | Health endpoint                                          | `apps/api/src/routes/v1/health.ts`, `apps/api/test/health.test.ts`                                                                                              | `GET /v1/health` route returning deployment-mode-neutral API health envelope                                                                                                                  | P2.E01, P2.C20                                                                                                 | Health test passes in hosted, customer-validator, and self-hosted config fixtures with identical response grammar and no participant/ledger topology fields                                                                                                                           | low    |

Execution order:

```text
1. P2.C19/P2.C20 common components, headers, errors, list, expand, IDs, health envelope.
2. P2.C06-P2.C17 resource paths, object schemas, examples, and golden fixtures.
3. P2.C18 reserved additive skeleton paths from API_MATRIX.
4. P2.C21/P2.C22/P2.C23 golden runner, schema codegen, and forbidden-substring lint.
5. P2.C24/P2.C25 version/idempotency contract tests.
6. P2.E01/P2.E02/P2.E03 Fastify skeleton, request ID, and audit hooks.
7. P2.E09/P2.E10/P2.E11 pagination, expand, and error presenter helpers.
8. P2.E04/P2.E05 account and asset DB-only routes.
9. P2.E12/P2.E13 OpenAPI serving and deployment-neutral health route.
10. Contract test sweep: OpenAPI validator + golden snapshots + forbidden-substring lint.
```

Route acceptance matrix:

| Endpoint group                | Required in OpenAPI | Required runnable in `apps/api`                                                   | Ledger side effect allowed? |
| ----------------------------- | ------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| accounts                      | yes                 | yes                                                                               | no                          |
| assets                        | yes                 | yes                                                                               | no                          |
| balances                      | yes                 | route may return controlled not-implemented/projection-unavailable until Phase 05 | no                          |
| holdings                      | yes                 | route may return controlled not-implemented/projection-unavailable until Phase 05 | no                          |
| issue/redeem/transfer intents | yes                 | contract-level validation only; no submission                                     | no                          |
| holds                         | yes                 | contract-level validation only; no lock/release                                   | no                          |
| operations                    | yes                 | contract-level retrieve shape only                                                | no                          |
| events                        | yes                 | contract-level list/retrieve shape only                                           | no                          |
| webhook endpoints             | yes                 | config route contract only                                                        | no delivery                 |
| API keys                      | yes                 | contract-level validation only; real secret persistence is Phase 08               | no                          |
| reserved additive resources   | yes                 | no, except explicit later-phase route tickets                                     | no                          |

## 10. Open Questions

| Question                             | Current resolution                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strong-read `consistency=` semantics | Undecided. [03 Pillar API Grammar v1](../Architecture/03_Pillar%20API%20Grammar%20v1.md) mentions `eventual`, `read_your_writes`, `strict`, and internal `ledger_only`; [05 Asset Read Model](../Architecture/05_asset%20read%20model.md) mentions `projection` and `ledger`. Phase 02 should document the parameter as reserved/experimental, not guarantee strong reads. |
| Timestamp style conflict             | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) examples include epoch seconds, while [03 Pillar API Grammar v1](../Architecture/03_Pillar%20API%20Grammar%20v1.md) standardizes RFC3339 UTC milliseconds. Phase 02 uses RFC3339 for new golden examples and preserves implementation-plan field names.                                              |
| Asset prefix conflict                | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) defines `asst_`; some other architecture docs use `asset_` or `ast_`. Phase 02 follows implementation-plan canonical prefix `asst_`.                                                                                                                                                                 |
| Operation debug expansion            | Admin-scoped ledger debug expansion is outside this phase. Default public operation remains safe.                                                                                                                                                                                                                                                                          |
| Account/asset DB route persistence   | CRUD-lite route implementation may use repository abstractions before canonical Phase 03 migrations, but must not create new canonical tables in this document.                                                                                                                                                                                                            |

## 11. Agent-ready Checklist

### Contract checklist

- [ ] `packages/api-contracts/openapi/pillar-v1.yaml` contains every `/v1` resource listed in API_MATRIX for account, asset, balance, holding, issue intent, redeem intent, transfer intent, hold, operation, event, webhook endpoint, and API key (`P2.C06`-`P2.C17`).
- [ ] Reserved additive skeletons exist for files, evidence files, export jobs, report templates, usage events, invoices, onboarding, and admin template registry (`P2.C18`).
- [ ] Object schemas validate ID prefixes: `acct_`, `asst_`, `bal_`, `hld_`, `issint_`, `redint_`, `trint_`, `hold_`, `op_`, `evt_`, `we_`, `ak_` (`P2.C19`).
- [ ] Intent status enum is exactly `requires_action`, `processing`, `succeeded`, `failed`, `canceled`, `expired` (`P2.C19`).
- [ ] Operation status enum is exactly `received`, `queued`, `submitted`, `in_flight`, `ledger_committed`, `projected`, `failed`, `unknown`, `reconciled` (`P2.C19`).
- [ ] Webhook delivery status enum is exactly `pending`, `delivered`, `failed`, `retrying`, `dead_lettered`, `manually_replayed` (`P2.C19`).
- [ ] Golden examples exist for every public resource ticket and validate through the snapshot runner (`P2.C03`, `P2.C21`).
- [ ] Every mutation endpoint requires `Idempotency-Key` in OpenAPI and route validation (`P2.C25`).
- [ ] Error responses use the section 5 envelope (`P2.C04`, `P2.C19`, `P2.E11`).
- [ ] Version middleware returns resolved `Pillar-Version` and passes header/default/SDK fallback tests (`P2.C05`, `P2.C24`).
- [ ] Account/asset CRUD-lite routes hit only DB/config abstractions and do not submit ledger commands (`P2.E04`, `P2.E05`).
- [ ] `/v1/openapi.json` and `/v1/health` are served through admin-scoped/open health routes with deployment-neutral grammar (`P2.E12`, `P2.E13`).

### Build gate

- [ ] `pnpm --filter @pillar/api-contracts build` covers `P2.C01`-`P2.C22`.
- [ ] OpenAPI validator passes for `packages/api-contracts/openapi/pillar-v1.yaml` and every API_MATRIX route reserved by `P2.C06`-`P2.C18`.
- [ ] Golden snapshot test runner is green for resource examples from `P2.C06`-`P2.C17` (`P2.C21`).

### Verify gate

- [ ] All examples validate against OpenAPI schemas and generated schema package artifacts (`P2.C21`, `P2.C22`).
- [ ] Route coverage confirms every API_MATRIX path owned or reserved by Phase 02 exists in the OpenAPI document (`P2.C06`-`P2.C18`).
- [ ] Account, asset, intent, hold, event replay, webhook endpoint, and API key route tests confirm `Idempotency-Key` is required for mutating operations (`P2.C25`).
- [ ] Snapshot diff contains no unclassified schema drift (`P2.C21`).
- [ ] Example and golden payload scan contains no forbidden Canton/Daml internals (`P2.C23`).
- [ ] Request ID, pagination, expand, error envelope, OpenAPI serving, and health helper tests pass (`P2.E02`, `P2.E09`, `P2.E10`, `P2.E11`, `P2.E12`, `P2.E13`).

### Invariant gate

- [ ] Public API exposes no Canton contract-first fields; forbidden-substring lint enforces IC-03 (`P2.C23`).
- [ ] DB asset state is projection/config only; account and asset route tickets do not create economic ledger authority (`P2.E04`, `P2.E05`).
- [ ] Every mutation has stable operation ID and future command ID mapping through intent/operation response schemas and idempotency flags (`P2.C10`-`P2.C17`, `P2.C25`).
- [ ] Deployment mode does not change `/v1` grammar; health and OpenAPI envelopes remain mode-neutral (`P2.C20`, `P2.E12`, `P2.E13`).
