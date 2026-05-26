# Executive Summary

**Pillar Template Registry / Versioning**은 Canton/Daml 템플릿 패키지의 생명주기를 Stripe급 API 경험으로 감싸는 **control-plane**이다. 핵심 설계는 다음과 같다.

Pillar는 DAR를 “코드 배포물”로 취급하되, 외부 API에는 DAR, package id, template id, contract id를 노출하지 않는다. 외부 세계는 `asset`, `holding`, `balance`, `transfer_intent`, `event` 같은 Stripe식 객체만 본다. 내부 runtime은 tenant pin에 따라 특정 DAR/package/template version을 선택하고, Canton Ledger command를 생성한다.

버전은 하나가 아니라 **6개 축**으로 분리한다.

| Version Axis                   | 의미                                                              | 외부 노출                           |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------- |
| **DAR package version**        | Daml code artifact version, package id, DAR hash                | Admin/Workbench only            |
| **Template family version**    | `asset.holding`, `transfer.intent` 같은 Pillar capability version | Admin/Workbench                 |
| **API object mapping version** | Canton template fields → Pillar API object schema 매핑            | API-visible through API version |
| **Webhook API version**        | webhook event payload schema version                            | Endpoint-level pinned           |
| **SDK version**                | generated client, typed models, webhook helpers                 | Developer-visible               |
| **Tenant template pin**        | tenant/environment별 active template version                     | Config/API admin-visible        |

공식 문서 기준으로도 이 분리 전략이 맞다. Stripe는 API version을 계정/요청/header/Workbench/SDK/webhook endpoint 단위로 관리하고, webhook event는 endpoint 생성 시점의 API version 또는 계정 기본 version을 사용한다. Stripe의 최신 API reference는 major release가 breaking change를 포함할 수 있고, monthly release는 backward-compatible change만 포함한다고 설명한다. 또한 Stripe SDK는 특정 API version에 맞춰 release되며, webhook endpoint는 별도 API version을 갖는다. ([Stripe Docs][1])

Canton/Daml 쪽에서는 DAR upload, Package Management Service, Package Service, Ledger API, JSON Ledger API, package vetting, package selection, Daml smart contract upgrade compatibility가 모두 별도 계층이다. Ledger API는 command submission과 completion/update stream을 분리하며, package upload/query 기능도 별도 service로 제공된다. JSON Ledger API는 production에서 인터넷에 직접 노출하지 말고 reverse proxy 뒤에 두며, 요청마다 JWT가 필요하다고 명시되어 있다. ([Digital Asset Documentation][2])

따라서 Pillar의 registry는 단순 package store가 아니라, **DAR registry + metadata extractor + compatibility checker + mapping compiler + tenant pin resolver + upgrade simulator + rollback controller + self-hosted sync agent**로 설계해야 한다.

---

# Research Baseline: 공식 문서 확인 요약

## Stripe

Stripe API versioning 문서는 **major release는 backward-incompatible change를 포함할 수 있고, monthly release는 backward-compatible change만 포함한다**고 설명한다. API 요청은 기본적으로 계정의 default API version을 사용하지만, `Stripe-Version` header로 특정 version을 지정할 수 있다. 공식 문서상 현재 API version은 `2026-04-22.dahlia`로 표시되어 있다. ([Stripe Docs][1])

Stripe webhook 문서는 endpoint별 API version을 강조한다. Webhook event payload 구조는 endpoint 생성 시점의 API version 또는 account default version에 의해 결정되고, 이미 생성된 event의 구조는 이후 API version upgrade로 변경되지 않는다. Stripe는 webhook handler가 복잡한 처리를 하기 전에 빠르게 성공 응답을 반환하고, 중복 event와 순서 뒤바뀜을 처리해야 한다고 설명한다. Live mode에서는 event delivery를 최대 3일간 자동 재시도하며, event ordering은 보장되지 않는다. ([Stripe Docs][3])

Stripe는 idempotency key를 `POST` 요청 retry 보호에 사용한다. 첫 요청의 status code와 body를 저장하고, 같은 key 재사용 시 같은 결과를 반환한다. key는 최대 255자이며, 민감 정보를 포함하지 말 것을 권장한다. 파라미터가 달라지면 idempotency error가 발생한다. ([Stripe Docs][4])

Stripe API v2는 SDK/CLI가 API version header를 자동 포함한다고 설명하고, v2 idempotency는 같은 API/account/sandbox 조합에서 같은 key를 30일 동안 replay할 수 있다고 설명한다. 또한 v1과 v2 API는 같은 integration에서 함께 사용할 수 있다. ([Stripe Docs][5])

Stripe event destination 문서는 **thin event**와 **snapshot event**를 구분한다. Thin event는 lightweight payload로 후속 API fetch를 요구하고, version upgrade 관리를 client-side로 단순화할 수 있다. Snapshot event는 특정 시점 객체 snapshot을 포함하며 delivered snapshot event는 versioned된다. ([Stripe Docs][6])

## Canton / Daml / Ledger API

Canton Ledger API는 gRPC service 집합으로 구성된다. Command Submission, Command Completion, Command Service, Update Service, State Service, Event Query Service, Package Management Service, Package Service, Version Service 등이 제공된다. Command Submission은 command를 받아들이는 단계이고, 실제 ledger effect는 Update Service와 Completion Service를 통해 관찰한다. ([Digital Asset Documentation][2])

DAR는 Daml code artifact다. DAR 내부에는 primary DALF와 dependency DALF, manifest/source 등이 포함되며, primary DALF가 templates, interfaces, data types, functions를 담는다. `dpm damlc inspect-dar --json`은 main package id, package name/path/version 등 programmatic metadata를 제공한다. Daml archive reader를 사용하면 DAR/DALF를 AST/package data로 파싱할 수 있다. ([Digital Asset Documentation][7])

`daml.yaml`은 package name, version, SDK version, source, dependencies를 포함한다. Daml SDK tooling은 `dpm` 중심으로 전환되었고, `dpm build`는 `daml.yaml`의 sdk-version을 사용해 dependency resolution과 DAR compilation을 수행한다. ([Digital Asset Documentation][8])

Canton/Daml package deployment는 DAR upload와 package vetting을 포함한다. 공식 문서는 Canton Console, JSON API, gRPC PackageManagementService를 통한 DAR upload와 PackageService/JSON API를 통한 package query를 설명한다. Local development에서는 `dpm sandbox`를 사용할 수 있다. ([Digital Asset Documentation][9])

Daml smart contract upgrade 문서는 source-code upgrade compatibility를 강하게 제약한다. Backward-compatible change는 optional field 추가, variant constructor 추가, choice 추가 등으로 제한된다. Field 제거, type 변경, choice/template 제거, interface definition 변경 등은 breaking change로 분류된다. Compiler와 `dpm upgrade-check`, CI sandbox upload, mixed-version workflow test가 권장된다. ([Canton Network Docs][10])

Canton Network upgrade 문서는 package version coexistence를 전제로 한다. 기존 contract는 생성된 package version에 연결되고, 새 contract는 새 package version을 사용할 수 있다. 자동 migration은 없으며, migration은 explicit Upgrade choice, backend automation, ACS/PQS traversal 등을 통해 수행해야 한다. Rollback은 새 contract가 생성되기 전에는 unvet/pin revert가 가능하지만, 새 version contract가 생성된 뒤에는 보통 corrected package로 roll-forward해야 한다. ([Canton Network Docs][11])

---

# Goals / Non-goals

## Goals

1. **Canton Ledger source of truth 유지**
   Package upload, template usage, migration, tenant pin 변경, rollback decision은 모두 ledger-traceable operation으로 남긴다.

2. **Stripe-like external API 유지**
   외부 asset API는 Canton/Daml 용어를 노출하지 않는다. `holding`, `balance`, `transfer_intent`, `event`, `webhook_endpoint`가 1급 객체다.

3. **DAR package registry 제공**
   DAR artifact, hash, signature, package ids, SDK version, dependencies, template metadata, compatibility report를 immutable registry record로 관리한다.

4. **Template metadata extraction 자동화**
   DAR upload 시 template, interface, choice, field schema, optionality, signatory/observer/controller expression fingerprint, upgrade declarations를 추출한다.

5. **Template compatibility check 자동화**
   Daml-level compatibility, Canton deployment compatibility, Pillar API mapping compatibility, webhook compatibility, SDK compatibility를 분리 검증한다.

6. **Tenant별 template version pinning**
   tenant/environment/live mode/asset family별 active template version을 pin하고, canary와 staged rollout을 지원한다.

7. **Upgrade simulator 제공**
   tenant의 historical intent log, ACS/PQS snapshot, synthetic ledger data를 기반으로 sandbox에서 upgrade/migration/webhook diff를 예측한다.

8. **Rollback 전략 내장**
   단순 pin revert, package unvet, migration pause, corrected DAR roll-forward, compensating ledger operation을 단계별로 제공한다.

9. **Self-hosted package sync 지원**
   cloud-hosted Pillar와 self-hosted Pillar가 동일 API 경험을 유지하되, package artifact와 registry index는 signed sync protocol로 배포한다.

10. **SDK version pinning**
    API version, mapping version, webhook version과 SDK version을 release matrix로 묶어 runtime mismatch를 방지한다.

## Non-goals

1. **Canton package id를 public asset API에 노출하지 않는다.**
   Package id는 admin/workbench/debug surface에서만 노출한다.

2. **Daml contract를 외부 API의 primary object로 만들지 않는다.**
   Contract는 implementation detail이다. Pillar API는 balance/holding/intent-first다.

3. **Ledger state를 Pillar DB에 중복 source-of-truth로 저장하지 않는다.**
   DB는 projection, audit, config만 저장한다.

4. **Breaking change를 자동으로 무해화하지 않는다.**
   Breaking change는 simulator, migration plan, tenant opt-in, rollback/roll-forward policy로 통제한다.

5. **JSON Ledger API를 public internet-facing API로 노출하지 않는다.**
   JSON Ledger API는 internal runtime 또는 reverse proxy 뒤의 controlled interface로만 사용한다. 공식 문서도 production에서 JSON Ledger API를 인터넷에 직접 노출하지 말 것을 권장한다. ([Digital Asset Documentation][12])

---

# Architecture

## 1. High-level Architecture

```text
                 ┌───────────────────────────┐
                 │        Pillar API          │
                 │ Stripe-like external API   │
                 └─────────────┬─────────────┘
                               │
                               ▼
                 ┌───────────────────────────┐
                 │ Intent Runtime             │
                 │ idempotency, auth, routing │
                 └─────────────┬─────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────┐
│ Template Registry Control Plane                         │
│                                                        │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │ DAR Registry │→ │ Metadata        │→ │ Compatibility│ │
│  │ Artifact     │  │ Extractor       │  │ Checker      │ │
│  └──────────────┘  └────────────────┘  └─────────────┘ │
│          │                  │                  │         │
│          ▼                  ▼                  ▼         │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │ Mapping       │  │ Tenant Pin      │  │ Upgrade      │ │
│  │ Compiler      │  │ Resolver        │  │ Simulator    │ │
│  └──────────────┘  └────────────────┘  └─────────────┘ │
│          │                  │                  │         │
│          ▼                  ▼                  ▼         │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │ Deployment    │  │ Migration       │  │ Rollback     │ │
│  │ Orchestrator  │  │ Orchestrator    │  │ Controller   │ │
│  └──────────────┘  └────────────────┘  └─────────────┘ │
└────────────────────────────────────────────────────────┘
                               │
                               ▼
                 ┌───────────────────────────┐
                 │ Canton-native Runtime      │
                 │ Ledger API / Admin APIs    │
                 └─────────────┬─────────────┘
                               │
                               ▼
                 ┌───────────────────────────┐
                 │ Canton Ledger              │
                 │ source of truth            │
                 └───────────────────────────┘
```

## 2. Component Responsibilities

### A. DAR Package Registry

**역할:** DAR artifact의 canonical registry.

저장 대상:

| Field             | 설명                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------- |
| `dar_sha256`      | content-addressed artifact hash                                                       |
| `artifact_uri`    | object storage / OCI registry / local self-host cache pointer                         |
| `main_package_id` | DAR primary package id                                                                |
| `package_ids[]`   | DAR 내부 dependency package ids                                                         |
| `package_name`    | Daml package name                                                                     |
| `package_version` | Daml package semantic version                                                         |
| `sdk_version`     | `daml.yaml` SDK version                                                               |
| `daml_lf_version` | Daml-LF version                                                                       |
| `manifest`        | DAR manifest metadata                                                                 |
| `signature`       | publisher signature / provenance                                                      |
| `sbom`            | dependency inventory                                                                  |
| `status`          | `uploaded`, `verified`, `indexed`, `compatible`, `published`, `deprecated`, `revoked` |

DAR는 immutable이다. 동일 hash는 동일 artifact로 취급하고, version tag는 mutable alias가 아니라 immutable release record에 매핑한다.

### B. Template Metadata Extractor

DAR upload 후 extractor가 다음 정보를 생성한다.

| Metadata              | 설명                                                                                |
| --------------------- | --------------------------------------------------------------------------------- |
| Template FQN          | `Package:Module:Template`                                                         |
| Interface instances   | implemented Daml interfaces                                                       |
| Payload schema        | record fields, type, optionality                                                  |
| Template key schema   | key type, maintainers expression fingerprint                                      |
| Choices               | choice name, controllers, consuming/non-consuming, argument schema, result schema |
| Observability         | signatory/observer expression fingerprint                                         |
| Upgrade metadata      | prior package reference, optional fields, upgrade compatibility declarations      |
| Canonical views       | Pillar `HoldingView`, `BalanceView`, `IntentView` mapping 가능성                     |
| Ledger command shapes | create/exercise/create-and-exercise 가능 command shape                              |
| Risk flags            | dynamic observers, unsafe choice shape, external object mapping ambiguity         |

Extractor는 3단계로 구성한다.

1. `dpm damlc inspect-dar --json` 기반 coarse metadata 추출
2. archive reader 기반 AST/type/choice/interface deep parse
3. Pillar Mapping DSL과 canonical interface validation

공식 Daml 문서는 `inspect-dar --json`이 main package id, package name/path/version 등 programmatic metadata를 제공한다고 설명하며, archive reader를 통해 DAR/DALF AST와 package data를 파싱할 수 있음을 보여준다. ([Digital Asset Documentation][13])

### C. Template Compatibility Checker

Compatibility는 5개 층으로 분리한다.

| Layer                               | Check                                                         |
| ----------------------------------- | ------------------------------------------------------------- |
| **Daml SCU compatibility**          | optional field 추가, choice 추가 등 Daml source-code upgrade rules |
| **Canton deployment compatibility** | package upload/vetting 가능성, dependency package availability   |
| **Pillar semantic compatibility**   | holding/balance/intent invariant 유지                           |
| **API mapping compatibility**       | external object field removal/type change/semantic change 없음  |
| **Webhook compatibility**           | endpoint-pinned event payload compatibility                   |
| **SDK compatibility**               | generated types, enum widening, webhook helper compatibility  |

Compatibility 결과는 다음 등급으로 분류한다.

| Level     | 의미                                                                      | Tenant impact          |
| --------- | ----------------------------------------------------------------------- | ---------------------- |
| `patch`   | bug fix, no schema change                                               | auto-eligible          |
| `minor`   | additive optional fields, additive choices, no external breaking change | staged rollout         |
| `major`   | external behavior or mapping change                                     | tenant opt-in required |
| `blocked` | Daml/Canton/package/vetting/API invariant violation                     | publish 불가             |

Daml 문서상 기존 field 제거, type 변경, choice/template 제거, interface definition 변경 등은 breaking change다. 반대로 optional field 추가, variant constructor 추가, choice 추가 등은 특정 조건에서 compatible change로 취급된다. Pillar는 이 기준 위에 API/webhook/SDK compatibility를 추가로 얹는다. ([Canton Network Docs][10])

### D. API Object Mapping Compiler

Mapping Compiler는 Canton-native template을 Stripe-like external object로 변환한다.

예:

```yaml
mapping_version: "2026-05-26.holding"
object: "holding"
template_family: "pillar.asset.holding"
source:
  interface: "Pillar.Asset.HoldingView"
fields:
  id:
    source: "external_id"
    stable: true
  asset:
    source: "asset_external_id"
  balance.available:
    source: "quantity.available"
    type: "decimal_string"
  balance.pending:
    source: "quantity.pending"
    type: "decimal_string"
  status:
    source: "lifecycle.status"
    enum:
      active: ["Active"]
      restricted: ["Frozen", "Restricted"]
      closed: ["Closed"]
```

Mapping compiler는 다음을 강제한다.

1. `contract_id`는 public API object id가 될 수 없다.
2. `holding.id`는 stable external id여야 한다.
3. Balance/Holding view가 없는 template은 asset runtime에 publish 불가하다.
4. Decimal, amount, currency/asset unit은 canonical precision policy를 통과해야 한다.
5. Mapping version은 API version과 webhook version에 연결된다.
6. Mapping change가 external object field의 의미를 바꾸면 `major`다.

### E. Tenant Pin Resolver

Runtime은 매 요청마다 다음 resolver를 호출한다.

```text
tenant_id
+ environment: test | live | sandbox
+ livemode
+ product_family: asset | custody | transfer | issuance
+ operation: create_holding | transfer_intent.confirm | redeem
+ requested_api_version
+ idempotency_key scope
→ template_version_id
→ api_mapping_version
→ webhook_api_version
→ sdk compatibility profile
→ Canton command builder
```

Tenant pin은 mutable config지만, 변경 행위 자체는 ledger-traceable audit operation으로 기록한다.

Pin mode:

| Mode            | 설명                                       |
| --------------- | ---------------------------------------- |
| `locked`        | tenant가 명시 version에 고정                   |
| `managed`       | compatible patch/minor 자동 적용 가능          |
| `canary`        | 일부 traffic 또는 asset family만 next version |
| `scheduled`     | 특정 cutover timestamp                     |
| `rollback_hold` | migration/rollback 중 새 version 사용 금지     |

### F. Deployment Orchestrator

Deployment Orchestrator는 registry release를 Canton participant/validator에 배포한다.

주요 기능:

1. DAR upload
2. package status 확인
3. package vetting 확인
4. dependency package readiness 확인
5. counterparty validator readiness 확인
6. tenant pin activation 전 preflight
7. deployment receipt ledger audit

Canton 공식 문서는 DAR upload를 Canton Console, JSON API, gRPC PackageManagementService 등으로 수행할 수 있고, PackageService/JSON API로 package status를 조회할 수 있다고 설명한다. ([Digital Asset Documentation][9])

### G. Upgrade Simulator

Upgrade Simulator는 production ledger를 건드리지 않고 다음을 검증한다.

1. old DAR + new DAR upload 가능성
2. old contract / new contract coexistence
3. historical intent replay
4. migration choice execution
5. balance/holding invariant 유지
6. webhook diff
7. API object diff
8. SDK generated type diff
9. rollback path feasibility

공식 Daml upgrade 문서는 `dpm upgrade-check`, CI sandbox upload, old/new DAR mixed workflow tests, Daml Script tests를 권장한다. Pillar Upgrade Simulator는 이를 제품화한 것이다. ([Canton Network Docs][14])

### H. Rollback Controller

Rollback은 3단계로 분류한다.

| Stage                                      | 가능한 rollback                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| **Before activation**                      | release revoke, tenant pin unchanged                                           |
| **After activation, before new contracts** | tenant pin revert, package unvet, webhook/API version freeze                   |
| **After new version contracts exist**      | true rollback 아님. corrected DAR로 roll-forward, downgrade/remediation choice 실행 |

Canton/Daml upgrade 문서는 old package가 남아 있고 old contracts가 계속 동작할 수 있으나, package를 제거하는 built-in rollback은 없으며, 새 version contract 생성 이후에는 corrected package와 migration/roll-forward가 현실적이라고 설명한다. ([Canton Network Docs][15])

### I. Self-hosted Package Sync Agent

Self-hosted 환경은 deployment model만 달라야 한다. API 경험은 동일해야 한다.

Sync agent 역할:

```text
Cloud Registry
  └─ signed registry index
      └─ self-hosted sync agent
          ├─ verifies signature/hash
          ├─ stores DAR in local artifact cache
          ├─ uploads/vets package to local Canton participant
          ├─ reports package deployment receipt
          └─ updates local tenant pin cache
```

Sync modes:

| Mode               | 설명                                             |
| ------------------ | ---------------------------------------------- |
| `online_pull`      | self-host agent가 cloud registry에서 pull         |
| `online_push`      | Pillar control plane이 self-host endpoint로 push |
| `airgap_bundle`    | signed bundle export/import                    |
| `delta_sync`       | hash index 기반 incremental sync                 |
| `emergency_revoke` | compromised package denylist sync              |

---

# API / Object Model

## 1. Version Headers

Pillar는 Stripe와 유사하게 API version을 header와 account default로 관리한다.

```http
Pillar-Version: 2026-05-26.core
Idempotency-Key: 4f2f7f2c-...
```

원칙:

1. `Pillar-Version`이 없으면 tenant/account default API version 사용
2. SDK는 release 시점의 API version을 내장
3. Webhook endpoint는 별도 `api_version`을 가짐
4. Tenant template pin은 API version과 독립적이지만, mapping compatibility matrix로 연결됨
5. 동일 idempotency key retry는 최초 요청 시점의 tenant pin, mapping version, API version을 고정함

Stripe도 SDK와 CLI가 API version을 포함하고, SDK release와 API version이 연결되며, webhook endpoint API version이 별도 관리된다고 설명한다. ([Stripe Docs][16])

## 2. Public Registry Admin Objects

### `template_package`

```json
{
  "id": "dar_pkg_01HV...",
  "object": "template_package",
  "livemode": false,
  "status": "verified",
  "package_name": "com.pillar.asset.holding",
  "package_version": "1.4.0",
  "main_package_id": "pkg_...",
  "dar_sha256": "sha256:...",
  "sdk_version": "3.4.0",
  "created": 1779792000,
  "metadata": {}
}
```

Admin-only object. Core asset API에는 노출하지 않는다.

### `template_version`

```json
{
  "id": "tplver_01HV...",
  "object": "template_version",
  "family": "asset.holding",
  "version": "1.4.0",
  "package": "dar_pkg_01HV...",
  "status": "published",
  "compatibility_level": "minor",
  "api_mappings": ["map_2026_05_26_holding"],
  "webhook_mappings": ["whmap_2026_05_26"],
  "created": 1779792000
}
```

### `api_object_mapping`

```json
{
  "id": "map_2026_05_26_holding",
  "object": "api_object_mapping",
  "api_version": "2026-05-26.core",
  "external_object": "holding",
  "template_family": "asset.holding",
  "schema_hash": "sha256:...",
  "compatibility": {
    "from": "map_2026_02_10_holding",
    "level": "minor",
    "breaking": false
  }
}
```

### `tenant_template_pin`

```json
{
  "id": "ttpin_01HV...",
  "object": "tenant_template_pin",
  "tenant": "acct_...",
  "environment": "live",
  "family": "asset.holding",
  "mode": "locked",
  "active_template_version": "tplver_01HV...",
  "active_api_mapping": "map_2026_05_26_holding",
  "active_webhook_api_version": "2026-05-26.core",
  "effective_from": 1779792000,
  "created": 1779700000
}
```

### `upgrade_simulation`

```json
{
  "id": "upsim_01HV...",
  "object": "upgrade_simulation",
  "tenant": "acct_...",
  "from_template_version": "tplver_old",
  "to_template_version": "tplver_new",
  "status": "succeeded",
  "result": {
    "compatibility_level": "minor",
    "contracts_sampled": 250000,
    "intents_replayed": 100000,
    "balance_diffs": 0,
    "webhook_breaking_diffs": 0,
    "rollback_stage": "before_new_contracts_only"
  },
  "created": 1779792000
}
```

## 3. API Endpoints

### Registry

```http
POST   /v1/template_packages
GET    /v1/template_packages/{id}
GET    /v1/template_packages
POST   /v1/template_packages/{id}/publish
POST   /v1/template_packages/{id}/deprecate
```

### Metadata / Compatibility

```http
GET    /v1/template_versions/{id}
GET    /v1/template_versions
POST   /v1/template_versions/{id}/compatibility_checks
GET    /v1/compatibility_checks/{id}
```

### Tenant Pinning

```http
GET    /v1/tenants/{tenant}/template_pins
POST   /v1/tenants/{tenant}/template_pins
POST   /v1/tenants/{tenant}/template_pins/{id}/rollback
POST   /v1/tenants/{tenant}/template_pins/{id}/schedule
```

### Upgrade Simulator

```http
POST   /v1/upgrade_simulations
GET    /v1/upgrade_simulations/{id}
POST   /v1/upgrade_simulations/{id}/approve
```

### Migration

```http
POST   /v1/migration_plans
GET    /v1/migration_plans/{id}
POST   /v1/migration_plans/{id}/run
POST   /v1/migration_plans/{id}/pause
POST   /v1/migration_plans/{id}/resume
POST   /v1/migration_plans/{id}/cancel
```

### Self-hosted Sync

```http
POST   /v1/package_sync_sessions
GET    /v1/package_sync_sessions/{id}
GET    /v1/registry_index
POST   /v1/package_sync_receipts
```

## 4. Webhook API Versioning

Webhook endpoint object:

```json
{
  "id": "we_01HV...",
  "object": "webhook_endpoint",
  "url": "https://example.com/pillar/webhooks",
  "enabled_events": [
    "holding.updated",
    "transfer_intent.succeeded",
    "template_version.upgraded"
  ],
  "api_version": "2026-05-26.core",
  "event_mode": "thin",
  "status": "enabled",
  "created": 1779792000
}
```

Webhook event object:

```json
{
  "id": "evt_01HV...",
  "object": "event",
  "api_version": "2026-05-26.core",
  "type": "holding.updated",
  "created": 1779792000,
  "livemode": true,
  "data": {
    "object": {
      "id": "hold_...",
      "object": "holding"
    }
  },
  "request": {
    "id": "req_...",
    "idempotency_key": "..."
  }
}
```

Pillar default는 **thin event**다. 이유는 versioning과 data integrity다. 수신자는 event payload의 object id로 최신 object를 fetch한다. Audit-grade integration은 snapshot event를 opt-in할 수 있다. Stripe도 thin event가 lightweight이며 후속 API fetch가 필요하고, snapshot event는 특정 시점 객체 snapshot을 포함한다고 설명한다. ([Stripe Docs][6])

Webhook delivery policy:

| Concern            | Pillar policy                                  |
| ------------------ | ---------------------------------------------- |
| Duplicate delivery | receiver must dedupe by `event.id`             |
| Ordering           | not guaranteed; object fetch required          |
| Retry              | exponential retry, max policy configurable     |
| Timeout            | fast 2xx required; heavy work async queue      |
| Signature          | HMAC/JWS signature required                    |
| Version            | endpoint-pinned                                |
| Immutability       | event payload version immutable after creation |

Stripe 문서도 webhook handler가 빠르게 성공 응답을 반환하고, 중복 event와 ordering 문제를 처리해야 한다고 설명한다. ([Stripe Docs][3])

## 5. SDK Version Pinning

SDK release matrix:

| SDK Version           | API Version       | Mapping Version      | Webhook Helpers   | Status  |
| --------------------- | ----------------- | -------------------- | ----------------- | ------- |
| `pillar-node@1.8.0`   | `2026-05-26.core` | `2026-05-26.holding` | `2026-05-26.core` | current |
| `pillar-java@1.8.0`   | `2026-05-26.core` | `2026-05-26.holding` | `2026-05-26.core` | current |
| `pillar-python@1.8.0` | `2026-05-26.core` | `2026-05-26.holding` | `2026-05-26.core` | current |

Rules:

1. Typed SDK는 기본 API version을 내장한다.
2. SDK override는 가능하지만 typed model mismatch warning을 발생시킨다.
3. Webhook signature verifier는 endpoint API version과 event schema를 확인한다.
4. SDK major version은 Pillar API major version과 정렬한다.
5. SDK minor version은 backward-compatible API/mapping version을 포함한다.
6. Tenant pin upgrade는 SDK upgrade와 독립적이지만, Workbench에서 compatibility warning을 표시한다.

Stripe도 strongly typed SDK가 release 시점 API version에 고정될 수 있고, override 시 type mismatch가 발생할 수 있음을 문서화한다. ([Stripe Docs][16])

---

# Internal Runtime

## 1. Request Execution Flow

```text
1. API request received
2. AuthN/AuthZ
3. Idempotency claim
4. Resolve API version
5. Resolve tenant template pin
6. Resolve API object mapping version
7. Build Canton-native command
8. Submit command through Ledger API
9. Observe completion/update
10. Update projection
11. Emit webhook event
12. Return Stripe-like object
```

Ledger API는 command submission과 completion/update observation을 분리한다. 따라서 Pillar도 API request가 command acceptance인지, ledger completion인지, projection availability인지 명확히 분리해야 한다. ([Digital Asset Documentation][2])

## 2. Idempotency + Template Pin Capture

Idempotency record는 최초 요청 시 다음을 capture한다.

```json
{
  "tenant": "acct_...",
  "livemode": true,
  "method": "POST",
  "path": "/v1/transfer_intents",
  "idempotency_key": "...",
  "params_hash": "sha256:...",
  "api_version": "2026-05-26.core",
  "template_pin_epoch": 42,
  "template_version": "tplver_...",
  "mapping_version": "map_...",
  "status": "in_progress"
}
```

재시도 시 tenant pin이 바뀌었더라도 최초 pin을 사용한다. 이것이 없으면 retry가 다른 DAR/template으로 실행될 수 있다.

Stripe는 idempotency key가 최초 요청 결과를 저장하고, 같은 key와 다른 파라미터 사용 시 error를 발생시키며, 네트워크 오류 후 같은 key로 retry하라고 권장한다. ([Stripe Docs][4])

## 3. Ledger-native Command Builder

Command builder는 외부 객체가 아니라 template family를 기준으로 command를 만든다.

예:

```text
transfer_intent.confirm
  → tenant pin resolver
  → template family: asset.transfer.intent
  → template version: tplver_1.4.0
  → choice: Confirm
  → Canton command: Exercise TransferIntent.Confirm
```

Public API response:

```json
{
  "id": "trint_...",
  "object": "transfer_intent",
  "status": "succeeded",
  "amount": "100.00",
  "asset": "asset_usdc",
  "source_holding": "hold_...",
  "destination_holding": "hold_..."
}
```

No `contract_id`, no `package_id`, no Daml template FQN.

## 4. Projection Model

Projection은 ledger update를 external object view로 변환한다.

```text
Ledger Update
  → event decoder by package/template version
  → canonical view extraction
  → API object mapping
  → projection upsert
  → webhook event creation
```

Projection은 DB에 저장되지만 source of truth가 아니다. Rebuild 가능해야 한다.

## 5. Migration Runtime

Migration은 일반 backend job이 아니라 **ledger-traceable operation**이다.

Migration plan structure:

```text
MigrationPlan
  ├─ source template version
  ├─ target template version
  ├─ affected object family
  ├─ eligibility query
  ├─ migration choice
  ├─ batch size
  ├─ rollback stage
  ├─ dry-run simulation result
  └─ approval policy
```

실행 flow:

```text
1. Create MigrationPlan audit contract
2. Freeze incompatible writes if needed
3. Scan ACS/PQS projection
4. Submit migration choices in batches
5. Observe completions
6. Recompute holding/balance projections
7. Emit migration webhooks
8. Mark MigrationPlan complete on ledger
```

Canton upgrade guidance는 explicit Upgrade choice, backend automation over ACS/PQS, staged rollout을 migration strategy로 설명한다. ([Canton Network Docs][17])

---

# DB Schema

Pillar DB는 **Projection / Audit / Config**만 저장한다. DAR binary는 artifact store/OCI registry/local cache에 있고, DB는 URI/hash/signature metadata를 저장한다.

## 1. Registry Tables

### `dar_packages`

| Column             |        Type | Classification |
| ------------------ | ----------: | -------------- |
| `id`               |     text PK | config/audit   |
| `dar_sha256`       | text unique | audit          |
| `artifact_uri`     |        text | config         |
| `package_name`     |        text | projection     |
| `package_version`  |        text | projection     |
| `main_package_id`  |        text | projection     |
| `package_ids`      |       jsonb | projection     |
| `sdk_version`      |        text | projection     |
| `daml_lf_version`  |        text | projection     |
| `manifest_json`    |       jsonb | projection     |
| `signature_status` |        enum | audit          |
| `provenance_json`  |       jsonb | audit          |
| `status`           |        enum | config         |
| `created_by`       |        text | audit          |
| `created_at`       | timestamptz | audit          |

### `template_families`

| Column               |        Type |
| -------------------- | ----------: |
| `id`                 |     text PK |
| `family_key`         | text unique |
| `canonical_object`   |        text |
| `required_interface` |        text |
| `description`        |        text |
| `status`             |        enum |

### `template_versions`

| Column                |        Type |
| --------------------- | ----------: |
| `id`                  |     text PK |
| `family_id`           |     text FK |
| `dar_package_id`      |     text FK |
| `template_fqn`        |        text |
| `semantic_version`    |        text |
| `status`              |        enum |
| `compatibility_level` |        enum |
| `published_at`        | timestamptz |
| `deprecated_at`       | timestamptz |

### `template_metadata`

| Column                    |        Type |
| ------------------------- | ----------: |
| `id`                      |     text PK |
| `template_version_id`     |     text FK |
| `payload_schema`          |       jsonb |
| `choice_schema`           |       jsonb |
| `interface_schema`        |       jsonb |
| `key_schema`              |       jsonb |
| `signatory_fingerprint`   |        text |
| `observer_fingerprint`    |        text |
| `controller_fingerprints` |       jsonb |
| `extraction_tool_version` |        text |
| `extracted_at`            | timestamptz |

## 2. Mapping / Version Tables

### `api_object_mappings`

| Column                |          Type |
| --------------------- | ------------: |
| `id`                  |       text PK |
| `api_version`         |          text |
| `mapping_version`     |          text |
| `external_object`     |          text |
| `template_version_id` |       text FK |
| `mapping_spec`        |         jsonb |
| `schema_hash`         |          text |
| `compatibility_from`  | text nullable |
| `compatibility_level` |          enum |
| `created_at`          |   timestamptz |

### `webhook_api_versions`

| Column           |                     Type |
| ---------------- | -----------------------: |
| `id`             |                  text PK |
| `api_version`    |                     text |
| `event_type`     |                     text |
| `event_mode`     | enum: `thin`, `snapshot` |
| `payload_schema` |                    jsonb |
| `schema_hash`    |                     text |
| `status`         |                     enum |

### `sdk_release_matrix`

| Column                  |    Type |
| ----------------------- | ------: |
| `id`                    | text PK |
| `language`              |    text |
| `sdk_version`           |    text |
| `api_version`           |    text |
| `mapping_versions`      |   jsonb |
| `webhook_api_version`   |    text |
| `min_supported_runtime` |    text |
| `status`                |    enum |

## 3. Tenant Pinning Tables

### `tenant_template_pins`

| Column                       |                 Type |
| ---------------------------- | -------------------: |
| `id`                         |              text PK |
| `tenant_id`                  |                 text |
| `environment`                |                 enum |
| `family_id`                  |              text FK |
| `mode`                       |                 enum |
| `active_template_version_id` |              text FK |
| `canary_template_version_id` |        text nullable |
| `api_version`                |                 text |
| `webhook_api_version`        |                 text |
| `pin_epoch`                  |               bigint |
| `effective_from`             |          timestamptz |
| `effective_until`            | timestamptz nullable |
| `ledger_audit_ref`           |                 text |
| `created_at`                 |          timestamptz |

Index:

```sql
create unique index tenant_pin_active_idx
on tenant_template_pins (tenant_id, environment, family_id)
where effective_until is null;
```

## 4. Compatibility / Simulation Tables

### `compatibility_checks`

| Column                     |        Type |
| -------------------------- | ----------: |
| `id`                       |     text PK |
| `from_template_version_id` |        text |
| `to_template_version_id`   |        text |
| `status`                   |        enum |
| `daml_result`              |       jsonb |
| `canton_result`            |       jsonb |
| `api_mapping_result`       |       jsonb |
| `webhook_result`           |       jsonb |
| `sdk_result`               |       jsonb |
| `overall_level`            |        enum |
| `blocking_reasons`         |       jsonb |
| `created_at`               | timestamptz |

### `upgrade_simulations`

| Column                       |        Type |
| ---------------------------- | ----------: |
| `id`                         |     text PK |
| `tenant_id`                  |        text |
| `from_pin_epoch`             |      bigint |
| `target_template_version_id` |        text |
| `sample_strategy`            |        enum |
| `status`                     |        enum |
| `sandbox_ref`                |        text |
| `contracts_sampled`          |      bigint |
| `intents_replayed`           |      bigint |
| `balance_diff_count`         |      bigint |
| `webhook_diff_count`         |      bigint |
| `report_json`                |       jsonb |
| `created_at`                 | timestamptz |

### `migration_plans`

| Column                     |        Type |
| -------------------------- | ----------: |
| `id`                       |     text PK |
| `tenant_id`                |        text |
| `from_template_version_id` |        text |
| `to_template_version_id`   |        text |
| `status`                   |        enum |
| `simulation_id`            |     text FK |
| `batch_policy`             |       jsonb |
| `approval_policy`          |       jsonb |
| `ledger_plan_ref`          |        text |
| `created_at`               | timestamptz |

## 5. Deployment / Self-hosted Sync Tables

### `package_deployments`

| Column              |        Type |
| ------------------- | ----------: |
| `id`                |     text PK |
| `tenant_id`         |        text |
| `deployment_target` |        text |
| `participant_id`    |        text |
| `synchronizer_id`   |        text |
| `dar_package_id`    |        text |
| `main_package_id`   |        text |
| `upload_status`     |        enum |
| `vetting_status`    |        enum |
| `ledger_update_id`  |        text |
| `last_checked_at`   | timestamptz |

### `package_sync_state`

| Column                    |        Type |
| ------------------------- | ----------: |
| `id`                      |     text PK |
| `self_hosted_instance_id` |        text |
| `registry_index_version`  |        text |
| `last_synced_sha256`      |        text |
| `sync_mode`               |        enum |
| `status`                  |        enum |
| `last_receipt`            |       jsonb |
| `last_synced_at`          | timestamptz |

## 6. Audit / Idempotency Tables

### `idempotency_keys`

| Column            |        Type |
| ----------------- | ----------: |
| `tenant_id`       |        text |
| `livemode`        |        bool |
| `key`             |        text |
| `method`          |        text |
| `path`            |        text |
| `params_hash`     |        text |
| `api_version`     |        text |
| `pin_epoch`       |      bigint |
| `response_status` |         int |
| `response_body`   |       jsonb |
| `state`           |        enum |
| `created_at`      | timestamptz |
| `expires_at`      | timestamptz |

Primary key:

```sql
primary key (tenant_id, livemode, key)
```

---

# Failure Modes

| Failure Mode                                       | Impact                                      | Mitigation                                                              |
| -------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| DAR hash mismatch                                  | Artifact tampering 가능성                      | content-addressed hash, signature verification, publish block           |
| DAR metadata extraction failure                    | Registry index incomplete                   | publish block, manual override forbidden except emergency signed waiver |
| Daml compatibility failure                         | Runtime command failure 또는 upload rejection | `dpm upgrade-check`, sandbox upload, compatibility report               |
| Package uploaded but not vetted                    | Tenant pin points unusable version          | activation preflight requires `uploaded && vetted`                      |
| Counterparty missing package                       | multi-party transaction failure             | readiness matrix, rollout window, counterparty receipt                  |
| Tenant pin changed during retry                    | duplicate or inconsistent operation         | idempotency captures pin epoch                                          |
| Mapping version drift                              | API object changes silently                 | mapping hash pinned to API version                                      |
| SDK/API mismatch                                   | typed client parse failure                  | SDK release matrix, warning on override                                 |
| Webhook duplicate                                  | duplicate downstream side effects           | event id dedupe, idempotent receiver contract                           |
| Webhook out-of-order                               | stale state processing                      | thin event + object fetch                                               |
| Migration partial completion                       | mixed state                                 | batch ledger audit, resumable cursor, invariant monitor                 |
| New version contract exists after rollback request | true rollback impossible                    | roll-forward corrected DAR, remediation migration                       |
| Self-hosted sync lag                               | self-hosted tenant cannot activate version  | local readiness gate, sync receipt required                             |
| Registry unavailable                               | new package publish blocked                 | runtime uses local pin cache; existing operations continue              |
| JSON Ledger API exposed accidentally               | security boundary violation                 | internal network only, reverse proxy, JWT, mTLS                         |

Canton docs emphasize package coexistence and absence of automatic migration; old contracts remain tied to old package versions, and migration must be explicit. That makes partial migration and mixed state expected operational states, not exceptional bugs. ([Canton Network Docs][11])

---

# Security / Compliance

## 1. Artifact Integrity

Controls:

1. DAR content-addressing by SHA-256
2. Publisher signature required
3. SBOM/provenance stored
4. Immutable release record
5. No mutable `latest` activation without resolving to immutable version
6. Emergency denylist for compromised package hash
7. Self-hosted sync verifies signature and hash before local cache write

## 2. Access Control

Roles:

| Role                   | Permission                              |
| ---------------------- | --------------------------------------- |
| `registry.viewer`      | read registry metadata                  |
| `registry.publisher`   | upload DAR, start checks                |
| `registry.approver`    | publish compatible release              |
| `tenant.pin_admin`     | schedule tenant pin changes             |
| `migration.operator`   | run approved migration                  |
| `security.revoker`     | revoke compromised package              |
| `self_host.sync_agent` | pull registry index and submit receipts |

Sensitive actions require dual control:

1. Publish major version
2. Activate live tenant pin
3. Run migration
4. Rollback/roll-forward after activation
5. Revoke package
6. Self-host emergency sync override

## 3. Ledger-traceable Operations

The following operations produce ledger-auditable records:

| Operation                       | Ledger audit                |
| ------------------------------- | --------------------------- |
| DAR release published           | `RegistryReleasePublished`  |
| Tenant pin changed              | `TenantTemplatePinChanged`  |
| Package deployment receipt      | `PackageDeploymentReceipt`  |
| Migration plan approved         | `MigrationPlanApproved`     |
| Migration batch completed       | `MigrationBatchCompleted`   |
| Rollback/roll-forward initiated | `TemplateRollbackInitiated` |
| Emergency revoke                | `PackageRevoked`            |

The DB may store audit projections, but canonical operational trace should be reconstructable from ledger updates.

## 4. Webhook Security

Webhook security policy:

1. HTTPS only
2. Signature verification required
3. Timestamp tolerance enforced
4. Replay protection by event id and signature timestamp
5. Endpoint secret rotation supported
6. Thin event default minimizes stale snapshot risk
7. Event delivery logs retained
8. Only subscribed event types emitted

Stripe documentation also recommends verifying webhook origin and notes TLS requirements, retries, duplicate handling, and fast success response patterns. ([Stripe Docs][3])

## 5. Ledger API Security

1. Ledger API credentials are internal-only.
2. JSON Ledger API is not internet-facing.
3. JWT audience, issuer, party authorization, tenant boundary are enforced.
4. Runtime service accounts have minimum party/participant privileges.
5. Package upload/vetting operations require separate administrative principal.
6. Self-hosted agent authenticates with mTLS and signed registry tokens.

Official Canton JSON Ledger API docs state that it should not be exposed directly to the internet in production and that requests require JWT access tokens. ([Digital Asset Documentation][12])

## 6. Compliance Posture

| Area                   | Control                                                         |
| ---------------------- | --------------------------------------------------------------- |
| Auditability           | ledger-traceable release/pin/migration events                   |
| Change management      | compatibility report, approval workflow, rollback plan          |
| Tenant isolation       | per-tenant pin, per-tenant auth, per-party ledger authorization |
| Data minimization      | no sensitive data in idempotency keys or metadata               |
| Retention              | registry/audit retention policy by environment                  |
| Incident response      | package revoke, pin freeze, migration pause                     |
| Vendor risk            | SDK/CLI/workbench version matrix                                |
| Self-hosted governance | sync receipts, artifact provenance, airgap bundle signature     |

---

# Migration Strategy

## 1. Compatible Upgrade

예: optional field 추가, choice 추가, API field additive.

```text
1. Upload DAR
2. Extract metadata
3. Run compatibility check
4. Publish template version
5. Deploy/vet package
6. Run simulator
7. Activate tenant canary pin
8. Monitor command failures and projection diffs
9. Promote to managed/live
```

## 2. Breaking Ledger Change

예: field type 변경, template 제거, interface definition 변경.

Policy:

1. 같은 template family의 minor/patch로 publish 금지
2. 새 template family 또는 major template version 필요
3. explicit migration choice 필요
4. old version support window 유지
5. tenant opt-in 필수
6. simulator pass 필수
7. rollback은 roll-forward plan까지 승인되어야 함

## 3. API Breaking Change

예: `holding.balance.available` 의미 변경, field removal, enum semantic change.

Policy:

1. 기존 API version에서는 절대 변경 금지
2. 새 `Pillar-Version` 발행
3. SDK major version과 연결
4. webhook endpoint는 old version 유지
5. tenant/account default version upgrade는 Workbench에서 explicit approve

Stripe도 major API release가 breaking change를 포함할 수 있고, Workbench를 통해 API version upgrade를 테스트/적용하는 흐름을 제공한다. ([Stripe Docs][1])

## 4. Contract Migration

Migration runner는 ledger state를 직접 수정하지 않는다. 반드시 Daml choice를 exercise한다.

```text
OldHolding
  └─ choice UpgradeToV2
       input: migration parameters
       output: NewHolding / MigrationReceipt
```

Batch controls:

| Control                  | Purpose                               |
| ------------------------ | ------------------------------------- |
| batch size               | ledger load control                   |
| retry policy             | transient failure handling            |
| invariant check          | balance conservation                  |
| pause condition          | anomaly detection                     |
| resume cursor            | exactly-once-ish operational recovery |
| webhook suppression mode | noisy migration event control         |
| event summary mode       | downstream migration awareness        |

## 5. Rollback Strategy

### Case A: version published but not activated

Action:

```text
revoke release → keep tenant pin unchanged → emit registry event
```

### Case B: activated but no new contracts created

Action:

```text
freeze writes → tenant pin revert → unvet target package if safe → regenerate projections → emit rollback event
```

### Case C: new contracts created, no irreversible field use

Action:

```text
freeze affected operations → evaluate downgrade choice → run migration back or pin old for creates → monitor mixed state
```

### Case D: new contracts created with incompatible data

Action:

```text
no true rollback → publish corrected DAR → roll-forward migration → compensating webhook events
```

Canton upgrade guidance explicitly treats rollback after new version contract creation as constrained; practical recovery is often corrected package plus migration/roll-forward. ([Canton Network Docs][15])

---

# Breaking Change Policy

## 1. Pillar Compatibility Contract

A release is **non-breaking** only if all are true:

1. Existing API objects parse under old SDKs.
2. Existing webhook endpoints receive payloads compatible with their pinned version.
3. Existing tenant pins continue to execute commands.
4. Existing holdings/balances preserve accounting invariants.
5. Existing idempotency keys replay to the same external result.
6. Existing migration/rollback plan remains valid.
7. Self-hosted sync can defer upgrade without API behavior change.

## 2. Breaking Changes

Breaking by default:

| Change                                             | Reason                         |
| -------------------------------------------------- | ------------------------------ |
| Remove external API field                          | SDK/client break               |
| Change field type                                  | SDK/client break               |
| Change field semantics                             | silent correctness break       |
| Remove webhook event type                          | workflow break                 |
| Change webhook payload under same version          | endpoint break                 |
| Remove template choice used by runtime             | command builder break          |
| Change signatory/observer semantics                | authorization/visibility break |
| Remove canonical holding/balance interface         | Pillar invariant break         |
| Require package unavailable to self-hosted tenants | deployment model leak          |

## 3. Allowed Compatible Changes

Allowed under `minor` if checks pass:

| Change                  | Condition                                   |
| ----------------------- | ------------------------------------------- |
| Add optional API field  | old SDK ignores                             |
| Add webhook event type  | not enabled by default for old endpoint     |
| Add Daml optional field | Daml upgrade-compatible                     |
| Add non-breaking choice | runtime does not require it for old tenants |
| Add enum value          | SDK enum must be open/unknown-safe          |
| Add metadata field      | no semantics change                         |

## 4. Deprecation Policy

Recommended Pillar policy:

1. Public API major versions: minimum 12-month support window
2. Template major versions: tenant-by-tenant deprecation plan required
3. Webhook event types: endpoint-specific deprecation notice
4. SDK versions: support matrix published
5. Self-hosted: deprecation requires sync agent compatibility window
6. Emergency security revoke can override windows but must produce ledger audit event

---

# Upgrade Simulator

## Simulator Inputs

```json
{
  "tenant": "acct_...",
  "environment": "live",
  "from_template_version": "tplver_1_3_0",
  "to_template_version": "tplver_1_4_0",
  "sample": {
    "source": "pqs",
    "contracts": 250000,
    "historical_intents": 100000
  },
  "webhook_mode": "thin",
  "sdk_versions": ["pillar-node@1.7.0", "pillar-java@1.7.0"]
}
```

## Simulation Phases

| Phase                 | Description                                 |
| --------------------- | ------------------------------------------- |
| `artifact_check`      | DAR hash/signature/dependency verification  |
| `daml_check`          | `dpm upgrade-check`, compiler compatibility |
| `sandbox_boot`        | ephemeral Canton sandbox startup            |
| `package_upload`      | old/new DAR upload and status check         |
| `acs_seed`            | representative ACS/PQS data seeding         |
| `intent_replay`       | historical intent replay                    |
| `migration_dry_run`   | Upgrade choice execution                    |
| `projection_diff`     | API object diff                             |
| `balance_invariant`   | balance/holding conservation                |
| `webhook_diff`        | event payload diff by endpoint version      |
| `sdk_diff`            | generated type compatibility                |
| `rollback_assessment` | rollback stage classification               |

## Simulator Output

```json
{
  "status": "succeeded",
  "overall": "minor",
  "blocking": false,
  "warnings": [
    {
      "type": "sdk_unknown_enum",
      "sdk": "pillar-node@1.7.0",
      "field": "holding.status",
      "new_value": "restricted"
    }
  ],
  "rollback": {
    "stage": "safe_until_new_contracts",
    "requires_roll_forward_after_activation": true
  },
  "recommendation": "canary"
}
```

---

# Self-hosted Package Sync

## 1. Registry Index

Cloud registry exposes signed index:

```json
{
  "object": "registry_index",
  "version": "idx_2026_05_26_001",
  "created": 1779792000,
  "packages": [
    {
      "dar_package": "dar_pkg_...",
      "dar_sha256": "sha256:...",
      "artifact_uri": "registry://pillar/dar_pkg_...",
      "signature": "sig_...",
      "status": "published"
    }
  ],
  "revocations": [],
  "signature": "..."
}
```

## 2. Sync Protocol

```text
1. Agent fetches registry index
2. Verify index signature
3. Compare local hash cursor
4. Download missing DARs
5. Verify DAR signature/hash
6. Upload/vet package to local Canton
7. Submit package_sync_receipt
8. Local tenant pins become activatable
```

## 3. Air-gapped Mode

```text
pillar registry export-bundle \
  --from idx_2026_05_01 \
  --to idx_2026_05_26 \
  --include dar_pkg_... \
  --output pillar-registry-bundle.tar.zst

pillar registry import-bundle \
  --file pillar-registry-bundle.tar.zst \
  --verify-signatures \
  --upload-to-canton
```

## 4. Self-hosted Invariant

Self-hosted deployment cannot change API semantics.

Allowed differences:

| Dimension          | Cloud                | Self-hosted      |
| ------------------ | -------------------- | ---------------- |
| Artifact source    | cloud registry       | local cache      |
| Package upload     | managed orchestrator | local sync agent |
| Ledger participant | managed              | customer-owned   |
| API behavior       | same                 | same             |
| API versioning     | same                 | same             |
| Webhook versioning | same                 | same             |
| SDK support        | same                 | same             |

---

# Pillar Workbench / CLI / Sandbox

## Workbench

Pillar Workbench는 registry/versioning 운영 UI다.

기능:

1. DAR upload
2. metadata inspection
3. compatibility report
4. API mapping diff
5. webhook event diff
6. SDK compatibility matrix
7. tenant pin scheduling
8. upgrade simulation report
9. migration approval
10. rollback/roll-forward control
11. self-host sync status

Stripe Workbench는 API version upgrade와 webhook endpoint configuration/testing에서 핵심 tooling으로 문서화되어 있다. Pillar Workbench도 같은 역할을 DAR/template/versioning 영역으로 확장한다. ([Stripe Docs][16])

## CLI

```bash
pillar templates upload ./asset-holding-1.4.0.dar
pillar templates inspect dar_pkg_...
pillar templates compat-check --from tplver_1_3_0 --to tplver_1_4_0
pillar templates publish tplver_1_4_0
pillar tenants pin set acct_... asset.holding tplver_1_4_0 --env live
pillar upgrades simulate --tenant acct_... --to tplver_1_4_0
pillar migrations run mig_...
pillar registry sync --self-hosted
pillar sandbox start --with-template tplver_1_4_0
```

Stripe CLI는 webhook local listener와 test event trigger에 사용되고, Canton/Daml tooling은 `dpm build`, `dpm test`, `dpm sandbox`, DAR upload 흐름을 제공한다. Pillar CLI는 이 둘을 통합한 developer/operator interface가 된다. ([Stripe Docs][3])

## Sandbox

Pillar Sandbox는 다음을 포함한다.

```text
- local Canton sandbox
- local Pillar registry
- test DAR upload
- synthetic tenants
- webhook local delivery
- upgrade simulator
- API version playground
```

목표는 “production과 같은 API grammar, local에서 Canton-native execution”이다.

---

# Implementation Plan

## Phase 0 — Baseline / Spec

Deliverables:

1. `TemplateRegistrySpec.md`
2. `PillarVersioningPolicy.md`
3. `MappingDSL v0`
4. `TemplateCompatibilityMatrix`
5. `SDKReleaseMatrix`
6. `WebhookVersioningSpec`
7. `SelfHostedSyncProtocol`

Exit criteria:

* version axes 정의 완료
* registry object model 확정
* tenant pin resolver semantics 확정
* breaking change policy 승인

## Phase 1 — DAR Registry + Metadata Extraction

Build:

1. DAR upload API
2. artifact hash/signature verification
3. `inspect-dar --json` integration
4. archive reader deep parser
5. template/interface/choice schema extraction
6. registry DB tables
7. Workbench inspection UI

Exit criteria:

* DAR upload → metadata extraction → registry record 생성
* 동일 hash dedupe
* invalid DAR publish block

## Phase 2 — Compatibility Checker + Mapping Compiler

Build:

1. Daml compatibility check integration
2. API mapping compatibility diff
3. webhook payload schema diff
4. SDK type generation diff
5. compatibility report object
6. publish gate

Exit criteria:

* `patch/minor/major/blocked` classification
* breaking change publish block
* report downloadable from Workbench/CLI

## Phase 3 — Tenant Pin Resolver + Runtime Integration

Build:

1. tenant template pin table/API
2. pin epoch capture in idempotency
3. command builder version resolver
4. projection decoder by package/template version
5. webhook event version resolver

Exit criteria:

* tenant A/B can run different template versions
* same idempotency key replays same pin
* old webhook endpoint receives old event shape

## Phase 4 — Deployment Orchestrator

Build:

1. package upload/vetting adapter
2. package deployment status monitor
3. dependency readiness check
4. counterparty readiness matrix
5. deployment receipt audit event

Exit criteria:

* tenant pin cannot activate before package readiness
* self-host and cloud deployment use same registry release

## Phase 5 — Upgrade Simulator

Build:

1. ephemeral sandbox runner
2. ACS/PQS sample loader
3. historical intent replay
4. balance invariant checker
5. webhook/API diff generator
6. rollback feasibility classifier

Exit criteria:

* Workbench can show upgrade readiness
* migration approval requires successful simulation

## Phase 6 — Migration / Rollback

Build:

1. migration plan object
2. batch migration runner
3. migration pause/resume/cancel
4. rollback controller
5. corrected DAR roll-forward flow
6. compensating webhook events

Exit criteria:

* partial migration is resumable
* rollback stage is machine-classified
* no migration runs without ledger audit

## Phase 7 — Self-hosted Sync

Build:

1. signed registry index
2. sync agent
3. local artifact cache
4. airgap bundle export/import
5. sync receipt API
6. emergency revoke propagation

Exit criteria:

* self-hosted instance can activate same template version after sync
* API behavior remains identical
* sync lag blocks activation safely

## Phase 8 — SDK / Workbench / CLI Hardening

Build:

1. SDK generation per API version
2. webhook signature helpers
3. typed event models
4. CLI commands
5. Workbench upgrade wizard
6. sandbox developer flow

Exit criteria:

* SDK matrix published
* Workbench can upgrade API/template/webhook safely
* local sandbox simulates template upgrade

---

# Open Questions

1. **Canonical Pillar interfaces**
   Do we require every asset template to implement `Pillar.Asset.HoldingView`, or allow mapping-only templates?

2. **Package naming policy**
   Should all Pillar first-party packages use reverse-DNS naming such as `com.pillar.asset.holding`?

3. **Webhook default mode**
   Should thin event be mandatory for all high-integrity asset workflows, with snapshot only for audit integrations?

4. **Tenant pin granularity**
   Is pinning by tenant + environment + family enough, or do we need asset-class-level and counterparty-level pins?

5. **Rollback SLA**
   What is the maximum acceptable time to freeze writes and revert pin after failed activation?

6. **Self-hosted airgap cadence**
   Should air-gapped customers be required to import registry bundles before template deprecation windows start?

7. **Ledger audit templates**
   Should registry control operations use first-party Pillar audit templates, or should each customer deploy their own audit package?

8. **Historical replay scope**
   Should simulator replay all historical intents, sampled intents, or only high-risk operation classes?

9. **Package revocation semantics**
   How should emergency package revoke interact with existing ledger contracts that cannot simply disappear?

10. **SDK enum policy**
    Should all enums be open by default, even in strongly typed SDKs, to reduce additive-change breakage?

---

# Agent-ready Checklist

## DAR Registry

* [ ] Accept DAR upload through admin API
* [ ] Compute `dar_sha256`
* [ ] Verify signature/provenance
* [ ] Extract `main_package_id`
* [ ] Extract all package ids
* [ ] Extract package name/version/sdk-version
* [ ] Store immutable artifact record
* [ ] Reject mutable overwrite of existing hash
* [ ] Publish registry event

## Metadata Extraction

* [ ] Run `inspect-dar --json`
* [ ] Parse DAR/DALF with archive reader
* [ ] Extract templates
* [ ] Extract interfaces
* [ ] Extract choices
* [ ] Extract payload schemas
* [ ] Extract template key schemas
* [ ] Fingerprint signatory/observer/controller expressions
* [ ] Detect canonical holding/balance/intent views
* [ ] Store extraction report

## Compatibility

* [ ] Run Daml upgrade compatibility check
* [ ] Run sandbox upload check
* [ ] Verify package dependency availability
* [ ] Verify package vetting path
* [ ] Diff API object mappings
* [ ] Diff webhook payload schemas
* [ ] Diff SDK generated types
* [ ] Classify `patch/minor/major/blocked`
* [ ] Block publish on incompatible changes
* [ ] Generate machine-readable report

## API Mapping

* [ ] Compile Mapping DSL
* [ ] Validate no public `contract_id` dependency
* [ ] Validate stable external id
* [ ] Validate decimal/amount precision
* [ ] Validate balance conservation fields
* [ ] Generate projection decoder
* [ ] Generate API schema
* [ ] Generate webhook schema
* [ ] Generate SDK type metadata

## Tenant Pinning

* [ ] Create tenant pin API
* [ ] Support `locked`, `managed`, `canary`, `scheduled`, `rollback_hold`
* [ ] Capture `pin_epoch`
* [ ] Resolve template version per request
* [ ] Capture pin in idempotency record
* [ ] Prevent activation before package readiness
* [ ] Emit ledger audit for pin change

## Webhook Versioning

* [ ] Endpoint-level API version
* [ ] Endpoint-level event mode
* [ ] Immutable event payload version
* [ ] Thin event default
* [ ] Snapshot event opt-in
* [ ] Signature verification helper
* [ ] Duplicate event handling guidance
* [ ] Retry and delivery log projection

## SDK Pinning

* [ ] Maintain SDK release matrix
* [ ] Generate typed SDKs by API version
* [ ] Pin default API version in SDK
* [ ] Warn on API version override
* [ ] Include webhook verifier by version
* [ ] Include unknown enum fallback
* [ ] Publish SDK compatibility report

## Upgrade Simulator

* [ ] Start ephemeral sandbox
* [ ] Upload old/new DARs
* [ ] Seed representative ACS/PQS data
* [ ] Replay historical intents
* [ ] Run migration dry-run
* [ ] Diff API projections
* [ ] Diff webhook events
* [ ] Check holding/balance invariants
* [ ] Classify rollback feasibility
* [ ] Generate Workbench report

## Migration

* [ ] Create migration plan object
* [ ] Require simulation success
* [ ] Require approval policy
* [ ] Execute ledger choices in batches
* [ ] Track completion offsets/update ids
* [ ] Pause/resume safely
* [ ] Emit migration webhooks
* [ ] Rebuild projections after migration
* [ ] Produce ledger audit records

## Rollback

* [ ] Detect rollback stage
* [ ] Revert pin before new contracts
* [ ] Unvet package where safe
* [ ] Freeze affected writes
* [ ] Support corrected DAR roll-forward
* [ ] Support remediation migration
* [ ] Emit compensating events
* [ ] Document non-reversible cases

## Self-hosted Sync

* [ ] Publish signed registry index
* [ ] Implement sync agent
* [ ] Verify artifact hash/signature
* [ ] Support delta sync
* [ ] Support airgap bundle
* [ ] Upload/vet to local Canton
* [ ] Submit sync receipt
* [ ] Block activation on sync lag
* [ ] Propagate emergency revokes

## Workbench / CLI / Sandbox

* [ ] Workbench DAR upload
* [ ] Workbench compatibility report
* [ ] Workbench API mapping diff
* [ ] Workbench webhook diff
* [ ] Workbench tenant pin scheduler
* [ ] CLI upload/inspect/check/publish/pin/simulate/sync
* [ ] Local sandbox with registry + Canton
* [ ] Webhook local test flow
* [ ] SDK upgrade guidance generation

[1]: https://docs.stripe.com/api/versioning?utm_source=chatgpt.com "Versioning | Stripe API Reference"
[2]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[3]: https://docs.stripe.com/webhooks "docs.stripe.com"
[4]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[5]: https://docs.stripe.com/api-v2-overview "docs.stripe.com"
[6]: https://docs.stripe.com/event-destinations?locale=en-GB "docs.stripe.com"
[7]: https://docs.digitalasset.com/build/3.5/explanations/daml-packages-and-archive-files.html "Daml packages and archive (.dar) files — Digital Asset’s platform documentation"
[8]: https://docs.digitalasset.com/build/3.5/sdlc-howtos/smart-contracts/build/how-to-build-dar-files.html "How to build Daml Archive (.dar) files — Digital Asset’s platform documentation"
[9]: https://docs.digitalasset.com/build/3.4/dpm/dpm.html "Digital Asset Package Manager (Dpm) — Digital Asset’s platform documentation"
[10]: https://docs.canton.network/appdev/modules/m6-upgrade-compatibility "Upgrade Compatibility - Canton Network Docs"
[11]: https://docs.canton.network/appdev/modules/m6-package-selection "Package Selection - Canton Network Docs"
[12]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html "JSON Ledger API Service V2 — Digital Asset’s platform documentation"
[13]: https://docs.digitalasset.com/build/3.4/component-howtos/development-tooling-authors/how-to-parse-daml-archive-files.html "How to parse Daml archive files — Digital Asset’s platform documentation"
[14]: https://docs.canton.network/appdev/modules/m6-testing-upgrades "Testing Upgrades - Canton Network Docs"
[15]: https://docs.canton.network/appdev/modules/m7-smart-contract-upgrades "Smart Contract Upgrades in Production - Canton Network Docs"
[16]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[17]: https://docs.canton.network/appdev/modules/m6-deployment "Upgrade Deployment - Canton Network Docs"
