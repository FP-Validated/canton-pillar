# Pillar Event Catalog

This catalog is the authoritative v1 list of every public `evt_*` event type Pillar emits. It implements Invariant 8: async workflow is webhook-first, event payloads are immutable per API version, and receivers must be idempotent.

Source references:

- [10 Event / Webhook System](../Architecture/10_Event_Webhook%20System.md)
- [06 TransferIntent / SettlementIntent State Machine](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md)
- [04 Object Model](../Architecture/04_Object%20Model.md)
- [Phase 06 Webhook-first Event System](./Phase_06_Webhook_Event_System.md)
- [DATA_MODEL](./DATA_MODEL.md)

## 1. Event object envelope

Every event persisted in `event_log` and delivered by `services/webhook-dispatcher` uses the same envelope. The envelope is stable for a pinned `api_version`; the inner resource object is rendered according to endpoint payload mode.

```json
{
  "id": "evt_01JZ8K4J5S6Q9X2N8VZ7M8B9C1",
  "object": "event",
  "type": "transfer_intent.succeeded",
  "api_version": "2026-05-26",
  "created": 1782470400,
  "livemode": true,
  "data": {
    "object": {
      "id": "ti_01JZ8K3V2X8ZJ6P4M2N1Q9A7B6",
      "object": "transfer_intent",
      "url": "/v1/transfer_intents/ti_01JZ8K3V2X8ZJ6P4M2N1Q9A7B6"
    },
    "previous_attributes": {
      "status": "processing"
    }
  },
  "request": {
    "id": "req_01JZ8K2T1VQZ8N6P4B3C2D1E0F",
    "idempotency_key": "transfer-2026-05-26-000123"
  }
}
```

Envelope fields:

| Field                      |    Required | Semantics                                                                                                  |
| -------------------------- | ----------: | ---------------------------------------------------------------------------------------------------------- |
| `id`                       |         Yes | Immutable event identifier. Prefix: `evt_`.                                                                |
| `object`                   |         Yes | Always `event`.                                                                                            |
| `type`                     |         Yes | Exact event type string from this catalog.                                                                 |
| `api_version`              |         Yes | Payload rendering version pinned by webhook endpoint or event API request context.                         |
| `data.object`              |         Yes | Thin object reference by default, full resource snapshot when endpoint opts into snapshot mode.            |
| `data.previous_attributes` | Conditional | Changed top-level fields for update/state-transition events; omitted or `{}` for creations and redactions. |
| `created`                  |         Yes | Unix seconds when the immutable event was created.                                                         |
| `livemode`                 |         Yes | `true` for live mode, `false` for sandbox/test mode.                                                       |
| `request.id`               | Conditional | Request ID when caused by a public API mutation; `null` for ledger/system clock events.                    |
| `request.idempotency_key`  | Conditional | Original customer idempotency key when available; `null` for automated/system events.                      |

Envelope invariants:

- `event_log` is produced by `services/projection-worker` for ledger-derived events and by `apps/api` only for explicit config/system mutations.
- `services/webhook-dispatcher` never creates events; it renders and delivers persisted events.
- Event IDs are dedupe keys for webhook receivers and replay jobs.
- Event payloads must not expose Canton contract IDs, template IDs, participant IDs, synchronizer IDs, command IDs, submission IDs, update IDs, or ledger offsets by default.
- Internal trace correlation remains queryable through support/admin surfaces, not the public default payload.

## 2. Event naming convention

Event type grammar:

```text
<resource>.<action>
```

Rules:

| Rule          | Requirement                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Resource name | Public API object name in snake case: `transfer_intent`, `webhook_endpoint`, `compliance_decision`.                    |
| Action name   | Past-tense state transition or lifecycle action: `created`, `updated`, `processing`, `succeeded`, `failed`, `rotated`. |
| Case          | Lowercase ASCII with underscores inside resource names and dots between resource/action.                               |
| Immutability  | Once shipped for an API version, an event type is never repurposed.                                                    |
| Ledger hiding | Event names describe public resources, never Daml templates, contract choices, offsets, or participant internals.      |

Examples:

| Good                              | Why                                                          |
| --------------------------------- | ------------------------------------------------------------ |
| `account.created`                 | Public resource lifecycle.                                   |
| `transfer_intent.processing`      | Intent state-machine transition.                             |
| `webhook_endpoint.secret_rotated` | Operational/config transition with customer action required. |
| `usage.threshold_reached`         | Billing/usage domain event.                                  |

Forbidden forms:

| Bad                       | Reason                                               |
| ------------------------- | ---------------------------------------------------- |
| `evt_transfer_succeeded`  | Prefix belongs to event IDs, not event type strings. |
| `TransferIntentSucceeded` | Not dot-separated lowercase API grammar.             |
| `daml_contract.archived`  | Exposes internal ledger implementation.              |
| `transfer_intent.success` | Not past-tense canonical transition name.            |

## 3. Event taxonomy by resource

The table below is the canonical catalog. `Shape` refers to the resource schema in [DATA_MODEL](./DATA_MODEL.md). Thin payload mode includes only the required reference fields listed in Section 9; snapshot mode includes the full API-versioned object.

| Event type                            | Phase / ticket | Trigger transition                                                                             | Shape                | Previous attributes?                                   | Receiver action                                                                              |
| ------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `account.created`                     | P5.G05         | Account identity is accepted and projected after ledger/config authorization is durable.       | `Account`            | No                                                     | Create tenant/customer account mapping and fetch `/v1/accounts/{id}` before enabling writes. |
| `account.updated`                     | P5.G05         | Mutable account profile, capabilities, metadata, or status changes.                            | `Account`            | Yes: changed fields.                                   | Refresh local account profile and capability cache.                                          |
| `asset.created`                       | P5.G05         | Asset is registered, authorized, and projected as a public `asset`.                            | `Asset`              | No                                                     | Register asset metadata and initialize balance views.                                        |
| `asset.updated`                       | P5.G05         | Asset display metadata, policy reference, or settlement capability changes.                    | `Asset`              | Yes: changed fields.                                   | Refresh asset metadata and risk/routing rules.                                               |
| `asset.suspended`                     | P5.G05         | Asset status changes from active or pending to suspended.                                      | `Asset`              | Yes: `status`, optional `suspension_reason`.           | Stop new issue/redeem/transfer workflows for the asset.                                      |
| `issue_intent.requires_action`        | P5.G05         | Issue intent is accepted but requires approval, signature, funding, or compliance action.      | `IssueIntent`        | Yes when leaving another non-terminal state.           | Present `next_action` to the operator or end user.                                           |
| `issue_intent.processing`             | P5.G05         | Required action is complete and ledger command submission/projection is in progress.           | `IssueIntent`        | Yes: `status`, `next_action`.                          | Mark local workflow pending; do not issue local credit.                                      |
| `issue_intent.succeeded`              | P5.G05         | Ledger-confirmed issuance is projected into holdings/balances.                                 | `IssueIntent`        | Yes: `status`, `amount`, optional resulting `holding`. | Release product fulfillment and reconcile issued amount.                                     |
| `issue_intent.failed`                 | P5.G05         | Issue workflow reaches terminal failure before or after command submission.                    | `IssueIntent`        | Yes: `status`, `last_error`.                           | Notify operator, stop retrying unless a new intent is created.                               |
| `issue_intent.canceled`               | P5.G05         | Customer/API/system cancels an issue intent before terminal success.                           | `IssueIntent`        | Yes: `status`, `cancellation_reason`.                  | Close pending approval/funding work.                                                         |
| `redeem_intent.requires_action`       | P5.G05         | Redemption requires approval, signature, compliance review, or source selection.               | `RedeemIntent`       | Yes when transitioning from another state.             | Request missing action and keep funds available/locked per object state.                     |
| `redeem_intent.processing`            | P5.G05         | Redemption is submitted or waiting for ledger confirmation.                                    | `RedeemIntent`       | Yes: `status`, `next_action`.                          | Mark redemption pending and avoid duplicate redemption.                                      |
| `redeem_intent.succeeded`             | P5.G05         | Ledger-confirmed burn/redeem is projected.                                                     | `RedeemIntent`       | Yes: `status`, resulting balance fields.               | Fulfill off-ledger redemption and reconcile liability reduction.                             |
| `redeem_intent.failed`                | P5.G05         | Redemption reaches terminal failure.                                                           | `RedeemIntent`       | Yes: `status`, `last_error`.                           | Restore local pending state from fetched object and alert operators if needed.               |
| `redeem_intent.canceled`              | P5.G05         | Redemption is canceled before success.                                                         | `RedeemIntent`       | Yes: `status`, `cancellation_reason`.                  | Release local pending redemption workflow.                                                   |
| `transfer_intent.requires_action`     | P5.G05         | Transfer requires signature, approval, counterparty acceptance, funding, or compliance action. | `TransferIntent`     | Yes when leaving another non-terminal state.           | Drive user/operator through `next_action`; do not assume movement.                           |
| `transfer_intent.processing`          | P5.G05         | Transfer has enough inputs and ledger command/completion is in progress.                       | `TransferIntent`     | Yes: `status`, `next_action`.                          | Mark transfer pending and poll/fetch current object when displaying status.                  |
| `transfer_intent.succeeded`           | P5.G05         | Ledger-confirmed transfer projection reaches terminal success.                                 | `TransferIntent`     | Yes: `status`, resulting transfer/holding references.  | Mark transfer complete and reconcile balances from API reads.                                |
| `transfer_intent.failed`              | P5.G05         | Transfer reaches terminal failure.                                                             | `TransferIntent`     | Yes: `status`, `last_error`.                           | Notify caller and unblock dependent workflows safely.                                        |
| `transfer_intent.canceled`            | P5.G05         | Transfer is canceled before ledger-confirmed success.                                          | `TransferIntent`     | Yes: `status`, `cancellation_reason`.                  | Cancel downstream fulfillment and release pending UI/work queues.                            |
| `hold.created`                        | P5.G05         | Hold/lock is ledger-confirmed or projected for a reserved amount.                              | `Hold`               | No                                                     | Reserve local capacity and associate dependent transfer/settlement.                          |
| `hold.released`                       | P5.G05         | Hold is explicitly released without consumption.                                               | `Hold`               | Yes: `status`, `released_at`.                          | Release local reservation and resume available-balance workflows.                            |
| `hold.consumed`                       | P5.G05         | Hold is consumed by transfer, settlement, redemption, or issuance reversal.                    | `Hold`               | Yes: `status`, `consumed_by`.                          | Mark reservation fulfilled and reconcile resulting object.                                   |
| `hold.expired`                        | P6.H07         | Workflow orchestrator expires hold after its ledger/configured deadline.                       | `Hold`               | Yes: `status`, `expires_at`.                           | Release local pending actions and notify user to recreate workflow.                          |
| `webhook_endpoint.created`            | P6.H01         | Webhook endpoint is created and secret is issued once.                                         | `WebhookEndpoint`    | No                                                     | Store the endpoint ID; store returned secret from create response, not event payload.        |
| `webhook_endpoint.secret_rotated`     | P6.H01         | Endpoint signing secret is rotated; overlap window begins.                                     | `WebhookEndpoint`    | Yes: `secret_version`, `rotation_status`.              | Load new signing secret from rotation response and accept old+new during overlap.            |
| `webhook_endpoint.disabled`           | P6.H01         | Endpoint status changes to disabled by API, policy, repeated failure, or admin action.         | `WebhookEndpoint`    | Yes: `status`, `disabled_reason`.                      | Stop expecting deliveries and alert integration owner.                                       |
| `api_key.created`                     | P8.K01         | API key is created and raw secret is returned once by API response.                            | `ApiKey`             | No                                                     | Store key metadata only; raw secret is never present in event.                               |
| `api_key.revoked`                     | P8.K01         | API key is revoked and can no longer authenticate.                                             | `ApiKey`             | Yes: `status`, `revoked_at`.                           | Remove key from local secret stores and rotate dependent services.                           |
| `api_key.rotated`                     | P8.K06         | Key rotation creates a replacement or advances active credential version.                      | `ApiKey`             | Yes: `status`, `rotated_at`, optional `replacement`.   | Deploy replacement key and remove old key before overlap ends.                               |
| `export_job.queued`                   | P11.M04        | Export job request is accepted and queued for asynchronous execution.                          | `ExportJob`          | No                                                     | Display queued state and wait for terminal export event.                                     |
| `export_job.succeeded`                | P11.M04        | Export worker writes artifact metadata and marks job succeeded.                                | `ExportJob`          | Yes: `status`, `completed_at`, `file`.                 | Download file through authenticated API before retention expiry.                             |
| `export_job.failed`                   | P11.M04        | Export worker records terminal failure.                                                        | `ExportJob`          | Yes: `status`, `last_error`.                           | Notify operator and allow a new export request if still needed.                              |
| `file.uploaded`                       | P13.O06        | File upload is completed and file object is persisted.                                         | `File`               | No                                                     | Link file to evidence/workflow after scan result is available.                               |
| `file.scanned`                        | P13.O06        | Malware/content scan completes and scan status is projected.                                   | `File`               | Yes: `scan_status`, `scan_completed_at`.               | Use file only when scan result permits access.                                               |
| `file.deleted`                        | P13.O06        | File is deleted, expired, or removed by retention policy.                                      | `File`               | Yes: `deleted`, `deleted_at`.                          | Remove cached document and stop referencing it in new workflows.                             |
| `evidence_file.linked`                | P8.K05         | Evidence file is linked to compliance decision, account, asset, or workflow.                   | `EvidenceFile`       | No                                                     | Attach evidence metadata to local compliance case.                                           |
| `evidence_file.verified`              | P8.K05         | Evidence verification completes successfully.                                                  | `EvidenceFile`       | Yes: `verification_status`, `verified_at`.             | Advance compliance workflow that depended on evidence.                                       |
| `compliance_decision.approved`        | P8.K04         | Compliance decision changes to approved.                                                       | `ComplianceDecision` | Yes: `status`, `approved_at`.                          | Continue blocked issue/redeem/transfer/onboarding workflow.                                  |
| `compliance_decision.rejected`        | P8.K04         | Compliance decision changes to rejected.                                                       | `ComplianceDecision` | Yes: `status`, `rejection_reason`.                     | Stop workflow and notify customer/operator.                                                  |
| `compliance_decision.requires_action` | P8.K04         | Compliance review requires additional evidence or remediation.                                 | `ComplianceDecision` | Yes: `status`, `next_action`.                          | Collect requested action and resubmit/retry when complete.                                   |
| `onboarding.completed`                | P13.O03        | Customer/account onboarding reaches completed status.                                          | `Onboarding`         | Yes: `status`, `completed_at`.                         | Enable production integration steps and operational routing.                                 |
| `onboarding.failed`                   | P13.O03        | Customer/account onboarding reaches terminal failure.                                          | `Onboarding`         | Yes: `status`, `last_error`.                           | Notify operator and halt go-live automation.                                                 |
| `invoice.created`                     | P14.Q05        | Billing invoice is created from metered usage or subscription schedule.                        | `Invoice`            | No                                                     | Display/pay invoice or sync to accounting system.                                            |
| `invoice.paid`                        | P14.Q05        | Invoice payment is confirmed.                                                                  | `Invoice`            | Yes: `status`, `paid_at`.                              | Mark account current and reconcile billing ledger.                                           |
| `invoice.uncollectible`               | P14.Q05        | Invoice is marked uncollectible after collection policy is exhausted.                          | `Invoice`            | Yes: `status`, `collection_status`.                    | Alert finance and enforce account policy if configured.                                      |
| `usage.threshold_reached`             | P14.Q03        | Usage meter crosses a configured soft or hard threshold.                                       | `UsageThreshold`     | Yes when repeated thresholds advance.                  | Notify customer/admin and throttle or upgrade according to policy.                           |
| `balance.updated`                     | P5.G03         | Available, pending, locked, or settled balance changes after ledger projection.                | `Balance`            | Yes: changed balance dimensions.                       | Re-fetch balance and reconcile local ledger.                                                 |
| `holding.created`                     | P5.G04         | A logical holding appears from issuance, transfer receipt, settlement, or ACS bootstrap.       | `Holding`            | No                                                     | Add holding to local inventory after fetching current state.                                 |
| `holding.updated`                     | P5.G04         | Holding amount, lock status, metadata, or lifecycle changes.                                   | `Holding`            | Yes: changed fields.                                   | Refresh holding and dependent balance views.                                                 |
| `holding.closed`                      | P5.G04         | Holding is fully consumed/archived and no longer active.                                       | `Holding`            | Yes: `status`, `closed_at`.                            | Remove holding from available inventory.                                                     |
| `transfer.created`                    | P5.G05         | A transfer resource is materialized from an accepted transfer intent.                          | `Transfer`           | No                                                     | Record transfer ID and wait for terminal status.                                             |
| `transfer.succeeded`                  | P5.G05         | Transfer object reaches ledger-confirmed success.                                              | `Transfer`           | Yes: `status`, `settled_at`.                           | Fulfill off-ledger obligations and reconcile balances.                                       |
| `transfer.failed`                     | P5.G05         | Transfer object reaches terminal failure.                                                      | `Transfer`           | Yes: `status`, `last_error`.                           | Stop fulfillment and notify operator/customer.                                               |
| `transfer.canceled`                   | P5.G05         | Transfer object is canceled before success.                                                    | `Transfer`           | Yes: `status`, `canceled_at`.                          | Cancel dependent fulfillment.                                                                |
| `request.rate_limit_hit`              | P8.K02         | Authenticated or anonymous request exceeds configured rate limit.                              | `RequestLog`         | No                                                     | Slow client retry schedule; inspect quota usage.                                             |
| `webhook_delivery.failed`             | P6.H04         | Delivery generation exhausts retry policy or hits non-retryable failure.                       | `WebhookDelivery`    | Yes: `status`, `last_error`.                           | Fix receiver and request manual replay.                                                      |
| `webhook_delivery.succeeded`          | P6.H03         | Webhook endpoint returns HTTP 2xx for a delivery generation.                                   | `WebhookDelivery`    | Yes: `status`, `delivered_at`.                         | Optional auditing only; business processing should use original resource event.              |
| `template_version.activated`          | P11.M01        | Search/export readable schema version is activated for reporting/indexing.                     | `TemplateVersion`    | Yes: `status`, `activated_at`.                         | Refresh generated reporting clients or schema-aware ETL.                                     |
| `search_index.rebuilt`                | P11.M02        | Search index rebuild completes for an account/environment.                                     | `SearchIndex`        | Yes: `status`, `completed_at`.                         | Resume search-dependent workflows and clear stale-result warnings.                           |

## 4. Lifecycle events

Lifecycle events describe creation, mutation, disablement, deletion, revocation, or rotation of public objects. They are emitted for resource existence changes, not necessarily for every internal field mutation.

| Resource        | Lifecycle events                                                                           | Source authority                                        |
| --------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Account         | `account.created`, `account.updated`                                                       | Ledger/config projection through P5.G05.                |
| Asset           | `asset.created`, `asset.updated`, `asset.suspended`                                        | Ledger/config projection through P5.G05.                |
| WebhookEndpoint | `webhook_endpoint.created`, `webhook_endpoint.secret_rotated`, `webhook_endpoint.disabled` | Config DB/API through P6.H01.                           |
| ApiKey          | `api_key.created`, `api_key.revoked`, `api_key.rotated`                                    | Security API through P8.K01/P8.K06.                     |
| File            | `file.uploaded`, `file.scanned`, `file.deleted`                                            | Dashboard/docs/onboarding file service through P13.O06. |
| EvidenceFile    | `evidence_file.linked`, `evidence_file.verified`                                           | Compliance/evidence service through P8.K05.             |
| Invoice         | `invoice.created`, `invoice.paid`, `invoice.uncollectible`                                 | Billing service through P14.Q05.                        |

Lifecycle receiver rules:

- Treat lifecycle events as notifications, not as full cache invalidation proofs.
- Fetch the resource by ID when local state controls money movement, access, compliance, or billing.
- Deduplicate by `event.id`; do not deduplicate by resource ID because multiple lifecycle events can target the same object.
- Do not assume a create event arrives before a later update event; delivery ordering is not guaranteed.

## 5. State-machine events

State-machine events are emitted when a public workflow changes status. They are the primary completion channel for intent-first APIs.

| State machine      | Non-terminal events                                             | Terminal success                 | Terminal failure/cancel                              |
| ------------------ | --------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| IssueIntent        | `issue_intent.requires_action`, `issue_intent.processing`       | `issue_intent.succeeded`         | `issue_intent.failed`, `issue_intent.canceled`       |
| RedeemIntent       | `redeem_intent.requires_action`, `redeem_intent.processing`     | `redeem_intent.succeeded`        | `redeem_intent.failed`, `redeem_intent.canceled`     |
| TransferIntent     | `transfer_intent.requires_action`, `transfer_intent.processing` | `transfer_intent.succeeded`      | `transfer_intent.failed`, `transfer_intent.canceled` |
| Hold               | `hold.created`                                                  | `hold.consumed`, `hold.released` | `hold.expired`                                       |
| ExportJob          | `export_job.queued`                                             | `export_job.succeeded`           | `export_job.failed`                                  |
| ComplianceDecision | `compliance_decision.requires_action`                           | `compliance_decision.approved`   | `compliance_decision.rejected`                       |
| Onboarding         | none                                                            | `onboarding.completed`           | `onboarding.failed`                                  |

State-machine invariants:

- Terminal status events are emitted only after the authoritative state is durable.
- Ledger-backed state transitions use ledger projection, not optimistic API response state.
- A receiver must handle duplicate terminal events idempotently and must tolerate receiving a terminal event without having observed all intermediate events.
- `data.previous_attributes.status` is required for state transitions when the previous status is known.
- If the previous status is unknown during rebuild/import, `previous_attributes` may omit `status` but the event still remains immutable.

## 6. Compliance / audit events

Compliance and audit events are operationally sensitive. They must carry enough public context for workflow automation while avoiding raw secrets, private evidence content, and internal reviewer notes.

| Event                                 | Data object          | Sensitive fields excluded from default payload                                                      |
| ------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| `compliance_decision.approved`        | `ComplianceDecision` | Reviewer identity details beyond public audit actor reference, internal notes, vendor raw response. |
| `compliance_decision.rejected`        | `ComplianceDecision` | Full rejection evidence, vendor raw response, internal escalation comments.                         |
| `compliance_decision.requires_action` | `ComplianceDecision` | Private review notes and raw document content.                                                      |
| `evidence_file.linked`                | `EvidenceFile`       | File contents, storage bucket/key, malware scan internals.                                          |
| `evidence_file.verified`              | `EvidenceFile`       | Vendor raw verification payload unless explicit export permission exists.                           |
| `api_key.created`                     | `ApiKey`             | Raw API key secret.                                                                                 |
| `api_key.revoked`                     | `ApiKey`             | Raw key material and secret hash.                                                                   |
| `api_key.rotated`                     | `ApiKey`             | Raw old/new key material.                                                                           |
| `request.rate_limit_hit`              | `RequestLog`         | Authorization header, API key hash, raw IP if policy masks it.                                      |

Audit receiver rules:

- Security-sensitive receivers should fetch current state through authenticated API rather than relying on snapshot event content.
- Raw secrets are never delivered in event payloads, even in snapshot mode.
- Evidence files require authenticated download URLs or API retrieval; webhook payloads include metadata only.
- Compliance events can unblock workflows only when the referenced object still has the expected current status.

## 7. Operational events

Operational events notify customers and operators about integration health, credentials, rate limits, schema/index readiness, and usage thresholds. They are not a substitute for metrics, logs, or alerts, but they are part of the public integration contract.

| Event                             | Phase / ticket | Operational meaning                                           | Receiver expectation                                               |
| --------------------------------- | -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `request.rate_limit_hit`          | P8.K02         | A request exceeded account/project/key rate policy.           | Back off, inspect quotas, and avoid immediate hot retries.         |
| `webhook_endpoint.secret_rotated` | P6.H01         | Endpoint signing secret changed and overlap window is active. | Update verifier secret store.                                      |
| `webhook_endpoint.disabled`       | P6.H01         | Endpoint will no longer receive configured events.            | Fix URL/security/failure reason and re-enable explicitly.          |
| `webhook_delivery.failed`         | P6.H04         | A delivery generation reached DLQ or non-retryable failure.   | Repair receiver and request replay if business event was missed.   |
| `webhook_delivery.succeeded`      | P6.H03         | Delivery generation was accepted by receiver.                 | Use for audit only; do not trigger business state from this event. |
| `api_key.rotated`                 | P8.K06         | Credential rotation occurred or is required.                  | Roll dependent services to the new key.                            |
| `usage.threshold_reached`         | P14.Q03        | Usage crossed configured metering threshold.                  | Notify owner, throttle, upgrade, or enforce policy.                |
| `template_version.activated`      | P11.M01        | Reporting/index schema version is active.                     | Refresh schema-dependent integrations.                             |
| `search_index.rebuilt`            | P11.M02        | Search index rebuild completed.                               | Resume search/report workflows.                                    |

Operational event constraints:

- Operational events may be emitted from API/config/system services, not only ledger projection.
- They still use the standard event envelope and endpoint `api_version` rendering.
- They must include `request.id` when directly caused by an API request.
- They must not leak secret values, raw keys, signing secrets, internal queue names, or infrastructure topology.

## 8. Versioning rules

Versioning rules are binding for every event in this catalog.

| Rule               | Requirement                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint pinning   | Each webhook endpoint has an explicit `api_version`; delivery payloads are rendered to that version.                                                        |
| Event immutability | A persisted event's canonical ID, type, creation time, and version-rendered payload are immutable.                                                          |
| Additive changes   | Optional additive fields may be added within an API version only when old receivers can ignore them safely.                                                 |
| Breaking changes   | Removing fields, changing field type, changing enum meaning, or changing object identity requires a new `api_version` or new event type.                    |
| Type stability     | Event type strings are never repurposed. Deprecation means stop emitting after a documented cutover, not changing semantics.                                |
| Snapshot stability | Snapshot payloads are rendered as the endpoint-pinned API object shape, not as the current server default version.                                          |
| Thin stability     | Thin payload references keep `id`, `object`, and `url` stable across compatible versions.                                                                   |
| Replay rendering   | Manual replay preserves `event.id`; rendering uses the destination endpoint's pinned version unless replay explicitly targets historical payload rendering. |

Breaking examples:

- Renaming `transfer_intent.succeeded` to `transfer.succeeded` is breaking; emit both during migration or introduce a new API version.
- Changing `data.object.status` from string to object is breaking.
- Removing `request.idempotency_key` from API-request-caused events is breaking.
- Adding `data.object.metadata` as an optional object is additive if object schema allows it.

## 9. Payload mode

Pillar supports thin payloads by default and snapshot payloads by endpoint opt-in.

### Thin payload mode

Thin mode is the default for production webhook endpoints.

Required `data.object` fields in thin mode:

| Field      | Requirement                                                                        |
| ---------- | ---------------------------------------------------------------------------------- |
| `id`       | Public object ID for the affected resource.                                        |
| `object`   | Public object name matching [DATA_MODEL](./DATA_MODEL.md).                         |
| `url`      | API URL to retrieve the current object.                                            |
| `livemode` | Included when the referenced object schema includes it.                            |
| `status`   | Included for state-machine events when safe and stable for the pinned API version. |

Thin mode receiver behavior:

- Verify signature using the raw request body.
- Deduplicate by `event.id`.
- Fetch `data.object.url` before making money, compliance, or billing decisions.
- Handle `404` on fetch as a possible deletion/retention race and apply resource-specific rules.

### Snapshot payload mode

Snapshot mode is opt-in per webhook endpoint for audit, legacy integration, and debugging workflows.

Snapshot mode requirements:

| Requirement             | Details                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Full object             | `data.object` includes the API-versioned object snapshot for the event's resource.                                            |
| Previous attributes     | Update/state events include changed top-level fields when known.                                                              |
| Secret exclusion        | Raw secrets, secret hashes, private keys, webhook signing secrets, and raw vendor payloads are excluded.                      |
| Canton hiding           | Contract IDs, template IDs, participant IDs, command IDs, submission IDs, offsets, and update IDs remain excluded by default. |
| Fetch still recommended | Receivers still fetch current state when correctness depends on latest object state.                                          |

Mode selection:

| Endpoint field   | Values                                                           | Default                                                                  |
| ---------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `event_payload`  | `thin`, `snapshot`                                               | `thin`                                                                   |
| `enabled_events` | Explicit event type list or supported wildcard group in API docs | No implicit all-events in live mode unless explicitly configured.        |
| `api_version`    | Date/version string                                              | Endpoint creation version, never implicit server current after creation. |

## 10. Delivery guarantees

Delivery semantics are deliberately conservative and match the ledger/web reality.

| Guarantee             | Pillar contract                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Delivery model        | At-least-once. Exactly-once is not promised.                                                                                         |
| Signature             | Every HTTPS delivery is signed with `Pillar-Signature: t=<unix>,v1=<base64 hmac-sha256>`.                                            |
| Signing input         | HMAC input is `t + "." + raw_body` using the exact raw bytes delivered.                                                              |
| Timestamp tolerance   | Receivers must reject stale timestamps according to documented tolerance.                                                            |
| Ordering              | No global ordering guarantee. No cross-resource ordering guarantee. Receivers must tolerate out-of-order events.                     |
| Per-resource ordering | Best-effort only unless a future API version explicitly adds per-resource sequence fields.                                           |
| Retry                 | Failed HTTPS deliveries retry with durable backoff and jitter until retry window/max attempts expires.                               |
| DLQ                   | Exhausted deliveries move to DLQ for inspection and replay; ledger state is never rolled back.                                       |
| Manual replay         | Replay creates a new delivery identity/generation for the same `event.id`.                                                           |
| Duplicate handling    | Receivers must store processed `event.id` values and make side effects idempotent.                                                   |
| Endpoint disablement  | Disabled/deleted endpoints stop receiving new deliveries; existing in-flight deliveries move to canceled/failed according to policy. |
| Event retention       | Public event retrieval has a retention window; internal audit trace may have longer retention.                                       |

Receiver checklist:

1. Read the raw HTTP body before JSON parsing.
2. Verify `Pillar-Signature` with the endpoint secret and timestamp tolerance.
3. Parse JSON only after signature verification succeeds.
4. Deduplicate by `event.id` before performing side effects.
5. Return 2xx quickly after enqueueing local work.
6. Fetch the current resource for correctness-sensitive decisions.
7. Treat missing intermediate events as normal.
8. Treat duplicate terminal events as normal.
9. Never use webhook delivery success/failure to infer ledger rollback.
10. Use manual replay only after receiver defects are fixed.

## Per-event payload contract matrix

This matrix expands Section 3 into the exact payload obligations receivers can rely on. `Thin fields` are in addition to the envelope. `Snapshot object` names the [DATA_MODEL](./DATA_MODEL.md) object rendered when endpoint `event_payload=snapshot`.

| Event type                            | Thin fields                        | Snapshot object      | `previous_attributes` policy                                           |
| ------------------------------------- | ---------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| `account.created`                     | `id`, `object`, `url`              | `Account`            | Omitted.                                                               |
| `account.updated`                     | `id`, `object`, `url`              | `Account`            | Changed profile, capability, metadata, or status fields.               |
| `asset.created`                       | `id`, `object`, `url`              | `Asset`              | Omitted.                                                               |
| `asset.updated`                       | `id`, `object`, `url`              | `Asset`              | Changed metadata, policy, capability, or status fields.                |
| `asset.suspended`                     | `id`, `object`, `url`, `status`    | `Asset`              | `status`, optional `suspension_reason`.                                |
| `issue_intent.requires_action`        | `id`, `object`, `url`, `status`    | `IssueIntent`        | `status`, `next_action` when changed.                                  |
| `issue_intent.processing`             | `id`, `object`, `url`, `status`    | `IssueIntent`        | `status`, `next_action`.                                               |
| `issue_intent.succeeded`              | `id`, `object`, `url`, `status`    | `IssueIntent`        | `status`, resulting issue references when changed.                     |
| `issue_intent.failed`                 | `id`, `object`, `url`, `status`    | `IssueIntent`        | `status`, `last_error`.                                                |
| `issue_intent.canceled`               | `id`, `object`, `url`, `status`    | `IssueIntent`        | `status`, `cancellation_reason`.                                       |
| `redeem_intent.requires_action`       | `id`, `object`, `url`, `status`    | `RedeemIntent`       | `status`, `next_action` when changed.                                  |
| `redeem_intent.processing`            | `id`, `object`, `url`, `status`    | `RedeemIntent`       | `status`, `next_action`.                                               |
| `redeem_intent.succeeded`             | `id`, `object`, `url`, `status`    | `RedeemIntent`       | `status`, resulting redemption references when changed.                |
| `redeem_intent.failed`                | `id`, `object`, `url`, `status`    | `RedeemIntent`       | `status`, `last_error`.                                                |
| `redeem_intent.canceled`              | `id`, `object`, `url`, `status`    | `RedeemIntent`       | `status`, `cancellation_reason`.                                       |
| `transfer_intent.requires_action`     | `id`, `object`, `url`, `status`    | `TransferIntent`     | `status`, `next_action` when changed.                                  |
| `transfer_intent.processing`          | `id`, `object`, `url`, `status`    | `TransferIntent`     | `status`, `next_action`.                                               |
| `transfer_intent.succeeded`           | `id`, `object`, `url`, `status`    | `TransferIntent`     | `status`, transfer and holding references when changed.                |
| `transfer_intent.failed`              | `id`, `object`, `url`, `status`    | `TransferIntent`     | `status`, `last_error`.                                                |
| `transfer_intent.canceled`            | `id`, `object`, `url`, `status`    | `TransferIntent`     | `status`, `cancellation_reason`.                                       |
| `hold.created`                        | `id`, `object`, `url`, `status`    | `Hold`               | Omitted.                                                               |
| `hold.released`                       | `id`, `object`, `url`, `status`    | `Hold`               | `status`, `released_at`.                                               |
| `hold.consumed`                       | `id`, `object`, `url`, `status`    | `Hold`               | `status`, `consumed_by`.                                               |
| `hold.expired`                        | `id`, `object`, `url`, `status`    | `Hold`               | `status`, `expires_at`.                                                |
| `webhook_endpoint.created`            | `id`, `object`, `url`, `status`    | `WebhookEndpoint`    | Omitted.                                                               |
| `webhook_endpoint.secret_rotated`     | `id`, `object`, `url`, `status`    | `WebhookEndpoint`    | `secret_version`, `rotation_status`; never secret value.               |
| `webhook_endpoint.disabled`           | `id`, `object`, `url`, `status`    | `WebhookEndpoint`    | `status`, `disabled_reason`.                                           |
| `api_key.created`                     | `id`, `object`, `url`, `status`    | `ApiKey`             | Omitted; never raw key.                                                |
| `api_key.revoked`                     | `id`, `object`, `url`, `status`    | `ApiKey`             | `status`, `revoked_at`.                                                |
| `api_key.rotated`                     | `id`, `object`, `url`, `status`    | `ApiKey`             | `status`, `rotated_at`, optional replacement reference; never raw key. |
| `export_job.queued`                   | `id`, `object`, `url`, `status`    | `ExportJob`          | Omitted.                                                               |
| `export_job.succeeded`                | `id`, `object`, `url`, `status`    | `ExportJob`          | `status`, `completed_at`, file reference.                              |
| `export_job.failed`                   | `id`, `object`, `url`, `status`    | `ExportJob`          | `status`, `last_error`.                                                |
| `file.uploaded`                       | `id`, `object`, `url`, `status`    | `File`               | Omitted.                                                               |
| `file.scanned`                        | `id`, `object`, `url`, `status`    | `File`               | `scan_status`, `scan_completed_at`.                                    |
| `file.deleted`                        | `id`, `object`, `url`, `deleted`   | `File`               | `deleted`, `deleted_at`.                                               |
| `evidence_file.linked`                | `id`, `object`, `url`              | `EvidenceFile`       | Omitted.                                                               |
| `evidence_file.verified`              | `id`, `object`, `url`, `status`    | `EvidenceFile`       | `verification_status`, `verified_at`.                                  |
| `compliance_decision.approved`        | `id`, `object`, `url`, `status`    | `ComplianceDecision` | `status`, `approved_at`.                                               |
| `compliance_decision.rejected`        | `id`, `object`, `url`, `status`    | `ComplianceDecision` | `status`, public rejection code.                                       |
| `compliance_decision.requires_action` | `id`, `object`, `url`, `status`    | `ComplianceDecision` | `status`, `next_action`.                                               |
| `onboarding.completed`                | `id`, `object`, `url`, `status`    | `Onboarding`         | `status`, `completed_at`.                                              |
| `onboarding.failed`                   | `id`, `object`, `url`, `status`    | `Onboarding`         | `status`, `last_error`.                                                |
| `invoice.created`                     | `id`, `object`, `url`, `status`    | `Invoice`            | Omitted.                                                               |
| `invoice.paid`                        | `id`, `object`, `url`, `status`    | `Invoice`            | `status`, `paid_at`.                                                   |
| `invoice.uncollectible`               | `id`, `object`, `url`, `status`    | `Invoice`            | `status`, `collection_status`.                                         |
| `usage.threshold_reached`             | `id`, `object`, `url`, `threshold` | `UsageThreshold`     | Threshold cursor when repeated thresholds advance.                     |
| `balance.updated`                     | `id`, `object`, `url`              | `Balance`            | Changed balance dimensions only.                                       |
| `holding.created`                     | `id`, `object`, `url`, `status`    | `Holding`            | Omitted.                                                               |
| `holding.updated`                     | `id`, `object`, `url`, `status`    | `Holding`            | Changed amount, lock, metadata, or status fields.                      |
| `holding.closed`                      | `id`, `object`, `url`, `status`    | `Holding`            | `status`, `closed_at`.                                                 |
| `transfer.created`                    | `id`, `object`, `url`, `status`    | `Transfer`           | Omitted.                                                               |
| `transfer.succeeded`                  | `id`, `object`, `url`, `status`    | `Transfer`           | `status`, `settled_at`.                                                |
| `transfer.failed`                     | `id`, `object`, `url`, `status`    | `Transfer`           | `status`, `last_error`.                                                |
| `transfer.canceled`                   | `id`, `object`, `url`, `status`    | `Transfer`           | `status`, `canceled_at`.                                               |
| `request.rate_limit_hit`              | `id`, `object`, `url`              | `RequestLog`         | Omitted.                                                               |
| `webhook_delivery.failed`             | `id`, `object`, `url`, `status`    | `WebhookDelivery`    | `status`, `last_error`.                                                |
| `webhook_delivery.succeeded`          | `id`, `object`, `url`, `status`    | `WebhookDelivery`    | `status`, `delivered_at`.                                              |
| `template_version.activated`          | `id`, `object`, `url`, `status`    | `TemplateVersion`    | `status`, `activated_at`.                                              |
| `search_index.rebuilt`                | `id`, `object`, `url`, `status`    | `SearchIndex`        | `status`, `completed_at`.                                              |

## Emitting-service ownership

| Service                                     | Event families                                                                                                      | Tickets                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `services/projection-worker`                | Ledger-derived account, asset, balance, holding, transfer, hold, issue, redeem, and transfer intent events.         | P5.G03, P5.G04, P5.G05         |
| `services/workflow-orchestrator`            | Time-triggered hold expiry and delayed state advancement requests whose final event is projected from ledger state. | P6.H07, P5.G05                 |
| `apps/api`                                  | Webhook endpoint lifecycle, API key lifecycle request acceptance, replay request audit, and rate-limit events.      | P6.H01, P8.K01, P8.K02, P8.K06 |
| `services/webhook-dispatcher`               | Delivery status events only; never resource business events.                                                        | P6.H03, P6.H04, P6.H05         |
| `services/search-indexer`                   | Search index rebuild operational events.                                                                            | P11.M02                        |
| `services/export-worker`                    | Export job queued/succeeded/failed events.                                                                          | P11.M04                        |
| `services/compliance-adapter`               | Compliance decision and evidence verification events.                                                               | P8.K04, P8.K05                 |
| `apps/dashboard` / `apps/docs` support APIs | Onboarding and file events surfaced through customer setup flows.                                                   | P13.O03, P13.O06               |
| `services/usage-meter`                      | Usage threshold and invoice lifecycle events.                                                                       | P14.Q03, P14.Q05               |

## Receiver idempotency contract by resource

| Resource family             | Idempotency key                                                    | Safe local action                                                                  |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Account/asset configuration | `event.id` plus current resource `updated` value after fetch.      | Upsert cache; ignore older fetched `updated` values.                               |
| Intent workflows            | `event.id` for side effects, resource ID for current status fetch. | Advance only forward to terminal/current API state; never recreate money movement. |
| Holds/holdings/balances     | `event.id`; current API read for amounts.                          | Recompute local available/locked balances from fetched objects.                    |
| Webhook endpoints/API keys  | `event.id`; request ID for audit correlation.                      | Rotate or disable local integration config exactly once.                           |
| Files/evidence/compliance   | `event.id`; evidence/compliance object ID for case correlation.    | Attach metadata and fetch protected content through API only.                      |
| Export/search/reporting     | `event.id`; job/index ID for workflow status.                      | Download or refresh after terminal success only.                                   |
| Billing/usage               | `event.id`; invoice or threshold ID for accounting correlation.    | Create accounting entry once and reconcile by invoice ID.                          |
| Operational delivery events | `event.id`; delivery ID for support correlation.                   | Alert or clear integration incident; never drive economic state.                   |

## Catalog completeness gates

### Build gate

- `docs/Dev/EVENT_CATALOG.md` exists and is the single authoritative event type catalog for v1 planning.
- Every event type in Section 3 has an emitting phase and ticket ID.
- Every event type uses `resource.action` naming and public object resources only.

### Verify gate

- Catalog enumerates more than 50 event types.
- Envelope fields reproduce `id`, `object=event`, `type`, `api_version`, `data.object`, `data.previous_attributes`, `created`, `livemode`, `request.id`, and `request.idempotency_key`.
- Versioning, payload mode, delivery guarantees, retry, DLQ, signing, idempotent receiver, and manual replay rules are explicit.

### Invariant gate

- Invariant 1: ledger-derived business events are emitted from projected ledger state.
- Invariant 2: event storage is projection/audit/config, not economic truth.
- Invariant 3: public payloads are Stripe-like and Canton-invisible.
- Invariant 8: asynchronous completion is event/webhook-first.
- Regression clauses IC-06 and IC-07 are directly covered by `P5.G05`, `P6.H02`, `P6.H03`, `P6.H04`, and `P6.H05`.
