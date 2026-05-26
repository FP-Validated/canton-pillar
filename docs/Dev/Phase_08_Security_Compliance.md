# Phase 08 — Security / Compliance

> Production deployment is gated until Pillar can prove scoped API authentication, ledger-safe compliance workflow advancement, audit-grade traceability, and evidence-grade file handling without exposing Canton internals or PII.

## 1. Executive Summary

Phase 08 implements the security and compliance production gate for Pillar, the Stripe for Canton-backed assets.

This phase maps to M8 in [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md#security--compliance), but is separated as its own development phase because no production deploy may proceed until authentication, audit, compliance, and evidence controls pass in staging.

Core architecture references:

| Reference                                                                                               | Implemented here                                                                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [12 Security / Keys / AuthZ](../Architecture/12_Security.md)                                            | API key lifecycle, bearer auth, scoped keys, JWT/mTLS to participant, credential storage  |
| [19 Compliance / Risk / Policy Engine](../Architecture/19_Compliance.md)                                | KYC/AML hooks, compliance decisions, off-ledger decision to ledger workflow advancement   |
| [20 Files / Documents / Evidence](../Architecture/20_Files%20Documents%20Evidence.md)                   | evidence file object-storage references, no blobs in DB or ledger, evidence hash handling |
| [11 Request Logs / Ledger Trace / Audit](../Architecture/11.Request%20Logs%20Ledger%20Trace%20Audit.md) | request-to-ledger audit spine and audit log enrichment                                    |
| [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)                                   | M8 acceptance: API keys, JWT/mTLS, audit, compliance adapter; staging auth profile pass   |

Phase 08 turns the previous public API, ledger-command, projection, webhook, and SDK phases into a production-control surface:

1. Canton Ledger remains the source of truth for asset state and workflow finality.
2. Pillar DB stores only Projection / Audit / Config.
3. External API remains Stripe-like and Canton-invisible.
4. Internal runtime remains Canton-native.
5. Every operation is ledger-traceable.
6. Balance/Holding-first APIs are preserved; no contract-first leakage.
7. Intent-first workflow is preserved; compliance advances intents, not raw transactions.
8. Webhook-first async workflow remains the customer notification model; webhook signing is owned by Phase 06.
9. API grammar remains Stripe-grade from day one.
10. Deployment model may change, but `/v1` grammar must not.

The phase is not a generic compliance product. It wires the minimum production controls required for regulated Canton-backed asset issuance and movement:

```text
API key lifecycle
  -> bearer auth middleware
  -> scoped authorization and rate limits
  -> audit log enrichment
  -> compliance adapter decision ingestion
  -> ledger-command workflow advancement
  -> evidence file reference persistence
  -> staging auth profile verification
```

The design rule is strict:

> Off-ledger systems may decide or attest. Canton/Daml must enforce asset-state transitions.

## 2. Goals / Non-goals

### Goals

| Goal                         | Requirement                                                                                                                 | Architecture source                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| API key lifecycle            | `/v1/api_keys` create/list/revoke; secret returned once; full and restricted keys                                           | [12 Security](../Architecture/12_Security.md)                                                           |
| Scoped bearer authentication | Server API accepts `Authorization: Bearer <key>` and resolves tenant, mode, principal, scopes, constraints                  | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md#security--compliance)              |
| Secure key storage           | Store only hashed API key secrets; keep prefix, last4, status, mode, scopes, metadata                                       | [12 Security](../Architecture/12_Security.md)                                                           |
| Rate limiting                | Token buckets at tenant, key, and endpoint levels                                                                           | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md#security--compliance)              |
| JWT/mTLS to participant      | Ledger API client uses JWT; staging/prod participant connections use mTLS                                                   | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md#security--compliance)              |
| Audit enrichment             | Every request has request_id, trace_id, operation_id when applicable, auth principal, policy decision, ledger command trace | [11 Request Logs / Ledger Trace / Audit](../Architecture/11.Request%20Logs%20Ledger%20Trace%20Audit.md) |
| Compliance adapter           | KYC/AML/sanctions/risk result is persisted and advances Daml workflow through ledger-command                                | [19 Compliance](../Architecture/19_Compliance.md)                                                       |
| Evidence references          | Store object-storage references and evidence metadata; actual blobs stay in S3/GCS/Azure Blob/MinIO                         | [20 Files / Documents / Evidence](../Architecture/20_Files%20Documents%20Evidence.md)                   |
| Data minimization            | No PII in metadata, Daml templates, audit payloads, request logs, or ledger-visible evidence payloads                       | [20 Files / Documents / Evidence](../Architecture/20_Files%20Documents%20Evidence.md)                   |
| Production gate              | Staging auth profile passes; compliance mock advances issue intent; audit log captures full trace                           | [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md#milestone-plan)                    |

### Non-goals

| Non-goal                                           | Reason                                                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| New public asset objects                           | Phase 08 secures existing object model; it does not create new customer-facing asset resources.                                   |
| Raw Canton auth proxy                              | External customers never receive Ledger API, party, template, contract, command, participant, synchronizer, or offset primitives. |
| Legal advice engine                                | KYC/AML adapter records external/vendor decisions and policy outcomes; it does not interpret law.                                 |
| KYC vendor replacement                             | Pillar stores decision/evidence references and workflow state, not identity verification/liveness vendor logic.                   |
| Webhook signing implementation                     | `Pillar-Signature` was implemented in Phase 06; Phase 08 links to and depends on it.                                              |
| File blob storage in DB/ledger                     | DB stores object-storage references only; ledger stores evidence references/hashes only.                                          |
| Omnibus secret key default                         | Restricted keys are the production default; full secret keys are controlled server-side legacy/root integration credentials.      |
| Storing raw sensitive payloads in audit            | Audit stores masked snapshots, hashes, IDs, and reason codes, not PII or secret bodies.                                           |
| Making DB authoritative for compliance enforcement | DB stores decision records; ledger/Daml enforces material asset transition constraints.                                           |

## 3. Architecture

### Trust boundary diagram

```text
External customer system
  - Holds: API key secret returned once, Idempotency-Key, optional SDK config
  - Must not hold: Canton party IDs, Daml contract IDs, participant JWTs, mTLS private keys
        |
        | HTTPS /v1
        | Authorization: Bearer rk_live_...
        | Pillar-Version, Idempotency-Key, traceparent
        v
Pillar API edge / apps/api
  - Holds: key verification pepper via secret manager, public config, rate-limit counters
  - Writes: request log shell, audit shell, auth decision, idempotency lock
  - Enforces: TLS, bearer auth, scopes, tenant/mode routing, metadata redaction, rate limits
        |
        | internal service auth
        v
Pillar DB
  - Holds: Projection / Audit / Config only
  - Config: api_keys hashes, scopes, tenant/account/mode, party mappings
  - Audit: api_requests, audit_log, compliance_decisions, operation trace IDs
  - Evidence: object-storage references and hashes, never file bytes
  - Must not hold: raw API key secret, raw KYC PII, private ledger credentials
        |
        | command request / workflow advancement
        v
services/ledger-command
  - Holds: ledger client JWT issuer/access token material via secret manager
  - Holds: mTLS client cert/key mounted from runtime secret store
  - Reads: party mapping, operation, compliance decision, evidence reference
  - Emits: command_id, submission_id, completion, ledger trace
        |
        | gRPC Ledger API over TLS/mTLS + JWT
        v
Canton participant
  - Holds: participant identity, party rights, ledger API authorization state
  - Source of truth: Daml contracts, choices, compliance permit/approval state, evidence anchors
  - Returns: completion, update_id, offset, events to projection worker
```

### Boundary table

| Boundary                             | Credential crossing                                                                | Credential stored at rest                                                  | Principal resolved                        | Primary controls                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Client ↔ API                         | API key bearer token; optional publishable key/client secret for client-side flows | Client stores secret according to customer policy; Pillar stores hash only | service account / account / tenant / mode | TLS, bearer auth, key status, scopes, IP constraints, rate limits                    |
| API ↔ DB                             | DB service credential                                                              | Runtime secret manager only                                                | API service identity                      | network policy, least-privilege DB role, query scoping by tenant/mode                |
| API ↔ ledger-command                 | internal service token / workload identity                                         | Runtime secret manager only                                                | API service identity                      | service-to-service auth, signed operation request, audit correlation                 |
| ledger-command ↔ participant         | Ledger API JWT + mTLS client cert                                                  | Runtime secret manager / KMS-backed mount                                  | ledger client user mapped to party rights | TLS/mTLS, JWT exp/nbf validation, `canActAs`/`canReadAs`, sticky participant routing |
| compliance-adapter ↔ external vendor | vendor API credential                                                              | compliance-adapter secret store only                                       | vendor integration account                | outbound allowlist, timeout/retry, redaction, no direct ledger mutation              |
| API/worker ↔ object storage          | object-storage service credential or signed URL signer                             | storage secret manager / KMS                                               | storage signer identity                   | encrypted buckets, object lock where required, short-lived signed URLs               |

### Service responsibilities

| Component                     | Responsibility                                                                                   | Must not do                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `apps/api`                    | Key lifecycle routes, auth middleware, rate limits, audit entry, compliance read APIs if present | Submit raw ledger commands directly                |
| `packages/security`           | API key hashing/verification, JWT validation helpers, webhook HMAC shared helpers from Phase 06  | Store tenant business state                        |
| `services/compliance-adapter` | Normalize KYC/AML/sanctions/risk vendor results into `compliance_decisions`                      | Mutate Daml or balances directly                   |
| `services/ledger-command`     | Convert allowed compliance result into Daml workflow advancement command                         | Trust DB decision without re-querying latest state |
| `packages/db/migrations`      | Add config/audit/evidence schema                                                                 | Store file blobs or raw secrets                    |
| `services/projection-worker`  | Observe ledger advancement and project status                                                    | Invent compliance success without ledger event     |
| `services/webhook-dispatcher` | Deliver events signed with `Pillar-Signature` from Phase 06                                      | Recompute policy decisions                         |

### Credential ownership

| Credential                        | Location                                             | Storage rule                                             | Rotation owner                     | Audit event                                             |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------- |
| Restricted API key                | customer server; hash in `api_keys`                  | Argon2id hash + server-side pepper; secret revealed once | API key owner/admin                | `api_key.created`, `api_key.revoked`, `api_key.rotated` |
| Full secret key                   | customer server; hash in `api_keys`                  | same as restricted; live creation gated                  | tenant owner + privileged approval | same plus `api_key.full_key_created`                    |
| Key pepper                        | Pillar runtime secret manager                        | not in DB; KMS/secret-manager material                   | platform security                  | `secret.pepper_rotated` with no value                   |
| Participant JWT                   | `ledger-command` runtime                             | short-lived token or signing key in secret manager       | platform / participant operator    | `ledger.jwt.issued`, `ledger.jwt.refresh_failed`        |
| mTLS client cert/key              | `ledger-command` runtime                             | mounted secret; cert metadata in config                  | platform / participant operator    | `mtls.cert.rotated`, `mtls.cert.expiring`               |
| Webhook endpoint secret           | webhook service / hash or encrypted secret in config | Phase 06 endpoint secret model                           | endpoint admin                     | `webhook_endpoint.secret_rotated`                       |
| Compliance vendor key             | `compliance-adapter` runtime                         | secret manager only                                      | compliance operator                | `compliance.vendor_credential_rotated`                  |
| Object-storage signing credential | file/evidence service runtime                        | secret manager/KMS                                       | platform operator                  | `storage.signer_rotated`                                |

## 4. API / Object Model

### `/v1/api_keys` lifecycle

Phase 08 exposes key management through Stripe-like resource APIs.

```http
POST /v1/api_keys
Authorization: Bearer sk_live_...
Pillar-Version: 2026-05-01
Idempotency-Key: create-settlement-worker-key-001
Content-Type: application/json
```

Request:

```json
{
  "name": "Settlement worker",
  "type": "restricted",
  "scopes": [
    "holdings:read",
    "balances:read",
    "issue_intents:create",
    "issue_intents:read",
    "transfer_intents:create",
    "transfer_intents:read"
  ],
  "constraints": {
    "party_aliases": ["treasury"],
    "asset_ids": ["asset_usdcx"],
    "max_amount": "250000.00"
  },
  "allowed_ips": ["203.0.113.0/24"],
  "expires_at": "2026-12-31T23:59:59Z",
  "metadata": {
    "owner": "treasury-ops"
  }
}
```

Response on create only:

```json
{
  "id": "key_01JZK8...",
  "object": "api_key",
  "type": "restricted",
  "mode": "live",
  "livemode": true,
  "status": "active",
  "name": "Settlement worker",
  "prefix": "rk_live",
  "last4": "9f2a",
  "secret": "rk_live_...9f2a",
  "scopes": [
    "holdings:read",
    "balances:read",
    "issue_intents:create",
    "issue_intents:read",
    "transfer_intents:create",
    "transfer_intents:read"
  ],
  "constraints": {
    "party_aliases": ["treasury"],
    "asset_ids": ["asset_usdcx"],
    "max_amount": "250000.00"
  },
  "allowed_ips": ["203.0.113.0/24"],
  "created": 1782400000,
  "expires_at": 1798761599,
  "last_used_at": null,
  "metadata": {
    "owner": "treasury-ops"
  }
}
```

List never returns `secret`:

```http
GET /v1/api_keys?limit=10
Authorization: Bearer sk_live_...
```

```json
{
  "object": "list",
  "data": [
    {
      "id": "key_01JZK8...",
      "object": "api_key",
      "type": "restricted",
      "mode": "live",
      "livemode": true,
      "status": "active",
      "name": "Settlement worker",
      "prefix": "rk_live",
      "last4": "9f2a",
      "scopes": ["holdings:read", "transfer_intents:create"],
      "created": 1782400000,
      "last_used_at": null
    }
  ],
  "has_more": false,
  "url": "/v1/api_keys"
}
```

Revoke:

```http
POST /v1/api_keys/key_01JZK8/revoke
Authorization: Bearer sk_live_...
Idempotency-Key: revoke-key-01JZK8
```

```json
{
  "id": "key_01JZK8...",
  "object": "api_key",
  "status": "revoked",
  "revoked_at": 1782400200
}
```

### Key types

| Type                     | Prefix                 | Production stance                            | Use                                                                       | Default scopes                              |
| ------------------------ | ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| `restricted`             | `rk_test_`, `rk_live_` | Default                                      | Server integrations with explicit scopes, constraints, party entitlements | Caller-provided; no implicit wildcard       |
| `full`                   | `sk_test_`, `sk_live_` | Controlled exception                         | Legacy/root server integration, key administration, migration bridge      | Account-level by policy, never browser-safe |
| `publishable`            | `pk_test_`, `pk_live_` | Out of core K tickets unless already present | Browser/mobile initialization and client-secret-bound reads               | No ledger mutation                          |
| `webhook_signing_secret` | `whsec_`               | Owned by Phase 06                            | Verify Pillar-originated webhook events                                   | Not an API key                              |

Webhook signatures use the Phase 06 `Pillar-Signature` model:

```http
Pillar-Signature: t=1779775200,v1=base64_hmac_sha256(...)
```

Phase 08 must not reimplement webhook signing; it must cross-link API key rotation and audit events to webhook endpoint secret rotation where relevant.

### API key object fields

| Field                           | External?   | Notes                                                          |
| ------------------------------- | ----------- | -------------------------------------------------------------- |
| `id`                            | yes         | `key_...`; stable object ID                                    |
| `object`                        | yes         | always `api_key`                                               |
| `type`                          | yes         | `restricted` or `full` for this phase                          |
| `mode` / `livemode`             | yes         | test/live split follows key prefix and tenant config           |
| `status`                        | yes         | `active`, `revoked`, `expired`, `rotating`                     |
| `name`                          | yes         | non-sensitive label                                            |
| `prefix`                        | yes         | prefix only, no secret body                                    |
| `last4`                         | yes         | diagnostic only                                                |
| `secret`                        | create-only | returned once, never stored or listed                          |
| `scopes`                        | yes         | endpoint/action permissions                                    |
| `constraints`                   | yes         | asset, party_alias, amount, destination constraints            |
| `allowed_ips`                   | yes         | optional CIDR list                                             |
| `expires_at`                    | yes         | nullable for test, discouraged for live                        |
| `last_used_at` / `last_used_ip` | yes         | updated asynchronously after auth success                      |
| `hash`                          | no          | Argon2id hash in DB                                            |
| `hash_version`                  | no          | supports future rehash/migration                               |
| `pepper_id`                     | no          | identifies secret-manager pepper version; not the pepper value |

### Compliance decision object

External exposure should be minimal and role-gated. The customer-facing workflow sees intent status and `requires_action`; support/admin expansions may expose `policy_decision` references.

```json
{
  "id": "cmpdec_01JZ...",
  "object": "compliance_decision",
  "livemode": true,
  "subject": {
    "object": "issue_intent",
    "id": "iin_01JZ..."
  },
  "status": "approved",
  "decision_type": "kyc_aml",
  "provider": "configured_vendor",
  "policy_version": "polv_2026_05_26",
  "input_facts_hash": "sha256:...",
  "reason_code": "kyc_aml.clear",
  "evidence_file_ids": ["file_01JZ..."],
  "created": 1782400100
}
```

Rules:

| Rule               | Requirement                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| No PII in object   | Customer name, date of birth, document number, address, sanctions raw hit details stay in vendor system or encrypted file body. |
| Hash facts         | Store canonical `input_facts_hash` and `decision_facts_hash`, not raw facts.                                                    |
| Explainable        | Store policy version, matched rules/reason codes, provider correlation ID hash.                                                 |
| Ledger advancement | `approved` does not mutate assets until `ledger-command` submits the Daml workflow advancement.                                 |
| Denial             | Denied decisions move intent/case to failed/requires_action according to existing intent grammar and emit webhook.              |

### Evidence file object relation

Phase 08 stores only evidence file references needed by compliance and audit. File API details are defined in [20 Files / Documents / Evidence](../Architecture/20_Files%20Documents%20Evidence.md).

```json
{
  "id": "file_01JZ...",
  "object": "file",
  "purpose": "kyc_document_reference",
  "status": "verified",
  "evidence_status": "anchored",
  "storage": {
    "provider": "s3",
    "bucket_alias": "pillar-evidence-live",
    "object_key_ref": "enc:...",
    "object_version": "3HL4k..."
  },
  "hash": {
    "algorithm": "sha256",
    "content_hash": "sha256:private-or-redacted",
    "visibility": "private_commitment"
  },
  "linked_objects": [
    {
      "object": "compliance_decision",
      "id": "cmpdec_01JZ...",
      "role": "kyc_evidence"
    }
  ]
}
```

## 5. Internal Runtime

### API key bearer auth middleware

Auth middleware runs before idempotency and route handlers.

```text
incoming request
  -> parse Authorization: Bearer
  -> reject missing/malformed credential
  -> identify prefix and mode
  -> lookup candidate key by prefix/key_id/last4-safe selector
  -> verify hash with Argon2id + current/previous pepper
  -> check status, expiry, rotation grace, tenant, account, mode
  -> check IP allowlist and optional mTLS binding
  -> resolve principal, service account, party entitlements
  -> check endpoint/action scope
  -> consume tenant/key/endpoint token buckets
  -> attach auth context to request
  -> create audit auth event
  -> continue to idempotency middleware
```

Auth context:

```ts
type AuthContext = {
  tenantId: string;
  accountId: string;
  mode: 'test' | 'live';
  apiKeyId: string;
  keyType: 'restricted' | 'full' | 'publishable';
  principalId: string;
  scopes: string[];
  constraints: Record<string, unknown>;
  partyEntitlements: Array<{
    partyAlias: string;
    permissions: Array<
      'party.read' | 'party.act' | 'party.prepare' | 'party.execute' | 'party.admin'
    >;
  }>;
  requestId: string;
  traceId: string;
};
```

### Hashing decision

Section 10 records the implementation choice: API key secrets use **Argon2id** with a server-side pepper.

Runtime rules:

| Rule                     | Requirement                                                               |
| ------------------------ | ------------------------------------------------------------------------- |
| Store no raw secret      | `api_keys.secret_hash` only; `secret` returned once on create.            |
| Use Argon2id             | Memory-hard hash for offline DB compromise resistance.                    |
| Use pepper               | Pepper stored outside DB; `pepper_id` allows rotation/migration.          |
| Preserve prefix/last4    | Usability/debug only; never enough to authenticate.                       |
| Rehash opportunistically | If `hash_version` or Argon2 params are old, rehash after successful auth. |
| Constant-time compare    | Verification must avoid prefix/last4 timing leaks where practical.        |

### Rate limiting

The rate limiter is a token bucket hierarchy.

| Bucket   | Key                                 | Purpose                           | Example                     |
| -------- | ----------------------------------- | --------------------------------- | --------------------------- |
| Tenant   | `tenant:{tenant_id}:mode:{mode}`    | protect platform and tenant quota | 10k req/min                 |
| API key  | `key:{api_key_id}`                  | contain leaked or runaway key     | 1k req/min                  |
| Endpoint | `key:{api_key_id}:route:{route_id}` | protect expensive operations      | 30 issue-intent creates/min |

Decision rule:

```text
allow request only if all applicable buckets have tokens
```

429 response shape:

```json
{
  "error": {
    "type": "rate_limit_error",
    "code": "rate_limit.exceeded",
    "message": "Too many requests for this API key and endpoint.",
    "request_id": "req_..."
  }
}
```

### Compliance adapter integration

The compliance adapter is off-ledger decision ingestion. It does not mutate ledger state directly.

```text
issue_intent created
  -> operation row created
  -> compliance requirement evaluated from asset config
  -> intent status: requires_compliance / processing
  -> compliance-adapter submits vendor request
  -> vendor callback/poll result normalized
  -> compliance_decisions row inserted
  -> audit_log records decision metadata and hashes
  -> ledger-command re-queries latest intent/projection/compliance state
  -> ledger-command submits complete_issue_after_compliance command
  -> participant commits Daml workflow advancement
  -> projection observes ledger event
  -> webhook event emitted
```

Controls:

| Control               | Runtime behavior                                                                    |
| --------------------- | ----------------------------------------------------------------------------------- |
| No direct mutation    | `services/compliance-adapter` cannot call participant or update balances/holdings.  |
| Durable decision      | Decision written before ledger command request.                                     |
| Latest-state re-query | `ledger-command` re-queries latest PQS/projection state before submitting.          |
| Stable operation IDs  | Compliance advancement uses existing `operation_id` and deterministic `command_id`. |
| Idempotent callbacks  | Vendor correlation ID and decision hash prevent duplicate advancement.              |
| Explainable denial    | Denial produces reason code and intent status; no silent workflow stall.            |

### JWT/mTLS to participant

`services/ledger-command` is the only runtime component in this phase that calls the participant for workflow advancement.

| Control             | Requirement                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| JWT audience        | Token audience matches participant Ledger API config.                           |
| JWT subject/user    | Token maps to internal ledger user with least-privilege rights.                 |
| `canReadAs`         | Required for projection-sensitive command preparation/inspection.               |
| `canActAs`          | Required for Daml choices that advance issue/transfer workflows.                |
| mTLS                | Staging/prod participant connections require client cert and server validation. |
| Cert expiry monitor | Alert before expiry; fail closed when expired.                                  |
| Clock skew          | Validate `nbf`/`exp` with bounded skew and explicit metrics.                    |

## 6. DB Schema

Phase 08 extends existing `config`, `audit`, and evidence/file schemas without making DB authoritative for asset state.

### `config.api_keys`

```sql
create table config.api_keys (
  id text primary key,
  tenant_id text not null references config.tenants(id),
  account_id text not null references config.accounts(id),
  mode text not null check (mode in ('test', 'live')),
  type text not null check (type in ('restricted', 'full', 'publishable')),
  status text not null check (status in ('active', 'revoked', 'expired', 'rotating')),
  name text not null,
  prefix text not null,
  last4 text not null,
  secret_hash text not null,
  hash_algorithm text not null default 'argon2id',
  hash_version integer not null default 1,
  pepper_id text not null,
  scopes jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  allowed_ips cidr[] null,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  rotated_from text null references config.api_keys(id),
  rotation_grace_until timestamptz null,
  last_used_at timestamptz null,
  last_used_ip inet null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index api_keys_tenant_mode_status_idx
  on config.api_keys (tenant_id, mode, status);

create index api_keys_prefix_last4_idx
  on config.api_keys (prefix, last4);
```

### `audit.audit_log` additions

Existing audit log gains security/compliance fields sufficient to prove who did what, under which credential and policy decision.

```sql
alter table audit.audit_log
  add column if not exists tenant_id text,
  add column if not exists account_id text,
  add column if not exists mode text,
  add column if not exists actor_type text,
  add column if not exists actor_id text,
  add column if not exists api_key_id text,
  add column if not exists auth_scope text,
  add column if not exists request_id text,
  add column if not exists trace_id text,
  add column if not exists operation_id text,
  add column if not exists intent_id text,
  add column if not exists command_id text,
  add column if not exists policy_decision_id text,
  add column if not exists resource_type text,
  add column if not exists resource_id text,
  add column if not exists decision text,
  add column if not exists reason_code text,
  add column if not exists masked_request_hash text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index audit_log_request_idx on audit.audit_log (request_id);
create index audit_log_operation_idx on audit.audit_log (operation_id);
create index audit_log_actor_idx on audit.audit_log (tenant_id, actor_type, actor_id, created_at desc);
```

Audit payload rules:

| Field class | Store                                                    | Do not store                                                                      |
| ----------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Identity    | tenant/account/principal/key IDs                         | API key secret, vendor credential                                                 |
| Request     | request ID, route, status, masked hash                   | raw PII body, file body, bearer token                                             |
| Compliance  | policy version, decision ID, reason code, hashes         | raw KYC document, sanctions raw narrative unless separately encrypted as evidence |
| Ledger      | operation_id, command_id, update_id/offset if role-gated | external default contract-first fields                                            |

### `audit.compliance_decisions`

```sql
create table audit.compliance_decisions (
  id text primary key,
  tenant_id text not null,
  account_id text not null,
  mode text not null check (mode in ('test', 'live')),
  subject_type text not null,
  subject_id text not null,
  decision_type text not null,
  status text not null check (status in ('pending', 'approved', 'denied', 'requires_review', 'expired', 'error')),
  provider text not null,
  provider_decision_ref_hash text null,
  policy_version_id text null,
  policy_hash text null,
  input_facts_hash text not null,
  decision_facts_hash text null,
  risk_score numeric null,
  reason_code text not null,
  reason_summary text null,
  evidence_file_ids jsonb not null default '[]'::jsonb,
  operation_id text null,
  command_id text null,
  decided_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index compliance_decisions_subject_type_idx
  on audit.compliance_decisions (tenant_id, mode, subject_type, subject_id, decision_type, policy_version_id)
  where status in ('approved', 'denied', 'requires_review');

create index compliance_decisions_operation_idx
  on audit.compliance_decisions (operation_id);
```

### `audit.evidence_files`

This table stores object-storage references only. Actual file bytes live in S3/GCS/Azure Blob/MinIO according to [20 Files / Documents / Evidence](../Architecture/20_Files%20Documents%20Evidence.md).

```sql
create table audit.evidence_files (
  id text primary key,
  tenant_id text not null,
  account_id text not null,
  mode text not null check (mode in ('test', 'live')),
  purpose text not null,
  status text not null check (status in ('upload_pending', 'uploaded', 'scanning', 'verified', 'quarantined', 'deleted')),
  evidence_status text not null check (evidence_status in ('unanchored', 'hash_verified', 'ledger_anchoring', 'anchored', 'attached', 'sealed', 'tombstoned')),
  storage_provider text not null,
  storage_bucket_alias text not null,
  storage_object_key_ref text not null,
  storage_object_version text null,
  content_type text null,
  size_bytes bigint null,
  content_hash text null,
  content_hash_visibility text not null default 'private_commitment',
  evidence_hash text null,
  retention_policy text null,
  retain_until timestamptz null,
  legal_hold boolean not null default false,
  linked_object_type text null,
  linked_object_id text null,
  operation_id text null,
  command_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index evidence_files_link_idx
  on audit.evidence_files (tenant_id, mode, linked_object_type, linked_object_id);

create index evidence_files_operation_idx
  on audit.evidence_files (operation_id);
```

### Schema invariants

| Invariant             | Enforcement                                                                    |
| --------------------- | ------------------------------------------------------------------------------ |
| DB is not asset truth | No balances/holdings are updated by compliance tables.                         |
| Secrets are one-way   | API key hashes only; no raw credential columns.                                |
| Blobs are external    | Evidence table has object references only.                                     |
| PII minimized         | Metadata validators reject PII/secrets; compliance stores hashes/reason codes. |
| Tenant/mode scoped    | All new tables include tenant/account/mode.                                    |
| Traceable mutation    | Compliance advancement rows include operation/command when applicable.         |

## 7. Failure Modes

| Failure mode                           | Detection                                                                                       | System behavior                                                                                                                                              | Recovery                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| API key leakage                        | Unusual rate-limit consumption, IP mismatch, customer report, Workbench audit review            | Key can be revoked immediately; token buckets contain blast radius; all requests are audit-linked to key ID                                                  | Revoke key, create replacement, inspect audit and request logs, rotate related service credentials if necessary |
| Replay of API request                  | Duplicate `Idempotency-Key`, same params hash, or signature/timestamp mismatch where applicable | Return cached result for safe duplicate; reject parameter mismatch; never submit duplicate ledger command blindly                                            | Customer retries with same key; support inspects idempotency and ledger trace                                   |
| Privilege escalation by restricted key | Scope/constraint/party entitlement mismatch                                                     | Reject with authorization error before idempotency mutation or ledger-command enqueue                                                                        | Adjust key scopes deliberately; audit denied attempt                                                            |
| Compliance adapter unavailable         | Adapter timeout/error, stale pending decision SLA, vendor callback missing                      | Intent remains `requires_action` or `processing`; no asset issuance/transfer advancement; webhook emits pending/failure according to existing intent grammar | Retry adapter, manual review path, operator may attach evidence and submit approved decision if policy allows   |
| Workflow stuck after approved decision | Decision persisted but command not committed                                                    | Operation status shows pending command; audit has decision; ledger trace lacks completion                                                                    | ledger-command retry with same deterministic command_id after latest-state re-query                             |
| JWT clock skew                         | Participant rejects token `nbf`/`exp`; auth metrics show token validation failures              | ledger-command fails closed; intent remains processing/retryable                                                                                             | Correct NTP/time sync, refresh token, rerun command retry                                                       |
| mTLS cert expiry                       | Expiry monitor alert, TLS handshake failures                                                    | Fail closed for staging/prod participant connection; no fallback to plaintext                                                                                | Rotate cert/key, update secret mount, verify participant connection                                             |
| Pepper rotation mismatch               | New hash verification failures after deploy                                                     | Current and previous pepper IDs accepted during rotation window                                                                                              | Roll back pepper pointer or rehash active keys after successful auth                                            |
| Rate limiter store unavailable         | Redis/limiter backend outage                                                                    | Fail closed for mutating endpoints; optionally fail open only for read-only health under explicit config                                                     | Restore limiter, replay no mutations from failed window                                                         |
| Evidence object missing                | HEAD object fails, object version mismatch, hash mismatch                                       | Evidence remains unverified/quarantined; compliance decision cannot depend on it                                                                             | Re-upload or repair storage reference; audit all access attempts                                                |
| PII in metadata                        | Metadata validator detects forbidden pattern/key; DLP flags evidence metadata                   | Reject request or quarantine file; audit denial                                                                                                              | Customer resubmits sanitized metadata; raw PII belongs in encrypted file/vendor system                          |
| Test/live cross-contamination          | Key prefix/mode mismatch, tenant mode mismatch, object reference mode mismatch                  | Reject request; no cross-mode lookup                                                                                                                         | Rotate wrong key and inspect audit logs                                                                         |

## 8. Security / Compliance

### KYC/AML gating

Phase 08 sets the initial compliance rule:

| Workflow                 | Gate                                                                              | Configuration                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Issue                    | KYC/AML required before issue completion                                          | Required by default for regulated assets                                                                 |
| Transfer                 | KYC/AML gate is asset-configurable                                                | Controlled by `asset_configs` policy; default follows implementation-plan open question resolution below |
| Redeem                   | Uses asset/jurisdiction policy; not expanded in this phase unless already present | May require compliance evidence for regulated assets                                                     |
| File/evidence attachment | Malware/DLP/hash verification before evidence anchor                              | Required for compliance evidence                                                                         |

Issue flow:

```text
POST /v1/issue_intents
  -> auth/scopes/rate limit/idempotency
  -> create issue intent and operation
  -> determine compliance requirement from asset config
  -> if required: request KYC/AML decision
  -> persist compliance_decision
  -> ledger-command submits complete_issue_after_compliance
  -> Canton commits Daml workflow advancement
  -> projection updates issue intent / holding / balance
  -> webhook emits final state
```

Transfer flow:

```text
POST /v1/transfer_intents
  -> auth/scopes/rate limit/idempotency
  -> asset config determines whether sender/receiver compliance gate applies
  -> if gate applies, transfer intent remains requires_action/processing until decision
  -> off-ledger approval creates compliance_decision
  -> ledger-command advances Daml transfer workflow
```

### Non-repudiation

Non-repudiation is based on the combined trace spine, not on a DB-only record.

| Layer          | Evidence                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| API            | request_id, API key ID, principal, IP, user agent, idempotency key hash, masked request hash   |
| Authorization  | scope decision, constraint decision, party entitlement decision, rate-limit result             |
| Compliance     | compliance_decision ID, policy version/hash, input facts hash, reason code, evidence file IDs  |
| Ledger command | operation_id, workflow_id, command_id, submission_id, participant user, act_as/read_as mapping |
| Canton ledger  | committed Daml workflow state, update_id/transaction, ledger events, offset                    |
| Webhook        | event_id, delivery IDs, Phase 06 `Pillar-Signature`, replay history                            |

Customer-facing APIs still hide Canton internals by default. Internal/admin trace expansion may include ledger identifiers according to [11 Request Logs / Ledger Trace / Audit](../Architecture/11.Request%20Logs%20Ledger%20Trace%20Audit.md).

### Data minimization

Rules:

| Surface             | Allowed                                                                             | Forbidden                                                                          |
| ------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| API metadata        | non-sensitive labels and customer correlation IDs                                   | PII, secrets, bearer tokens, document numbers, addresses, sanctions raw narratives |
| Daml templates      | compliance permit/reference IDs, policy hashes, evidence commitments where required | raw KYC/KYB PII, raw document body, API key material                               |
| Audit log           | actor/action/resource IDs, masked request hash, reason codes                        | raw request body containing PII, file bytes, secret values                         |
| Compliance decision | facts hash, policy version, provider ref hash, reason code                          | raw vendor payload unless separately encrypted as evidence                         |
| Evidence files      | encrypted object-storage bytes and private commitments                              | DB/ledger file blobs                                                               |
| Webhooks            | thin event IDs and redacted object state                                            | raw KYC documents or secret material                                               |

Metadata validator stance for this phase:

```text
Reject known secret/PII keys and high-confidence sensitive patterns.
Allow low-risk labels only.
Route ambiguous evidence into file/evidence flow, not metadata.
```

### Test/live separation

| Control            | Requirement                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| Prefix separation  | `rk_test_` and `rk_live_` cannot be interchanged.                            |
| Tenant mode        | Every auth context carries `mode`; DB queries include mode.                  |
| Ledger config      | Test and live use separate participant/ledger configs.                       |
| Evidence storage   | Test and live object-storage bucket aliases are separate.                    |
| Compliance vendors | Test uses sandbox/mock vendor; live uses live vendor credentials.            |
| Webhooks           | Test/live endpoints and signing secrets remain separate.                     |
| Audit              | Audit records include `livemode`/`mode` and never merge traces across modes. |

### Compliance adapter authorization

The compliance adapter is a policy input, not a privileged ledger actor.

```text
compliance-adapter can:
  - call configured vendor
  - normalize vendor response
  - persist compliance_decisions
  - attach evidence file references
  - emit audit entries

compliance-adapter cannot:
  - call Canton participant
  - update balances or holdings
  - mark issue/transfer completed without ledger event
  - bypass API key/tenant/mode isolation
```

### Ledger-enforced policy plane

The core compliance principle from [19 Compliance / Risk / Policy Engine](../Architecture/19_Compliance.md) applies unchanged:

> Policy engine may decide; ledger must enforce.

Implementation consequences:

1. `compliance_decisions.status = 'approved'` is necessary but not sufficient.
2. Daml workflow advancement must verify the relevant permit/approval facts.
3. Projection must observe the ledger event before customer-visible final state changes.
4. If DB is stale or adapter is wrong, ledger command fails or remains pending; no DB-only asset mutation is allowed.

## 9. Implementation Plan

### Ticket table

| ID     | Title                                       | Path                                                                                                                                                       | Output                                                                                                                          | Deps                                                                   | Acceptance                                                                                                                                                              | Risk   |
| ------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P8.K01 | API key lifecycle                           | `apps/api/src/routes/v1/api_keys`, `packages/api-contracts`, `packages/db/migrations/0080_security_compliance`                                             | create/list/revoke endpoints, OpenAPI schemas, key hash persistence                                                             | P2.C01, P2.C02, P2.C03, P2.C04, P2.C05, P2.E01, P3.D01, P3.D02, P3.D03 | `/v1/api_keys` creates restricted key, returns secret once, list omits secret, revoke blocks future auth                                                                | high   |
| P8.K02 | Hierarchical rate limiter                   | `apps/api/src/middleware/rate-limit.ts`, `packages/security/src/rate-limit`                                                                                | tenant + key + endpoint token bucket middleware                                                                                 | P8.K01                                                                 | exceeding endpoint bucket returns 429 with request_id and no route mutation                                                                                             | medium |
| P8.K03 | Audit log enrichment                        | `apps/api/src/middleware/audit.ts`, `packages/db/migrations/0080_security_compliance`, `apps/api/src/routes/v1/request_logs`                               | auth/compliance/ledger trace fields on audit records                                                                            | P3.D02, P3.D04, P5.E07, P8.K01                                         | mutation audit row includes request_id, api_key_id, operation_id, principal, decision, masked hash                                                                      | high   |
| P8.K04 | Compliance adapter                          | `services/compliance-adapter`, `services/ledger-command/src/workflows/complete_issue_after_compliance`, `packages/db/migrations/0081_compliance_decisions` | KYC/AML mock/vendor adapter, decision persistence, ledger-command advancement                                                   | P4.E06, P4.F03, P4.F04, P4.F05, P4.F06, P8.K03                         | mock approved decision advances issue intent through ledger-command and projection observes completion                                                                  | high   |
| P8.K05 | Evidence storage references                 | `apps/api/src/routes/v1/files`, `services/compliance-adapter/src/evidence`, `packages/db/migrations/0082_evidence_files`                                   | evidence file reference persistence, object-storage pointer model, hash fields                                                  | P8.K04                                                                 | compliance decision links evidence file ID; DB stores no blob bytes; missing object blocks verification                                                                 | medium |
| P8.K06 | Secret rotation runbook                     | `docs/Dev/Phase_08_Security_Compliance.md`, `packages/security/src/rotation`, `infra/compose/local-auth.yml`                                               | operational steps and code hooks for API key, pepper, JWT, mTLS, vendor, webhook-secret rotation                                | P8.K01, P8.K04                                                         | staging rotation drill revokes old key, accepts new key, preserves audit trace, participant auth still passes                                                           | medium |
| P8.K07 | Pen-test checklist                          | `docs/Dev/Phase_08_Security_Compliance.md`, `packages/testing/src/security`, `apps/api/test/security`                                                      | executable checklist and targeted tests for leakage/replay/escalation/rate-limit/data-minimization                              | P8.K01, P8.K02, P8.K03, P8.K04, P8.K05, P8.K06                         | pen-test checklist covers K01-K06 and staging auth profile passes                                                                                                       | medium |
| P8.K08 | API key scope catalog                       | `packages/security/src/scopes`, `packages/api-contracts/schemas/api_key`, `docs/Dev/API_MATRIX.md`                                                         | restricted/full/admin/publishable scope registry with per-endpoint allow-list and denial fixtures                               | P8.K01, P8.K02, P8.K03                                                 | every `/v1` endpoint in API matrix maps to one minimum scope; restricted keys cannot call admin/full-key routes; publishable keys cannot mutate ledger-backed resources | high   |
| P8.K09 | API key OIDC bridge for Workbench/Dashboard | `apps/workbench/src/auth`, `apps/dashboard/src/auth`, `apps/api/src/auth/oidc-bridge`                                                                      | OIDC-authenticated human session to scoped API-key/service-account exchange boundary                                            | P8.K01, P8.K08, P7.I06                                                 | Workbench and Dashboard can obtain short-lived scoped backend credentials without exposing raw API keys in browser storage or logs                                      | high   |
| P8.K10 | Customer dashboard OAuth2/OIDC sign-in      | `apps/dashboard/src/auth`, `apps/api/src/routes/v1/auth`, `packages/security/src/oidc`                                                                     | customer dashboard sign-in integration with issuer config, callback validation, session claims, tenant/mode binding             | P8.K03, P8.K08                                                         | dashboard sign-in validates issuer/audience/nonce/state, binds user to tenant/mode, and rejects ledger/API mutation without scoped authorization                        | high   |
| P8.K11 | Participant mTLS credential lifecycle       | `services/ledger-command/src/security/mtls`, `infra/helm/pillar/templates/ledger-command`, `infra/compose/local-auth.yml`                                  | participant client cert provisioning, rotation, expiry metadata, and expiry alert hook                                          | P4.F02, P8.K03                                                         | staging participant connection requires mTLS; expired/unknown cert fails closed; expiry alert fires before configured threshold                                         | high   |
| P8.K12 | Internal service JWT minting                | `packages/security/src/jwt`, `services/ledger-command/src/security/jwt`, `apps/api/src/internal-auth`                                                      | short-lived service-to-service JWT issuer/verifier with audience, subject, tenant/mode, and key rotation support                | P8.K03, P8.K11                                                         | API-to-ledger-command request with valid JWT is accepted; wrong audience/expired token is rejected and audited before workflow mutation                                 | high   |
| P8.K13 | Postgres column-level encryption            | `packages/db/migrations/0080_security_compliance`, `packages/db/src/crypto`, `packages/db/migrations/0081_compliance_decisions`                            | column-level encryption envelope for sensitive config/audit fields and encrypted party/vendor/evidence references               | P3.D01, P8.K03, P8.K04                                                 | sensitive columns are encrypted at rest with KMS-backed data keys; query paths decrypt only inside authorized service boundary; raw plaintext is absent from DB dumps   | high   |
| P8.K14 | TLS everywhere and internal pinning         | `infra/compose/local-auth.yml`, `infra/helm/pillar/values.schema.json`, `packages/security/src/tls`                                                        | TLS-required service topology and internal CA/certificate pin validation for service and participant calls                      | P8.K11, P8.K12                                                         | staging profile refuses plaintext internal service URLs and detects unexpected participant/internal service certificate chain                                           | high   |
| P8.K15 | Secrets management integration              | `packages/security/src/secrets`, `infra/helm/pillar/templates/external-secrets`, `infra/terraform`                                                         | KMS adapter and External Secrets Operator wiring for peppers, JWT keys, mTLS certs, vendor keys, and storage signer credentials | P8.K11, P8.K12, P8.K13                                                 | services load secrets by reference, not literal env value; missing/unauthorized secret fails startup; Helm values contain no raw secret material                        | high   |
| P8.K16 | Container image vulnerability scanning      | `.github/workflows`, `infra/docker`, `packages/testing/src/security`                                                                                       | CI image vulnerability scan with severity policy and allowlist evidence                                                         | P0.A06, P8.K15                                                         | CI blocks critical/high unapproved image vulnerabilities and stores scan artifact without secrets                                                                       | medium |
| P8.K17 | Dependency SCA and license scanning         | `.github/workflows`, `packages/testing/src/security/sca`, `gradle/libs.versions.toml`                                                                      | SCA and license policy checks for TypeScript/JVM dependencies                                                                   | P0.A06                                                                 | dependency scan blocks prohibited licenses and critical unpatched CVEs unless an approved exception file references owner/expiry                                        | medium |
| P8.K18 | SLSA provenance attestations                | `.github/workflows`, `infra/docker`, `packages/testing/src/provenance`                                                                                     | build provenance generation and cosign attestation verification for images and release artifacts                                | P8.K16, P8.K17                                                         | release candidate includes verifiable provenance attestation tied to commit SHA and image digest                                                                        | medium |
| P8.K19 | DAR/image/SBOM supply-chain signing         | `daml/`, `infra/docker`, `.github/workflows`, `packages/testing/src/provenance`                                                                            | DAR signing, image signing, SBOM generation, and verification gates                                                             | P1.B07, P8.K18                                                         | deployment refuses unsigned or digest-mismatched DAR/image; SBOM exists for each release image and Daml artifact                                                        | high   |
| P8.K20 | KYC vendor adapter abstraction              | `services/compliance-adapter/src/kyc`, `services/compliance-adapter/test/kyc`, `packages/db/migrations/0081_compliance_decisions`                          | mock and real-provider KYC adapter interface with normalized subject, outcome, reason, evidence references                      | P8.K04, P8.K13, P8.K15                                                 | deterministic mock and configured provider both persist normalized KYC decision without raw PII in decision row                                                         | high   |
| P8.K21 | AML tenant rule-pack engine                 | `services/compliance-adapter/src/aml`, `packages/db/migrations/0081_compliance_decisions`, `packages/security/src/policy`                                  | per-tenant AML rule pack evaluator with version/hash and explainable matched rules                                              | P8.K04, P8.K20                                                         | tenant-specific AML rules produce approved/rejected/requires_action with policy version/hash and matched reason codes                                                   | high   |
| P8.K22 | Sanctions list ingestion                    | `services/compliance-adapter/src/sanctions`, `packages/db/migrations/0081_compliance_decisions`, `infra/compose/local-auth.yml`                            | sanctions provider adapter, scheduled ingestion job, normalized list versioning, and match audit                                | P8.K04, P8.K15                                                         | ingestion updates active sanctions list version; exact/fuzzy match generates auditable decision and does not mutate ledger directly                                     | high   |
| P8.K23 | Risk scoring service                        | `services/compliance-adapter/src/risk`, `packages/db/migrations/0081_compliance_decisions`                                                                 | risk scoring service combining KYC, AML, sanctions, velocity, asset, and tenant rule signals                                    | P8.K20, P8.K21, P8.K22                                                 | risk score is deterministic for fixed inputs/rule versions and persists score band, reason codes, and input facts hash                                                  | high   |
| P8.K24 | Compliance decision workflow persistence    | `services/compliance-adapter/src/decisions`, `services/ledger-command/src/workflows/compliance`, `packages/db/migrations/0081_compliance_decisions`        | approved/rejected/requires_action decision persistence and ledger-command workflow advancement                                  | P8.K20, P8.K21, P8.K22, P8.K23, P8.K03                                 | approved advances only through ledger-command; rejected blocks workflow; requires_action persists next_action and emits compliance event without ledger mutation        | high   |
| P8.K25 | Regulator audit export profile              | `services/export-worker/src/compliance`, `apps/api/src/routes/v1/export_jobs`, `packages/api-contracts/schemas/export_job`                                 | regulator export profile for compliance decisions, evidence hashes, audit trace, CSV and JSONL formats                          | P8.K24, P8.K05, P11.M04                                                | export job produces CSV and JSONL with masked PII, stable headers/schema, decision trace IDs, and evidence hashes                                                       | medium |
| P8.K26 | GDPR DSAR handler                           | `apps/api/src/routes/v1/privacy`, `services/export-worker/src/privacy`, `packages/db/src/privacy`                                                          | data subject access request handler with subject lookup, export package, redaction, and audit trail                             | P8.K13, P8.K24, P8.K25                                                 | authorized DSAR request returns customer-visible personal-data report and records audit entry without exposing raw secrets or Canton internals                          | high   |
| P8.K27 | Object storage adapter                      | `apps/api/src/routes/v1/files`, `packages/storage/src/providers`, `infra/compose/local-auth.yml`                                                           | provider-agnostic object storage adapter for S3, GCS, Azure Blob, S3-compatible/MinIO                                           | P8.K05, P8.K15                                                         | file metadata create can target configured provider; provider switch does not change `/v1/files` grammar; DB stores references only                                     | medium |
| P8.K28 | Presigned URL service                       | `packages/storage/src/presign`, `apps/api/src/routes/v1/files`, `packages/api-contracts/schemas/file`                                                      | short-lived upload/download URL signer with purpose, TTL, content hash, and authorization checks                                | P8.K27, P8.K08                                                         | presigned URL issuance enforces file scope and TTL; URL is absent from list/retrieve unless explicitly requested by authorized action                                   | high   |
| P8.K29 | File virus scan integration                 | `services/compliance-adapter/src/evidence/scan`, `packages/storage/src/scan`, `packages/db/migrations/0082_evidence_files`                                 | malware scan hook and scan status persistence for uploaded files before evidence use                                            | P8.K27, P8.K28                                                         | infected or unscanned file cannot be linked as evidence; clean file records scanner version, result, and audit trace                                                    | high   |
| P8.K30 | Evidence retention and immutability         | `packages/storage/src/retention`, `packages/db/migrations/0082_evidence_files`, `services/compliance-adapter/src/evidence/retention`                       | WORM/object-lock retention policy, legal hold metadata, immutable evidence hash verification                                    | P8.K27, P8.K29, P8.K24                                                 | evidence object under retention cannot be overwritten/deleted through Pillar; verification proves stored object hash matches retained evidence metadata                 | high   |

### P8.K01 API key lifecycle details

| Step         | Implementation detail                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Schema       | Add `config.api_keys` with Argon2id hash, prefix, last4, status, scopes, constraints, tenant/account/mode. |
| Create route | Validate caller can manage keys; generate secret; hash; store; return secret once.                         |
| List route   | Cursor pagination; no secret; allow filters by status/type/mode.                                           |
| Revoke route | Idempotent revoke; writes audit event; invalidates auth cache.                                             |
| Contract     | OpenAPI examples for restricted and full keys; full live key creation gated.                               |

### P8.K02 rate limiter details

| Step          | Implementation detail                                          |
| ------------- | -------------------------------------------------------------- |
| Bucket config | Per-route cost and bucket config by tenant/mode.               |
| Middleware    | Consume tenant, key, endpoint buckets before handler mutation. |
| Audit         | Log allow/deny decision for denied mutating requests.          |
| Headers       | Return standard rate-limit headers where safe.                 |
| Failure       | Fail closed for mutations when limiter unavailable.            |

### P8.K03 audit enrichment details

| Step              | Implementation detail                                         |
| ----------------- | ------------------------------------------------------------- |
| Request shell     | Create request/audit shell before auth completes.             |
| Auth enrich       | Attach key ID, principal, scopes, mode, tenant.               |
| Operation enrich  | Attach operation/intent/command IDs after route creates them. |
| Compliance enrich | Attach decision ID, reason code, policy version/hash.         |
| Redaction         | Store masked request hash, never raw secret/PII.              |

### P8.K04 compliance adapter details

| Step            | Implementation detail                                                 |
| --------------- | --------------------------------------------------------------------- |
| Adapter API     | Accept internal job or callback for subject intent.                   |
| Mock adapter    | Deterministic staging mock for approved/denied/requires_review/error. |
| Decision table  | Insert idempotent `compliance_decisions` row.                         |
| Command request | Enqueue ledger-command workflow advancement after approved decision.  |
| Ledger safety   | ledger-command re-queries latest state and uses stable command_id.    |

### P8.K05 evidence details

| Step          | Implementation detail                                                                        |
| ------------- | -------------------------------------------------------------------------------------------- |
| Storage model | Object-storage provider alias, encrypted key ref, version, hash, size.                       |
| Verification  | HEAD object, size/MIME/hash validation, malware/DLP hooks if present.                        |
| Decision link | Compliance decision references evidence file IDs.                                            |
| Ledger anchor | Evidence anchoring follows Architecture 20; Phase 08 stores references needed by compliance. |
| No blob       | Migration/test asserts DB does not store file bytes.                                         |

### P8.K06 rotation runbook summary

```text
API key rotation:
  1. create replacement restricted key with same or narrower scopes
  2. deploy customer config using new key
  3. observe last_used_at on new key
  4. revoke old key
  5. inspect audit log for old-key use after revoke

Pepper rotation:
  1. create new pepper in secret manager
  2. mark new pepper current and previous pepper valid
  3. rehash keys on successful auth
  4. monitor verification failures
  5. retire previous pepper after rotation window

Participant JWT/mTLS rotation:
  1. add new JWT signing material or token issuer config
  2. mount new mTLS cert/key before expiry
  3. verify staging participant connection
  4. cut traffic to new credential
  5. revoke old credential and audit event

Compliance vendor credential rotation:
  1. configure new vendor key in secret manager
  2. run sandbox decision check
  3. cut over adapter
  4. revoke old vendor key
  5. verify no pending callback uses old credential
```

### P8.K07 pen-test checklist summary

| Check                                                       | Expected result                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| Use revoked key                                             | 401/403, audit denial, no mutation                             |
| Use live key against test object                            | mode mismatch rejection                                        |
| Restricted key without scope                                | authorization error before operation creation                  |
| Restricted key with wrong party_alias                       | party entitlement denial                                       |
| Replay create request same idempotency key/same params      | cached result/no duplicate command                             |
| Replay create request same idempotency key/different params | conflict error/no command                                      |
| Exceed endpoint bucket                                      | 429/no mutation                                                |
| Submit metadata with API key or PII pattern                 | validation error                                               |
| Compliance adapter timeout                                  | intent remains pending/requires_action; no ledger advancement  |
| Approved mock compliance                                    | issue intent advances only via ledger-command and ledger event |
| Expired JWT                                                 | participant call fails closed; retry after token refresh       |
| Expired mTLS cert                                           | participant TLS fails closed; alert/runbook path               |
| Evidence object missing                                     | decision cannot rely on missing evidence; audit failure        |

## 10. Open Questions

| Question                                                    | Phase 08 resolution                                                                                                                                                                       | Rationale                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KYC scope per implementation-plan principle/open question 8 | Require KYC/AML before issue for regulated assets; make transfer KYC/AML asset-configurable.                                                                                              | The assignment explicitly requires KYC/AML gating on issue and configurable transfer gating per asset. This resolves the implementation-plan open question for Phase 08 without hard-coding all transfers globally. |
| Multi-tenant isolation strategy                             | Use shared schema with mandatory `tenant_id`, `account_id`, and `mode` columns for Phase 08; reserve separate deployment/schema for regulated enterprise tenants as a deployment variant. | Implementation plan schema groups are shared; Phase 08 must not invent a new tenancy model. Strong query scoping and tests are mandatory.                                                                           |
| API key hash algorithm                                      | Use Argon2id with a server-side pepper and `hash_version`.                                                                                                                                | Argon2id is memory-hard and better for offline DB compromise resistance than bcrypt for newly built systems.                                                                                                        |
| Metadata policy                                             | Hard validation for known PII/secrets, not documentation-only.                                                                                                                            | Architecture 23 asks whether to enforce; Phase 08 must gate production deploy, so soft guidance is insufficient.                                                                                                    |
| Full secret key in live                                     | Allow only for controlled server-side/root integration flows with audit and approval; restricted keys remain default.                                                                     | Architecture 12 says restricted key is default and full secret key is legacy/root-level.                                                                                                                            |
| Compliance vendor payload retention                         | Store normalized hashes/reason codes in `compliance_decisions`; store raw vendor evidence only as encrypted evidence file if required.                                                    | Preserves data minimization and evidence-grade retention.                                                                                                                                                           |
| Webhook signature ownership                                 | Phase 08 depends on Phase 06 `Pillar-Signature`; no duplicate implementation.                                                                                                             | Shared security package may contain helpers, but delivery signing remains webhook phase scope.                                                                                                                      |

## 11. Agent-ready Checklist

### Build gate

- [ ] `apps/api` starts with staging auth profile and rejects missing, malformed, revoked, expired, wrong-mode, and wrong-scope API keys.
- [ ] `packages/security` exposes Argon2id API key hash/verify helpers with pepper ID and hash version support.
- [ ] `packages/db` migrations create/alter `api_keys`, `audit_log`, `compliance_decisions`, and `evidence_files` without storing raw secrets or blobs.
- [ ] `services/ledger-command` connects to staging participant with JWT and mTLS enabled.
- [ ] `services/compliance-adapter` mock can return approved, denied, requires_review, timeout/error outcomes; KYC, AML, sanctions, and risk scoring adapters persist normalized decisions.

- [ ] `packages/security` contains endpoint scope catalog, OIDC/OAuth helpers, service JWT mint/verify, TLS pinning, secret-provider, and at-rest crypto helpers for `P8.K08`-`P8.K15`.
- [ ] Supply-chain CI produces image scans, dependency/license reports, SLSA provenance, cosign signatures, SBOMs, and DAR signing artifacts for `P8.K16`-`P8.K19`.
- [ ] File/evidence services expose object-storage adapter, presigned URL service, virus scan state, and WORM retention controls for `P8.K27`-`P8.K30`.

### Verify gate

- [ ] `/v1/api_keys` create/list/revoke works; create response returns `secret` once; list/retrieve never returns `secret`; scope catalog verifies restricted/full/admin/publishable endpoint allow-lists.
- [ ] Restricted API key can call only scoped endpoints and only within configured constraints and party entitlements; publishable keys cannot mutate ledger-backed resources.
- [ ] Tenant + key + endpoint token buckets reject excess mutating requests before handler mutation.
- [ ] Workbench and Dashboard OIDC/OAuth sign-in binds authenticated users to tenant/mode without storing raw API keys in browser state.
- [ ] Compliance adapter KYC, AML, sanctions, and risk-score results persist normalized decisions; approved result advances an issue intent through `ledger-command`, not by direct DB state mutation.
- [ ] Compliance decision workflow handles approved, rejected, and requires_action states with audit trace and correct `compliance_decision.*` events.
- [ ] Audit log captures full operation trace: `request_id`, `trace_id`, `api_key_id`, `principal`, `operation_id`, `compliance_decision_id`, `command_id` when applicable.
- [ ] Evidence file path stores object-storage references only; DB contains no file blob bytes; object storage adapter, presigned URL service, scan integration, and WORM retention checks pass.
- [ ] Staging auth profile passes end-to-end against participant JWT/mTLS configuration, internal service JWT, TLS pinning, and secret-manager loading.
- [ ] Container/dependency scan, SLSA provenance, cosign, SBOM, image signing, and DAR signing gates fail closed on unsigned or vulnerable release artifacts.
- [ ] Regulator audit export and GDPR DSAR handlers produce masked, scoped exports with decision trace IDs and no raw secrets, PII metadata, or Canton internals.
- [ ] Key leakage/replay/privilege-escalation/adapter-unavailable/JWT-skew/mTLS-expiry/object-scan-failure/retention-bypass scenarios have targeted tests or scripted checks.

### Invariant gate

- [ ] Public API exposes no Canton contract-first fields.
- [ ] DB asset state is projection only.
- [ ] Every mutation has stable operation_id and command_id where it reaches ledger workflow.
- [ ] Projection is rebuildable from Canton ledger events plus config/audit context.
- [ ] Webhook deliveries remain signed with Phase 06 `Pillar-Signature` and replayable by event ID.
- [ ] Deployment mode does not change `/v1` grammar.
- [ ] API key secrets, participant JWT material, mTLS private keys, vendor credentials, and object-storage signing credentials are never stored in Pillar DB.
- [ ] KYC/AML decisions can block or advance workflows only through ledger-command and Daml workflow enforcement.
- [ ] PII is not stored in metadata, Daml templates, request logs, audit raw payloads, or default webhook payloads.
- [ ] `P8.K08`-`P8.K30` have explicit acceptance evidence linked from the phase verification record before Phase 08 promotion.
