# 20. Pillar Files / Documents / Evidence System

## Executive Summary

Pillar의 Files/Documents/Evidence 시스템은 단순 파일 업로드 기능이 아니라 **Canton-backed asset lifecycle의 증빙 레이어**다. RWA 발행 증빙, 계약서, settlement evidence, claim/dispute evidence, KYC/KYB 문서 참조, audit attachment를 모두 하나의 Stripe-grade File API 문법으로 제공하되, 내부적으로는 **Canton-native evidence anchoring**으로 운영한다.

핵심 설계는 다음과 같다.

1. **파일 바이트는 ledger에 저장하지 않는다.**
   원본 파일은 encrypted object storage에 저장한다. Canton Ledger에는 파일의 존재, 목적, 연결 대상, retention snapshot, evidence hash, 필요한 경우 content hash만 기록한다.

2. **Canton Ledger가 evidence association의 source of truth다.**
   “이 파일이 어떤 RWA, settlement, claim, dispute, KYC/KYB reference, audit operation에 증빙으로 붙었다”는 사실은 ledger contract/choice/event로 확정한다.

3. **Pillar DB는 storage pointer, projection, audit, config만 보관한다.**
   DB는 `file_id → encrypted storage key`, upload session, signed URL issuance log, webhook delivery, projection, retention config를 저장한다. 최종 증빙 상태는 ledger anchor와 ledger projection에서 재구성 가능해야 한다.

4. **외부 API는 Stripe-like, Canton-invisible이다.**
   고객은 `file_...`, `file_link_...`, `evidence_hash`, `linked_objects`, `status`, `metadata`만 본다. `contract_id`, Daml template, party, synchronizer 같은 Canton 세부사항은 기본 응답에서 숨긴다.

5. **내부 runtime은 Canton-native다.**
   File upload가 완료되면 verifier가 hash를 계산하고, malware/DLP 검사를 수행하고, Canton Ledger API에 `CreateEvidenceReference` 또는 `AttachEvidence` command를 submit한다. Ledger completion과 PQS projection이 API 상태를 갱신한다.

6. **Webhook-first async workflow다.**
   파일 업로드, 검증, quarantine, evidence anchor, object attachment, retention transition, file link expiry는 모두 webhook event로 통지한다.

7. **Hash는 두 계층으로 분리한다.**
   `content_hash`는 원본 바이트의 SHA-256이다. `evidence_hash`는 파일, 목적, linkage, retention snapshot, nonce를 canonical JSON으로 묶어 만든 commitment다. 민감 문서는 raw content hash를 ledger에 직접 노출하지 않고 salted/private commitment만 ledger에 기록한다.

공식 문서 리서치 기준으로, Stripe는 File object와 `multipart/form-data` upload, file link, metadata, idempotency, Workbench, CLI, sandbox, webhook retry/versioning 패턴을 명확히 제공한다. Stripe File API는 파일을 독립 객체로 다루며 dispute evidence, identity document 같은 목적 기반 업로드를 지원하고, file link는 공개 다운로드 URL을 별도 객체로 모델링한다. ([Stripe 문서][1]) Canton/Daml 공식 문서는 backend가 Ledger API를 숨기고 API/frontend가 Canton 세부사항을 몰라도 되도록 하는 패턴, JSON/gRPC Ledger API, command id/completion/deduplication, sandbox, PQS/Daml Shell 기반 projection/debugging을 뒷받침한다. ([Digital Asset][2])

---

## Research Notes: Official-doc Findings

### Stripe

| 영역                        | 공식 문서에서 확인한 사항                                                                                                                                                                                                     | Pillar 설계 반영                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| File object               | Stripe File object는 `id`, `object`, `created`, `expires_at`, `filename`, `purpose`, `size`, `type`, `url`, `links` 등을 가진 독립 API 객체다. ([Stripe 문서][3])                                                              | Pillar도 `file_...`를 독립 객체로 만들고, 목적 기반 `purpose`와 linkage를 별도 모델링한다.                                                    |
| Upload API                | Stripe는 파일 업로드에 `multipart/form-data`를 사용하고, 공식 SDK들이 multipart 전송을 지원한다. ([Stripe 문서][4])                                                                                                                         | Pillar는 `POST /v1/files` multipart upload와 direct-to-storage upload session을 모두 제공한다.                                  |
| File links                | Stripe File Link object는 file에 연결된 별도 객체이며 `url`, `expires_at`, `expired`, `metadata`를 가진다. ([Stripe 문서][5])                                                                                                       | Pillar도 signed download URL을 `file_link` 객체로 만들고 URL 자체는 단기/일회성으로 취급한다.                                                |
| Metadata                  | Stripe metadata는 key-value 구조이며 민감 정보를 metadata에 저장하지 말라고 명시한다. ([Stripe 문서][6])                                                                                                                                   | Pillar metadata는 non-sensitive client metadata만 허용하고, KYC/KYB PII는 encrypted file body나 secure document manifest에만 둔다. |
| Idempotency               | Stripe는 idempotency key로 retry 시 중복 operation을 방지하고, key 재사용 시 parameter mismatch를 감지한다. ([Stripe 문서][7]) API v2에서는 POST/DELETE idempotency 범위와 30일 replay semantics가 더 명확하다. ([Stripe 문서][8])                     | Pillar는 모든 mutating endpoint에 `Idempotency-Key`를 요구 또는 권장하고, ledger `command_id`와 연결한다.                                |
| Webhooks                  | Stripe는 webhook retry, out-of-order delivery 가능성, async queue 처리, signature verification, duplicate handling을 공식 best practice로 둔다. ([Stripe 문서][9])                                                               | Pillar webhooks는 thin-event 우선, event idempotency, out-of-order safe fetch-after-event 패턴으로 설계한다.                      |
| API versioning            | Stripe는 Workbench에서 API version upgrade를 관리하고, webhook endpoint version과 SDK-pinned version을 고려한다. ([Stripe 문서][10]) Stripe SDK/versioning 문서 기준 현재 API version은 `2026-04-22.dahlia`로 표시된다. ([Stripe 문서][11])      | Pillar는 `Pillar-Version` header, webhook endpoint version pinning, SDK version pinning, Workbench upgrade test를 제공한다.  |
| SDK                       | Stripe는 Ruby, Python, PHP, Java, Node, Go, .NET 등 공식 server-side SDK를 제공한다. ([Stripe 문서][12])                                                                                                                      | Pillar는 OpenAPI 기반 Node/Python/Java/Go/.NET SDK와 typed webhook helpers를 제공한다.                                          |
| CLI / Workbench / Sandbox | Stripe CLI는 sandbox resource 관리, webhook test, API call에 사용되고, Workbench Shell은 API Explorer와 CLI-like shell을 제공한다. ([Stripe 문서][13]) Stripe sandbox는 live data와 분리된 isolated test environment다. ([Stripe 문서][14]) | Pillar CLI/Workbench/Sandbox는 file upload, evidence anchor inspection, webhook replay, local Canton sandbox를 제공한다.     |

### Canton / Daml / Ledger API

| 영역                               | 공식 문서에서 확인한 사항                                                                                                                                   | Pillar 설계 반영                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Backend hides Ledger API         | Canton Quickstart 문서는 backend가 모든 ledger interaction을 처리하고 frontend가 Canton/Ledger API와 직접 대화하지 않는 패턴을 설명한다. ([Digital Asset][2])                | Pillar External API는 Canton-invisible이고, 내부 backend만 Ledger API/PQS를 사용한다.                                  |
| JSON Ledger API                  | Canton JSON Ledger API는 HTTP/JSON으로 ledger와 상호작용하며 gRPC Ledger API의 대부분 기능을 제공하고 OpenAPI/AsyncAPI client generation을 권장한다. ([Digital Asset][15]) | Pillar internal tooling과 sandbox는 JSON Ledger API를 사용 가능하게 하되, production core는 gRPC Ledger API 우선이다.       |
| gRPC Ledger API command identity | Ledger API command는 `workflow_id`, `user_id`, `command_id`, `act_as`, completion의 `update_id` 등을 제공한다. ([Digital Asset][16])                     | Pillar `operation_id`, `request_id`, `file_id`, `Idempotency-Key`를 ledger `workflow_id`/`command_id`와 매핑한다. |
| Command deduplication            | Canton command deduplication은 같은 Participant Node로 submit될 때만 보장된다고 문서화되어 있다. ([Digital Asset][17])                                              | Pillar는 API-level idempotency를 primary로 두고 Canton dedupe는 secondary safety net으로만 사용한다.                     |
| Parties/users/auth               | Canton Ledger API는 party metadata와 user management, actAs/readAs 권한을 제공한다. ([Digital Asset][18])                                                 | Pillar runtime은 account/user → party/user/claims mapping을 내부 auth layer에서 관리한다.                             |
| Sandbox                          | Canton Sandbox는 단일 Participant Node와 Synchronizer Node로 Daml code를 실행하는 단순 topology다. ([Digital Asset][19])                                      | Pillar Sandbox는 local Canton sandbox + MinIO/object store + fake KYC + webhook listener로 구성한다.              |
| PQS / Daml Shell                 | Daml Shell은 PQS PostgreSQL에 저장된 ledger transaction/event 상태를 interactive하게 조회한다. ([Digital Asset][20])                                           | Pillar Workbench는 ledger projection/PQS와 API audit을 합쳐 evidence trace를 보여준다.                                |
| Canton security                  | Canton nodes는 Ledger/Admin/Sequencer APIs에서 TLS, signing keys, KMS key storage options를 사용한다. ([Digital Asset][21])                              | Pillar internal runtime은 Ledger API mTLS/JWT, KMS-backed key management, least privilege를 적용한다.             |

### Object Storage / Security Standards

AWS S3 presigned URL 문서는 URL이 지정된 기간 동안만 유효하고 SDK/CLI 사용 시 최대 7일까지 설정 가능하다고 설명한다. ([AWS Documentation][22]) S3는 server-side encryption을 기본 적용하고, SSE-KMS에서는 envelope encryption을 사용한다. ([AWS Documentation][23]) S3 Object Lock은 retention period와 legal hold로 object version overwrite/delete를 방지한다. ([AWS Documentation][24]) SHA-256 같은 hash algorithm은 NIST FIPS 180-4의 Secure Hash Standard 범위에 있고, RFC 8785는 JSON을 deterministic하게 canonicalize하여 hashable representation을 만드는 방법을 정의한다. ([NIST CSRC][25])

---

## Goals / Non-goals

### Goals

1. **RWA evidence-grade file layer**

   * title deed, appraisal report, insurance certificate, warehouse receipt, custody statement, tokenization approval, board resolution 등을 evidence로 보관한다.
   * RWA asset lifecycle의 “증빙 연결”은 ledger에서 확정한다.

2. **Contract and settlement document layer**

   * 계약서, amendment, side letter, invoice, delivery confirmation, settlement receipt, payment confirmation을 File object로 관리한다.
   * settlement completion이나 claim resolution과 파일이 on-ledger로 연결되어야 한다.

3. **Claim / dispute evidence layer**

   * dispute evidence는 업로드 후 immutable evidence reference로 sealing한다.
   * 각 dispute/claim object는 evidence bundle을 가진다.

4. **KYC/KYB document reference**

   * KYC/KYB 문서 본문은 절대 ledger에 저장하지 않는다.
   * Ledger에는 salted/private evidence commitment와 document reference status만 남긴다.

5. **Audit attachment**

   * 운영자가 수행한 민감 작업, exception approval, manual override, reconciliation report에 파일을 첨부할 수 있다.
   * privileged operation은 audit log와 ledger-traceable digest를 남긴다.

6. **Stripe-grade API grammar**

   * `POST /v1/files`, `GET /v1/files/{id}`, `POST /v1/file_links`, `metadata`, `Idempotency-Key`, `livemode`, `expand`, cursor pagination, request IDs, webhook events를 일관되게 제공한다.

7. **Canton-native internal runtime**

   * evidence creation, attachment, sealing, retention transition이 Canton Ledger command로 처리된다.
   * API response는 Canton details를 숨기되, Workbench/internal API에서는 ledger trace를 볼 수 있다.

8. **Provider-agnostic deployment**

   * AWS S3, GCS, Azure Blob, on-prem S3-compatible storage, MinIO sandbox를 storage adapter로 지원한다.
   * API experience는 배포 모델과 무관하게 동일해야 한다.

### Non-goals

1. **Ledger에 파일 원문 저장 금지**

   * PDF, image, contract body, KYC document body, PII, business secrets는 ledger payload에 넣지 않는다.

2. **범용 CMS가 아님**

   * folder tree, collaborative editing, rich document workflow는 범위 밖이다.
   * Pillar Files는 asset/evidence/audit 증빙용이다.

3. **외부 고객에게 Canton contract-first UX 제공 금지**

   * 외부 API에서 contract ID, template ID, party ID를 주 API grammar로 노출하지 않는다.

4. **무기한 public file URL 금지**

   * 다운로드는 authenticated API 또는 short-lived signed URL만 허용한다.

5. **KYC/KYB vendor replacement 아님**

   * Pillar는 KYC/KYB 문서 reference와 evidence anchoring을 제공한다. Identity verification scoring, liveness, sanctions screening은 별도 vendor/service와 연동한다.

---

## Architecture

### 1. Logical Architecture

```text
Client / SDK / CLI / Workbench
        |
        v
Pillar API Gateway
  - AuthN/AuthZ
  - API versioning
  - Idempotency
  - Request audit
        |
        v
File API Service
  - File object lifecycle
  - Upload session
  - File link creation
  - Metadata validation
  - Object linkage request
        |
        +-------------------+
        |                   |
        v                   v
Storage Signer        Object Link Resolver
  - upload URL        - asset/holding/settlement/claim lookup
  - download URL      - external ID -> internal ledger target
        |
        v
Encrypted Object Storage
  - encrypted file bytes
  - object version
  - object lock / retention
  - tags
        |
        v
File Verifier Pipeline
  - HEAD object
  - MIME sniff
  - size validation
  - malware scan
  - DLP scan
  - PDF/Office validation
  - content hash
  - evidence hash
        |
        v
Evidence Anchor Orchestrator
  - construct Daml command
  - submit to Canton Ledger API
  - command_id/workflow_id mapping
  - completion tracking
        |
        v
Canton Ledger
  - EvidenceReference
  - EvidenceAttachment
  - EvidenceBundle
  - Retention/LegalHold operation
        |
        v
Projection Layer / PQS / Pillar DB
  - API object projection
  - audit log
  - webhook outbox
  - signed URL issuance history
        |
        v
Webhook Delivery
  - thin events
  - retries
  - signature
  - delivery logs
```

### 2. Planes

| Plane                | Responsibility                                                                                        | Source of truth                            |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Storage plane**    | Encrypted file bytes, object version, object lock, lifecycle policy                                   | Object storage for bytes only              |
| **Ledger plane**     | Evidence reference, hash commitment, attachment to asset/holding/settlement/claim, retention snapshot | Canton Ledger                              |
| **Projection plane** | API object cache, search/list response, Workbench view, webhook outbox                                | Pillar DB as projection/audit/config       |
| **Security plane**   | Auth, KMS, signing, DLP, scan, access control                                                         | IAM/KMS/config + ledger-audited operations |
| **Developer plane**  | SDK, CLI, Workbench, Sandbox                                                                          | OpenAPI/API version config                 |

### 3. Core Design Principle

A File has two lifecycles:

#### A. Storage lifecycle

```text
created -> upload_pending -> uploaded -> scanning -> stored -> expired/deleted
```

#### B. Evidence lifecycle

```text
unanchored -> hash_verified -> ledger_anchoring -> anchored -> attached -> sealed -> retained/released/tombstoned
```

A file is not considered **evidence-grade** until:

1. upload is complete,
2. hash is computed,
3. scan policy passes or is explicitly overridden,
4. evidence hash is constructed,
5. Canton Ledger `EvidenceReference` is committed,
6. projection observes the ledger completion.

---

## API / Object Model

## 1. File Object

### External object

```json
{
  "id": "file_01JZ8Y0F5X2Q9B7AV6P6A4H3VG",
  "object": "file",
  "livemode": false,
  "created": 1782400000,
  "updated": 1782400033,

  "purpose": "rwa_proof",
  "status": "verified",
  "evidence_status": "anchored",

  "filename": "warehouse_receipt.pdf",
  "title": "Warehouse receipt - Lot 42",
  "type": "pdf",
  "content_type": "application/pdf",
  "size": 842912,

  "hash": {
    "algorithm": "sha256",
    "content_hash": "sha256:4b7c...",
    "visibility": "public_verifiable"
  },

  "evidence": {
    "evidence_hash": "sha256:9ac1...",
    "canonicalization": "jcs-rfc8785",
    "manifest_version": "2026-05-26",
    "sealed": true,
    "sealed_at": 1782400031
  },

  "retention": {
    "policy": "rwa_evidence_7y",
    "retain_until": 2000000000,
    "legal_hold": false,
    "disposition": "retain_then_delete"
  },

  "linked_objects": [
    {
      "object": "rwa_asset",
      "id": "rwa_01JZ8Y...",
      "role": "warehouse_receipt",
      "status": "attached"
    }
  ],

  "metadata": {
    "asset_class": "commodity",
    "issuer_reference": "wr-2026-042"
  },

  "downloadable": true,
  "links": {
    "object": "list",
    "data": [],
    "has_more": false
  },

  "trace": {
    "request_id": "req_...",
    "operation_id": "op_...",
    "ledger_anchor": "evref_01JZ8Y..."
  }
}
```

### Field rules

| Field                    | Rule                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `id`                     | Stable external ID. Never equals storage key or ledger contract ID.                             |
| `purpose`                | Required. Drives validation, retention, scan policy, ledger template/choice.                    |
| `status`                 | Storage/processing state.                                                                       |
| `evidence_status`        | Ledger anchoring state.                                                                         |
| `filename`, `title`      | Encrypted at rest in DB because filenames can leak PII/business context.                        |
| `metadata`               | Customer key-value metadata. No secrets, PAN, private keys, PII, raw KYC details.               |
| `hash.content_hash`      | Raw file byte hash. Only exposed when `visibility = public_verifiable` or caller is authorized. |
| `evidence.evidence_hash` | Ledger commitment hash. Always safe to expose.                                                  |
| `linked_objects`         | External Pillar IDs only. No Canton contract IDs.                                               |
| `trace.ledger_anchor`    | Pillar evidence reference ID, not Daml contract ID.                                             |

---

## 2. Purpose Enum

```text
rwa_proof
contract
settlement_evidence
claim_evidence
dispute_evidence
kyc_kyb_document
audit_attachment
tax_document
regulatory_report
other
```

### Purpose policy matrix

| Purpose               |       Default retention | Ledger content hash visibility         | Scan policy                                          | Download policy                    |
| --------------------- | ----------------------: | -------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| `rwa_proof`           |                 7 years | public or private by asset policy      | malware + DLP + type validation                      | authenticated + optional file_link |
| `contract`            | contract term + 7 years | private commitment default             | malware + DLP                                        | authenticated                      |
| `settlement_evidence` |                 7 years | public/verifiable for non-PII receipts | malware + DLP                                        | authenticated                      |
| `claim_evidence`      |   claim close + 7 years | private commitment                     | malware + DLP                                        | restricted                         |
| `dispute_evidence`    | dispute close + 7 years | private commitment                     | strict malware + PDF validation                      | restricted                         |
| `kyc_kyb_document`    |       regulatory policy | private commitment only                | strict malware + DLP + OCR/classification if enabled | compliance-only                    |
| `audit_attachment`    |            audit policy | private commitment                     | malware + DLP                                        | privileged-only                    |

---

## 3. Upload APIs

### 3.1 Multipart upload, Stripe-like

```http
POST /v1/files
Content-Type: multipart/form-data
Idempotency-Key: 3a6c3ef4-1d3e-4d45-89d2-f9d8c6a9e6c4
Pillar-Version: 2026-05-26
```

Form fields:

```text
file=@warehouse_receipt.pdf
purpose=rwa_proof
linked_object[object]=rwa_asset
linked_object[id]=rwa_01JZ8Y...
linked_object[role]=warehouse_receipt
metadata[issuer_reference]=wr-2026-042
metadata[asset_class]=commodity
hash_visibility=public_verifiable
```

Response:

```json
{
  "id": "file_...",
  "object": "file",
  "status": "processing",
  "evidence_status": "ledger_anchoring",
  "purpose": "rwa_proof",
  "created": 1782400000
}
```

Use this for small files and backend uploads.

---

### 3.2 Direct-to-storage upload session

#### Create session

```http
POST /v1/file_upload_sessions
Idempotency-Key: 7aa3...
```

```json
{
  "purpose": "contract",
  "filename": "master_agreement.pdf",
  "content_type": "application/pdf",
  "size": 2481220,
  "linked_object": {
    "object": "settlement",
    "id": "setl_...",
    "role": "master_agreement"
  },
  "metadata": {
    "agreement_type": "msa"
  }
}
```

Response:

```json
{
  "id": "fus_...",
  "object": "file_upload_session",
  "file": "file_...",
  "status": "requires_upload",
  "expires_at": 1782400900,
  "upload": {
    "method": "PUT",
    "url": "https://signed-upload-url...",
    "headers": {
      "Content-Type": "application/pdf",
      "x-pillar-file-id": "file_..."
    },
    "max_bytes": 104857600
  }
}
```

#### Confirm upload

```http
POST /v1/files/file_.../confirm
Idempotency-Key: 10fa...
```

```json
{
  "upload_session": "fus_...",
  "client_content_hash": "sha256:4b7c..."
}
```

Response:

```json
{
  "id": "file_...",
  "object": "file",
  "status": "scanning",
  "evidence_status": "unanchored"
}
```

Direct upload is preferred for browser/mobile and large files. The signed URL is short-lived, scoped to one object key, one content type, one max size, one tenant, and one file ID.

---

## 4. Retrieve / List Files

```http
GET /v1/files/file_...
```

Query options:

```text
expand[]=links
expand[]=linked_objects
expand[]=evidence_manifest
```

List:

```http
GET /v1/files?purpose=rwa_proof&linked_object=rwa_...&limit=25&starting_after=file_...
```

Cursor pagination follows Stripe-style `data`, `has_more`, `url`.

---

## 5. File Links / Signed URLs

### Create a download link

```http
POST /v1/file_links
Idempotency-Key: link-2026-05-26-001
```

```json
{
  "file": "file_...",
  "expires_at": 1782400900,
  "max_downloads": 1,
  "reason": "auditor_download",
  "metadata": {
    "audit_id": "aud_..."
  }
}
```

Response:

```json
{
  "id": "flink_...",
  "object": "file_link",
  "file": "file_...",
  "created": 1782400000,
  "expires_at": 1782400900,
  "expired": false,
  "revoked": false,
  "max_downloads": 1,
  "download_count": 0,
  "url": "https://files.pillar.example/l/..."
}
```

### Link policy

| Rule                        | Default                                                      |
| --------------------------- | ------------------------------------------------------------ |
| URL TTL                     | 15 minutes                                                   |
| Max TTL                     | 24 hours, unless account policy permits more                 |
| Public unauthenticated link | Disabled by default                                          |
| KYC/KYB link                | Not allowed unless compliance role + explicit policy         |
| Contract link               | Authenticated or one-time signed URL                         |
| Audit access                | Always logged                                                |
| URL storage                 | Never persist raw URL; store digest + issuance metadata only |

---

## 6. Link File to Object

### Attach an existing file

```http
POST /v1/files/file_.../attach
Idempotency-Key: attach-file-settlement-001
```

```json
{
  "object": "settlement",
  "id": "setl_...",
  "role": "settlement_confirmation"
}
```

Response:

```json
{
  "id": "file_...",
  "object": "file",
  "evidence_status": "attaching",
  "linked_objects": [
    {
      "object": "settlement",
      "id": "setl_...",
      "role": "settlement_confirmation",
      "status": "pending"
    }
  ]
}
```

The API returns before ledger completion if the attachment is async. Client observes final status through webhook:

```text
file.attached
evidence_reference.attached
settlement.evidence_attached
```

---

## 7. Evidence Manifest

Authorized callers can retrieve a manifest for independent verification.

```http
GET /v1/files/file_.../evidence_manifest
```

Response:

```json
{
  "object": "evidence_manifest",
  "file": "file_...",
  "manifest_version": "2026-05-26",
  "canonicalization": "jcs-rfc8785",
  "hash_algorithm": "sha256",
  "content_hash": "sha256:4b7c...",
  "metadata_hash": "sha256:b911...",
  "linkage_hash": "sha256:0c31...",
  "nonce": "base64url:...",
  "evidence_hash": "sha256:9ac1...",
  "ledger_anchor": "evref_..."
}
```

For KYC/KYB/private documents, `content_hash` and `nonce` are only returned to authorized compliance actors.

---

## 8. Webhook Events

### Event object

```json
{
  "id": "evt_...",
  "object": "event",
  "type": "file.verified",
  "api_version": "2026-05-26",
  "created": 1782400033,
  "livemode": false,
  "data": {
    "object": {
      "id": "file_...",
      "object": "file"
    }
  },
  "request": {
    "id": "req_...",
    "idempotency_key": "..."
  }
}
```

Pillar should default to **thin events**: event payload contains object ID and event type; client fetches latest object state. This avoids stale snapshots and simplifies API version upgrades.

### Event types

```text
file.created
file.upload_session.created
file.uploaded
file.scanning
file.verified
file.quarantined
file.rejected
file.ledger_anchor.created
file.attached
file.sealed
file.retention_updated
file.legal_hold_applied
file.legal_hold_released
file.expired
file.deleted
file_link.created
file_link.revoked
file_link.expired
file_link.downloaded
```

### Webhook delivery rules

* Events are at-least-once.
* Ordering is not guaranteed.
* Consumers must de-duplicate by `event.id`.
* Consumers must fetch current object state.
* Pillar signs webhooks with HMAC-SHA256 over raw body + timestamp.
* Endpoint versions are pinned at creation time.
* Webhook handlers should return 2xx quickly and process asynchronously.

---

## Internal Runtime

## 1. Services

| Service                      | Responsibility                                                  |
| ---------------------------- | --------------------------------------------------------------- |
| API Gateway                  | Auth, API versioning, idempotency, request IDs, rate limits     |
| File API Service             | File object lifecycle, metadata validation, response shaping    |
| Upload Session Service       | Creates storage key, signed upload URL, multipart session       |
| Storage Adapter              | S3/GCS/Azure/MinIO abstraction, object lock, tags, HEAD/GET/PUT |
| KMS Adapter                  | Envelope encryption, key selection, key rotation metadata       |
| File Verifier                | MIME sniffing, size check, hash calculation, malware scan, DLP  |
| Evidence Hash Service        | Constructs canonical manifest and evidence hash                 |
| Link Resolver                | External Pillar object ID → internal ledger target resolution   |
| Evidence Anchor Orchestrator | Submits Daml commands through Ledger API                        |
| Ledger Completion Consumer   | Tracks command completion/update ID                             |
| Projection Consumer          | Updates Pillar DB from ledger projection/PQS                    |
| Retention Engine             | Retain-until, legal hold, deletion/crypto-shredding workflows   |
| Webhook Outbox               | Event creation, signing, retries, delivery logs                 |
| Workbench API                | Request log, file trace, webhook replay, evidence inspector     |
| CLI / Sandbox Tools          | Local upload, event listen, fake ledger/storage bootstrap       |

---

## 2. Upload-to-Ledger Sequence

```text
1. Client calls POST /v1/file_upload_sessions.
2. Pillar creates file_... in upload_pending.
3. Pillar reserves object key:
   /env/{mode}/acct/{account_id}/files/{file_id}/blob
4. Pillar returns signed PUT URL.
5. Client uploads bytes to object storage.
6. Client calls /confirm or storage event triggers verifier.
7. Verifier reads object metadata and computes content_hash.
8. Scanner validates malware/DLP/type policy.
9. Evidence Hash Service creates canonical evidence manifest.
10. Evidence Anchor Orchestrator submits CreateEvidenceReference.
11. Canton Ledger commits EvidenceReference.
12. Completion consumer receives update_id.
13. Projection updates file.status=verified, evidence_status=anchored.
14. Webhook emits file.verified and file.ledger_anchor.created.
15. If linked_object was supplied, AttachEvidence command is submitted.
16. On completion, webhook emits file.attached.
```

---

## 3. Idempotency Strategy

Pillar uses two idempotency layers.

### API idempotency — primary

For every mutating request:

```text
idempotency_scope = account_id + mode + method + path + idempotency_key
request_fingerprint = sha256(canonical_request_params_without_file_bytes)
```

Rules:

1. Same key + same fingerprint returns same result.
2. Same key + different fingerprint returns `idempotency_key_reused_with_different_params`.
3. Upload binary body is not stored in idempotency records; store content hash if available.
4. Idempotency records live for 30 days by default.
5. Sensitive data must not be placed in idempotency keys.

### Ledger idempotency — secondary

```text
workflow_id = "file:" + file_id
command_id  = "cmd:" + sha256(account_id | method | path | idempotency_key | file_id)
```

Canton command deduplication is useful but cannot be the only control because it is participant-node scoped. Pillar therefore ensures idempotency before ledger submission.

---

## 4. Canton/Daml Model

### EvidencePurpose

```daml
data EvidencePurpose
  = RwaProof
  | Contract
  | SettlementEvidence
  | ClaimEvidence
  | DisputeEvidence
  | KycKybDocument
  | AuditAttachment
  | RegulatoryReport
  | Other
```

### ExternalRef

```daml
data ExternalRef = ExternalRef
  with
    objectType : Text
    objectId   : Text
    role       : Text
```

### EvidenceReference

```daml
template EvidenceReference
  with
    operator        : Party
    evidenceOwner   : Party
    observers       : [Party]

    evidenceId      : Text
    fileId          : Text
    purpose         : EvidencePurpose

    hashAlgorithm   : Text
    hashVisibility  : Text
    evidenceHash    : Text
    contentHash     : Optional Text
    metadataHash    : Text
    linkageHash     : Optional Text

    retentionPolicy : Text
    retainUntil     : Optional Time
    legalHold       : Bool

    linkedRefs      : [ExternalRef]
    createdAt       : Time
    sealed          : Bool
  where
    signatory operator
    observer evidenceOwner, observers

    choice AttachEvidence : ContractId EvidenceAttachment
      with
        targetObjectType : Text
        targetObjectId   : Text
        role             : Text
      controller operator
      do
        create EvidenceAttachment
          with
            operator = operator
            evidenceOwner = evidenceOwner
            observers = observers
            evidenceId = evidenceId
            fileId = fileId
            targetObjectType = targetObjectType
            targetObjectId = targetObjectId
            role = role
            evidenceHash = evidenceHash
            attachedAt = createdAt

    choice Seal : ContractId EvidenceReference
      controller operator
      do
        create this with sealed = True
```

### EvidenceAttachment

```daml
template EvidenceAttachment
  with
    operator         : Party
    evidenceOwner    : Party
    observers        : [Party]

    evidenceId       : Text
    fileId           : Text
    targetObjectType : Text
    targetObjectId   : Text
    role             : Text
    evidenceHash     : Text
    attachedAt       : Time
  where
    signatory operator
    observer evidenceOwner, observers
```

### EvidenceBundle

Used for settlement packages, disputes, audits.

```daml
template EvidenceBundle
  with
    operator       : Party
    owner          : Party
    bundleId       : Text
    purpose        : Text
    evidenceIds    : [Text]
    evidenceHashes : [Text]
    merkleRoot     : Text
    createdAt      : Time
  where
    signatory operator
    observer owner
```

### Ledger privacy rule

| Use case         | Ledger hash                                            |
| ---------------- | ------------------------------------------------------ |
| Public RWA proof | `contentHash` optional visible + `evidenceHash`        |
| Private contract | `evidenceHash`; `contentHash = None` unless authorized |
| KYC/KYB          | `evidenceHash` only                                    |
| Claim/dispute    | `evidenceHash`, optional private disclosure package    |
| Audit attachment | `evidenceHash`, optional daily audit Merkle root       |

---

## 5. Evidence Hash Strategy

### Hashes

```text
content_hash  = sha256(raw_file_bytes)
metadata_hash = sha256(JCS(public_or_allowed_metadata_subset))
linkage_hash  = sha256(JCS(sorted_linkage_refs))
```

### Evidence manifest preimage

```json
{
  "object": "pillar.evidence_manifest",
  "version": "2026-05-26",
  "file": {
    "id": "file_...",
    "purpose": "rwa_proof",
    "content_hash": "sha256:4b7c...",
    "size": 842912,
    "content_type": "application/pdf"
  },
  "metadata_hash": "sha256:b911...",
  "linkage_hash": "sha256:0c31...",
  "retention": {
    "policy": "rwa_evidence_7y",
    "retain_until": 2000000000
  },
  "nonce": "base64url:32_random_bytes"
}
```

```text
evidence_hash = sha256(JCS(evidence_manifest_preimage))
```

### Why nonce exists

Raw file hashes can leak information when a file is guessable or commonly reused. For example, a known PDF template or public certificate could be hash-compared by an observer. Pillar therefore supports:

| Mode                 | Ledger stores                    | Verification model                          |
| -------------------- | -------------------------------- | ------------------------------------------- |
| `public_verifiable`  | `content_hash` + `evidence_hash` | Anyone with file can verify                 |
| `private_commitment` | `evidence_hash` only             | Authorized party receives manifest preimage |
| `regulated_private`  | `evidence_hash` + policy marker  | Compliance-only disclosure                  |

### Evidence bundle hash

For multi-file evidence packages:

```text
leaf_i = evidence_hash_i
merkle_root = merkle_root(sort_by(evidence_id, leaf_i))
```

The bundle root is ledger-anchored. Individual files can remain private.

---

## DB Schema

Pillar DB is **not the source of truth** for evidence state. It stores operational state, storage pointers, projection, audit, config, and webhook delivery state.

## 1. `files`

```sql
CREATE TABLE files (
  id                       TEXT PRIMARY KEY,
  object                   TEXT NOT NULL DEFAULT 'file',
  account_id               TEXT NOT NULL,
  livemode                 BOOLEAN NOT NULL,

  purpose                  TEXT NOT NULL,
  status                   TEXT NOT NULL,
  evidence_status          TEXT NOT NULL,

  filename_enc             BYTEA,
  title_enc                BYTEA,
  content_type             TEXT,
  file_type                TEXT,
  size_bytes               BIGINT,

  content_hash_sha256      TEXT,
  evidence_hash            TEXT,
  metadata_hash            TEXT,
  linkage_hash             TEXT,
  hash_visibility          TEXT NOT NULL DEFAULT 'private_commitment',

  storage_provider         TEXT NOT NULL,
  storage_bucket_enc       BYTEA NOT NULL,
  storage_key_enc          BYTEA NOT NULL,
  storage_object_version   TEXT,
  storage_region           TEXT,

  kms_key_ref              TEXT NOT NULL,
  encrypted_dek            BYTEA,
  encryption_scheme        TEXT NOT NULL,

  retention_policy_id      TEXT,
  retain_until             TIMESTAMPTZ,
  legal_hold               BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at               TIMESTAMPTZ,

  created_by               TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL,
  updated_at               TIMESTAMPTZ NOT NULL,
  deleted_at               TIMESTAMPTZ,

  ledger_anchor_id         TEXT,
  ledger_anchor_status     TEXT,
  ledger_update_id         TEXT,
  ledger_offset            TEXT,
  ledger_projected_at      TIMESTAMPTZ,

  request_id               TEXT,
  operation_id             TEXT
);
```

## 2. `file_upload_sessions`

```sql
CREATE TABLE file_upload_sessions (
  id                    TEXT PRIMARY KEY,
  file_id               TEXT NOT NULL REFERENCES files(id),
  account_id            TEXT NOT NULL,
  status                TEXT NOT NULL,

  upload_method         TEXT NOT NULL,
  multipart_upload_id   TEXT,
  expected_size_bytes   BIGINT,
  expected_content_type TEXT,
  expected_hash_sha256  TEXT,

  signed_request_digest TEXT,
  expires_at            TIMESTAMPTZ NOT NULL,

  created_by            TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  confirmed_at          TIMESTAMPTZ
);
```

## 3. `file_links`

```sql
CREATE TABLE file_links (
  id                    TEXT PRIMARY KEY,
  file_id               TEXT NOT NULL REFERENCES files(id),
  account_id            TEXT NOT NULL,
  status                TEXT NOT NULL,

  expires_at            TIMESTAMPTZ NOT NULL,
  revoked_at            TIMESTAMPTZ,
  max_downloads         INTEGER,
  download_count        INTEGER NOT NULL DEFAULT 0,

  reason                TEXT,
  scope                 JSONB NOT NULL,
  signed_url_digest     TEXT,

  created_by            TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  last_accessed_at      TIMESTAMPTZ
);
```

## 4. `file_object_links`

```sql
CREATE TABLE file_object_links (
  id                    TEXT PRIMARY KEY,
  file_id               TEXT NOT NULL REFERENCES files(id),
  account_id            TEXT NOT NULL,

  object_type           TEXT NOT NULL,
  object_id             TEXT NOT NULL,
  role                  TEXT NOT NULL,
  status                TEXT NOT NULL,

  ledger_attachment_id  TEXT,
  ledger_update_id      TEXT,
  ledger_offset         TEXT,

  created_by            TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL
);
```

## 5. `evidence_anchors`

```sql
CREATE TABLE evidence_anchors (
  id                    TEXT PRIMARY KEY,
  file_id               TEXT NOT NULL REFERENCES files(id),
  account_id            TEXT NOT NULL,

  evidence_hash         TEXT NOT NULL,
  content_hash_sha256   TEXT,
  metadata_hash         TEXT,
  linkage_hash          TEXT,

  manifest_enc          BYTEA,
  manifest_version      TEXT NOT NULL,

  ledger_workflow_id    TEXT NOT NULL,
  ledger_command_id     TEXT NOT NULL,
  ledger_update_id      TEXT,
  ledger_offset         TEXT,
  ledger_contract_ref   TEXT,

  status                TEXT NOT NULL,
  submitted_at          TIMESTAMPTZ,
  anchored_at           TIMESTAMPTZ
);
```

## 6. `file_scan_results`

```sql
CREATE TABLE file_scan_results (
  id                    TEXT PRIMARY KEY,
  file_id               TEXT NOT NULL REFERENCES files(id),
  scanner               TEXT NOT NULL,
  result                TEXT NOT NULL,
  details_enc           BYTEA,
  policy_version        TEXT NOT NULL,
  scanned_at            TIMESTAMPTZ NOT NULL
);
```

## 7. `retention_policies`

```sql
CREATE TABLE retention_policies (
  id                    TEXT PRIMARY KEY,
  account_id            TEXT NOT NULL,
  purpose               TEXT NOT NULL,
  retention_days        INTEGER NOT NULL,
  disposition           TEXT NOT NULL,
  object_lock_mode      TEXT,
  legal_hold_default    BOOLEAN NOT NULL DEFAULT FALSE,
  config_version        INTEGER NOT NULL,
  active                BOOLEAN NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL
);
```

## 8. `idempotency_records`

```sql
CREATE TABLE idempotency_records (
  account_id            TEXT NOT NULL,
  livemode              BOOLEAN NOT NULL,
  method                TEXT NOT NULL,
  path                  TEXT NOT NULL,
  idempotency_key       TEXT NOT NULL,
  request_fingerprint   TEXT NOT NULL,
  response_status       INTEGER,
  response_body_enc     BYTEA,
  operation_id          TEXT,
  created_at            TIMESTAMPTZ NOT NULL,
  expires_at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, livemode, method, path, idempotency_key)
);
```

## 9. `webhook_events` and `webhook_deliveries`

```sql
CREATE TABLE webhook_events (
  id                    TEXT PRIMARY KEY,
  account_id            TEXT NOT NULL,
  type                  TEXT NOT NULL,
  api_version           TEXT NOT NULL,
  object_type           TEXT NOT NULL,
  object_id             TEXT NOT NULL,
  payload               JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL
);

CREATE TABLE webhook_deliveries (
  id                    TEXT PRIMARY KEY,
  event_id              TEXT NOT NULL REFERENCES webhook_events(id),
  endpoint_id           TEXT NOT NULL,
  status                TEXT NOT NULL,
  attempt_count         INTEGER NOT NULL DEFAULT 0,
  last_status_code      INTEGER,
  next_retry_at         TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL
);
```

---

## Failure Modes

| Failure                   | Example                                          | System behavior                                                                                       |
| ------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Upload URL expired        | Client uploads after TTL                         | Return `upload_session_expired`; allow session renewal without changing `file_id` if no object exists |
| Incomplete upload         | Object missing or size mismatch                  | `file.status = upload_failed`; emit `file.rejected`                                                   |
| Hash mismatch             | Client hash differs from computed hash           | Quarantine; do not anchor; emit `file.rejected`                                                       |
| MIME spoofing             | PDF extension but executable content             | Reject or quarantine                                                                                  |
| Malware detected          | Scanner positive                                 | `file.status = quarantined`; no download; no ledger attachment unless compliance override             |
| DLP violation             | PII in metadata or prohibited content class      | Strip/reject metadata; quarantine file depending policy                                               |
| Object storage outage     | PUT/HEAD/GET unavailable                         | Retry; preserve idempotency; file remains `upload_pending` or `scanning`                              |
| KMS unavailable           | Cannot encrypt/decrypt DEK                       | Fail closed; no signed URL issuance                                                                   |
| Ledger command rejected   | Invalid party/authorization/target archived      | `evidence_status = anchor_failed`; repair queue                                                       |
| Ledger completion delayed | Command submitted but no completion observed     | `ledger_anchoring`; reconciliation worker queries completion/projection                               |
| Duplicate API retry       | Client retries after network failure             | Idempotency returns same File object                                                                  |
| Idempotency misuse        | Same key, different params                       | Return `400 idempotency_key_reused_with_different_params`                                             |
| Participant mismatch      | Canton dedupe not guaranteed across participants | API idempotency prevents duplicate commands before submission                                         |
| Link target missing       | `rwa_asset` not found                            | Create file but attachment fails; emit `file.verified`, then `file.attach_failed`                     |
| Retention conflict        | Delete requested before retain_until             | Return `retention_policy_violation`                                                                   |
| Legal hold active         | Delete requested during hold                     | Return `legal_hold_active`                                                                            |
| Signed URL leakage        | Link copied externally                           | Short TTL, max downloads, revocation, access log, optional auth-bound link                            |
| Webhook duplicate         | Same event delivered twice                       | Consumer dedupes by `event.id`; Pillar delivery remains at-least-once                                 |
| Webhook out of order      | `file.attached` before `file.verified`           | Consumer fetches latest File object                                                                   |
| Privacy leak via hash     | Known document hash correlation                  | Use `private_commitment` with nonce for sensitive docs                                                |
| DB projection lag         | Ledger committed but API shows pending           | Read-through ledger/PQS reconciliation; Workbench displays projection freshness                       |

---

## Security / Compliance

## 1. Data Classification

| Class                 | Examples                                         | Storage                                      | Ledger                                   |
| --------------------- | ------------------------------------------------ | -------------------------------------------- | ---------------------------------------- |
| Public evidence       | Public RWA certificate, published registry proof | Encrypted object                             | `content_hash` + `evidence_hash` allowed |
| Confidential business | Contract, settlement memo, invoice               | Encrypted object + restricted ACL            | `evidence_hash` only by default          |
| Regulated identity    | Passport, beneficial owner doc, KYB registration | Strict encrypted storage + compliance access | private commitment only                  |
| Audit privileged      | Manual approval evidence, exception report       | Restricted encrypted storage                 | digest/bundle anchor                     |

## 2. Encryption

### At rest

* Object storage encryption is mandatory.
* Default: provider SSE-KMS.
* Regulated/private documents: application envelope encryption.
* Per-file DEK encrypted by tenant/region/purpose KMS KEK.
* Store only `encrypted_dek`, `kms_key_ref`, `key_version`.
* Rotate KEKs by rewrapping DEKs; do not rewrite file bytes unless required.
* Compute `content_hash` over plaintext bytes before encryption.

### In transit

* API and signed URL access require HTTPS.
* Internal service-to-service traffic uses mTLS where possible.
* Ledger API connections use TLS/JWT/mTLS according to deployment profile.

### Customer-managed keys

For enterprise tenants:

```text
account.encryption.mode = customer_managed_kms
account.encryption.kms_key_ref = cloud/provider/key-id
```

If customer key is disabled:

* existing files become inaccessible,
* ledger evidence references remain intact,
* API returns `file_key_unavailable`.

## 3. Metadata Security

Rules:

1. No PII in metadata.
2. No bank account/card/PAN/private key/secret in metadata.
3. Filenames are treated as sensitive.
4. Metadata used in `evidence_hash` is a sanitized allowlist.
5. Full metadata is encrypted in DB if policy requires.
6. Object storage tags contain only low-risk operational values:

   * `pillar_file_id`
   * `account_id_hash`
   * `purpose`
   * `retention_policy`
   * `livemode`

## 4. Access Control

### Roles

```text
file.reader
file.uploader
file.link_creator
file.compliance_reader
file.audit_reader
file.retention_admin
file.legal_hold_admin
file.delete_admin
```

### Authorization dimensions

| Dimension            | Use                                                               |
| -------------------- | ----------------------------------------------------------------- |
| Account/tenant       | Hard isolation                                                    |
| Mode                 | live vs sandbox/test                                              |
| Purpose              | KYC docs require compliance role                                  |
| Linked object        | User must have access to target RWA/settlement/claim              |
| Retention/legal hold | Delete/release requires privileged role                           |
| Region               | Data residency enforcement                                        |
| File status          | Quarantined files are not downloadable except compliance workflow |

## 5. Privacy by Design

* Ledger stores no file bytes.
* Ledger stores no raw KYC/KYB details.
* Ledger metadata is minimized.
* Sensitive evidence uses salted commitments.
* File access is purpose-bound and logged.
* Download links are short-lived and revocable.
* Bulk exports require explicit job, audit reason, and elevated role.
* Deletion follows retention policy; if legal retention blocks erasure, return a compliance reason and create a tombstone/erasure request record.

## 6. Audit

Every sensitive operation writes:

```json
{
  "actor": "user_...",
  "account": "acct_...",
  "operation": "file_link.created",
  "file": "file_...",
  "reason": "auditor_download",
  "request_id": "req_...",
  "ip": "203.0.113.10",
  "user_agent_hash": "sha256:...",
  "created": 1782400000
}
```

Audit strategy:

1. API audit log in append-only DB.
2. Privileged operation digest batched into daily Merkle root.
3. Daily audit root anchored to Canton Ledger as `AuditDigest`.
4. Workbench shows request → file → evidence anchor → webhook trace.

---

## Implementation Plan

## Phase 0 — API Grammar and Policy Foundation

Deliverables:

* `File` object schema
* `FileLink` object schema
* `FileUploadSession` schema
* purpose enum
* retention policy enum/config
* error object grammar
* idempotency middleware
* request IDs
* OpenAPI spec
* SDK generation baseline

Acceptance criteria:

* API grammar is stable enough for SDK generation.
* All mutating endpoints support `Idempotency-Key`.
* API version header is accepted and logged.
* Metadata validation rejects prohibited keys/patterns.

---

## Phase 1 — Storage Plane MVP

Deliverables:

* S3-compatible storage adapter
* MinIO sandbox adapter
* encrypted object upload
* signed upload URL
* signed download URL
* file link object
* object version capture
* object tags
* filename/title encryption in DB

Acceptance criteria:

* Direct upload session works.
* Multipart `POST /v1/files` works.
* Download is impossible without authorization or valid file link.
* Raw signed URLs are not persisted.
* Upload URL cannot be reused for another file ID.

---

## Phase 2 — Verification Pipeline

Deliverables:

* MIME/type validation
* size validation
* SHA-256 content hash
* RFC 8785/JCS metadata canonicalization
* evidence manifest generation
* malware scanner integration
* DLP/classification hook
* quarantine workflow

Acceptance criteria:

* Invalid MIME and hash mismatch fail closed.
* Quarantined file cannot be linked or downloaded.
* Evidence hash is deterministic from manifest preimage.
* Private commitment mode hides raw content hash from unauthorized users.

---

## Phase 3 — Canton Evidence Anchoring

Deliverables:

* Daml `EvidenceReference`
* Daml `EvidenceAttachment`
* Daml `EvidenceBundle`
* Ledger command submitter
* command ID/workflow ID mapping
* completion consumer
* projection updater
* Workbench ledger trace view

Acceptance criteria:

* Verified file creates `EvidenceReference`.
* File attached to RWA/settlement/claim creates ledger attachment.
* API object reaches `evidence_status=anchored`.
* `ledger_update_id` and `operation_id` are correlated internally.
* External API remains Canton-invisible.

---

## Phase 4 — Retention / Legal Hold

Deliverables:

* retention policy engine
* object lock integration
* legal hold apply/release
* deletion/tombstone workflow
* crypto-shredding workflow where legally permitted
* retention webhooks

Acceptance criteria:

* Delete before `retain_until` is blocked.
* Legal hold blocks deletion regardless of retention date.
* Retention policy snapshot is included in evidence hash.
* Object lock configuration is verified in storage adapter health checks.

---

## Phase 5 — Webhooks, SDK, CLI, Workbench

Deliverables:

* webhook event outbox
* HMAC webhook signing
* webhook endpoint API
* retry and delivery logs
* `pillar listen`
* `pillar files upload`
* `pillar file-links create`
* Workbench request/file/evidence/event views
* Sandbox bootstrap

Acceptance criteria:

* CLI can upload file and listen for `file.verified`.
* Workbench can replay webhook events.
* Sandbox separates storage, keys, ledger, and API mode from live.
* SDK supports typed File object and webhook signature verification.

---

## Phase 6 — Compliance Hardening

Deliverables:

* data residency controls
* customer-managed keys
* compliance reader role
* audit digest ledger anchoring
* DLP policy packs
* privileged access workflow
* export controls
* regulator/auditor access mode

Acceptance criteria:

* KYC/KYB docs are compliance-only by default.
* Audit access is logged and digest-anchored.
* Customer key disablement blocks file read but preserves ledger evidence.
* Region mismatch blocks upload/download.

---

## Open Questions

1. **Public verifiability policy**
   Which RWA asset classes require public `content_hash` on ledger, and which require private commitments only?

2. **KYC/KYB retention jurisdiction matrix**
   Retention periods differ by jurisdiction. Pillar needs a policy table by tenant, region, document type, and regulatory regime.

3. **Object storage provider default**
   AWS S3 + SSE-KMS is the default candidate, but enterprise deployments may require GCS, Azure Blob, or on-prem S3-compatible storage.

4. **DLP scope**
   Should DLP be metadata-only initially, or include OCR/content extraction for PDFs/images?

5. **Ledger anchoring granularity**
   Should every file access be ledger-anchored, or should read-access audit logs be batched into daily Merkle roots to avoid privacy leakage and ledger load?

6. **EvidenceReference signatories**
   For each purpose, decide whether `operator`, `asset issuer`, `custodian`, `customer`, `compliance party`, or `regulator` should be signatory/observer.

7. **File versioning semantics**
   Should “replace file” always create a new `file_...`, or should Pillar expose `file_revision` under one logical document?

8. **Sandbox parity**
   How much malware/DLP behavior should sandbox simulate versus bypass?

9. **Disclosure package format**
   For private commitments, define how authorized parties receive `content_hash`, nonce, manifest preimage, and verification instructions.

10. **Legal erasure vs ledger immutability**
    Define official policy for GDPR-style erasure requests where ledger evidence hash remains but file bytes are deleted or crypto-shredded.

---

## Agent-ready Checklist

### API

* [ ] Define `File` object schema.
* [ ] Define `FileUploadSession` object schema.
* [ ] Define `FileLink` object schema.
* [ ] Define `EvidenceManifest` schema.
* [ ] Implement `POST /v1/files` multipart upload.
* [ ] Implement `POST /v1/file_upload_sessions`.
* [ ] Implement `POST /v1/files/{id}/confirm`.
* [ ] Implement `GET /v1/files/{id}`.
* [ ] Implement `GET /v1/files`.
* [ ] Implement `POST /v1/file_links`.
* [ ] Implement `POST /v1/file_links/{id}/revoke`.
* [ ] Implement `POST /v1/files/{id}/attach`.
* [ ] Implement `GET /v1/files/{id}/evidence_manifest`.
* [ ] Add `Pillar-Version` handling.
* [ ] Add `Idempotency-Key` middleware.
* [ ] Add Stripe-like error object grammar.

### Storage

* [ ] Build S3-compatible storage adapter.
* [ ] Add MinIO adapter for sandbox.
* [ ] Add signed upload URL generation.
* [ ] Add signed download URL generation.
* [ ] Add object tags.
* [ ] Add object version capture.
* [ ] Add object lock/retention capability check.
* [ ] Ensure raw signed URLs are never persisted.

### Security

* [ ] Encrypt filename/title/storage key fields.
* [ ] Integrate KMS envelope encryption.
* [ ] Implement per-purpose access policy.
* [ ] Implement KYC/KYB compliance-only access.
* [ ] Implement file link max downloads and expiry.
* [ ] Add webhook HMAC signing.
* [ ] Add audit log for every download/link creation.
* [ ] Add privileged access reason requirement.
* [ ] Add metadata sensitive-data rejection.

### Verification

* [ ] Compute plaintext SHA-256 content hash.
* [ ] Implement RFC 8785/JCS canonicalization for evidence manifest.
* [ ] Compute metadata hash.
* [ ] Compute linkage hash.
* [ ] Compute evidence hash.
* [ ] Add nonce/private commitment mode.
* [ ] Integrate malware scanner.
* [ ] Add DLP hook.
* [ ] Add MIME sniffing.
* [ ] Add PDF/Office validation policy.
* [ ] Implement quarantine status.

### Canton Runtime

* [ ] Define Daml `EvidenceReference`.
* [ ] Define Daml `EvidenceAttachment`.
* [ ] Define Daml `EvidenceBundle`.
* [ ] Add `CreateEvidenceReference` command flow.
* [ ] Add `AttachEvidence` command flow.
* [ ] Map `file_id` to `workflow_id`.
* [ ] Map idempotency key to ledger `command_id`.
* [ ] Implement completion consumer.
* [ ] Implement projection updater.
* [ ] Hide Canton IDs from default external API response.
* [ ] Add internal ledger trace expansion for Workbench.

### Retention

* [ ] Define retention policy table.
* [ ] Add purpose → retention policy resolver.
* [ ] Include retention snapshot in evidence manifest.
* [ ] Implement legal hold apply/release.
* [ ] Implement delete/tombstone workflow.
* [ ] Implement crypto-shredding where legally allowed.
* [ ] Add retention transition webhooks.

### Webhooks

* [ ] Define thin event format.
* [ ] Add `file.created`.
* [ ] Add `file.uploaded`.
* [ ] Add `file.verified`.
* [ ] Add `file.quarantined`.
* [ ] Add `file.ledger_anchor.created`.
* [ ] Add `file.attached`.
* [ ] Add `file.retention_updated`.
* [ ] Add `file.deleted`.
* [ ] Add `file_link.created`.
* [ ] Add `file_link.revoked`.
* [ ] Add delivery retry scheduler.
* [ ] Add event de-duplication guidance in docs.

### SDK / CLI / Workbench / Sandbox

* [ ] Generate Node SDK.
* [ ] Generate Python SDK.
* [ ] Generate Java SDK.
* [ ] Generate Go SDK.
* [ ] Generate .NET SDK.
* [ ] Add webhook signature helper.
* [ ] Implement `pillar files upload`.
* [ ] Implement `pillar file-links create`.
* [ ] Implement `pillar listen`.
* [ ] Implement `pillar events resend`.
* [ ] Build Workbench File inspector.
* [ ] Build Workbench Evidence trace view.
* [ ] Build Sandbox with local Canton sandbox + MinIO + fake scanner.
* [ ] Add sandbox API keys and separate object namespace.

### Compliance

* [ ] Define KYC/KYB document access policy.
* [ ] Define data residency constraints.
* [ ] Define customer-managed key flow.
* [ ] Define audit digest ledger anchoring.
* [ ] Define regulator/auditor access mode.
* [ ] Define erasure-vs-retention decision tree.
* [ ] Define disclosure package format for private commitments.

[1]: https://docs.stripe.com/api/files "docs.stripe.com"
[2]: https://docs.digitalasset.com/build/3.5/quickstart/configure/project-structure-overview.html "Canton Network quickstart project structure — Digital Asset’s platform documentation"
[3]: https://docs.stripe.com/api/files/object?lang=ruby&lang%29=&utm_source=chatgpt.com "The File object | Stripe API Reference"
[4]: https://docs.stripe.com/api/files/create "docs.stripe.com"
[5]: https://docs.stripe.com/api/file_links/object "docs.stripe.com"
[6]: https://docs.stripe.com/api/metadata?utm_source=chatgpt.com "Metadata | Stripe API Reference"
[7]: https://docs.stripe.com/api/idempotent_requests "docs.stripe.com"
[8]: https://docs.stripe.com/api-v2-overview "docs.stripe.com"
[9]: https://docs.stripe.com/webhooks "docs.stripe.com"
[10]: https://docs.stripe.com/api/versioning "docs.stripe.com"
[11]: https://docs.stripe.com/sdks/versioning "docs.stripe.com"
[12]: https://docs.stripe.com/sdks/server-side?utm_source=chatgpt.com "Introduction to server-side SDKs"
[13]: https://docs.stripe.com/stripe-cli "docs.stripe.com"
[14]: https://docs.stripe.com/sandboxes "docs.stripe.com"
[15]: https://docs.digitalasset.com/build/3.4/explanations/json-api/index.html "JSON Ledger API Service V2 — Digital Asset’s platform documentation"
[16]: https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html "gRPC Ledger API Reference — Digital Asset’s platform documentation"
[17]: https://docs.digitalasset.com/build/3.5/explanations/ledger-api-services.html "The gRPC Ledger API Services — Digital Asset’s platform documentation"
[18]: https://docs.digitalasset.com/build/3.5/explanations/parties-users.html "Parties and users on a Canton ledger — Digital Asset’s platform documentation"
[19]: https://docs.digitalasset.com/build/3.5/component-howtos/application-development/dpm-sandbox.html?utm_source=chatgpt.com "Sandbox — Digital Asset's platform documentation"
[20]: https://docs.digitalasset.com/build/3.5/component-howtos/daml-shell/index.html "Daml Shell — Digital Asset’s platform documentation"
[21]: https://docs.digitalasset.com/overview/3.4/explanations/canton/security.html "Cryptographic keys in Canton — Digital Asset’s platform documentation"
[22]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html?utm_source=chatgpt.com "Download and upload objects with presigned URLs"
[23]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html?utm_source=chatgpt.com "Using server-side encryption with Amazon S3 managed ..."
[24]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html?utm_source=chatgpt.com "Locking objects with Object Lock"
[25]: https://csrc.nist.gov/pubs/fips/180-4/upd1/final?utm_source=chatgpt.com "FIPS 180-4, Secure Hash Standard (SHS) | CSRC"
