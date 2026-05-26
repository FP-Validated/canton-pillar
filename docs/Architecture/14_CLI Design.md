# 14. CLI Design — Pillar CLI

## Executive Summary

**Pillar CLI**는 `Stripe CLI` 수준의 개발·테스트·운영 디버깅 경험을 제공하는 단일 커맨드라인 인터페이스다. 외부 사용자는 Canton, Daml, contract ID, participant, synchronizer를 알 필요가 없다. 사용자는 `accounts`, `asset-classes`, `assets issue`, `transfers create`, `listen`, `trigger`, `ledger trace` 같은 Stripe-grade API grammar만 사용한다. 내부 런타임은 모든 상태 변경을 Canton Ledger command로 변환하고, DB는 projection, audit, config만 저장한다.

핵심 설계 결정은 다음이다.

1. **CLI는 기본적으로 Pillar External API만 호출한다.** Canton Ledger API, Canton Admin API, JSON Ledger API는 `Canton Adapter`와 `Ledger Trace Service` 뒤에 숨긴다.
2. **모든 mutation 명령은 intent-first다.** `assets issue`, `transfers create`, `templates upgrade`는 “트랜잭션 실행”이 아니라 “의도를 생성하고 ledger completion까지 추적”한다.
3. **모든 운영 디버깅은 ledger-traceable하다.** `pillar ledger trace tr_...`는 API request, idempotency key, internal intent, Daml command ID, Canton completion, ledger offset, projection update, webhook delivery를 하나의 timeline으로 보여준다.
4. **Webhook-first async workflow를 CLI가 직접 지원한다.** `pillar listen`, `pillar trigger`, `pillar fixtures`, `pillar events resend`가 로컬 개발과 운영 복구를 담당한다.
5. **Deployment model은 바뀌어도 API experience는 바뀌지 않는다.** 로컬 sandbox, hosted sandbox, Kubernetes/Helm, BYOC Canton 모두 동일한 CLI grammar를 유지한다.

### 공식 문서 리서치 요약

| 영역                          | 확인한 공식 문서 내용                                                                                                                                                                                                                                             | Pillar 반영                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe CLI                  | Stripe CLI는 터미널에서 API object 생성·조회·수정·삭제, request log tail, webhook local forwarding을 지원한다. 로그인은 CLI용 key를 로컬 config에 저장하고, global/project config와 `--api-key`, env var를 지원한다. ([Stripe Docs][1])                                                        | `pillar login`, `pillar config`, `pillar logs tail`, `pillar listen`을 Stripe CLI와 동일한 developer ergonomics로 설계한다.                                               |
| CLI API versioning          | Stripe CLI는 request별 API version override와 `--latest`를 지원하고, Workbench에서 실제 request API version을 확인할 수 있다. ([Stripe Docs][2])                                                                                                                            | 모든 Pillar CLI request에 `--api-version`, `--latest`를 제공하고, response에 `api_version`과 `request_id`를 포함한다.                                                          |
| Idempotency                 | Stripe는 생성·수정 request에 idempotency key를 사용해 네트워크 오류 후 안전한 재시도를 지원하며, 같은 key의 최초 결과를 저장해 이후 동일 결과를 반환한다. ([Stripe Docs][3])                                                                                                                               | 모든 mutation 명령은 `--idempotency-key`를 지원하고, CLI가 자동 key를 생성할 수 있다. Ledger command ID와 idempotency key를 결합해 exactly-once에 가까운 사용자 경험을 제공한다.                       |
| Error handling              | Stripe API는 2xx/4xx/5xx HTTP status family로 성공·클라이언트 오류·서버 오류를 표현하며, 저수준 오류 처리에서는 idempotency와 retry를 분리한다. ([Stripe Docs][4])                                                                                                                           | Pillar error object는 `type`, `code`, `message`, `param`, `request_id`, `ledger_trace_id`를 갖고, CLI exit code와 retry hint를 표준화한다.                                 |
| Workbench                   | Stripe Workbench는 API versions, recent errors, API request logs, resource ID filtering, events, webhook deliveries를 디버깅하는 도구다. ([Stripe Docs][5])                                                                                                        | Pillar CLI는 Workbench 기능을 terminal-first로 구현한다: `logs tail`, `ledger trace`, `events resend`, `health`.                                                         |
| Webhooks                    | Stripe webhook은 local development에서는 HTTP도 가능하지만 공개 endpoint는 HTTPS가 필요하며, handler는 POST JSON event를 받고 복잡한 작업 전에 2xx를 빠르게 반환해야 한다. CLI `listen`은 local endpoint로 event를 forward하고 signing secret을 제공한다. ([Stripe Docs][6])                              | Pillar `listen`은 local forwarding, signing secret, event filtering, thin/snapshot event payload를 지원한다. Webhook dispatcher는 retry와 resend를 운영 기능으로 제공한다.         |
| Trigger / fixtures / resend | Stripe `trigger`는 실제 API request를 발생시켜 test webhook event를 만들며 side effect가 있다. `fixtures`는 JSON file 기반으로 순차 API request를 실행하고 step output 참조를 지원한다. `events resend`는 특정 event를 webhook endpoint로 재전송한다. ([Stripe Docs][7])                             | Pillar `trigger`는 fake event 발행이 아니라 실제 sandbox resource와 ledger command를 생성한다. `fixtures`는 asset issuance/transfer scenario를 재현한다. `events resend`는 운영 복구 도구다. |
| Stripe sandbox              | Stripe sandbox는 live data에 영향 없이 기능과 API upgrade를 테스트하는 격리 환경이며, 팀/시나리오별 sandbox 운영이 가능하다. ([Stripe Docs][8])                                                                                                                                            | Pillar sandbox는 Canton participant/synchronizer, templates, projections, webhook config가 묶인 격리 환경이다.                                                            |
| SDK                         | Stripe는 Ruby, Python, Go, Java, Node, PHP, .NET 등 공식 server-side SDK를 제공하고, SDK versioning과 API versioning을 분리한다. ([Stripe Docs][9])                                                                                                                     | Pillar CLI는 SDK와 동일한 OpenAPI schema, API version contract, idempotency behavior를 사용한다. CLI는 SDK conformance test의 기준 실행기로도 동작한다.                                |
| Canton / JSON Ledger API    | Canton JSON Ledger API는 gRPC Ledger API를 HTTP/JSON으로 사용하는 방법을 제공하며 OpenAPI/AsyncAPI 기반 client generation이 가능하다. Canton sandbox는 `--json-api-port`로 JSON API를 켤 수 있고 `/docs/openapi`, `/livez` health endpoint를 제공한다. ([Digital Asset Documentation][10]) | Pillar 내부 Canton Adapter는 JSON/gRPC Ledger API를 사용할 수 있지만 외부 CLI에는 Canton을 숨긴다. `pillar health --deep`만 내부 readiness를 요약 노출한다.                                  |
| Ledger API model            | Ledger API는 command stream과 update/event stream으로 구성되고, command outcome은 비동기적으로 completion과 ledger events를 통해 확인된다. ([Digital Asset Documentation][11])                                                                                                  | Pillar mutation command는 즉시 `processing` intent를 반환하고, `--wait`가 있으면 completion/projection/webhook까지 추적한다.                                                      |
| Parties / users             | Canton ledger에서 party는 전역 식별자이고 user는 participant-local 개념이며, user는 actAs/readAs 권한과 연결된다. ([Digital Asset Documentation][12])                                                                                                                           | `pillar accounts create`는 외부 `acct_...`를 만들고 내부적으로 party/user/rights를 provisioning한다. Raw party ID는 기본 출력에서 숨긴다.                                                |
| PQS / offsets               | Participant Query Store와 SQL API는 offset을 기준으로 ledger state를 일관성 있게 조회한다. offset은 participant-local이며 privacy/filtering 때문에 gap이 있을 수 있다. ([Digital Asset Documentation][13])                                                                            | `ledger trace`와 projections는 offset-first로 설계한다. DB projection은 ledger replay로 재생성 가능해야 한다.                                                                     |
| Daml packages / templates   | Daml Archive `.dar`는 ledger upload와 dependency에 사용되며, `dpm build`가 `.daml/dist/...dar`를 생성한다. ([Digital Asset Documentation][14])                                                                                                                        | `pillar templates install/upgrade`는 DAR upload, API schema, projection mapping, migration plan을 하나의 template lifecycle로 묶는다.                                    |
| Helm / Kubernetes           | Helm chart는 Kubernetes resource 묶음이며, install은 release를 생성한다. `helm upgrade --install`은 install-or-upgrade 단일 command pattern이고, `--values`, `--set`, `--dry-run`, `--rollback-on-failure` 등이 운영에 중요하다. ([Helm][15])                                     | `pillar deploy helm`은 Helm을 감싸되 Pillar-specific preflight, values validation, secret handling, health wait, rollback을 추가한다.                                     |

---

## Goals / Non-goals

### Goals

* **Stripe-grade CLI grammar**: resource noun + action verb 구조. 예: `pillar transfers create`.
* **Canton-invisible external UX**: contract ID, template ID, participant ID, synchronizer ID는 기본 출력에서 숨긴다.
* **Canton-native internal runtime**: party/user, command ID, completion, offset, Daml package, ledger events를 내부 추적의 중심으로 둔다.
* **Balance/Holding-first interface**: 사용자는 active contract set이 아니라 account balance, holding, asset class, transfer intent를 본다.
* **Webhook-first async**: 모든 ledger-driven state transition은 event로 관찰 가능해야 한다.
* **Full traceability**: 모든 API request는 `request_id`, `idempotency_key`, `intent_id`, `ledger_command_id`, `ledger_offset`, `event_id`, `delivery_id`로 이어져야 한다.
* **Sandbox parity**: sandbox, staging, production이 API grammar와 object shape를 공유한다.
* **Agent-ready operations**: AI coding agent가 CLI를 호출해 fixture 실행, local listen, ledger trace, health diagnosis를 자동화할 수 있어야 한다.

### Non-goals

* CLI가 Canton Console을 대체하지 않는다.
* CLI가 사용자를 raw Daml contract workflow에 직접 노출하지 않는다.
* DB projection을 source of truth로 사용하지 않는다.
* Production ledger에 testing-only command를 허용하지 않는다.
* Sandbox reset을 production-like rollback으로 오해하게 만들지 않는다.
* Helm wrapper가 Kubernetes platform 전체 운영도구가 되지는 않는다. Pillar runtime 배포에 한정한다.

---

## Architecture

### 1. CLI Layer

`pillar`는 단일 static binary로 배포한다. 권장 구현 언어는 **Go**다. 이유는 cross-platform binary, OS keychain integration, streaming I/O, WebSocket/SSE, Helm SDK embedding, terminal UX 구현이 안정적이기 때문이다.

```text
pillar CLI
├─ command router
├─ auth / profile manager
├─ API client
│  ├─ idempotency middleware
│  ├─ API version header
│  ├─ retry / backoff
│  └─ request_id capture
├─ output renderer
│  ├─ table
│  ├─ json
│  ├─ yaml
│  └─ ndjson
├─ local webhook forwarder
├─ fixture runner
├─ log/event streaming client
└─ helm deployment adapter
```

### 2. Pillar Platform Surfaces

```text
External API Surface
  /v1/accounts
  /v1/asset_classes
  /v1/assets/issuances
  /v1/transfers
  /v1/events
  /v1/webhook_endpoints
  /v1/sandboxes
  /v1/templates
  /v1/logs
  /v1/ledger_traces
  /v1/health

Internal Runtime
  API Gateway
  Auth / Tenant Resolver
  Idempotency Service
  Intent Service
  Canton Adapter
  Projection Worker
  Webhook Dispatcher
  Audit / Trace Service
  Template Manager
  Sandbox Manager
  Deployment Manager

Canton Native Layer
  Participant Node
  Synchronizer
  gRPC Ledger API
  JSON Ledger API
  Package Management Service
  Party Management Service
  User Management Service
  Update / Completion / State Services
  PQS / ledger event export
```

### 3. Global CLI Flags

모든 command는 다음 global flags를 공유한다.

| Flag                      | 의미                                                      |                  |         |        |
| ------------------------- | ------------------------------------------------------- | ---------------- | ------- | ------ |
| `--profile <name>`        | 사용할 local profile. 기본 `default`.                        |                  |         |        |
| `--api-key <key>`         | one-off API key override.                               |                  |         |        |
| `--api-base <url>`        | API base URL override.                                  |                  |         |        |
| `--sandbox <sbx_id        | name>`                                                  | sandbox context. |         |        |
| `--live`                  | live mode 명시. destructive command에서는 추가 confirm 필요.     |                  |         |        |
| `--api-version <version>` | request API version override.                           |                  |         |        |
| `--latest`                | 최신 API version으로 request.                               |                  |         |        |
| `--idempotency-key <key>` | mutation retry key.                                     |                  |         |        |
| `--output table           | json                                                    | yaml             | ndjson` | 출력 형식. |
| `--expand <path>`         | response expansion. 예: `--expand latest_event`.         |                  |         |        |
| `--request-id <req_...>`  | diagnostic 조회용 request ID.                              |                  |         |        |
| `--quiet`                 | machine mode 최소 출력.                                     |                  |         |        |
| `--verbose`               | HTTP method/path, latency, request ID 표시.               |                  |         |        |
| `--debug-canton`          | 권한 있는 operator에게만 Canton party/package/offset 세부 정보 표시. |                  |         |        |
| `--redact / --no-redact`  | secret, party ID, metadata redaction 제어.                |                  |         |        |
| `--confirm`               | destructive/live command 확인 bypass.                     |                  |         |        |
| `--no-color`              | ANSI color 비활성화.                                        |                  |         |        |

### 4. Environment Variables

```bash
PILLAR_API_KEY
PILLAR_API_BASE
PILLAR_PROFILE
PILLAR_SANDBOX
PILLAR_API_VERSION
PILLAR_OUTPUT
PILLAR_CLI_TELEMETRY_OPTOUT
PILLAR_WEBHOOK_SIGNING_SECRET
PILLAR_HELM_EXTRA_ARGS
```

### 5. Exit Codes

| Code | 의미                                        |
| ---: | ----------------------------------------- |
|  `0` | 성공                                        |
|  `1` | 일반 실패                                     |
|  `2` | CLI usage/config 오류                       |
|  `3` | 인증/권한 오류                                  |
|  `4` | API validation/domain 오류                  |
|  `5` | ledger completion/projection wait timeout |
|  `6` | network/stream interruption               |
|  `7` | destructive/live safety confirmation 누락   |
|  `8` | deployment/Helm/Kubernetes 오류             |
|  `9` | local webhook forwarding 오류               |
| `10` | fixture partial failure                   |

### 6. Standard Error Object

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "balance_insufficient",
    "message": "Account acct_issuer does not have 100.00 TOK available.",
    "param": "quantity",
    "request_id": "req_01HX8S6Q8K",
    "idempotency_key": "ik_transfer_001",
    "ledger_trace_id": "ltr_01HX8S6R2F",
    "retryable": false,
    "doc_url": "https://docs.pillar.dev/errors/balance_insufficient"
  }
}
```

---

## API / Object Model

### Common Object Shape

Pillar API object는 Stripe-like grammar를 따른다.

```json
{
  "id": "tr_01HX8S6QYJCN",
  "object": "transfer",
  "livemode": false,
  "sandbox": "sbx_dev_01",
  "created": 1763942000,
  "updated": 1763942002,
  "status": "succeeded",
  "metadata": {
    "order_id": "ord_123"
  }
}
```

### Core Objects

| Object             | ID prefix | 설명                                                  | Ledger source                         |
| ------------------ | --------: | --------------------------------------------------- | ------------------------------------- |
| `account`          |   `acct_` | 외부 고객/issuer/holder/treasury 계정                     | Party/User + AccountRegistry contract |
| `asset_class`      |   `acls_` | 발행 가능한 자산 정의                                        | AssetClass + Policy contracts         |
| `asset_issuance`   |    `iss_` | 발행 intent                                           | IssuanceIntent + Holding creation     |
| `holding`          |    `hld_` | 특정 account의 특정 asset balance 단위                     | Holding/Position contracts            |
| `balance`          |    `bal_` | account + asset_class의 available/pending projection | Derived projection                    |
| `transfer`         |     `tr_` | 자산 이동 intent                                        | TransferProposal/Settlement contracts |
| `event`            |    `evt_` | state transition notification                       | Ledger update + runtime event         |
| `webhook_endpoint` |     `we_` | event delivery destination                          | Config DB                             |
| `event_delivery`   |   `edlv_` | webhook delivery attempt group                      | Audit DB                              |
| `sandbox`          |    `sbx_` | isolated Canton-backed environment                  | Sandbox config + runtime              |
| `template`         |   `tmpl_` | Daml/API/projection package                         | Package + config                      |
| `ledger_trace`     |    `ltr_` | cross-system trace object                           | Audit + ledger offsets                |
| `request_log`      |    `req_` | API request log                                     | Audit DB                              |

### External API Grammar

```text
POST   /v1/accounts
POST   /v1/asset_classes
POST   /v1/assets/issuances
POST   /v1/transfers
GET    /v1/transfers/:id
GET    /v1/balances
GET    /v1/events
POST   /v1/events/:id/resend
POST   /v1/webhook_endpoints
POST   /v1/sandboxes
POST   /v1/sandboxes/:id/reset
POST   /v1/templates/install
POST   /v1/templates/:id/upgrade
GET    /v1/logs
GET    /v1/ledger_traces/:id
GET    /v1/health
```

### Event Model

Pillar는 두 가지 payload mode를 제공한다.

| Mode       | 설명                                                               | CLI 사용                                      |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------- |
| `thin`     | event에 object ID와 type만 포함. handler가 최신 object를 fetch. 기본값.      | `pillar listen --thin-events transfer.*`    |
| `snapshot` | API version에 고정된 object snapshot 포함. legacy/system integration용. | `pillar listen --events transfer.succeeded` |

대표 event types:

```text
account.created
asset_class.created
asset.issuance.created
asset.issued
transfer.created
transfer.requires_approval
transfer.succeeded
transfer.failed
ledger.command.rejected
projection.lagged
webhook.delivery.failed
template.installed
template.upgraded
sandbox.created
sandbox.reset
```

### Idempotency Rules

* 모든 `POST` mutation은 `Idempotency-Key`를 받는다.
* CLI는 사용자가 key를 주지 않으면 command + arguments hash + random suffix로 key를 생성한다.
* 같은 key + 같은 request body는 동일 response를 반환한다.
* 같은 key + 다른 request body는 `409 idempotency_key_reused_with_different_body`.
* idempotency record는 최소 24시간 보관한다. 운영 계정은 policy로 연장 가능.
* ledger command ID는 `cmd_{tenant}_{request_id}_{intent_id}` 형태로 deterministic하게 생성한다.

---

## CLI Command Specification

### 1. `pillar login`

| 항목        | 정의                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | CLI를 Pillar 계정 또는 sandbox에 연결한다. Browser OAuth/device flow/API key interactive login을 지원한다.                                                 |
| 옵션        | `--profile`, `--api-key`, `--interactive`, `--no-browser`, `--device-name`, `--sandbox`, `--live`, `--scopes`, `--api-base`, `--expires-in` |
| API 호출 매핑 | `POST /v1/cli/sessions`, `GET /v1/cli/sessions/{id}`, `GET /v1/me`, optional `POST /v1/api_keys/cli`                                        |
| 내부 매핑     | 로컬 OS keychain 또는 `~/.config/pillar/config.toml`에 encrypted credential 저장. Canton token은 저장하지 않음.                                           |
| 에러 처리     | `auth_invalid_key`, `device_code_expired`, `scope_denied`, `profile_locked`, `sandbox_not_found`, `tls_untrusted`                           |

예시:

```bash
pillar login --profile dev --sandbox sbx_dev_01
```

출력:

```text
Your pairing code is: noble-river-asset-42
Opening browser for authentication...

✓ Logged in as ops@example.com
Profile: dev
Mode: sandbox
Sandbox: sbx_dev_01
API version: 2026-05-01
Config: ~/.config/pillar/config.toml
```

JSON 출력:

```json
{
  "object": "cli_login_result",
  "profile": "dev",
  "user": "usr_01HX8RZ7EW",
  "sandbox": "sbx_dev_01",
  "livemode": false,
  "api_version": "2026-05-01",
  "scopes": ["accounts:write", "assets:write", "events:read", "logs:read"]
}
```

---

### 2. `pillar config`

| 항목        | 정의                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 목적        | CLI profile, default sandbox, API version, output mode, local settings를 조회·수정한다.                                                                                   |
| 옵션        | `list`, `get <key>`, `set <key> <value>`, `unset <key>`, `profiles`, `use <profile>`, `--global`, `--project`, `--profile`, `--redact`, `--show-secrets`, `--json` |
| API 호출 매핑 | 대부분 local-only. 검증 시 `GET /v1/me`, `GET /v1/sandboxes/{id}`, `GET /v1/api_versions`                                                                                |
| 내부 매핑     | local config precedence: CLI flag > env var > project config > global config                                                                                       |
| 에러 처리     | `config_key_unknown`, `config_value_invalid`, `profile_not_found`, `secret_display_denied`, `api_version_unsupported`                                              |

예시:

```bash
pillar config set default_sandbox sbx_dev_01 --profile dev
pillar config get api_version --profile dev
```

출력:

```text
✓ Updated profile dev
default_sandbox = sbx_dev_01

api_version = 2026-05-01
```

---

### 3. `pillar sandbox create/reset`

#### `pillar sandbox create`

| 항목        | 정의                                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | isolated Canton-backed test environment를 생성한다. templates, projections, webhook config, seed fixtures를 함께 bootstrap한다.                                            |
| 옵션        | `--name`, `--copy-from`, `--template`, `--region`, `--canton-version`, `--daml-sdk-version`, `--ttl`, `--fixtures`, `--webhook-forward-to`, `--wait`, `--output` |
| API 호출 매핑 | `POST /v1/sandboxes`, `GET /v1/sandboxes/{id}`, `GET /v1/operations/{id}`                                                                                        |
| 내부 매핑     | Sandbox Manager → Canton sandbox/participant provisioning → package upload → party bootstrap → projection DB init → webhook test endpoint                        |
| 에러 처리     | `sandbox_quota_exceeded`, `template_not_found`, `canton_version_unsupported`, `provisioning_timeout`, `fixture_failed`                                           |

예시:

```bash
pillar sandbox create \
  --name staging-assets \
  --template regulated-token@1.2.0 \
  --fixtures ./fixtures/bootstrap.yaml \
  --wait
```

출력:

```text
✓ Sandbox created
ID:          sbx_01HX8T0J4G6A
Name:        staging-assets
Status:      ready
API base:    https://api.pillar.dev/v1
Templates:   regulated-token@1.2.0
Ledger:      ready
Projection:  caught_up
Webhook:     test endpoint configured
```

#### `pillar sandbox reset`

| 항목        | 정의                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | sandbox ledger/projections/test data를 초기화한다. live mode에서는 금지한다.                                                                          |
| 옵션        | `<sandbox>`, `--keep-config`, `--keep-webhooks`, `--drop-ledger`, `--drop-projections`, `--fixtures`, `--wait`, `--confirm`              |
| API 호출 매핑 | `POST /v1/sandboxes/{id}/reset`, `GET /v1/operations/{id}`                                                                               |
| 내부 매핑     | command admission freeze → webhook pause → projection truncate → Canton sandbox recreate 또는 reset → templates reinstall → fixture replay |
| 에러 처리     | `sandbox_not_ready`, `reset_in_progress`, `live_mode_not_allowed`, `confirmation_required`, `projection_rebuild_failed`                  |

예시:

```bash
pillar sandbox reset sbx_01HX8T0J4G6A --keep-webhooks --fixtures ./fixtures/base.yaml --wait --confirm
```

출력:

```text
Reset started: op_01HX8T1C9Q
✓ command admission frozen
✓ ledger reset
✓ projections rebuilt
✓ templates reinstalled
✓ fixtures applied
✓ webhook delivery resumed

Sandbox sbx_01HX8T0J4G6A is ready.
```

---

### 4. `pillar accounts create`

| 항목        | 정의                                                                                                                                              |        |          |                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | Pillar account를 생성하고 내부적으로 Canton party/user/rights를 provisioning한다.                                                                            |        |          |                                                                                                                                                |
| 옵션        | `--type issuer                                                                                                                                  | holder | operator | treasury`, `--name`, `--email`, `--external-id`, `--metadata key=value`, `--kyc-status`, `--party-hint`, `--capability`, `--sandbox`, `--wait` |
| API 호출 매핑 | `POST /v1/accounts`, `GET /v1/accounts/{id}`                                                                                                    |        |          |                                                                                                                                                |
| 내부 매핑     | Party Management `POST /v2/parties`, User Management `POST /v2/users`, AccountRegistry Daml create command                                      |        |          |                                                                                                                                                |
| 에러 처리     | `external_id_already_exists`, `kyc_required`, `party_allocation_failed`, `user_rights_failed`, `capability_not_granted`, `idempotency_conflict` |        |          |                                                                                                                                                |

예시:

```bash
pillar accounts create \
  --type issuer \
  --name "Acme Issuer Ltd" \
  --external-id issuer_acme \
  --capability assets.issue \
  --metadata jurisdiction=KR
```

출력:

```json
{
  "id": "acct_01HX8T3Y9J7G",
  "object": "account",
  "type": "issuer",
  "name": "Acme Issuer Ltd",
  "external_id": "issuer_acme",
  "status": "active",
  "capabilities": {
    "assets.issue": "active"
  },
  "livemode": false,
  "created": 1763942100,
  "ledger": {
    "status": "provisioned",
    "party_ref": "ptyref_01HX8T3Z0A"
  }
}
```

기본 출력에서는 raw Canton party ID를 숨긴다. `--debug-canton`을 사용하고 권한이 있으면 `party_id`, `user_id`, `actAs/readAs`가 표시된다.

---

### 5. `pillar asset-classes create`

| 항목        | 정의                                                                                                                                                      |          |      |        |                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| 목적        | 발행 가능한 asset class를 생성한다. Symbol, decimals, issuer, transfer policy, template version을 고정한다.                                                            |          |      |        |                                                                                                                           |
| 옵션        | `--issuer`, `--symbol`, `--name`, `--type cash                                                                                                          | security | fund | carbon | custom`, `--decimals`, `--currency`, `--transfer-policy`, `--governance-template`, `--metadata`, `--visibility`, `--wait` |
| API 호출 매핑 | `POST /v1/asset_classes`, `GET /v1/asset_classes/{id}`                                                                                                  |          |      |        |                                                                                                                           |
| 내부 매핑     | AssetClass Daml create command, TransferPolicy contract, projection schema registration                                                                 |          |      |        |                                                                                                                           |
| 에러 처리     | `symbol_already_exists`, `issuer_not_found`, `issuer_capability_missing`, `invalid_decimals`, `policy_template_incompatible`, `ledger_command_rejected` |          |      |        |                                                                                                                           |

예시:

```bash
pillar asset-classes create \
  --issuer acct_01HX8T3Y9J7G \
  --symbol ACME \
  --name "Acme Tokenized Share" \
  --type security \
  --decimals 2 \
  --transfer-policy regulated-default
```

출력:

```text
✓ Asset class created
ID:        acls_01HX8T73M0QC
Symbol:    ACME
Type:      security
Decimals:  2
Issuer:    acct_01HX8T3Y9J7G
Policy:    regulated-default@1.0.0
Status:    active
Trace:     ltr_01HX8T74X0A3
```

---

### 6. `pillar assets issue`

| 항목        | 정의                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | asset class 단위로 holdings/balances를 발행한다. 발행은 ledger-backed issuance intent로 처리된다.                                                                               |
| 옵션        | `--asset-class`, `--to`, `--quantity`, `--settlement-date`, `--memo`, `--metadata`, `--batch-file`, `--dry-run`, `--wait`, `--idempotency-key`                  |
| API 호출 매핑 | `POST /v1/assets/issuances`, `GET /v1/assets/issuances/{id}`, optional `GET /v1/balances?account=...`                                                           |
| 내부 매핑     | IssuanceIntent create → issuer authorization → Holding create → balance projection update → `asset.issued` event                                                |
| 에러 처리     | `asset_class_not_active`, `issuer_not_authorized`, `account_not_eligible`, `quantity_precision_invalid`, `issuance_limit_exceeded`, `ledger_completion_timeout` |

예시:

```bash
pillar assets issue \
  --asset-class acls_01HX8T73M0QC \
  --to acct_holder_01 \
  --quantity 1000.00 \
  --memo "seed issuance" \
  --wait
```

출력:

```json
{
  "id": "iss_01HX8T9WTP31",
  "object": "asset_issuance",
  "asset_class": "acls_01HX8T73M0QC",
  "to": "acct_holder_01",
  "quantity": "1000.00",
  "status": "succeeded",
  "holding": "hld_01HX8TA2QK9M",
  "balance": {
    "account": "acct_holder_01",
    "asset_class": "acls_01HX8T73M0QC",
    "available": "1000.00",
    "pending": "0.00"
  },
  "latest_event": "evt_01HX8TA35G4H",
  "ledger_trace": "ltr_01HX8TA3WR0X"
}
```

---

### 7. `pillar transfers create`

| 항목        | 정의                                                                                                                                                                                  |          |     |                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | account 간 asset transfer intent를 생성한다. 즉시 settlement, approval workflow, DVP/PVP 확장을 지원한다.                                                                                          |          |     |                                                                                                                                                               |
| 옵션        | `--from`, `--to`, `--asset-class`, `--quantity`, `--settlement-mode immediate                                                                                                       | approval | dvp | pvp`, `--counter-asset-class`, `--counter-quantity`, `--memo`, `--metadata`, `--expires-at`, `--require-approval`, `--dry-run`, `--wait`, `--idempotency-key` |
| API 호출 매핑 | `POST /v1/transfers`, `GET /v1/transfers/{id}`, `GET /v1/balances`                                                                                                                  |          |     |                                                                                                                                                               |
| 내부 매핑     | TransferIntent create → balance reservation/lock → Daml TransferProposal → accept/settle choice → Holding archive/create 또는 balance projection update → webhook events              |          |     |                                                                                                                                                               |
| 에러 처리     | `balance_insufficient`, `asset_class_mismatch`, `transfer_policy_blocked`, `account_not_visible`, `approval_required`, `transfer_expired`, `ledger_contention`, `projection_lagged` |          |     |                                                                                                                                                               |

예시:

```bash
pillar transfers create \
  --from acct_holder_01 \
  --to acct_holder_02 \
  --asset-class acls_01HX8T73M0QC \
  --quantity 100.00 \
  --memo "secondary transfer" \
  --wait
```

출력:

```text
✓ Transfer succeeded
ID:             tr_01HX8TC1K3ZZ
From:           acct_holder_01
To:             acct_holder_02
Asset class:    ACME (acls_01HX8T73M0QC)
Quantity:       100.00
Status:         succeeded
Ledger offset:  487
Trace:          ltr_01HX8TC2EE1V
Events:         transfer.created, transfer.succeeded
```

---

### 8. `pillar logs tail`

| 항목        | 정의                                                                                                              |        |         |            |                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------- | ------ | ------- | ---------- | ----------------------------------------------------------------------- |
| 목적        | API request logs, webhook delivery logs, worker logs, projection logs를 실시간 tail한다.                              |        |         |            |                                                                         |
| 옵션        | `--since`, `--status`, `--method`, `--resource`, `--request-id`, `--idempotency-key`, `--event`, `--service api | worker | webhook | projection | canton-adapter`, `--level`, `--follow`, `--json`, `--live`, `--sandbox` |
| API 호출 매핑 | `GET /v1/logs`, `GET /v1/logs/tail` over SSE/WebSocket                                                          |        |         |            |                                                                         |
| 내부 매핑     | RequestLog store + runtime log stream + delivery log stream                                                     |        |         |            |                                                                         |
| 에러 처리     | `logs_scope_required`, `retention_window_exceeded`, `stream_interrupted`, `filter_invalid`, `live_logs_denied`  |        |         |            |                                                                         |

예시:

```bash
pillar logs tail --service api --status failed --resource tr_01HX8TC1K3ZZ
```

출력:

```text
2026-05-26T14:12:33Z req_01HX8TC1 POST /v1/transfers 409 balance_insufficient tr_01HX8TC1K3ZZ
2026-05-26T14:12:34Z req_01HX8TC8 GET  /v1/transfers/tr_01HX8TC1K3ZZ 200
```

NDJSON:

```json
{"ts":"2026-05-26T14:12:33Z","request_id":"req_01HX8TC1","method":"POST","path":"/v1/transfers","status":409,"code":"balance_insufficient","resource":"tr_01HX8TC1K3ZZ"}
```

---

### 9. `pillar ledger trace`

| 항목        | 정의                                                                                                                                                                                             |      |                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------- |
| 목적        | API resource/request/event를 ledger까지 역추적한다. Pillar 운영 디버깅의 핵심 command다.                                                                                                                        |      |                      |
| 옵션        | `<resource_id>`, `--request-id`, `--idempotency-key`, `--event-id`, `--ledger-offset`, `--from-offset`, `--to-offset`, `--include-contracts`, `--include-payload`, `--canton`, `--format table | json | mermaid`, `--redact` |
| API 호출 매핑 | `GET /v1/ledger_traces/{resource_or_trace_id}`, `GET /v1/ledger_traces?request_id=...`, optional `GET /v1/events?resource=...`                                                                 |      |                      |
| 내부 매핑     | AuditLog → Idempotency table → Intent table → LedgerCommand table → Completion stream → PQS/Projection offset → Webhook delivery table                                                         |      |                      |
| 에러 처리     | `trace_not_found`, `ledger_offset_pruned`, `projection_not_caught_up`, `party_visibility_denied`, `canton_debug_denied`, `payload_redacted`                                                    |      |                      |

예시:

```bash
pillar ledger trace tr_01HX8TC1K3ZZ
```

출력:

```text
Trace: ltr_01HX8TC2EE1V
Resource: transfer tr_01HX8TC1K3ZZ
Status: succeeded

Timeline
  14:12:30.120  API request accepted      req_01HX8TC1
  14:12:30.134  Idempotency locked        ik_auto_6b1c...
  14:12:30.210  Intent created            tr_01HX8TC1K3ZZ
  14:12:30.480  Ledger command submitted  cmd_tnt_req_01HX8TC1_tr_01HX8TC1
  14:12:31.002  Ledger completion OK      offset=487
  14:12:31.180  Projection updated        balances: 2 rows
  14:12:31.410  Event created             evt_01HX8TC2X8KQ transfer.succeeded
  14:12:31.900  Webhook delivered         edlv_01HX8TC3R1JY 200
```

Mermaid 출력:

```bash
pillar ledger trace tr_01HX8TC1K3ZZ --format mermaid
```

```text
sequenceDiagram
  API->>Intent: create transfer intent
  Intent->>CantonAdapter: submit command
  CantonAdapter->>Ledger: Daml command
  Ledger-->>CantonAdapter: completion offset=487
  Ledger-->>Projection: update stream
  Projection->>Webhook: transfer.succeeded
```

---

### 10. `pillar listen`

| 항목        | 정의                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | Pillar events를 local machine에서 수신하고 local HTTP endpoint로 forward한다. Webhook 개발·테스트 핵심 command다.                                                                                             |
| 옵션        | `--forward-to`, `--events`, `--thin-events`, `--headers`, `--api-version`, `--latest`, `--load-from-webhooks-api`, `--print-secret`, `--print-json`, `--skip-verify`, `--live`, `--sandbox` |
| API 호출 매핑 | `POST /v1/cli/listeners`, `GET /v1/cli/listeners/{id}/stream`, `DELETE /v1/cli/listeners/{id}`                                                                                              |
| 내부 매핑     | Event stream subscription → local forwarder → HMAC signing → delivery ack                                                                                                                   |
| 에러 처리     | `local_endpoint_unreachable`, `event_type_invalid`, `listener_token_expired`, `forward_tls_failed`, `webhook_timeout`, `signature_secret_unavailable`                                       |

예시:

```bash
pillar listen \
  --thin-events transfer.*,asset.issued \
  --forward-to http://localhost:4242/webhook
```

출력:

```text
Ready! Your webhook signing secret is whsec_pillar_01HX8TD5M2K
Forwarding thin events to http://localhost:4242/webhook

2026-05-26 14:15:10 --> transfer.created [evt_01HX8TD9A]
2026-05-26 14:15:11 <-- 200 transfer.created [evt_01HX8TD9A]
2026-05-26 14:15:12 --> transfer.succeeded [evt_01HX8TDA7]
2026-05-26 14:15:12 <-- 200 transfer.succeeded [evt_01HX8TDA7]
```

---

### 11. `pillar trigger`

| 항목        | 정의                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | sandbox에서 실제 workflow를 실행해 test event를 발생시킨다. 단순 fake event가 아니라 필요한 API objects와 ledger side effect를 만든다.                                                     |
| 옵션        | `<event_type>`, `--override key=value`, `--fixture`, `--account`, `--asset-class`, `--quantity`, `--forward-to`, `--idempotency-key`, `--wait`, `--print-json` |
| API 호출 매핑 | `POST /v1/test_helpers/triggers/{event_type}`, `GET /v1/operations/{id}`                                                                                       |
| 내부 매핑     | Test Helper → resource setup → Canton command → projection/event/webhook                                                                                       |
| 에러 처리     | `trigger_not_supported`, `trigger_live_mode_forbidden`, `fixture_invalid`, `override_invalid`, `side_effect_failed`, `event_not_emitted`                       |

지원 event 예시:

```text
account.created
asset.issued
transfer.created
transfer.succeeded
transfer.failed
ledger.command.rejected
projection.lagged
webhook.delivery.failed
template.upgraded
```

예시:

```bash
pillar trigger transfer.succeeded \
  --asset-class acls_01HX8T73M0QC \
  --quantity 10.00 \
  --wait
```

출력:

```text
Setting up fixture for: account_pair
Running fixture for: account_pair
Setting up fixture for: asset_issued
Running fixture for: asset_issued
Running workflow for: transfer.succeeded

✓ Trigger succeeded
Transfer: tr_01HX8TF8H1A9
Event:    evt_01HX8TF9V7BM
Trace:    ltr_01HX8TF9YK2N
```

---

### 12. `pillar fixtures`

| 항목        | 정의                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 목적        | YAML/JSON fixture file로 API request sequence를 실행한다. Sample data, regression test, demo scenario, integration test에 사용한다.                                           |
| 옵션        | `<file>`, `--var key=value`, `--env`, `--dry-run`, `--fail-fast`, `--continue-on-error`, `--idempotency-prefix`, `--state-out`, `--state-in`, `--wait`, `--output` |
| API 호출 매핑 | Fixture file의 `method/path`에 따라 Pillar External API 호출. `GET /v1/operations/{id}` wait 가능.                                                                         |
| 내부 매핑     | Variable resolver → request executor → idempotency manager → output capture → reference injection                                                                  |
| 에러 처리     | `fixture_schema_invalid`, `fixture_reference_unresolved`, `fixture_step_failed`, `async_wait_timeout`, `partial_failure`, `unsafe_live_fixture`                    |

Fixture 예시:

```yaml
vars:
  issuer_name: "Acme Issuer Ltd"

steps:
  - name: issuer
    request:
      method: POST
      path: /v1/accounts
      body:
        type: issuer
        name: ${issuer_name}
        external_id: issuer_acme

  - name: holder
    request:
      method: POST
      path: /v1/accounts
      body:
        type: holder
        name: "Holder One"

  - name: asset_class
    request:
      method: POST
      path: /v1/asset_classes
      body:
        issuer: ${issuer.id}
        symbol: ACME
        name: "Acme Tokenized Share"
        type: security
        decimals: 2

  - name: issuance
    wait: true
    request:
      method: POST
      path: /v1/assets/issuances
      body:
        asset_class: ${asset_class.id}
        to: ${holder.id}
        quantity: "1000.00"
```

실행:

```bash
pillar fixtures ./fixtures/acme.yaml --wait --state-out ./state/acme.json
```

출력:

```text
✓ issuer        acct_01HX8TG1C9A
✓ holder        acct_01HX8TG4A0M
✓ asset_class   acls_01HX8TG7QX7
✓ issuance      iss_01HX8TGAF3P succeeded

4 steps completed.
State written to ./state/acme.json
```

---

### 13. `pillar events resend`

| 항목        | 정의                                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | 기존 event를 특정 webhook endpoint 또는 active CLI listener로 재전송한다. 운영 복구와 integration debugging에 사용한다.                                                                                  |
| 옵션        | `<event_id>`, `--webhook-endpoint`, `--delivery`, `--to-url`, `--confirm`, `--wait`, `--live`, `--show-headers`, `--idempotency-key`                                              |
| API 호출 매핑 | `POST /v1/events/{id}/resend`, `POST /v1/event_deliveries/{id}/resend`, `GET /v1/event_deliveries/{id}`                                                                           |
| 내부 매핑     | Event store lookup → payload re-materialization by API version → signing → delivery attempt → audit log                                                                           |
| 에러 처리     | `event_not_found`, `event_retention_expired`, `webhook_endpoint_not_found`, `endpoint_disabled`, `payload_version_unavailable`, `delivery_failed`, `resend_confirmation_required` |

예시:

```bash
pillar events resend evt_01HX8TDA7 --webhook-endpoint we_01HX8R9K2 --wait
```

출력:

```text
✓ Event resent
Event:      evt_01HX8TDA7
Type:       transfer.succeeded
Endpoint:   we_01HX8R9K2
Delivery:   edlv_01HX8TH11F5
Status:     delivered
HTTP:       200
```

---

### 14. `pillar templates install/upgrade`

#### `pillar templates install`

| 항목        | 정의                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | Daml package, API schema, projection mapping, policy defaults를 포함한 asset/workflow template을 설치한다.                                            |
| 옵션        | `<template_ref>`, `--version`, `--sandbox`, `--values`, `--set key=value`, `--activate`, `--dry-run`, `--compatibility-check`, `--wait`      |
| API 호출 매핑 | `POST /v1/templates/install`, `GET /v1/template_installations/{id}`, `GET /v1/operations/{id}`                                               |
| 내부 매핑     | Template registry → DAR hash verify → Package Management upload → DB config migration → projection mapping load → activation                 |
| 에러 처리     | `template_not_found`, `dar_hash_mismatch`, `package_upload_failed`, `schema_incompatible`, `projection_mapping_invalid`, `activation_failed` |

예시:

```bash
pillar templates install regulated-token@1.2.0 \
  --values ./pillar-template-values.yaml \
  --activate \
  --wait
```

출력:

```text
✓ Template installed
Template:       regulated-token@1.2.0
Installation:   tins_01HX8TJ9A7C
Package:        pkgref_01HX8TJAD7P
API objects:    asset_class, asset_issuance, transfer
Projection:     installed
Status:         active
```

#### `pillar templates upgrade`

| 항목        | 정의                                                                                                                                                    |                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | 기존 template installation을 새 version으로 upgrade한다. API compatibility와 ledger migration을 분리 검증한다.                                                        |                                                                                                                                         |
| 옵션        | `<installation_id                                                                                                                                     | template_name>`, `--to-version`, `--migration-plan`, `--canary`, `--dry-run`, `--allow-api-breaking`, `--rollback-on-failure`, `--wait` |
| API 호출 매핑 | `POST /v1/templates/{id}/upgrade`, `GET /v1/template_upgrades/{id}`                                                                                   |                                                                                                                                         |
| 내부 매핑     | Compatibility check → DAR upload → upgrade Daml workflow → projection migration → event schema validation → activation                                |                                                                                                                                         |
| 에러 처리     | `upgrade_path_not_found`, `api_breaking_change_blocked`, `ledger_migration_failed`, `projection_migration_failed`, `canary_failed`, `rollback_failed` |                                                                                                                                         |

예시:

```bash
pillar templates upgrade regulated-token \
  --to-version 1.3.0 \
  --migration-plan ./migrations/regulated-token-1.3.yaml \
  --rollback-on-failure \
  --wait
```

출력:

```text
Upgrade: upg_01HX8TKQX2W
✓ API compatibility checked
✓ DAR uploaded
✓ Ledger migration completed
✓ Projection migration completed
✓ Canary checks passed
✓ Template regulated-token is active at 1.3.0
```

---

### 15. `pillar health`

| 항목        | 정의                                                                                                                                                |    |        |            |          |           |                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -- | ------ | ---------- | -------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| 목적        | Pillar API, DB, projection lag, Canton connectivity, webhook dispatcher, template status, deployment readiness를 확인한다.                             |    |        |            |          |           |                                                                                                                   |
| 옵션        | `--component api                                                                                                                                  | db | ledger | projection | webhooks | templates | all`, `--deep`, `--watch`, `--timeout`, `--json`, `--include-ledger`, `--include-webhooks`, `--sandbox`, `--live` |
| API 호출 매핑 | `GET /v1/health`, `GET /v1/health/components`, optional `GET /v1/health/deep`                                                                     |    |        |            |          |           |                                                                                                                   |
| 내부 매핑     | API ping → DB migration status → projection offsets → Canton JSON `/livez` / Ledger API Version Service → webhook queue depth → template registry |    |        |            |          |           |                                                                                                                   |
| 에러 처리     | `health_degraded`, `deep_health_scope_required`, `ledger_unreachable`, `projection_lag_exceeded`, `webhook_queue_backed_up`, `timeout`            |    |        |            |          |           |                                                                                                                   |

예시:

```bash
pillar health --deep --sandbox sbx_dev_01
```

출력:

```text
Component        Status      Details
api              healthy     p50=18ms p95=44ms
db               healthy     migrations=up_to_date
ledger           healthy     participant=ready json_api=ready
projection       healthy     last_offset=982 lag=0.8s
webhooks         degraded    queue_depth=412 failed=3
templates        healthy     regulated-token@1.3.0 active

Overall: degraded
```

JSON 출력:

```json
{
  "object": "health_report",
  "status": "degraded",
  "components": {
    "api": {"status": "healthy", "p95_ms": 44},
    "ledger": {"status": "healthy", "last_offset": 982},
    "projection": {"status": "healthy", "lag_ms": 800},
    "webhooks": {"status": "degraded", "queue_depth": 412, "failed": 3}
  }
}
```

---

### 16. `pillar deploy helm`

| 항목        | 정의                                                                                                                                                                                |         |                                                                                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적        | Pillar runtime을 Kubernetes에 Helm으로 설치/업그레이드한다. Control plane, API, Canton adapter, projection worker, webhook dispatcher, template manager를 배포한다.                                 |         |                                                                                                                                                                                                               |
| 옵션        | `--namespace`, `--release`, `--chart`, `--version`, `--values`, `--set`, `--env sandbox                                                                                           | staging | prod`, `--image-tag`, `--canton-endpoint`, `--db-url-secret`, `--create-namespace`, `--dry-run`, `--print-manifest`, `--wait`, `--timeout`, `--atomic`, `--rollback-on-failure`, `--verify`, `--hide-secrets` |
| API 호출 매핑 | 기본은 local Helm/Kubernetes 호출. Optional: `POST /v1/deployments/preflight`, `POST /v1/deployments/register`, `GET /v1/health`                                                       |         |                                                                                                                                                                                                               |
| 내부 매핑     | Values validation → chart render → secret reference validation → Helm upgrade/install → readiness wait → Pillar health check → deployment audit                                   |         |                                                                                                                                                                                                               |
| 에러 처리     | `kubeconfig_not_found`, `namespace_denied`, `chart_not_found`, `values_invalid`, `secret_missing`, `helm_render_failed`, `release_failed`, `readiness_timeout`, `rollback_failed` |         |                                                                                                                                                                                                               |

예시:

```bash
pillar deploy helm \
  --release pillar \
  --namespace pillar-prod \
  --chart oci://registry.pillar.dev/charts/pillar \
  --version 1.8.0 \
  --values ./values-prod.yaml \
  --set image.tag=1.8.0 \
  --wait \
  --rollback-on-failure
```

출력:

```text
Preflight
✓ Kubernetes context: prod-eu
✓ Namespace: pillar-prod
✓ Chart: pillar@1.8.0
✓ Secrets: db-url, jwt-issuer, webhook-signing-root
✓ Canton endpoint reachable

Deploying with Helm upgrade --install...
✓ Release pillar revision 42 deployed
✓ API ready
✓ Projection worker ready
✓ Webhook dispatcher ready
✓ Canton adapter ready

Running Pillar health...
Overall: healthy
Deployment: dep_01HX8TMRR7S
```

Dry-run secret-safe output:

```bash
pillar deploy helm --values values.yaml --dry-run --print-manifest --hide-secrets
```

---

## Internal Runtime

### Mutation Flow

```text
CLI command
  ↓
Pillar External API
  ↓
Auth + API version resolver
  ↓
Idempotency Service
  ↓
Intent Service
  ↓
Canton Adapter
  ↓
Ledger command submission
  ↓
Command completion / update stream
  ↓
Projection Worker
  ↓
Event Builder
  ↓
Webhook Dispatcher
  ↓
CLI listen / customer endpoint
```

### Example: `pillar transfers create`

1. CLI sends `POST /v1/transfers` with `Idempotency-Key`.
2. API validates account eligibility, asset class policy, quantity precision.
3. Intent Service creates `transfer_intent` audit record.
4. Canton Adapter resolves `acct_...` to party refs and submits Daml command.
5. Ledger completion emits offset.
6. Projection Worker updates balances/holdings.
7. Event Builder emits `transfer.created`, then `transfer.succeeded` or `transfer.failed`.
8. Webhook Dispatcher delivers events.
9. `--wait` CLI polls or subscribes until terminal state.

### Ledger Command ID Strategy

```text
command_id = cmd_{tenant_id}_{request_id}_{resource_id}_{attempt}
deduplication_id = hash(idempotency_key + request_body_hash)
workflow_id = wf_{resource_type}_{resource_id}
```

This guarantees traceability across API, ledger, projection, webhook.

### Projection Consistency

Every read response may include consistency metadata when `--verbose` or `--expand consistency` is used.

```json
{
  "projection": {
    "participant": "participant-primary",
    "ledger_offset": 982,
    "projected_at": "2026-05-26T14:20:01Z",
    "lag_ms": 800,
    "replayable": true
  }
}
```

### Canton Visibility

Default:

```json
"ledger": {
  "status": "completed",
  "trace": "ltr_..."
}
```

With `--debug-canton`:

```json
"canton": {
  "participant": "participant-primary",
  "synchronizer": "global-sync",
  "command_id": "cmd_tnt_req_tr",
  "completion_offset": 982,
  "package_id": "pkg_...",
  "template_id": "Pillar.Asset.Transfer:TransferIntent"
}
```

---

## DB Schema

DB는 source of truth가 아니다. 재구성 가능한 projection, audit, config만 저장한다.

### 1. Config Tables

```sql
tenants (
  id text primary key,
  name text not null,
  mode text check (mode in ('test','live')),
  default_api_version text not null,
  created_at timestamptz not null
);

api_keys (
  id text primary key,
  tenant_id text not null references tenants(id),
  key_hash text not null,
  mode text not null,
  scopes text[] not null,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);

sandboxes (
  id text primary key,
  tenant_id text not null references tenants(id),
  name text not null,
  status text not null,
  canton_version text,
  daml_sdk_version text,
  api_base_url text,
  ledger_api_endpoint text,
  json_api_endpoint text,
  ttl_expires_at timestamptz,
  created_at timestamptz not null
);

webhook_endpoints (
  id text primary key,
  tenant_id text not null references tenants(id),
  sandbox_id text references sandboxes(id),
  url text not null,
  enabled_events text[] not null,
  payload_mode text check (payload_mode in ('thin','snapshot')),
  api_version text,
  signing_secret_ref text not null,
  status text not null,
  created_at timestamptz not null
);
```

### 2. Idempotency / Request Audit

```sql
idempotency_keys (
  tenant_id text not null,
  key text not null,
  request_hash text not null,
  response_status int,
  response_body jsonb,
  locked_until timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  primary key (tenant_id, key)
);

request_logs (
  id text primary key,
  tenant_id text not null,
  sandbox_id text,
  method text not null,
  path text not null,
  status int,
  api_version text,
  idempotency_key text,
  resource_id text,
  latency_ms int,
  error_code text,
  user_agent text,
  created_at timestamptz not null
);

audit_entries (
  id text primary key,
  tenant_id text not null,
  sandbox_id text,
  actor_id text,
  action text not null,
  resource_id text,
  request_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null
);
```

### 3. Ledger Trace Tables

```sql
ledger_commands (
  command_id text primary key,
  tenant_id text not null,
  sandbox_id text not null,
  request_id text,
  resource_id text,
  workflow_id text,
  status text not null,
  submitted_at timestamptz,
  completed_at timestamptz,
  completion_offset bigint,
  completion_status text,
  error_code text
);

ledger_offsets (
  sandbox_id text not null,
  participant_id text not null,
  last_seen_offset bigint not null,
  last_projected_offset bigint not null,
  last_projected_at timestamptz not null,
  primary key (sandbox_id, participant_id)
);

ledger_trace_links (
  trace_id text not null,
  request_id text,
  idempotency_key text,
  resource_id text,
  command_id text,
  event_id text,
  delivery_id text,
  ledger_offset bigint,
  created_at timestamptz not null
);
```

### 4. Projection Tables

```sql
accounts_projection (
  id text primary key,
  tenant_id text not null,
  sandbox_id text not null,
  external_id text,
  type text not null,
  name text,
  status text not null,
  party_ref text not null,
  metadata jsonb,
  effective_offset bigint not null,
  archived_at timestamptz
);

asset_classes_projection (
  id text primary key,
  tenant_id text not null,
  sandbox_id text not null,
  issuer_account_id text not null,
  symbol text not null,
  name text not null,
  type text not null,
  decimals int not null,
  status text not null,
  policy_ref text,
  effective_offset bigint not null
);

holdings_projection (
  id text primary key,
  tenant_id text not null,
  sandbox_id text not null,
  account_id text not null,
  asset_class_id text not null,
  quantity numeric not null,
  status text not null,
  effective_offset bigint not null,
  archived_offset bigint
);

balances_projection (
  tenant_id text not null,
  sandbox_id text not null,
  account_id text not null,
  asset_class_id text not null,
  available numeric not null,
  pending numeric not null,
  locked numeric not null,
  last_offset bigint not null,
  primary key (tenant_id, sandbox_id, account_id, asset_class_id)
);

transfers_projection (
  id text primary key,
  tenant_id text not null,
  sandbox_id text not null,
  from_account_id text not null,
  to_account_id text not null,
  asset_class_id text not null,
  quantity numeric not null,
  status text not null,
  failure_code text,
  created_offset bigint,
  completed_offset bigint
);
```

### 5. Events / Deliveries

```sql
events (
  id text primary key,
  tenant_id text not null,
  sandbox_id text,
  type text not null,
  resource_id text not null,
  api_version text not null,
  payload_mode text not null,
  thin_payload jsonb not null,
  snapshot_payload jsonb,
  ledger_offset bigint,
  created_at timestamptz not null
);

event_deliveries (
  id text primary key,
  event_id text not null references events(id),
  webhook_endpoint_id text not null references webhook_endpoints(id),
  status text not null,
  attempt_count int not null,
  next_retry_at timestamptz,
  last_http_status int,
  last_error_code text,
  last_attempt_at timestamptz
);
```

### 6. Template Tables

```sql
templates (
  id text primary key,
  name text not null,
  version text not null,
  dar_hash text not null,
  api_schema_version text not null,
  projection_schema_hash text not null,
  status text not null,
  created_at timestamptz not null
);

template_installations (
  id text primary key,
  tenant_id text not null,
  sandbox_id text not null,
  template_id text not null references templates(id),
  package_ref text,
  status text not null,
  installed_at timestamptz not null
);

template_upgrades (
  id text primary key,
  installation_id text not null references template_installations(id),
  from_template_id text not null,
  to_template_id text not null,
  status text not null,
  migration_plan_hash text,
  started_at timestamptz,
  completed_at timestamptz
);
```

---

## Failure Modes

| Failure mode                                 | 증상                                  | CLI behavior                                     | Runtime mitigation                          |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| Network loss after mutation                  | CLI가 response를 못 받음                 | 같은 `--idempotency-key`로 재시도 안내                   | idempotency result replay                   |
| Ledger command submitted, completion delayed | `processing` 장기 지속                  | `--wait` timeout 후 `ledger_trace_id` 출력          | completion stream resume                    |
| Duplicate mutation                           | 같은 transfer/issue가 중복될 위험           | idempotency key 요구 또는 자동 생성                      | request hash conflict 방지                    |
| Ledger command rejected                      | `ledger.command.rejected` event     | domain error와 trace 출력                           | rejection reason audit                      |
| Projection lag                               | balance read가 stale                 | response에 `projection.lag_ms`; `health` degraded | replay worker autoscale/backpressure        |
| Webhook endpoint down                        | delivery failed                     | `events resend` 안내                               | retry queue + exponential backoff           |
| Sandbox reset race                           | reset 중 command 생성                  | CLI에 `sandbox_reset_in_progress`                 | admission freeze                            |
| Template upgrade failure                     | API schema/projection mismatch      | rollback status 출력                               | compatibility check + rollback              |
| Canton participant unavailable               | mutation timeout 또는 health degraded | `ledger_unreachable`                             | circuit breaker, failover participant       |
| Ledger pruning                               | old trace details 부족                | `ledger_offset_pruned`                           | audit links retain high-level trace         |
| Helm deploy readiness timeout                | release failed                      | exit code `8`, rollback if enabled               | health gate + release audit                 |
| Local webhook forward failure                | `pillar listen` shows 5xx/timeout   | event ID와 retry command 출력                       | local retry not automatic unless configured |

---

## Security / Compliance

### Authentication / Authorization

* CLI credential은 OS keychain 우선, fallback은 encrypted config file.
* API key는 restricted scopes를 지원한다.
* Production mutations에는 `--live`와 destructive confirmation을 요구한다.
* Recommended scopes:

  * `accounts:read/write`
  * `asset_classes:read/write`
  * `assets:issue`
  * `transfers:create/read`
  * `events:read/resend`
  * `webhooks:read/write`
  * `logs:read`
  * `ledger_traces:read`
  * `templates:admin`
  * `deployments:admin`

### Canton Boundary

* JSON Ledger API와 gRPC Ledger API는 public internet에 직접 노출하지 않는다. Production에서는 reverse proxy, mTLS, private network, service identity를 적용한다. 공식 문서도 JSON Ledger API를 production에서 인터넷에 직접 노출하지 말고 reverse proxy 뒤에 둘 것을 명시한다. ([Digital Asset Documentation][10])
* CLI는 Canton access token을 직접 장기 저장하지 않는다.
* `--debug-canton`은 operator role과 audit logging이 있을 때만 허용한다.

### Webhook Security

* 모든 webhook delivery는 HMAC signature를 포함한다.
* `pillar listen`은 local 개발 secret을 출력하고, 공개 endpoint는 HTTPS를 요구한다.
* Webhook handler는 raw body 기반 signature verification을 해야 한다.
* Event replay attack 방지를 위해 timestamp tolerance를 둔다.
* `events resend`는 새 delivery ID를 만들되 원본 event ID를 유지한다.

### Compliance

* `accounts create`는 KYC/AML status와 capability gate를 분리한다.
* `asset-classes create`는 jurisdiction, transfer restriction, investor eligibility policy를 metadata가 아니라 policy object로 관리한다.
* 모든 admin action은 `audit_entries`에 남긴다.
* Ledger trace는 compliance export 가능해야 한다.
* PII metadata는 redaction policy를 적용하고, CLI 기본 출력에서 숨긴다.
* Production fixture/trigger는 금지한다.

### Deployment Security

* `pillar deploy helm --dry-run`은 secret 값을 출력하지 않는다.
* `--hide-secrets`가 기본값이다.
* chart provenance verification을 지원한다.
* Kubernetes secret은 value literal 대신 existing secret reference를 권장한다.
* DB URL, JWT issuer secret, webhook signing root, Canton credential은 Helm values에 직접 넣지 않는다.

---

## Implementation Plan

### Phase 0 — CLI Foundation

* Command framework
* Config/profile manager
* API client with retries/idempotency/API version headers
* Output renderer: table/json/yaml/ndjson
* Error object parser + exit codes
* Shell completion
* Telemetry opt-out

Deliverables:

```text
pillar login
pillar config
pillar health
```

### Phase 1 — Core Resource Commands

* Account creation
* Asset class creation
* Asset issuance
* Transfer creation
* Idempotency conformance tests
* API version conformance tests

Deliverables:

```text
pillar accounts create
pillar asset-classes create
pillar assets issue
pillar transfers create
```

### Phase 2 — Sandbox / Webhook Developer Loop

* Sandbox Manager API
* Local listener WebSocket/SSE
* HMAC signing
* Trigger helper workflows
* Fixture runner with variable interpolation

Deliverables:

```text
pillar sandbox create
pillar sandbox reset
pillar listen
pillar trigger
pillar fixtures
```

### Phase 3 — Operations / Debugging

* Request log streaming
* Ledger trace graph
* Event resend
* Projection lag reporting
* Webhook delivery diagnostics

Deliverables:

```text
pillar logs tail
pillar ledger trace
pillar events resend
pillar health --deep
```

### Phase 4 — Templates / Deployment

* Template registry
* DAR hash verification
* Package upload orchestration
* Projection schema migration
* Helm chart values validation
* Deployment health gate

Deliverables:

```text
pillar templates install
pillar templates upgrade
pillar deploy helm
```

### Phase 5 — Hardening

* Live-mode safety reviews
* RBAC matrix tests
* Ledger replay recovery tests
* Sandbox reset race tests
* Webhook retry/resend tests
* Backward compatibility snapshots
* AI-agent command fixtures

---

## Open Questions

1. **Thin event를 기본값으로 확정할 것인가?**
   권장: thin default, snapshot opt-in. API version upgrade 리스크가 낮다.

2. **Production에서 `trigger`를 완전 금지할 것인가?**
   권장: live mode에서는 `trigger` 금지. 단, `webhook.ping` 같은 non-mutating diagnostic만 허용.

3. **`ledger trace`의 Canton 상세 노출 범위는 어디까지인가?**
   권장: 기본은 business trace만 제공. `--debug-canton` + operator scope에서 party/package/offset 표시.

4. **Sandbox reset이 ledger identity를 보존해야 하는가?**
   선택지: 빠른 reset은 새 ledger, deterministic reset은 same sandbox ID + new ledger epoch.

5. **Template upgrade 중 API breaking change를 어떻게 통제할 것인가?**
   권장: `--allow-api-breaking` 없이는 차단. SDK/CLI snapshot conformance를 통과해야 activation.

6. **DVP/PVP settlement workflow의 first-class object가 필요한가?**
   권장: `transfer`를 유지하되 `settlement_mode=dvp|pvp`와 `counter_leg`를 명시한다. 별도 `settlement` object는 v2에서 고려.

7. **BYOC Canton과 hosted Canton의 health model을 동일하게 유지할 수 있는가?**
   권장: CLI 출력은 동일하게 유지하고, 내부 `component.details.provider`만 다르게 둔다.

---

## Agent-ready Checklist

### CLI Contract

* [ ] 모든 command가 `--output json`을 지원한다.
* [ ] 모든 mutation command가 `--idempotency-key`를 지원한다.
* [ ] 모든 command response에 `request_id`가 있다.
* [ ] 모든 ledger-backed mutation response에 `ledger_trace`가 있다.
* [ ] 모든 command가 `--api-version`과 `--latest`를 처리한다.
* [ ] 모든 destructive command가 `--confirm` 또는 typed confirmation을 요구한다.
* [ ] 모든 live mutation은 `--live`를 명시해야 한다.

### Developer Experience

* [ ] `pillar login`이 browser/device/API key flow를 모두 지원한다.
* [ ] `pillar listen`이 local forwarding과 signing secret 출력을 지원한다.
* [ ] `pillar trigger transfer.succeeded`가 실제 ledger-backed flow를 생성한다.
* [ ] `pillar fixtures`가 step reference `${step.id}`를 지원한다.
* [ ] CLI examples가 docs와 SDK examples와 동일한 object shape를 사용한다.

### Ledger Correctness

* [ ] DB projection을 지워도 ledger replay로 balances/holdings를 복구할 수 있다.
* [ ] `ledger_commands.command_id`가 API request와 deterministic하게 연결된다.
* [ ] completion offset이 projection offset과 trace에서 확인된다.
* [ ] projection lag가 read response와 `health`에 표시된다.
* [ ] ledger pruning 후에도 audit-level trace가 남는다.

### Webhook Reliability

* [ ] 모든 event delivery가 signing secret으로 서명된다.
* [ ] delivery retry와 manual resend가 분리된다.
* [ ] `events resend`가 새 delivery ID를 생성한다.
* [ ] webhook endpoint failure가 `webhook.delivery.failed` event를 만든다.
* [ ] `listen` local forwarding 실패가 event ID와 retry command를 출력한다.

### Security

* [ ] CLI secret은 OS keychain 우선 저장한다.
* [ ] project config에 secret을 평문 저장하지 않는다.
* [ ] `--debug-canton`은 operator scope 없이 실패한다.
* [ ] Helm dry-run은 secret을 숨긴다.
* [ ] API key scopes가 command별로 강제된다.
* [ ] audit log가 admin/template/deploy/sandbox reset 작업을 모두 기록한다.

### Deployment

* [ ] `deploy helm`이 `helm upgrade --install` semantics를 사용한다.
* [ ] `--rollback-on-failure`가 release failure에 동작한다.
* [ ] deployment 후 `pillar health --deep`이 자동 실행된다.
* [ ] chart values schema validation이 배포 전 수행된다.
* [ ] Canton endpoint, DB secret, webhook signing root가 preflight에서 검증된다.

[1]: https://docs.stripe.com/cli "docs.stripe.com"
[2]: https://docs.stripe.com/stripe-cli/use-cli "docs.stripe.com"
[3]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[4]: https://docs.stripe.com/api/errors "docs.stripe.com"
[5]: https://docs.stripe.com/workbench/guides "docs.stripe.com"
[6]: https://docs.stripe.com/webhooks "docs.stripe.com"
[7]: https://docs.stripe.com/cli/trigger "docs.stripe.com"
[8]: https://docs.stripe.com/sandboxes "docs.stripe.com"
[9]: https://docs.stripe.com/sdks "docs.stripe.com"
[10]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html "JSON Ledger API Service V2 — Digital Asset’s platform documentation"
[11]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[12]: https://docs.digitalasset.com/build/3.5/explanations/parties-users.html "Parties and users on a Canton ledger — Digital Asset’s platform documentation"
[13]: https://docs.digitalasset.com/build/3.5/component-howtos/pqs/references/sql-api.html "SQL API — Digital Asset’s platform documentation"
[14]: https://docs.digitalasset.com/build/3.5/sdlc-howtos/smart-contracts/build/how-to-build-dar-files.html "How to build Daml Archive (.dar) files — Digital Asset’s platform documentation"
[15]: https://helm.sh/docs/intro/using_helm "Using Helm | Helm"
