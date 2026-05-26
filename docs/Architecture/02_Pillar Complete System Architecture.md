## 결론

**DB balance 해킹은 “자산 탈취”가 아니라 “projection 오염”으로 격리되어야 한다.**

Pillar의 정답은 다음이다.

> **DB balance는 절대 권한 판단의 최종 근거가 아니다.**
> **Canton Ledger + Daml contract state만 economic source of truth다.**

따라서 공격자가 `holdings_projection.available_amount`를 조작해도:

1. 실제 ledger balance는 변하지 않는다.
2. transfer / issuance / redemption은 Canton ledger에서 다시 검증된다.
3. Daml choice가 실제 active contract state, owner party, quantity, restriction을 검증한다.
4. 조작된 DB는 reconciliation으로 탐지되고 replay로 복구된다.
5. 의심 상태에서는 해당 projection partition을 `degraded`로 전환하고 ledger-verified path만 허용한다.

---

# 1. Threat Model: DB balance 해킹 시나리오

가정:

```sql
UPDATE holdings_projection
SET available_amount = 1000000000
WHERE account_id = 'acct_attacker'
AND asset_id = 'ast_usdx';
```

공격자가 DB balance를 `10`에서 `1,000,000,000`으로 바꿨다고 하자.

이때 발생 가능한 일은 세 가지다.

| 공격 효과                     |  허용 여부 | 설명                                                  |
| ------------------------- | -----: | --------------------------------------------------- |
| API 화면에 잘못된 balance 표시    |     가능 | projection 오염이므로 read deception 가능                  |
| 실제 transfer 성공            |     불가 | Canton ledger/Daml contract state에서 거부              |
| 새 asset mint / balance 생성 |     불가 | issuance authority, issuer party, Daml choice 검증 필요 |
| webhook fake event 유발     | 방지해야 함 | event producer signature와 ledger update binding 필요  |
| 정상 사용자의 거래 거부             |     가능 | balance를 낮게 조작하면 DoS 가능                             |
| projection drift          |     가능 | ledger replay로 복구 가능                                |

즉, **DB 해킹은 economic loss로 이어지면 안 되고, 최대한 read-plane corruption / DoS로 제한되어야 한다.**

---

# 2. 핵심 원칙: DB Balance는 “승인 근거”가 아니라 “힌트”다

Pillar runtime의 write path는 이렇게 설계해야 한다.

```text
Client
  |
  v
POST /v1/transfer_intents
  |
  v
Projection DB preflight
  - 빠른 UX용 sanity check
  - insufficient balance 조기 탐지
  - stale/tampered 여부 확인
  |
  v
Intent Compiler
  |
  v
Canton Command
  |
  v
Daml Contract Validation
  - actual holding contract
  - actual quantity
  - actual owner party
  - actual restriction state
  - actual authorization
  |
  v
Ledger Commit or Reject
```

중요한 규칙:

> **Projection DB는 reject에는 사용할 수 있어도, 최종 approve에는 사용할 수 없다.**

더 정확히는:

| 단계                       | DB balance 사용 방식         |
| ------------------------ | ------------------------ |
| API read                 | projection으로 반환 가능       |
| low-risk preflight       | 빠른 sanity check로 사용 가능   |
| final transfer approval  | 사용 불가                    |
| ledger command execution | Canton/Daml state가 최종 판단 |
| webhook succeeded event  | ledger update 관측 후에만 생성  |

---

# 3. 공격 예시: Balance를 부풀린 경우

## 3.1 공격

DB row가 조작됨.

```json
{
  "account": "acct_attacker",
  "asset": "ast_usdx",
  "available": "1000000000.00"
}
```

## 3.2 공격자가 transfer 시도

```http
POST /v1/transfer_intents
Idempotency-Key: attack-001
```

```json
{
  "from_account": "acct_attacker",
  "to_account": "acct_friend",
  "asset": "ast_usdx",
  "amount": "1000000000.00"
}
```

## 3.3 Projection preflight는 속을 수 있음

```text
Projection says:
available = 1,000,000,000
```

그래서 runtime이 command를 제출할 수는 있다.

## 3.4 하지만 Canton ledger가 거부

Daml `Holding` contract에는 실제 수량이 예컨대 `10.00`이다.

```daml
choice Transfer : ContractId Holding
  with
    amount : Decimal
    receiver : Party
  controller owner
  do
    assertMsg "insufficient holding" (this.quantity >= amount)
    ...
```

Ledger validation 결과:

```text
Command rejected:
insufficient holding
```

## 3.5 API 결과

```json
{
  "id": "ti_01J...",
  "object": "transfer_intent",
  "status": "failed",
  "failure_code": "ledger_rejected_insufficient_holding",
  "ledger_trace": {
    "id": "ltr_01J...",
    "status": "rejected"
  }
}
```

결론:

> **DB balance 조작만으로는 돈이 움직이지 않는다.**

---

# 4. Projection Integrity Architecture

DB balance 해킹을 막는 구조는 5계층으로 설계해야 한다.

```text
Layer 1. Economic finality
  Canton Ledger / Daml contract validation

Layer 2. Projection write control
  Ledger Sync만 projection write 가능

Layer 3. Projection integrity proof
  update_id, offset, row_digest, producer_signature, hash chain

Layer 4. Continuous reconciliation
  State Service / Update stream replay로 drift 탐지

Layer 5. Blast-radius containment
  degraded mode, partition quarantine, ledger-verified reads/writes
```

---

# 5. Layer 1 — Canton Ledger가 최종 방어선

DB가 조작되어도 ledger에서 다시 검증되는 항목:

| 검증 항목                          | DB가 아니라 Ledger에서 검증                    |
| ------------------------------ | -------------------------------------- |
| 실제 holding 존재 여부               | Active contract set                    |
| 실제 수량                          | Holding contract field                 |
| 실제 owner                       | controller party                       |
| asset identity                 | on-ledger asset id                     |
| restriction / lock 상태          | on-ledger restriction state            |
| transfer authority             | Daml controller / signatory / observer |
| contract spend 여부              | active / archived state                |
| package/template compatibility | participant/package validation         |

즉, transfer가 성공하려면 DB row가 아니라 실제 Canton active contract가 있어야 한다.

---

# 6. Layer 2 — Projection DB Write 권한 분리

`holdings_projection`은 일반 API runtime이 쓰면 안 된다.

## 권한 모델

```text
api_service
  - SELECT holdings_projection
  - INSERT intent_audit
  - INSERT api_requests
  - NO UPDATE holdings_projection

intent_runtime
  - INSERT/UPDATE intent state
  - NO direct balance mutation

ledger_sync_service
  - UPSERT holdings_projection
  - INSERT balance_transactions_projection
  - INSERT ledger_update_log
  - update ledger_offsets

event_delivery_service
  - SELECT signed events
  - UPDATE webhook_delivery status only

admin_service
  - config write only
  - NO economic projection mutation
```

핵심:

```text
API service가 balance를 직접 수정할 수 없어야 한다.
Admin service도 balance를 직접 수정할 수 없어야 한다.
오직 Ledger Sync reducer만 ledger update를 근거로 projection을 쓸 수 있어야 한다.
```

---

# 7. Layer 3 — Balance Row에 Ledger Provenance를 붙인다

`holdings_projection` row는 단순히 amount만 저장하면 안 된다.

나쁜 설계:

```sql
holdings_projection (
  account_id,
  asset_id,
  available_amount
);
```

좋은 설계:

```sql
holdings_projection (
  id,
  tenant_id,
  environment_id,
  account_id,
  asset_id,

  available_amount,
  pending_amount,
  restricted_amount,
  settled_amount,

  participant_id,
  party_scope_hash,
  ledger_offset,
  update_id,
  event_id,

  projection_version,
  source_contract_digest,
  row_digest,
  producer_signature,

  integrity_status,
  derived_at,
  updated_at
);
```

각 field의 의미:

| Field                    | 목적                                             |
| ------------------------ | ---------------------------------------------- |
| `ledger_offset`          | 이 balance가 어느 ledger offset까지 반영했는지            |
| `update_id`              | 어떤 ledger update에서 파생됐는지                       |
| `event_id`               | 어떤 ledger event에서 파생됐는지                        |
| `source_contract_digest` | active contract content hash                   |
| `row_digest`             | row 내용의 hash                                   |
| `producer_signature`     | Ledger Sync service가 KMS key로 서명               |
| `integrity_status`       | `verified`, `stale`, `degraded`, `quarantined` |

---

# 8. Layer 4 — Event / Webhook도 DB 조작에 속으면 안 된다

중요한 지점이다.

DB balance가 조작되는 것보다 더 위험한 것은 공격자가 fake event를 삽입하는 것이다.

예:

```sql
INSERT INTO events_projection
(type, related_object_id, payload)
VALUES
('transfer_intent.succeeded', 'ti_fake', '{...}');
```

그러면 고객 시스템이 webhook을 받고 “돈이 들어왔다”고 믿을 수 있다.

따라서 Event Delivery Layer는 DB에 있는 event row를 맹신하면 안 된다.

## 해결책

### Event는 Ledger Sync service가 생성하고 서명한다

```text
Ledger Update observed
  |
  v
Projection reducer
  |
  v
Event builder
  |
  v
producer_signature = Sign_KMS(
  event_id,
  event_type,
  related_object_id,
  ledger_update_id,
  ledger_offset,
  payload_hash
)
  |
  v
events_projection
```

Webhook Delivery service는 전송 전에 검증한다.

```text
Before sending webhook:
  verify producer_signature
  verify ledger_update_id exists
  verify event hash matches payload
  verify endpoint subscription
```

따라서 DB 공격자가 fake event를 넣어도:

```text
producer_signature 없음
또는 signature mismatch
또는 ledger_update_id 없음
```

전송되지 않는다.

---

# 9. Layer 5 — Continuous Reconciliation

Pillar는 projection을 계속 ledger와 대조해야 한다.

```text
Canton State Service / Update Service
  |
  v
Reconciliation Job
  |
  +--> compare holdings_projection
  +--> compare balance_transactions_projection
  +--> compare contract_refs_projection
  +--> compare ledger_offsets
  |
  v
If mismatch:
  mark partition degraded
  alert security
  pause affected event delivery
  force ledger-verified mode
  rebuild projection
```

## Reconciliation 종류

| Type                            |         주기 | 목적                                     |
| ------------------------------- | ---------: | -------------------------------------- |
| Update-stream idempotency check |        실시간 | 중복/누락 update 탐지                        |
| Offset continuity check         |        실시간 | offset jump, rollback, consumer gap 탐지 |
| Holding digest check            |      수분 단위 | projection row 변조 탐지                   |
| State snapshot reconciliation   |        주기적 | active contract set과 projection 비교     |
| Full replay reconciliation      |       필요 시 | 전체 projection 재구성                      |
| Hash-root anchoring             | 시간 단위/일 단위 | projection integrity root 외부 고정        |

---

# 10. Hash Chain / Merkle Root Anchoring

고급 방어로는 projection 변경분을 hash chain으로 묶고, root를 별도 immutable store나 ledger에 anchor한다.

## 예시

```text
ledger_update_1 -> balance_delta_1 -> hash_1
ledger_update_2 -> balance_delta_2 -> hash_2 = H(hash_1, delta_2)
ledger_update_3 -> balance_delta_3 -> hash_3 = H(hash_2, delta_3)
```

주기적으로 root를 저장한다.

```sql
projection_integrity_roots (
  id,
  tenant_id,
  environment_id,
  participant_id,
  from_offset,
  to_offset,
  merkle_root,
  signer_key_id,
  signature,
  anchored_at
);
```

선택적으로 Canton ledger에 checkpoint marker를 남길 수도 있다.

```text
Pillar.Control.ProjectionCheckpoint
  tenant_hash
  environment_hash
  participant_hash
  from_offset
  to_offset
  merkle_root
```

이렇게 하면 DB 공격자가 과거 balance row를 바꿔도 root 검증에서 깨진다.

---

# 11. Contract Ref 조작 방어

DB balance뿐 아니라 `contract_refs_projection`도 조작될 수 있다.

예:

```sql
UPDATE contract_refs_projection
SET contract_id_ciphertext = '<other contract id>'
WHERE external_object_id = 'hld_attacker';
```

이 공격을 막으려면 contract id를 단순 암호화하면 안 된다. **AEAD with associated data**를 사용해야 한다.

## Associated data

암호화 시 다음 값을 함께 묶는다.

```text
tenant_id
environment_id
account_id
asset_id
external_object_id
template_id_hash
participant_id
```

즉, contract id ciphertext를 다른 row에 복사해도 복호화가 실패하거나 integrity check가 실패해야 한다.

```text
Decrypt(contract_id_ciphertext, aad = tenant/env/account/asset/object)
  -> success only if row binding is intact
```

추가로 Daml `Holding` contract 자체에도 `account_ref_hash`를 넣어야 한다.

```daml
template Holding
  with
    owner : Party
    assetId : Text
    accountRefHash : Text
    quantity : Decimal
```

그러면 projection row가 조작되어도 ledger contract와 account binding이 맞지 않으면 command가 실패한다.

---

# 12. Balance를 낮게 조작하는 공격도 중요하다

공격자가 balance를 높이는 것보다, 낮게 조작하는 것도 실제 운영상 심각하다.

예:

```sql
UPDATE holdings_projection
SET available_amount = 0
WHERE account_id = 'acct_victim';
```

이 경우 피해자는 실제로 돈이 있어도 API에서 insufficient balance를 받을 수 있다.

이것은 **theft**는 아니지만 **denial of service**다.

## 해결책

`insufficient_available_holding` 같은 경제적 거절은 projection만 보고 최종 판단하면 안 된다.

권장 정책:

```text
If projection says sufficient:
  submit to ledger; ledger decides

If projection says insufficient:
  check projection integrity and freshness

  if verified and fresh:
    reject early

  if stale/degraded/suspicious:
    perform ledger-verified check
    or return projection_untrusted
```

에러 예시:

```json
{
  "error": {
    "type": "projection_error",
    "code": "projection_untrusted",
    "message": "The holding projection is temporarily degraded. This operation requires ledger verification.",
    "request_id": "req_01J..."
  }
}
```

---

# 13. Degraded Mode

DB tamper나 projection drift가 감지되면 해당 tenant/environment/participant partition을 degraded로 전환한다.

```text
Normal Mode
  - projection reads allowed
  - projection preflight allowed
  - async write path allowed

Degraded Mode
  - balance reads include integrity warning
  - high-value writes require ledger verification
  - webhook delivery from affected events paused unless signed/verified
  - projection rebuild starts

Quarantined Mode
  - affected projection partition not trusted
  - write operations paused or ledger-verified only
  - Workbench shows incident state
  - security/admin approval required to resume
```

API response 예시:

```json
{
  "id": "hld_01J...",
  "object": "holding",
  "available": "950.00",
  "projection": {
    "status": "degraded",
    "reason": "integrity_check_failed",
    "ledger_offset": "00000000000012345",
    "last_verified_at": "2026-05-26T08:15:30Z"
  }
}
```

---

# 14. Write Path의 안전 규칙

Pillar에서 write operation은 다음 규칙을 따라야 한다.

## Rule 1 — Projection은 optimistic preflight다

```text
Projection can say:
  "Looks okay to try"

Projection cannot say:
  "This transfer is economically final"
```

## Rule 2 — Ledger rejection은 정상 경로다

Projection이 잘못되어 command를 제출했는데 ledger가 reject하면, 그것은 시스템 실패가 아니라 정상 방어다.

```text
projection corrupted
  -> command submitted
  -> ledger rejected
  -> intent failed
  -> projection marked suspicious
```

## Rule 3 — High-value operation은 ledger verification gate를 둔다

예:

```text
amount > threshold
new counterparty
restricted asset
regulated asset
projection lag > SLA
reconciliation status != verified
```

이 경우에는 projection만 보고 preflight하지 않고 ledger-derived active state를 직접 확인한다.

## Rule 4 — Final state는 Update Service에서만 온다

`transfer_intent.succeeded`는 command submission 성공으로 만들면 안 된다.

오직:

```text
Ledger update observed
  +
Projection reducer applied
  +
Operation mapped to intent
```

이 세 가지 이후에만 succeeded가 된다.

---

# 15. DB Hardening

경제적 방어와 별개로 DB 자체도 강하게 잠가야 한다.

## Access Control

| Actor                  | 권한                               |
| ---------------------- | -------------------------------- |
| API service            | projection SELECT only           |
| Runtime service        | intent/audit write only          |
| Ledger Sync service    | projection write                 |
| Event Delivery service | delivery status update only      |
| Control Plane service  | config write                     |
| Admin user             | no direct production DB mutation |
| Migration role         | controlled DDL only              |

## Required controls

* Row-level security by `tenant_id`, `environment_id`
* No shared superuser account
* No direct console write in production
* Just-in-time break-glass access
* All admin access audited
* DB credentials short-lived
* KMS-managed secrets
* PITR backups
* immutable audit export
* DDL change approval
* suspicious UPDATE/DELETE alerting on projection tables

## Dangerous SQL should alert immediately

```sql
UPDATE holdings_projection SET available_amount = ...
DELETE FROM balance_transactions_projection ...
UPDATE ledger_offsets SET last_offset = ...
INSERT INTO events_projection ...
UPDATE contract_refs_projection ...
```

Production에서는 이런 mutation이 service identity 없이 발생하면 incident다.

---

# 16. Recommended Schema Additions

기존 schema에 다음을 추가하는 것이 좋다.

## `ledger_update_log`

```sql
ledger_update_log (
  id                    text primary key,
  tenant_id             text not null,
  environment_id        text not null,
  participant_id        text not null,
  ledger_offset         text not null,
  update_id             text not null,
  update_digest         text not null,
  previous_digest       text,
  chain_digest          text not null,
  producer_signature    text not null,
  observed_at           timestamptz not null,
  unique (tenant_id, environment_id, participant_id, update_id)
);
```

## `projection_integrity_roots`

```sql
projection_integrity_roots (
  id                    text primary key,
  tenant_id             text not null,
  environment_id        text not null,
  participant_id        text not null,
  from_offset           text not null,
  to_offset             text not null,
  merkle_root           text not null,
  signer_key_id         text not null,
  signature             text not null,
  anchored_to_ledger    boolean not null default false,
  created_at            timestamptz not null
);
```

## `projection_anomalies`

```sql
projection_anomalies (
  id                    text primary key,
  tenant_id             text not null,
  environment_id        text not null,
  participant_id        text,
  anomaly_type          text not null,
  affected_object_type  text not null,
  affected_object_id    text,
  expected_digest       text,
  actual_digest         text,
  status                text not null,
  detected_at           timestamptz not null,
  resolved_at           timestamptz
);
```

## `holdings_projection` 추가 컬럼

```sql
ALTER TABLE holdings_projection
ADD COLUMN source_contract_digest text,
ADD COLUMN row_digest text,
ADD COLUMN producer_signature text,
ADD COLUMN integrity_status text not null default 'verified',
ADD COLUMN last_verified_at timestamptz;
```

---

# 17. Runtime Guardrail Pseudocode

## Transfer preflight

```python
def create_transfer_intent(req):
    holding = projection.get_holding(
        account=req.from_account,
        asset=req.asset
    )

    if holding.integrity_status != "verified":
        return require_ledger_verified_path(req)

    if holding.sync_lag_ms > MAX_ALLOWED_LAG:
        return require_ledger_verified_path(req)

    if holding.available_amount < req.amount:
        # Only safe to reject if projection is fresh and verified.
        return reject("insufficient_available_holding")

    # Still not final approval.
    # Ledger must validate actual contract state.
    op = intent_compiler.compile_transfer(req)
    canton.submit(op)

    return accepted_intent()
```

## Webhook delivery

```python
def deliver_event(event_id):
    event = db.get_event(event_id)

    if not verify_producer_signature(event):
        quarantine(event)
        raise SecurityError("event_signature_invalid")

    if not ledger_update_log.exists(event.ledger_update_id):
        quarantine(event)
        raise SecurityError("missing_ledger_update")

    payload = build_webhook_payload(event)
    signed_payload = sign_for_endpoint(payload)

    send_webhook(signed_payload)
```

---

# 18. Incident Response: DB Balance Tamper 감지 시

```text
1. Detect
   - row digest mismatch
   - ledger reconciliation mismatch
   - unexpected UPDATE/DELETE audit
   - producer signature failure

2. Contain
   - mark tenant/env/participant partition degraded
   - pause affected webhook deliveries
   - block projection-only rejections
   - force ledger-verified path for writes

3. Investigate
   - identify changed rows
   - inspect DB audit logs
   - inspect service credentials
   - inspect admin access
   - inspect deployment and network logs

4. Recover
   - replay from last verified offset
   - rebuild holdings_projection
   - rebuild balance_transactions_projection
   - rebuild events_projection if affected
   - compare Merkle root / signed digest

5. Resume
   - rotate credentials
   - restore projection status to verified
   - replay undelivered valid events
   - publish incident audit internally
```

---

# 19. API Contract: Balance Read에 Integrity Metadata 포함

Pillar는 balance를 그냥 숫자로만 반환하면 안 된다.

```json
{
  "id": "hld_01J...",
  "object": "holding",
  "account": "acct_01J...",
  "asset": "ast_01J...",
  "available": "950.00",
  "pending": "50.00",
  "restricted": "0.00",
  "settled": "1000.00",
  "projection": {
    "status": "verified",
    "participant_id": "ptcp_01J...",
    "offset": "00000000000012345",
    "update_id": "upd_01J...",
    "sync_lag_ms": 420,
    "last_verified_at": "2026-05-26T08:15:30Z"
  }
}
```

이 metadata가 있어야 고객 시스템도 다음을 판단할 수 있다.

```text
verified balance인가?
stale balance인가?
ledger sync lag가 큰가?
incident/degraded 상태인가?
```

---

# 20. 가장 중요한 설계 문장

Pillar security spec에 다음 문장을 명시해야 한다.

> **A balance projection must never be treated as economic authority.
> It is a cache of ledger-derived state.
> All asset-moving operations must be validated by Canton ledger state and Daml authorization.**

한국어로는:

> **Balance DB는 잔고 원장이 아니라 원장 projection이다.
> 조작될 수 있다고 가정하고 설계한다.
> 조작되어도 Canton ledger 없이는 자산 이동, 발행, 소각, 정산이 불가능해야 한다.**

---

# 21. 최종 Architecture Patch

기존 architecture에 다음 컴포넌트를 추가해야 한다.

```text
+--------------------------------------------------------------------------------+
|                              Projection Integrity Layer                         |
|--------------------------------------------------------------------------------|
|  Row Digest Builder                                                            |
|  Ledger Update Hash Chain                                                       |
|  Producer Signature via KMS                                                     |
|  Merkle Root Builder                                                            |
|  Optional Ledger-anchored Projection Checkpoint                                 |
|  Reconciliation Engine                                                          |
|  Projection Degraded/Quarantine Controller                                      |
+--------------------------------------------------------------------------------+
```

수정된 data flow:

```text
Canton Ledger
   |
   v
Ledger Sync Layer
   |
   +--> ledger_update_log
   |      - update_id
   |      - offset
   |      - update_digest
   |      - chain_digest
   |      - producer_signature
   |
   +--> Projection Reducers
   |      - holdings_projection
   |      - balance_transactions_projection
   |      - transfers_projection
   |
   +--> Projection Integrity Layer
   |      - row_digest
   |      - merkle_root
   |      - reconciliation
   |
   +--> Event Builder
          - signed event envelope
          - ledger_update_id required
          - webhook delivery only after verification
```

---

# 22. Final Answer

DB balance 해킹 우려는 다음 방식으로 해결한다.

1. **DB balance를 source of truth로 쓰지 않는다.**
2. **모든 asset-moving operation은 Canton ledger/Daml contract가 최종 검증한다.**
3. **Projection DB는 Ledger Sync service만 쓸 수 있게 한다.**
4. **Balance row마다 ledger offset, update id, digest, signature를 붙인다.**
5. **Webhook event도 ledger update에 bind하고 producer signature 없이는 전송하지 않는다.**
6. **Reconciliation으로 ledger와 projection을 계속 비교한다.**
7. **조작 감지 시 projection partition을 degraded/quarantined로 전환한다.**
8. **고위험 write는 ledger-verified path로 강제한다.**
9. **Projection은 언제든 ledger replay로 재구성 가능해야 한다.**

이렇게 설계하면 DB balance 해킹은 **자산 탈취가 아니라 탐지 가능한 projection corruption**으로 격리된다.
