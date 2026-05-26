# Phase 07 — SDK / CLI / Workbench

> Ship the developer surface for Pillar: generated SDKs with ergonomic wrappers, a polished `pillar` CLI, and Workbench panels that make Canton-backed operations inspectable without exposing Canton as the public API.

## 1. Executive Summary

Phase 07 turns the Phase 0–6 runtime into a usable developer product.

Pillar remains **The payments runtime for Canton-backed assets**:

1. Canton Ledger is the source of truth.
2. Pillar DB stores only Projection / Audit / Config.
3. External API must be developer-friendly and Canton-invisible.
4. Internal runtime must be Canton-native.
5. Operations must be ledger-traceable.
6. Balance/Holding-first, not contract-first.
7. Intent-first, not transaction-first.
8. Webhook-first for async workflow.
9. API grammar must be polished from day one.
10. Deployment model changes, API experience does not.

Phase 07 implements M7 from [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md):

- `packages/sdk-node`
- `packages/sdk-python`
- `packages/sdk-java`
- `tools/cli`
- `apps/workbench`
- `apps/docs`

The public deliverable is a developer loop that works end-to-end against local compose:

```bash
pillar sandbox up
pillar events list
pillar webhooks listen --forward-to http://localhost:4242/webhook
```

Then sample transfer applications in Node, Python, and Java create a transfer intent, wait for the projected result, verify webhook signature, and show the corresponding operation trace.

Architecture sources:

- [14 CLI Design](../Architecture/14_CLI%20Design.md)
- [15 SDK Design](../Architecture/15_SDK%20Design.md)
- [16 Pillar Workbench UX](../Architecture/16_Pillar%20Workbench%20UX.md)
- [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)

## 2. Goals / Non-goals

### Goals

| Goal                        | Phase 07 outcome                                                                                                                        | Source                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| SDK family consistency      | Node, Python, Java SDKs generated from OpenAPI and wrapped with handwritten ergonomics                                                  | [15 SDK Design](../Architecture/15_SDK%20Design.md)                     |
| polished CLI grammar    | `pillar` exposes login, sandbox, events, webhooks, balances, and traces workflows                                                       | [14 CLI Design](../Architecture/14_CLI%20Design.md)                     |
| Workbench for debugging     | API Explorer, Event Inspector, Webhook Delivery, Ledger Trace, Projection Health panels                                                 | [16 Pillar Workbench UX](../Architecture/16_Pillar%20Workbench%20UX.md) |
| Canton-invisible public UX  | SDK/CLI/Workbench default views show `acct_`, `asset_`, `hld_`, `bal_`, `tr_`, `evt_`, `op_`, `ltr_`; no raw contract-first identifiers | [15 SDK Design](../Architecture/15_SDK%20Design.md)                     |
| Webhook-first workflow      | CLI local listener and SDK webhook verifier work across all supported SDKs                                                              | [14 CLI Design](../Architecture/14_CLI%20Design.md)                     |
| Ledger-traceable operations | CLI and Workbench can resolve operation/request/event to ledger trace timeline                                                          | [16 Pillar Workbench UX](../Architecture/16_Pillar%20Workbench%20UX.md) |
| Docs site                   | `apps/docs` publishes SDK quickstarts, CLI command reference, Workbench workflows, and webhook verifier examples                        | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)   |

### Non-goals

| Non-goal                                      | Reason                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| New public objects                            | Phase 07 consumes the Phase 2 API contract and Phase 4–6 runtime; it does not define new `/v1` objects.             |
| New DB tables                                 | No migrations in this phase. SDK, CLI, Workbench, and docs use existing API/runtime/projection/audit/config tables. |
| Canton Ledger API exposure in public SDKs     | Public SDKs call only Pillar External API. Canton remains behind runtime adapters and trace services.               |
| Arbitrary Daml command authoring in Workbench | Workbench API Explorer executes Pillar Public API only.                                                             |
| Go/.NET fourth SDK                            | Open question for next SDK; Phase 07 ships Node, Python, Java only.                                                 |
| Production security hardening                 | OS keychain, CSP, CSRF, and token hygiene are implemented here; broader auth/compliance hardening is Phase 08.      |
| Helm/release automation                       | Packaging and deployment promotion are Phase 09.                                                                    |

## 3. Architecture

### Phase 07 component slice

```text
OpenAPI contract
  |
  |  codegen
  v
Generated SDK skeletons
  |        |         |
  v        v         v
Node     Python    Java
  |        |         |
  +--------+---------+
           |
Handwritten ergonomic layer
  - resource clients
  - request options
  - pagination helpers
  - retry/idempotency middleware
  - webhook signature verifier
  - typed events/errors
           |
           v
Pillar External API /v1
           ^
           |
+----------+-------------------------------+
|                                          |
pillar CLI (tools/cli, TypeScript)         Workbench (apps/workbench)
- auth/profile manager                     - API Explorer
- OS keychain credential store             - Event Inspector
- generated API client                     - Webhook Delivery
- local webhook forwarder                  - Ledger Trace
- sandbox orchestration                    - Projection Health
- trace/event renderers                    - SDK/CLI snippet generator
```

### Codegen pipeline

OpenAPI is the canonical contract for SDKs, docs, examples, and conformance tests.

```text
packages/api-contracts
  openapi.yaml
  examples/*.json
  fixtures/*.yaml
      |
      | validate + bundle
      v
packages/api-contracts/dist/pillar-<api-version>.yaml
      |
      +--> packages/sdk-node/src/generated
      +--> packages/sdk-python/pillar/generated
      +--> packages/sdk-java/src/main/java/com/pillar/generated
      +--> apps/docs/generated/api-reference
      +--> tools/cli/src/generated/client
      +--> apps/workbench/src/generated/client
```

Generated code MUST remain mechanically replaceable. Handwritten layers sit beside generated output:

| Layer     | Generated                                             | Handwritten ergonomic layer                                                |
| --------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| Transport | path params, query/body serializers, response schemas | auth, retries, timeouts, request id capture, version header                |
| Models    | OpenAPI schema types                                  | event unions, expandable types, rich errors, last response metadata        |
| Resources | low-level endpoint methods                            | `client.transferIntents.create`, auto-pagination, idempotency-safe options |
| Webhooks  | event schema types                                    | HMAC verifier, raw-body helpers, framework examples                        |
| Samples   | schema examples                                       | real transfer e2e sample apps                                              |

Rules:

- Generated directories are overwritten by codegen.
- Handwritten wrappers never edit generated files.
- SDK tests compare generated model names and public wrapper names against OpenAPI resource tags.
- Each SDK pins a default `Pillar-Version` aligned to its release.
- Docs and Workbench snippets are produced from the same OpenAPI + SDK metadata manifest.

### CLI architecture

Phase 07 implements `tools/cli` in TypeScript, even though [14 CLI Design](../Architecture/14_CLI%20Design.md) recommends Go for a final static binary. This is a conscious Phase 07 execution choice: TypeScript reuses the generated OpenAPI client and ships the M7 developer loop faster. If the CLI moves to Go later, the command grammar and acceptance gates do not change.

```text
tools/cli
├─ src/commands
│  ├─ login.ts
│  ├─ sandbox.ts
│  ├─ events.ts
│  ├─ webhooks.ts
│  ├─ balances.ts
│  └─ traces.ts
├─ src/auth
│  ├─ keychain.ts
│  ├─ profiles.ts
│  └─ token.ts
├─ src/client
│  ├─ pillar-client.ts
│  ├─ retry.ts
│  └─ idempotency.ts
├─ src/render
│  ├─ table.ts
│  ├─ json.ts
│  └─ ndjson.ts
├─ src/webhooks
│  ├─ listener.ts
│  ├─ forwarder.ts
│  └─ signing.ts
└─ src/sandbox
   ├─ compose.ts
   └─ profile.ts
```

CLI responsibilities:

| Responsibility    | Design                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Auth              | `pillar login` stores an access token in OS keychain; config stores only profile metadata. |
| Sandbox profile   | `pillar sandbox up` writes a no-auth local profile for compose.                            |
| API calls         | Only Pillar External API; no Canton Ledger API calls.                                      |
| Retry             | Safe retries for idempotency-safe methods.                                                 |
| Output            | `table`, `json`, `ndjson`; secret values redacted by default.                              |
| Webhook local dev | Stream events from Pillar, sign forwarded requests, print signing secret.                  |
| Trace UX          | Show request → operation → command → completion → projection → event → delivery timeline.  |

### Workbench panels

Phase 07 implements five Workbench panels from the Workbench architecture.

| Panel             | Purpose                                                                               | Data source                      | Exit behavior                                                           |
| ----------------- | ------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| API Explorer      | Execute Pillar `/v1` requests with selected environment, API version, idempotency key | OpenAPI schema + External API    | Can create a transfer/issuance intent in sandbox and deep-link to trace |
| Event Inspector   | Search and inspect events, payload mode, API version, request link                    | `/v1/events`                     | Event payload and related request are visible                           |
| Webhook Delivery  | Inspect delivery attempts, response codes, retry schedule, replay action              | webhook delivery API/audit views | A failed delivery shows status/timing/signature metadata                |
| Ledger Trace      | Visualize operation chain from API request to ledger outcome and webhook              | trace API/audit/projection       | `op_...` resolves to timeline and graph                                 |
| Projection Health | Show latest offset, lag, rebuild status, webhook backlog                              | projection health API            | Operator can distinguish ledger lag from webhook failure                |

Workbench MUST NOT become a general live-data operations console in this phase. It is a sandbox-first developer debugger with permission-gated live visibility.

### Docs site

`apps/docs` publishes:

- SDK quickstarts for Node, Python, Java.
- CLI command reference for the Phase 07 command map.
- Webhook signature verification examples for all SDKs.
- Workbench user guide for the five panels.
- Local sandbox transfer walkthrough.
- API version pinning and idempotency guidance.

## 4. API / Object Model

Phase 07 adds SDK/CLI/Workbench surfaces over existing Phase 2–6 API objects. It does not add new public object families.

### SDK matrix

| SDK             | Package path          | Public package                  | Client construction                                          | Pagination              | Webhook verifier                                              | Sample acceptance        |
| --------------- | --------------------- | ------------------------------- | ------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------- | ------------------------ |
| Node/TypeScript | `packages/sdk-node`   | `@pillar/pillar-js` or `pillar` | `new Pillar(apiKey, { apiVersion })`                         | `for await (...)`       | `pillar.webhooks.constructEvent(rawBody, signature, secret)`  | sample transfer succeeds |
| Python          | `packages/sdk-python` | `pillar-sdk`                    | `pillar.Client(api_key, api_version=...)`                    | `.auto_paging_iter()`   | `pillar.Webhook.construct_event(raw_body, signature, secret)` | sample transfer succeeds |
| Java            | `packages/sdk-java`   | `com.pillar:pillar-java`        | `PillarClient.builder().apiKey(...).apiVersion(...).build()` | `.autoPagingIterable()` | `Webhook.constructEvent(rawBody, signature, secret)`          | sample transfer succeeds |

### Common SDK resource surface

| Resource client                 | Required methods                                                  | Notes                                                                                    |
| ------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `accounts`                      | `create`, `retrieve`, `list`                                      | Account abstraction only; no raw party ID by default.                                    |
| `assets` / `assetClasses`       | `create`/`retrieve`/`list` as defined by current OpenAPI          | Naming follows OpenAPI tags; wrappers MAY alias only if documented and tested.           |
| `balances`                      | `retrieve`, `list`                                                | Balance/Holding-first read model.                                                        |
| `holdings`                      | `retrieve`, `list`                                                | Projection-backed; source is ledger.                                                     |
| `transferIntents` / `transfers` | `create`, `retrieve`, `confirm`, `cancel`, `list` where available | Intent-first mutation surface.                                                           |
| `events`                        | `retrieve`, `list`, `replay` where API supports replay            | Webhook-first async workflow.                                                            |
| `webhookEndpoints`              | `create`, `retrieve`, `update`, `list`                            | Endpoint API version pinning.                                                            |
| `traces`                        | `retrieve`                                                        | Returns ledger trace object/timeline by operation/resource/request when API supports it. |
| `webhooks`                      | `constructEvent`, `verifySignature`                               | Raw body required.                                                                       |

### Required SDK options

| Option              | Node                 | Python               | Java                                     | Behavior                                          |
| ------------------- | -------------------- | -------------------- | ---------------------------------------- | ------------------------------------------------- |
| API key             | constructor          | constructor          | builder                                  | Sent as bearer credential.                        |
| `apiVersion`        | global + per-request | global + per-request | builder/global; per-request preview-only | Sends `Pillar-Version`.                           |
| `idempotencyKey`    | request option       | request option       | request option                           | Sent on mutations; auto-generated only when safe. |
| `maxNetworkRetries` | client option        | client option        | client option                            | Applies only to idempotency-safe methods.         |
| timeout             | client/request       | client/request       | client/request                           | Default aligns with API gateway timeout policy.   |
| telemetry/debug     | client option        | client option        | client option                            | Redacted; no request bodies or secrets.           |

### CLI command map

Phase 07 CLI commands are fixed by [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) and expanded for the acceptance path.

| Command                    | Purpose                                                        | API/runtime mapping                                   | Required behavior                                               |
| -------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| `pillar login`             | Authenticate a CLI profile                                     | `POST /v1/cli/sessions`, `GET /v1/me` where available | Stores token in OS keychain; config contains no token.          |
| `pillar sandbox up`        | Start local compose sandbox and select no-auth sandbox profile | local compose + `/v1/health`                          | Local profile uses no-auth; no live credentials.                |
| `pillar events list`       | List recent events                                             | `GET /v1/events`                                      | Supports filters, table/json/ndjson output.                     |
| `pillar events replay`     | Replay an existing event                                       | event replay API from Phase 6                         | Creates new delivery/audit entry; no fake event.                |
| `pillar webhooks listen`   | Forward events to local HTTP endpoint                          | CLI listener stream + local forwarder                 | Prints signing secret, signs forwarded requests.                |
| `pillar webhooks trigger`  | Trigger sandbox workflow event                                 | sandbox test helper / trigger API                     | Creates real sandbox side effects; forbidden for live.          |
| `pillar balances get`      | Retrieve account/asset balance                                 | `GET /v1/balances` or balance retrieve endpoint       | Shows available/pending/locked and projection offset.           |
| `pillar traces get op_...` | Resolve operation trace                                        | trace API                                             | Shows operation → request → command → projection → event chain. |

Aliases MAY be added only when they preserve the canonical map:

```text
pillar webhooks listen  == pillar listen only if documented as an alias
pillar webhooks trigger == pillar trigger only if documented as an alias
pillar traces get       == pillar ledger trace only if documented as an alias
```

The canonical acceptance list for Phase 07 is:

```bash
pillar login
pillar sandbox up
pillar events list
pillar events replay
pillar webhooks listen
pillar webhooks trigger
pillar balances get
pillar traces get op_01...
```

### Workbench object visibility

| Workbench surface | Public IDs shown                                                | Internal IDs default | Internal IDs when privileged                        |
| ----------------- | --------------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| API Explorer      | `acct_`, `asset_`, `hld_`, `bal_`, `tr_`, `evt_`, `op_`, `ltr_` | hidden               | hidden unless trace expand is authorized            |
| Event Inspector   | `evt_`, resource ID, request ID                                 | hidden               | trace tab may show command/update metadata          |
| Webhook Delivery  | `edlv_`, `evt_`, `we_`                                          | hidden               | payload hash and trace edge only                    |
| Ledger Trace      | `op_`, `req_`, `evt_`, `ltr_`                                   | redacted             | command/update/offset visible with audit permission |
| Projection Health | offset/lag metrics                                              | no contracts         | no contract payloads                                |

## 5. Internal Runtime

Phase 07 does not alter ledger mutation semantics. It builds clients and user interfaces on top of existing runtime services.

### SDK internal behavior

| Concern              | Required implementation                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| API version pinning  | Each SDK release pins a default `Pillar-Version`; override support follows SDK strength rules.                                           |
| Idempotency          | Mutating calls accept `idempotencyKey`; SDK MAY generate retry-safety keys only for idempotency-safe methods.                            |
| Retry                | Retry connection reset, DNS transient, TLS timeout, read timeout, 408, retryable 409, 425, 429, 500, 502, 503, 504; honor `Retry-After`. |
| Non-retry            | Auth, validation, permission, and business-rule errors are not retried.                                                                  |
| Request ID           | Expose `Pillar-Request-Id` on returned objects and errors.                                                                               |
| Webhook verification | HMAC-SHA256 over `${timestamp}.${raw_body}`; constant-time compare; raw body required; multiple active secrets during rotation.          |
| Error model          | Typed errors carry `type`, `code`, `message`, `param`, `request_id`, `ledger_trace_id`, `retryable`.                                     |
| Logging              | Redact API keys, bearer tokens, signatures, raw request/response bodies, and customer metadata.                                          |

### CLI internal behavior

| Concern           | Required implementation                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Auth profile      | `pillar login` writes token to OS keychain and profile metadata to config.                                        |
| Sandbox profile   | `pillar sandbox up` writes a local profile with no-auth base URL for compose.                                     |
| Token precedence  | CLI flag > env var > project config > global config > keychain profile.                                           |
| Redaction         | Secrets redacted in table/log output by default; `--show-secrets` restricted to explicit commands.                |
| Idempotency       | Mutation commands support `--idempotency-key`; generated keys are printed in verbose/json output.                 |
| Output            | Every command supports machine-readable JSON; streaming commands support NDJSON where useful.                     |
| Trace correlation | Capture `request_id`, `operation_id`, `event_id`, `ledger_trace_id` from responses and surface them.              |
| Local webhooks    | Listener signs forwarded payloads using the CLI listener secret; raw forwarded body is stable for verifier tests. |

### Workbench internal behavior

| Concern             | Required implementation                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| OpenAPI binding     | API Explorer form, docs links, and snippets derive from OpenAPI bundle.                           |
| Environment binding | Project/environment selector resolves base URL, API version, and allowed credentials.             |
| Idempotency UX      | Mutating requests require or generate visible idempotency keys; replay warns on body mismatch.    |
| Trace links         | API Explorer, Event Inspector, Webhook Delivery, and Projection Health deep-link to Ledger Trace. |
| Permission gates    | Live replay, raw payload inspection, and Canton trace expansion require explicit permissions.     |
| Scope control       | Default mode is sandbox; live mode has visual warnings and confirmation for replay.               |

### Sample transfer e2e

Each SDK sample app MUST implement the same logical scenario:

```text
1. Load API key/base URL/API version from environment or sandbox profile.
2. Create or load issuer and holder accounts.
3. Create or load an asset class.
4. Issue asset to source holder.
5. Create transfer intent from source holder to destination holder.
6. Wait/poll until transfer reaches terminal projected status.
7. List events related to the transfer.
8. Verify a sample webhook payload signature using the SDK verifier.
9. Fetch trace by operation/trace ID and print request/event correlation.
```

No sample may use mocks for the acceptance path.

## 6. DB Schema

No new DB tables are introduced in Phase 07.

| Area      | DB impact                                                                                   |
| --------- | ------------------------------------------------------------------------------------------- |
| SDKs      | None; SDKs consume External API only.                                                       |
| CLI       | Local config/keychain files only; no server migration.                                      |
| Workbench | Uses existing API, request log, event, webhook delivery, trace, and projection health data. |
| Docs      | Static/generated site content only.                                                         |

Existing server-side data categories remain unchanged:

| Category   | Examples consumed by Phase 07                           | Rule                                |
| ---------- | ------------------------------------------------------- | ----------------------------------- |
| Projection | balances, holdings, transfer status, projection offsets | Rebuildable from Canton Ledger/PQS. |
| Audit      | request logs, trace edges, webhook delivery attempts    | Traceability and debugging only.    |
| Config     | webhook endpoints, API versions, sandbox settings       | Operational configuration only.     |

Phase 07 MUST NOT add tables for SDK sessions, CLI state, Workbench caches, or client-side telemetry. If Workbench needs cached UI state, it uses browser-local state or existing API-backed config after Phase 08 auth review.

## 7. Failure Modes

| Failure mode                                | Symptom                                                             | Impact                                           | Mitigation                                                                                                     | Gate           |
| ------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------- |
| SDK drift from OpenAPI                      | SDK method/type differs from public spec                            | Integrations compile against unsupported API     | Generated skeletons overwritten from bundled OpenAPI; wrapper conformance tests compare tags/resources/options | Build + Verify |
| Handwritten wrapper hides API errors        | SDK normalizes away `request_id`, `ledger_trace_id`, or `retryable` | Debugging and support lose traceability          | Error wrappers preserve server error object and headers                                                        | Verify         |
| Unsafe retry on non-idempotent mutation     | Duplicate ledger intent or confusing idempotency conflict           | User-visible financial workflow confusion        | Retries only when idempotency key exists or SDK generated a safe key                                           | Invariant      |
| CLI auth token leakage                      | Token printed, logged, stored in plaintext config                   | Account compromise                               | OS keychain storage, redaction by default, config contains profile metadata only                               | Security       |
| Sandbox profile leaks into live command     | Developer uses no-auth assumptions against live                     | Unsafe execution model                           | Explicit `livemode` response checks; live commands require authenticated profile                               | Verify         |
| Workbench live-data scope creep             | MVP becomes production operations console                           | Phase 07 slips and authorization surface expands | Sandbox-first panels; live replay/payload/trace expansion permission-gated and limited                         | Review         |
| Workbench executes Canton APIs              | API Explorer exposes JSON Ledger API or Daml choices                | Violates public API contract                     | Explorer is generated only from Pillar OpenAPI; no Canton endpoints in route tree                              | Invariant      |
| Webhook verifier accepts re-encoded JSON    | Signature checks pass on modified bytes                             | Security bug and interop failure                 | Verifier examples require raw body; tests fail on JSON-reencoded body                                          | Verify         |
| CLI listener signs incorrectly              | Local webhook tests pass only in CLI, fail in SDK                   | Broken developer loop                            | Shared signing fixture vectors across SDKs and CLI                                                             | Verify         |
| Trace panel exposes raw private ledger data | Workbench leaks participant/private payload                         | Compliance and privacy issue                     | Default redaction; privileged expansion only; no contract payload in normal view                               | Security       |
| Docs stale at ship                          | Docs snippets do not compile or use old grammar                     | Developer onboarding fails                       | Docs snippets generated from SDK metadata and run by sample tests                                              | Verify         |

## 8. Security / Compliance

Phase 07 security is developer-tool focused. Full platform auth/compliance is Phase 08, but the tools shipped here must not create insecure defaults.

### CLI secrets

| Control          | Requirement                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| OS keychain      | `pillar login` stores access tokens in macOS Keychain, Windows Credential Manager, or Linux Secret Service/libsecret.                         |
| Config file      | `~/.config/pillar/config.toml` and project config store profile name, API base, sandbox, API version, output preference; never bearer tokens. |
| Env vars         | `PILLAR_API_KEY` supported for CI and one-off commands; redacted in logs.                                                                     |
| Display          | Tokens, signing secrets, and API keys are hidden unless a command explicitly exists to reveal a one-time secret.                              |
| File permissions | Local config is created with user-only permissions where the OS supports it.                                                                  |
| Sandbox no-auth  | No-auth profile is allowed only for local compose base URLs and must be visually marked.                                                      |

### SDK security

| Control          | Requirement                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Webhook verifier | Raw body required; timestamp tolerance defaults to 300 seconds; constant-time comparison; multiple secrets during rotation. |
| Logging          | No API keys, webhook secrets, bearer tokens, raw bodies, or customer metadata values.                                       |
| Retry            | No retry of auth/permission/business-rule failures.                                                                         |
| Version pinning  | SDKs pin API version to avoid silent breaking response changes.                                                             |
| Browser safety   | No server secret examples in browser docs. React/browser SDK is not part of Phase 07.                                       |

### Workbench security

| Control           | Requirement                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| CSRF              | Mutating Workbench actions use CSRF protection or same-site token strategy aligned with the app framework.       |
| CSP               | Workbench ships a restrictive Content Security Policy: no arbitrary script execution, API/docs origins explicit. |
| Live mode         | Live execution and replay require confirmation and permission.                                                   |
| Payload redaction | Request/response bodies and webhook payloads are redacted unless authorized.                                     |
| Trace redaction   | Raw Canton identifiers and contract payloads are hidden by default.                                              |
| Secret handling   | API keys and webhook secrets use reveal-once or redacted display patterns.                                       |

### Compliance posture

Phase 07 does not implement compliance adapters, KYC/KYB policy, retention policy, or audit export. It must preserve the data needed by those controls:

- Request IDs are visible and copyable.
- Operation/trace IDs are visible and copyable.
- Webhook delivery attempts are inspectable.
- Projection offsets and lag are visible.
- No tool encourages DB-as-source-of-truth or contract-first workflows.

## 9. Implementation Plan

| ID     | Title                                      | Path                                                                                                                                             | Output                                                                                                                                                        | Deps                                                   | Acceptance                                                                                                                                                                     | Risk   |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| P7.I01 | Node SDK                                   | `packages/sdk-node`                                                                                                                              | Generated OpenAPI client, handwritten `Pillar` wrapper, typed resources, webhook verifier, sample transfer app                                                | P2.C01, P2.C02, P2.C03, P6.H02                         | Node sample transfer works against local sandbox and verifies webhook signature                                                                                                | medium |
| P7.I02 | Python SDK                                 | `packages/sdk-python`                                                                                                                            | Generated OpenAPI client, ergonomic client, auto-pagination, webhook verifier, sample transfer app                                                            | P2.C01, P2.C02, P2.C03, P6.H02, P7.I01                 | Python sample transfer works against local sandbox and verifies webhook signature                                                                                              | medium |
| P7.I03 | Java SDK                                   | `packages/sdk-java`                                                                                                                              | Generated OpenAPI client, builder-style wrapper, autoPagingIterable, webhook verifier, sample transfer app                                                    | P2.C01, P2.C02, P2.C03, P6.H02, P7.I01                 | Java sample transfer works against local sandbox and verifies webhook signature                                                                                                | medium |
| P7.I04 | CLI base                                   | `tools/cli`                                                                                                                                      | `pillar` executable, command router, profile config, OS keychain auth, generated API client, output renderers                                                 | P2.C01, P2.C02, P2.C05                                 | `pillar --help` works and lists Phase 07 canonical commands                                                                                                                    | medium |
| P7.I05 | CLI webhooks                               | `tools/cli`                                                                                                                                      | `pillar webhooks listen`, `pillar webhooks trigger`, `pillar events replay`, local forwarder, signing secret output                                           | P7.I04, P6.H01, P6.H02, P6.H03, P6.H05                 | Local webhook test receives signed event and SDK verifier accepts it                                                                                                           | high   |
| P7.I06 | CLI traces                                 | `tools/cli`                                                                                                                                      | `pillar traces get op_...`, `pillar events list`, `pillar balances get`, trace/event/balance renderers                                                        | P7.I04, P5.E07, P5.G05, P6.E08, P6.H03                 | Operation trace is shown from request/operation to event/delivery; balances show projection offset                                                                             | medium |
| P7.I07 | Workbench explorer                         | `apps/workbench`                                                                                                                                 | API Explorer panel, OpenAPI-driven forms, SDK/CLI snippets, sandbox run mode, docs links                                                                      | P2.C01, P2.C02, P2.E01, P7.I01, P7.I02, P7.I03, P7.I04 | User can create an intent in sandbox and open related request/trace                                                                                                            | high   |
| P7.I08 | Workbench trace                            | `apps/workbench`                                                                                                                                 | Event Inspector, Webhook Delivery, Ledger Trace, Projection Health panels                                                                                     | P5.E07, P5.G05, P6.E08, P6.H03, P7.I07                 | `op_...` shows request → projection → event chain and webhook delivery status/timing/signature metadata                                                                        | high   |
| P7.I09 | Node SDK auto-pagination iterator          | `packages/sdk-node/src/pagination`, `packages/sdk-node/test/pagination`                                                                          | AsyncIterable cursor helper wired into list resources for accounts, assets, balances, holdings, intents, events, operations, and webhook endpoints            | P7.I01, P2.C01, P2.C02                                 | `for await` consumes all pages from a fixture-backed cursor list, preserves request options, stops on `has_more=false`, and exposes final `Pillar-Request-Id`                  | medium |
| P7.I10 | Node SDK webhook verifier and vectors      | `packages/sdk-node/src/webhooks.ts`, `packages/sdk-node/test/webhooks`                                                                           | Raw-body HMAC verifier, framework helpers, typed event construction, and shared positive/negative signature vectors                                           | P7.I01, P6.H02, P6.H03                                 | Verifier accepts canonical vectors and rejects stale timestamp, wrong secret, tampered body, JSON-reencoded body, and malformed `Pillar-Signature`                             | high   |
| P7.I11 | Node SDK retry and telemetry hooks         | `packages/sdk-node/src/retry.ts`, `packages/sdk-node/src/telemetry.ts`, `packages/sdk-node/test/retry`                                           | Idempotent-endpoint-only retry policy, `Retry-After` handling, redacted OTel-compatible hooks, and retry attempt metadata                                     | P7.I01, P3.D03, P4.F04, P6.H02                         | Tests prove safe GET/idempotency-keyed mutations retry retryable failures, non-idempotent mutations do not retry, and telemetry spans omit secrets/bodies                      | high   |
| P7.I12 | Python SDK pagination and webhook verifier | `packages/sdk-python/pillar/pagination.py`, `packages/sdk-python/pillar/webhook.py`, `packages/sdk-python/tests`                                 | `auto_paging_iter()` cursor helper plus raw-byte HMAC verifier using shared vectors                                                                           | P7.I02, P6.H02, P6.H03                                 | Python tests iterate multi-page fixtures and reject stale, wrong-secret, tampered, and JSON-reencoded webhook payload vectors                                                  | medium |
| P7.I13 | Java SDK pagination and webhook verifier   | `packages/sdk-java/src/main/java/com/pillar/pagination`, `packages/sdk-java/src/main/java/com/pillar/Webhook.java`, `packages/sdk-java/src/test` | `autoPagingIterable()` cursor helper plus constant-time raw-body HMAC verifier using shared vectors                                                           | P7.I03, P6.H02, P6.H03                                 | Java tests iterate multi-page fixtures and reject stale, wrong-secret, tampered, and JSON-reencoded webhook payload vectors                                                    | medium |
| P7.I14 | SDK release sync wrapper                   | `.github/workflows/sdk-release.yml`, `packages/sdk-node`, `packages/sdk-python`, `packages/sdk-java`, `apps/docs`                                | Single release workflow that codegens, tests, versions, and publishes Node/Python/Java SDK artifacts from one OpenAPI API-version manifest                    | P7.I01, P7.I02, P7.I03, P7.I09, P7.I12, P7.I13         | Dry-run release emits all three SDK packages with the same `Pillar-Version`, changelog fragment, docs metadata handoff for P13, and no partial publish on one-language failure | high   |
| P7.I15 | CLI login and OS keychain                  | `tools/cli/src/commands/login.ts`, `tools/cli/src/auth/keychain.ts`, `tools/cli/test/auth`                                                       | `pillar login`, profile selection, OS keychain token storage, config metadata, and redacted credential diagnostics                                            | P7.I04, P8.K01                                         | `pillar login` stores token only in keychain, writes no bearer token to config, verifies profile with `/v1/me` or session response, and redacts secrets in verbose/json output | high   |
| P7.I16 | CLI sandbox lifecycle                      | `tools/cli/src/commands/sandbox.ts`, `tools/cli/src/sandbox`, `tools/cli/test/sandbox`                                                           | `pillar sandbox up`, `pillar sandbox down`, and `pillar sandbox reset` orchestration over local compose and sandbox profile state                             | P7.I04, P0.A06, P9.J01                                 | Up starts local stack and selects no-auth sandbox profile, down stops local resources without touching live profiles, reset recreates sandbox state with explicit confirmation | medium |
| P7.I17 | CLI events list and replay                 | `tools/cli/src/commands/events.ts`, `tools/cli/test/events`                                                                                      | `pillar events list` and `pillar events replay` with filters, cursor pagination, table/json/ndjson renderers, and replay idempotency keys                     | P7.I04, P6.H01, P6.H05                                 | List shows real `evt_` rows with type/resource/API version/delivery status; replay creates a new delivery/audit record and never fabricates event payloads                     | medium |
| P7.I18 | CLI webhooks listen/trigger/test           | `tools/cli/src/commands/webhooks.ts`, `tools/cli/src/webhooks`, `tools/cli/test/webhooks`                                                        | `pillar webhooks listen`, `pillar webhooks trigger`, and `pillar webhooks test` local forwarding, sandbox trigger, endpoint test delivery, and signing output | P7.I04, P7.I10, P7.I12, P7.I13, P6.H02, P6.H03         | Listen forwards signed raw payloads accepted by all SDK verifiers; trigger creates real sandbox side effects; test sends an endpoint test delivery through the API             | high   |
| P7.I19 | CLI traces get                             | `tools/cli/src/commands/traces.ts`, `tools/cli/src/render/trace.ts`, `tools/cli/test/traces`                                                     | `pillar traces get op_...` trace timeline renderer for request, idempotency key, operation, command status, projection, event, and delivery                   | P7.I04, P3.D04, P4.F05, P5.E07, P6.H03                 | Trace output resolves `op_...` and hides raw Canton IDs by default while privileged JSON includes authorized trace expansion only                                              | high   |
| P7.I20 | CLI balances and holdings reads            | `tools/cli/src/commands/balances.ts`, `tools/cli/src/commands/holdings.ts`, `tools/cli/test/projection-reads`                                    | `pillar balances get` and `pillar holdings list` projection read commands with account/asset filters and offset display                                       | P7.I04, P5.G02, P5.G03, P5.E07                         | Balance output shows available/locked/pending/projection offset; holdings list paginates projected `hld_` rows without raw contract identifiers                                | medium |
| P7.I21 | CLI keys create/list/revoke                | `tools/cli/src/commands/keys.ts`, `tools/cli/test/keys`                                                                                          | `pillar keys create`, `pillar keys list`, and `pillar keys revoke` for API key descriptors, one-time secret display, scopes, and redaction                    | P7.I04, P8.K01, P8.K03                                 | Create reveals raw key once, list never shows secrets, revoke is idempotency-keyed and audited, and all outputs redact secret material by default                              | high   |
| P7.I22 | CLI exports create/list/get                | `tools/cli/src/commands/exports.ts`, `tools/cli/test/exports`                                                                                    | `pillar exports create`, `pillar exports list`, and `pillar exports get` command grammar forward-linked to P11 export jobs                                    | P7.I04, P11.M04                                        | Commands are generated against `/v1/export_jobs`, support create/list/retrieve/cancel-safe output paths, and document that full worker implementation is P11-owned             | medium |
| P7.I23 | CLI config profiles and deployment mode    | `tools/cli/src/commands/config.ts`, `tools/cli/src/auth/profiles.ts`, `tools/cli/test/config`                                                    | `pillar config` profile CRUD, current profile display, API version, base URL, output preference, and deployment-mode metadata                                 | P7.I04, P2.C05, P9.J04                                 | Config supports `hosted`, `customer-validator`, and `self-hosted` metadata without changing command grammar or storing bearer tokens                                           | medium |
| P7.I24 | Workbench API Explorer panel               | `apps/workbench/src/features/api-explorer`, `apps/workbench/src/features/snippets`                                                               | OpenAPI-driven API Explorer with environment binding, idempotency key UX, SDK/CLI/cURL snippets, and docs links                                               | P7.I07, P2.C01, P2.C02, P2.C05                         | User can execute sandbox `/v1` request, inspect request/response/request ID, copy snippets for Node/Python/Java/CLI, and deep-link to trace                                    | high   |
| P7.I25 | Workbench Event Inspector panel            | `apps/workbench/src/features/events`                                                                                                             | Event list/detail inspector with type filters, payload mode, API version, request link, delivery status, and replay entry point                               | P7.I08, P6.H01, P6.H05                                 | Inspector shows immutable `evt_` payload, related request, endpoint deliveries, and replay action without exposing Canton internals                                            | medium |
| P7.I26 | Workbench Webhook Delivery viewer          | `apps/workbench/src/features/webhooks`                                                                                                           | Webhook endpoint/delivery viewer with attempts, status, response code, latency, next retry, payload hash, and signature metadata                              | P7.I08, P6.H03, P6.H04, P6.H06                         | Failed delivery detail shows retry schedule and sanitized request/response metadata; replay is permission-gated and audit-linked                                               | high   |
| P7.I27 | Workbench Ledger Trace viewer              | `apps/workbench/src/features/ledger-trace`                                                                                                       | Trace DAG/timeline resolving `op_`, `req_`, `evt_`, and `ltr_` across API request, operation, command, projection, event, and delivery                        | P7.I08, P3.D04, P4.F05, P5.E07, P6.H03                 | `op_...` resolves to a complete trace graph with public IDs by default and privileged raw Canton expansion only when authorized                                                | high   |
| P7.I28 | Workbench Projection Health panel          | `apps/workbench/src/features/projection-health`                                                                                                  | Projection offset, lag, stale status, rebuild status, reconciliation summary, and webhook backlog panel                                                       | P7.I08, P5.G06, P5.G07, P6.H04                         | Panel distinguishes projection lag from webhook delivery failure and deep-links stale objects to trace/reconciliation context                                                  | medium |
| P7.I29 | Workbench DLQ inspector                    | `apps/workbench/src/features/webhooks/dlq`, `apps/workbench/src/features/events/dlq`                                                             | Dead-letter queue inspector for failed webhook/event dispatch surfaces from P6.H19 with replay eligibility and operator notes                                 | P7.I08, P6.H19, P6.H04, P6.H05                         | DLQ rows show failure class, event ID, endpoint, last attempt, next action, and permission-gated replay without mutating original event                                        | high   |
| P7.I30 | Workbench Template Registry admin panel    | `apps/workbench/src/features/template-registry`                                                                                                  | Template Registry admin surface for P12 templates, versions, DAR metadata, activation status, compatibility report, and snippet generation                    | P7.I08, P12.N03, P12.N04, P12.N05, P12.N09             | Panel lists templates/versions via admin API, activates only through idempotency-keyed action, and keeps template/package internals role-gated                                 | high   |

### Dependency graph

```text
Phase 2 OpenAPI ─┬─► P7.I01 Node SDK ─┐
                 ├─► P7.I02 Python SDK ├─► sample transfer e2e gate
                 ├─► P7.I03 Java SDK ──┘
                 └─► P7.I04 CLI base ──┬─► P7.I05 CLI webhooks
                                        └─► P7.I06 CLI traces

Phase 5 Projection ───────────────┬─► P7.I06 CLI traces
                                  └─► P7.I08 Workbench trace

Phase 6 Webhooks ───┬─► P7.I05 CLI webhooks
                    └─► P7.I08 Workbench trace

P7.I07 Workbench explorer ────────► P7.I08 Workbench trace deep-links
```

### Ticket execution notes

#### P7.I01 Node SDK

Required files:

```text
packages/sdk-node
├─ src/generated/**
├─ src/Pillar.ts
├─ src/resources/**
├─ src/webhooks.ts
├─ src/errors.ts
├─ samples/transfer-e2e.ts
└─ test/**
```

Acceptance details:

- Client sends `Pillar-Version` by default.
- Mutations accept `{ idempotencyKey }`.
- `for await` pagination works for `events.list` or another cursor list endpoint.
- `constructEvent` rejects JSON-reencoded body fixture.
- Transfer sample prints transfer ID, event ID, and trace/operation ID.

#### P7.I02 Python SDK

Required files:

```text
packages/sdk-python
├─ pillar/generated/**
├─ pillar/client.py
├─ pillar/resources/**
├─ pillar/webhook.py
├─ pillar/error.py
├─ samples/transfer_e2e.py
└─ tests/**
```

Acceptance details:

- Client exposes `last_response.request_id` on objects and `err.request_id` on errors.
- `auto_paging_iter()` works for a cursor list endpoint.
- Webhook verifier uses raw bytes.
- Transfer sample uses the same logical scenario as Node.

#### P7.I03 Java SDK

Required files:

```text
packages/sdk-java
├─ src/main/java/com/pillar/generated/**
├─ src/main/java/com/pillar/PillarClient.java
├─ src/main/java/com/pillar/resources/**
├─ src/main/java/com/pillar/Webhook.java
├─ src/main/java/com/pillar/PillarException.java
├─ samples/TransferE2E.java
└─ src/test/**
```

Acceptance details:

- Builder pins API version.
- Request options carry idempotency key and timeout.
- `autoPagingIterable()` works.
- Webhook verifier uses constant-time comparison.
- Transfer sample uses the same logical scenario as Node/Python.

#### P7.I04 CLI base

Required files:

```text
tools/cli
├─ src/index.ts
├─ src/commands/login.ts
├─ src/commands/sandbox.ts
├─ src/auth/**
├─ src/client/**
├─ src/render/**
└─ test/**
```

Acceptance details:

- `pillar --help` lists all canonical Phase 07 commands.
- `pillar login` can create/select a profile and uses OS keychain for token storage.
- `pillar sandbox up` creates/selects a local no-auth profile.
- CLI supports global `--profile`, `--api-base`, `--api-version`, `--output`, `--verbose`, `--no-color`.

#### P7.I05 CLI webhooks

Required files:

```text
tools/cli/src/commands/webhooks.ts
tools/cli/src/commands/events.ts
tools/cli/src/webhooks/**
tools/cli/test/webhooks/**
```

Acceptance details:

- `pillar webhooks listen --forward-to http://localhost:4242/webhook` opens event stream.
- Forwarded events include `Pillar-Signature`.
- Printed signing secret verifies in Node, Python, and Java SDK fixtures.
- `pillar webhooks trigger transfer.succeeded --wait` creates real sandbox side effects.
- `pillar events replay evt_...` creates a new delivery/audit entry.

#### P7.I06 CLI traces

Required files:

```text
tools/cli/src/commands/traces.ts
tools/cli/src/commands/events.ts
tools/cli/src/commands/balances.ts
tools/cli/src/render/trace.ts
```

Acceptance details:

- `pillar events list` displays event ID, type, resource, API version, created time, delivery status.
- `pillar balances get` displays available, locked, pending, projection offset.
- `pillar traces get op_...` displays request, idempotency key, operation, ledger command status if available, projection update, event, delivery.
- Default output hides raw Canton contract identifiers.

#### P7.I07 Workbench explorer

Required files:

```text
apps/workbench/src/generated/**
apps/workbench/src/features/api-explorer/**
apps/workbench/src/features/snippets/**
apps/workbench/src/features/environment/**
apps/docs/**
```

Acceptance details:

- API Explorer endpoint tree is generated from Pillar OpenAPI.
- Mutating request form shows side-effect preview and idempotency key.
- Sandbox run can create an intent.
- Result links to request log and ledger trace.
- Snippets generated for Node, Python, Java, CLI, and cURL.

#### P7.I08 Workbench trace

Required files:

```text
apps/workbench/src/features/events/**
apps/workbench/src/features/webhooks/**
apps/workbench/src/features/ledger-trace/**
apps/workbench/src/features/projection-health/**
```

Acceptance details:

- Event Inspector shows event payload, API version, resource, request ID, delivery status.
- Webhook Delivery shows status, attempts, response code, latency, next retry, signature metadata.
- Ledger Trace panel resolves `op_...` and shows operation → event chain.
- Projection Health shows latest offset, lag, backlog, and stale status.
- All panels link to each other by resource/request/event/trace IDs.

## 10. Open Questions

| Question                                                      | Current resolution                                                                                                                                                                                                                                                                                                                                                                                              | Blocks Phase 07? | Owner phase              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------ |
| Which fourth SDK is next: Go or .NET?                         | Open. [15 SDK Design](../Architecture/15_SDK%20Design.md) lists Go and .NET as first-class planned SDKs; [16 Workbench UX](../Architecture/16_Pillar%20Workbench%20UX.md) says snippets start with Node/Python/Go/Java, while [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md) Phase 7 requires Node/Python/Java only. Architecture plan wins for Phase 07: do not ship a fourth SDK here. | No               | Post-M7 roadmap          |
| CLI final implementation language                             | [14 CLI Design](../Architecture/14_CLI%20Design.md) recommends Go, assignment requires `tools/cli` TypeScript. Phase 07 implements TypeScript and preserves command grammar so a later Go rewrite is a clean internal change.                                                                                                                                                                                   | No               | P9/P10 release hardening |
| CLI command aliases                                           | Canonical commands are `pillar webhooks listen`, `pillar webhooks trigger`, `pillar events replay`, `pillar traces get`. Short aliases may exist only if docs and help keep canonical commands visible.                                                                                                                                                                                                         | No               | P7.I04-I06               |
| Workbench live mode scope                                     | Phase 07 is sandbox-first. Live inspect/replay/payload expansion is permission-gated and reviewed in Phase 08.                                                                                                                                                                                                                                                                                                  | No               | P8                       |
| API resource naming drift (`transfers` vs `transfer_intents`) | Use OpenAPI as generated source. Wrappers MAY provide documented aliases only when they map exactly to existing API operations and do not introduce new public objects.                                                                                                                                                                                                                                         | No               | P7.I01-I03               |
| Docs site generator                                           | OpenAPI-generated API reference plus handwritten guides is sufficient for M7. Full docs IA/search hardening can move to P10.                                                                                                                                                                                                                                                                                    | No               | P7.I07                   |

## 11. Agent-ready Checklist

### Entry prerequisites

- [ ] Phase 02 OpenAPI bundle exists and validates.
- [ ] Phase 04 mutation runtime returns operation/request/trace identifiers.
- [ ] Phase 05 projection surfaces balances/holdings and projection health.
- [ ] Phase 06 events/webhooks expose list, replay, signing, and delivery status APIs.
- [ ] Local compose can start the API/runtime stack used by `pillar sandbox up`.

### Build gate

- [ ] SDK codegen completes for Node, Python, Java from the bundled OpenAPI spec.
- [ ] `packages/sdk-node` builds and its sample transfer app compiles.
- [ ] `packages/sdk-python` package imports and its sample transfer app starts.
- [ ] `packages/sdk-java` builds and its sample transfer app compiles.
- [ ] `tools/cli` builds the `pillar` executable and `pillar --help` lists `login`, `sandbox up`, `sandbox down`, `sandbox reset`, `events list`, `events replay`, `webhooks listen`, `webhooks trigger`, `webhooks test`, `traces get`, `balances get`, `holdings list`, `keys create`, `keys list`, `keys revoke`, `exports create`, `exports list`, `exports get`, and `config`.
- [ ] `apps/workbench` builds with API Explorer, Event Inspector, Webhook Delivery, Ledger Trace, Projection Health, DLQ Inspector, and Template Registry routes.
- [ ] `apps/docs` builds with SDK, CLI, webhook, Workbench, and sandbox walkthrough pages.
- [ ] SDK release dry-run for P7.I14 emits synchronized Node, Python, and Java artifacts for one API version and hands docs metadata to `apps/docs`.
- [ ] `pillar sandbox up && pillar events list && pillar webhooks listen` works against local compose.
- [ ] Sample transfer e2e is green from Node, Python, and Java sample apps.

### Verify gate

- [ ] Node SDK sample creates a transfer, observes event(s), verifies webhook signature, and fetches trace.
- [ ] Python SDK sample creates a transfer, observes event(s), verifies webhook signature, and fetches trace.
- [ ] Java SDK sample creates a transfer, observes event(s), verifies webhook signature, and fetches trace.
- [ ] SDK webhook verifiers reject tampered payloads, stale timestamps, wrong secrets, and JSON-reencoded bodies.
- [ ] SDK retry tests prove retries occur only for idempotency-safe requests.
- [ ] Node SDK auto-pagination, webhook verifier, retry, and telemetry tests cover P7.I09, P7.I10, and P7.I11.
- [ ] Python SDK auto-pagination and webhook verifier tests cover P7.I12.
- [ ] Java SDK auto-pagination and webhook verifier tests cover P7.I13.
- [ ] `pillar login` stores token in OS keychain and never writes it to config.
- [ ] `pillar sandbox up` selects a no-auth local profile and does not affect live profiles.
- [ ] `pillar events list` returns real projected events from local sandbox.
- [ ] `pillar events replay` creates a new replay/delivery record for an existing event.
- [ ] `pillar webhooks listen` forwards signed local webhook payloads accepted by all SDK verifiers.
- [ ] `pillar webhooks trigger` emits a real sandbox event through the runtime.
- [ ] `pillar balances get` shows available/locked/pending and projection offset without contract IDs.
- [ ] `pillar traces get op_...` shows request → operation → command/completion → projection → event → delivery chain.
- [ ] `pillar sandbox down` stops local sandbox resources without deleting live/profile credentials.
- [ ] `pillar sandbox reset` requires confirmation and recreates only the selected local sandbox state.
- [ ] `pillar webhooks test` sends a real endpoint test delivery through the API.
- [ ] `pillar holdings list` paginates projected holdings without contract IDs.
- [ ] `pillar keys create/list/revoke` preserves one-time secret reveal, redaction, scopes, and audit semantics.
- [ ] `pillar exports create/list/get` targets `/v1/export_jobs` and remains a P11-forward-linked command surface.
- [ ] `pillar config` manages profiles, API version, base URL, output preference, and `hosted`/`customer-validator`/`self-hosted` metadata without storing bearer tokens.
- [ ] Workbench API Explorer can create an intent in sandbox and link to its request/trace.
- [ ] Workbench Event Inspector shows event payload, API version, request, and delivery status.
- [ ] Workbench Webhook Delivery shows attempts, status, response code, latency, next retry, and signature metadata.
- [ ] Workbench Ledger Trace resolves `op_...` to an operation/event chain.
- [ ] Workbench Projection Health distinguishes projection lag from webhook delivery failure.
- [ ] Workbench DLQ Inspector surfaces failed webhook/event dispatch rows, replay eligibility, and permission-gated actions from P6.H19.
- [ ] Workbench Template Registry admin panel lists templates/versions and performs activation through idempotency-keyed admin API calls.
- [ ] Docs quickstarts match the runnable Node, Python, Java, and CLI sample flow.

### Invariant gate

- [ ] Public API exposes no Canton contract-first fields.
- [ ] SDKs do not expose Canton Ledger API clients as public runtime clients.
- [ ] CLI default output hides raw contract IDs, template IDs, party IDs, participant IDs, package IDs, and command IDs.
- [ ] Workbench API Explorer executes only Pillar Public API endpoints.
- [ ] DB asset state is projection only.
- [ ] Phase 07 adds no DB tables for client tooling state.
- [ ] Every mutation shown by SDK/CLI/Workbench has stable operation_id and command_id through the existing runtime.
- [ ] Projection is rebuildable and all SDK/CLI/Workbench balance/holding reads are projection views over ledger state.
- [ ] Webhook deliveries are signed and replayable.
- [ ] Webhook signature verification exists in Node, Python, and Java SDKs.
- [ ] Deployment mode does not change /v1 grammar.
