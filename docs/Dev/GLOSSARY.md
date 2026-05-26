# Pillar Glossary

> Authoritative definitions for every domain term used in architecture, dev plan, code, and customer docs. If a term is used elsewhere with a different meaning, the elsewhere is wrong.

## Index

- [account](#account)
- [AML](#aml)
- [api_key](#api_key)
- [asset](#asset)
- [attempt](#attempt)
- [audit log](#audit-log)
- [balance](#balance)
- [burn rate](#burn-rate)
- [canceled](#canceled)
- [checkpoint](#checkpoint)
- [CLI](#cli)
- [command](#command)
- [command_id](#command_id)
- [completion](#completion)
- [contract_id](#contract_id)
- [cursor](#cursor)
- [customer](#customer)
- [customer-validator](#customer-validator)
- [dashboard](#dashboard)
- [dead_lettered](#dead_lettered)
- [decision](#decision)
- [dedup](#dedup)
- [delivered](#delivered)
- [deploymentMode](#deploymentmode)
- [dev](#dev)
- [dispatch](#dispatch)
- [DLQ](#dlq)
- [docs site](#docs-site)
- [ending_after](#ending_after)
- [ending_before](#ending_before)
- [error budget](#error-budget)
- [event](#event)
- [evidence_file](#evidence_file)
- [expand](#expand)
- [expired](#expired)
- [export_job](#export_job)
- [failed](#failed)
- [file](#file)
- [has_more](#has_more)
- [hold](#hold)
- [holding](#holding)
- [hosted](#hosted)
- [idempotency](#idempotency)
- [Idempotency-Key](#idempotency-key)
- [idempotency_key](#idempotency_key)
- [in_flight](#in_flight)
- [intent](#intent)
- [invoice](#invoice)
- [issue_intent](#issue_intent)
- [KYB](#kyb)
- [KYC](#kyc)
- [ledger_committed](#ledger_committed)
- [ledger_offset](#ledger_offset)
- [list response](#list-response)
- [livemode](#livemode)
- [mainnet](#mainnet)
- [manually_replayed](#manually_replayed)
- [metadata](#metadata)
- [offset](#offset)
- [onboarding](#onboarding)
- [operation](#operation)
- [operation_id](#operation_id)
- [package_id](#package_id)
- [participant](#participant)
- [party](#party)
- [pending](#pending)
- [Pillar-Signature](#pillar-signature)
- [Pillar-Version](#pillar-version)
- [processing](#processing)
- [projected](#projected)
- [projection](#projection)
- [projection lag](#projection-lag)
- [queued](#queued)
- [rebuild](#rebuild)
- [reconciled](#reconciled)
- [reconciliation](#reconciliation)
- [redeem_intent](#redeem_intent)
- [replay](#replay)
- [report_template](#report_template)
- [request_hash](#request_hash)
- [request_id](#request_id)
- [requires_action](#requires_action)
- [restricted key](#restricted-key)
- [retrying](#retrying)
- [runbook](#runbook)
- [sanctions](#sanctions)
- [sandbox](#sandbox)
- [scope](#scope)
- [SDK](#sdk)
- [secret key](#secret-key)
- [self-hosted](#self-hosted)
- [SLI](#sli)
- [SLO](#slo)
- [starting_after](#starting_after)
- [submitted](#submitted)
- [succeeded](#succeeded)
- [synchronizer](#synchronizer)
- [template_id](#template_id)
- [tenant](#tenant)
- [testnet](#testnet)
- [trace](#trace)
- [transfer_intent](#transfer_intent)
- [unknown](#unknown)
- [update_id](#update_id)
- [usage_event](#usage_event)
- [validator](#validator)
- [watermark](#watermark)
- [webhook_attempt](#webhook_attempt)
- [webhook_delivery](#webhook_delivery)
- [webhook_endpoint](#webhook_endpoint)
- [workbench](#workbench)

## Conventions

- Public JSON fields use `snake_case`; code may use language-native casing only behind presenters or generated SDK boundaries.
- Public REST paths use kebab-free plural resource nouns under `/v1`, with object discriminators in `snake_case` and repo paths in `kebab-case`.
- Public IDs are opaque strings with a stable prefix and underscore, for example `acct_`, `asst_`, `op_`, and `evt_`.
- Ticket IDs use `P<phase>.<area-letter><nn>` and dependency cells list explicit comma-separated ticket IDs only.
- Public timestamps use the API contract timestamp format selected by [Phase 02](./Phase_02_API_Contract.md); internal ledger offsets are never substitutes for wall-clock timestamps.
- Decimal amounts are serialized as strings, never floating-point numbers; scale and precision are asset-defined.
- `deploymentMode` is exactly `hosted`, `customer-validator`, or `self-hosted`; `livemode` is a boolean environment flag and not a deployment mode.
- Canton internals (`contract_id`, `template_id`, `party`, `participant`, `package_id`, `command_id`, `submission_id`, `update_id`, `ledger_offset`) are internal trace/runtime vocabulary unless an authorized operational surface explicitly expands them.
- Public mutations are intent-first: `intent -> operation -> command_id -> update_id/ledger_offset -> projection -> event -> webhook_delivery`.
- DB rows are Projection / Audit / Config only; Canton Ledger and Daml contract state are the economic source of truth.

## Terms

### account

- Domain: Pillar public API
- ID prefix: `acct_`
- Definition: A tenant-scoped Pillar public object representing an end customer, wallet, legal sub-account, or business unit that can hold ledger-backed assets through mapped internal Canton parties. An account is the external authorization and ownership abstraction, not a raw ledger identity.
- Distinct from: `tenant`, `customer`, `party`, `participant`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [Phase 02](./Phase_02_API_Contract.md), [README invariants](./README.md#cross-phase-invariants-never-violate)

### AML

- Domain: Security / compliance
- ID prefix: N/A
- Definition: Anti-money-laundering controls applied to onboarding, issuance, redemption, and policy-selected transfers. AML produces compliance decisions and audit evidence; it does not mutate balances directly.
- Distinct from: `KYC`, `KYB`, `sanctions`, `decision`
- See: [Architecture/19](../Architecture/19_Compliance.md), [Phase 08](./Phase_08_Security_Compliance.md), [REGRESSION_CONTRACT](./REGRESSION_CONTRACT.md#2-invariant-clauses)

### api_key

- Domain: API / security
- ID prefix: `ak_`
- Definition: A public object describing an authentication credential issued to a tenant, environment, or restricted scope. The object ID is not the secret; raw secret material is shown only at creation or rotation time.
- Distinct from: `secret key`, `restricted key`, `scope`, `tenant`
- See: [Architecture/12](../Architecture/12_Security.md), [Phase 08](./Phase_08_Security_Compliance.md), [REGRESSION_CONTRACT §4](./REGRESSION_CONTRACT.md#4-object-identity-contract)

### asset

- Domain: Pillar public API
- ID prefix: `asst_`
- Definition: A public object describing an issued Canton-backed asset class or concrete asset representation exposed through Pillar's balance/holding model. It is customer-facing and must not require callers to understand Daml templates or token-standard contracts.
- Distinct from: `holding`, `balance`, `contract_id`, `template_id`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [Phase 02](./Phase_02_API_Contract.md), [REGRESSION_CONTRACT §4](./REGRESSION_CONTRACT.md#4-object-identity-contract)

### attempt

- Domain: Runtime
- ID prefix: N/A
- Definition: One concrete try to perform a dispatch, command submission, or webhook delivery. Attempts are retry evidence and must not create a new economic operation when they repeat the same intended change.
- Distinct from: `operation`, `command`, `webhook_delivery`, `webhook_attempt`
- See: [Architecture/23](../Architecture/23_Implementation%20Plan.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §5](./REGRESSION_CONTRACT.md#5-ledger-trace-contract)

### audit log

- Domain: Security / compliance
- ID prefix: N/A
- Definition: Durable audit records for API requests, key usage, compliance decisions, command traces, webhook deliveries, and operational actions. Audit logs preserve accountability; they are not projections and not economic authority.
- Distinct from: `projection`, `event`, `trace`, `decision`
- See: [Architecture/11](../Architecture/11.Request%20Logs%20Ledger%20Trace%20Audit.md), [Phase 03](./Phase_03_DB_Idempotency.md), [Phase 08](./Phase_08_Security_Compliance.md)

### balance

- Domain: Pillar public API / projection
- ID prefix: `bal_`
- Definition: A projected aggregate of holdings for an account and asset, usually split into available, pending, held, or restricted amounts. A balance is a read model and never the economic source of truth.
- Distinct from: `holding`, `asset`, `projection`, `ledger_offset`
- See: [Architecture/05](../Architecture/05_asset%20read%20model.md), [Phase 05](./Phase_05_Projection_Reconciliation.md), [REGRESSION_CONTRACT §8](./REGRESSION_CONTRACT.md#8-projection-contract)

### burn rate

- Domain: Observability
- ID prefix: N/A
- Definition: The rate at which an SLO error budget is being consumed over a defined window. Burn rate drives alert severity and runbook selection; it is not a raw error count.
- Distinct from: `error budget`, `SLI`, `SLO`, `runbook`
- See: [Architecture/22](../Architecture/22_Pillar%20Observability.md), [Phase 10](./Phase_10_GA_Hardening.md), [REGRESSION_CONTRACT](./REGRESSION_CONTRACT.md#2-invariant-clauses)

### canceled

- Domain: Status enum
- ID prefix: N/A
- Definition: Terminal state indicating an intent, job, or delivery was explicitly stopped before successful completion. Cancellation must preserve audit and idempotency history.
- Distinct from: `failed`, `expired`, `succeeded`, `requires_action`
- See: [Architecture/06](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md), [Phase 02](./Phase_02_API_Contract.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md)

### checkpoint

- Domain: Projection / runtime
- ID prefix: N/A
- Definition: A persisted processing position used by projection, reconciliation, indexing, export, or dispatch workers to resume safely. Checkpoints are derived from offsets or cursors and must support replay.
- Distinct from: `offset`, `watermark`, `ledger_offset`, `cursor`
- See: [Architecture/09](../Architecture/09_Pillar%20Ledger%20Sync%20Layer.md), [Phase 05](./Phase_05_Projection_Reconciliation.md), [REGRESSION_CONTRACT §8](./REGRESSION_CONTRACT.md#8-projection-contract)

### CLI

- Domain: Product / developer tooling
- ID prefix: N/A
- Definition: The command-line tool for sandbox setup, API calls, webhook testing, event replay, and developer diagnostics. CLI output follows the same public API grammar unless explicitly operating in an admin trace mode.
- Distinct from: `SDK`, `workbench`, `docs site`, `dashboard`
- See: [Architecture/15](../Architecture/15_SDK%20Design.md), [Phase 07](./Phase_07_SDK_CLI_Workbench.md), [REGRESSION_CONTRACT §3](./REGRESSION_CONTRACT.md#3-public-api-surface-contract)

### command

- Domain: Canton runtime
- ID prefix: N/A
- Definition: An internal Canton Ledger API command submitted by Pillar to execute a Daml choice or workflow transition. It is compiled from an operation and is not accepted directly from public clients.
- Distinct from: `intent`, `operation`, `command_id`, `submission_id`
- See: [Architecture/07](../Architecture/07_Canton-native%20runtime.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §5](./REGRESSION_CONTRACT.md#5-ledger-trace-contract)

### command_id

- Domain: Canton runtime / trace
- ID prefix: N/A
- Definition: Stable internal Canton command identity derived from the same external intended change. It remains the same across retries for deduplication and is forbidden in public `/v1` responses.
- Distinct from: `operation_id`, `submission_id`, `request_id`, `idempotency_key`
- See: [DECISIONS ADR-0004](./DECISIONS.md#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §3.2](./REGRESSION_CONTRACT.md#32-forbidden-fields-in-public-v1-responses)

### completion

- Domain: Canton runtime
- ID prefix: N/A
- Definition: Ledger API feedback that a submitted command reached an accepted, rejected, or otherwise classified outcome. Completion is correlated with command and operation traces before public state is finalized from projection.
- Distinct from: `ledger_committed`, `projected`, `event`, `webhook_delivery`
- See: [Architecture/07](../Architecture/07_Canton-native%20runtime.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §5](./REGRESSION_CONTRACT.md#5-ledger-trace-contract)

### contract_id

- Domain: Canton internal identifier
- ID prefix: N/A
- Definition: A Daml contract identity for a ledger contract instance. It is internal and fragment-prone; public API consumers must use Pillar objects such as `holding`, `balance`, and `intent` instead.
- Distinct from: `holding`, `asset`, `template_id`, `account`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [REGRESSION_CONTRACT §3.2](./REGRESSION_CONTRACT.md#32-forbidden-fields-in-public-v1-responses), [Phase 02](./Phase_02_API_Contract.md)

### cursor

- Domain: API / SDK
- ID prefix: N/A
- Definition: An opaque pagination position represented by object IDs in public list APIs. Cursor semantics are exposed through `starting_after`, `ending_before`, and `has_more`.
- Distinct from: `offset`, `ledger_offset`, `checkpoint`, `watermark`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [REGRESSION_CONTRACT §3.4](./REGRESSION_CONTRACT.md#34-cursor-pagination-grammar), [Phase 02](./Phase_02_API_Contract.md)

### customer

- Domain: Product / business
- ID prefix: N/A
- Definition: The legal or commercial entity buying or operating Pillar. A customer may own one or more tenants, projects, environments, accounts, and deployment modes.
- Distinct from: `tenant`, `account`, `party`, `participant`
- See: [Architecture/01](../Architecture/01_Pillar%20Product%20Strategy.md), [Architecture/04](../Architecture/04_Object%20Model.md), [Phase 13](./Phase_13_Dashboard_Docs_Onboarding.md)

### customer-validator

- Domain: Deployment
- ID prefix: N/A
- Definition: Deployment mode where the customer controls or owns the validator/participant infrastructure while Pillar preserves the same `/v1` API grammar. It changes responsibility boundaries, not object semantics.
- Distinct from: `hosted`, `self-hosted`, `validator`, `livemode`
- See: [Architecture/18](../Architecture/18_Deployment.md), [DECISIONS ADR-0010](./DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar), [Phase 09](./Phase_09_CICD_Helm_Deployment.md)

### dashboard

- Domain: Product / customer UI
- ID prefix: N/A
- Definition: Customer-facing UI for business users to view accounts, balances, operations, compliance status, invoices, and onboarding progress. It is not the developer/admin workbench and must not expose Canton internals to ordinary users.
- Distinct from: `workbench`, `docs site`, `CLI`, `SDK`
- See: [Architecture/16](../Architecture/16_Pillar%20Workbench%20UX.md), [Phase 13](./Phase_13_Dashboard_Docs_Onboarding.md), [README](./README.md#1-phase-map)

### dead_lettered

- Domain: Status enum / webhooks
- ID prefix: N/A
- Definition: Terminal or operator-action state for a delivery, event task, or dispatch item that exhausted automatic retries and moved to a DLQ. Dead-lettering preserves replay evidence and never rolls back ledger state.
- Distinct from: `retrying`, `failed`, `delivered`, `manually_replayed`
- See: [Architecture/10](../Architecture/10_Event_Webhook%20System.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### decision

- Domain: Security / compliance
- ID prefix: N/A
- Definition: A recorded compliance, risk, onboarding, or operational approval/denial result. Decisions are audit artifacts and policy gates; they are not ledger projections.
- Distinct from: `audit log`, `KYC`, `AML`, `sanctions`
- See: [Architecture/19](../Architecture/19_Compliance.md), [Phase 08](./Phase_08_Security_Compliance.md), [DECISIONS](./DECISIONS.md)

### dedup

- Domain: Runtime / idempotency
- ID prefix: N/A
- Definition: Duplicate suppression for retries of the same intended change, spanning public idempotency and Canton command deduplication. Dedup preserves the same `operation_id` and `command_id` while allowing new submission attempts.
- Distinct from: `idempotency`, `replay`, `attempt`, `submission_id`
- See: [Architecture/07](../Architecture/07_Canton-native%20runtime.md), [DECISIONS ADR-0004](./DECISIONS.md#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt), [REGRESSION_CONTRACT §6](./REGRESSION_CONTRACT.md#6-idempotency-contract)

### delivered

- Domain: Status enum / webhooks
- ID prefix: N/A
- Definition: Webhook delivery status indicating the endpoint accepted a signed payload according to delivery success rules. It describes a delivery outcome, not whether the underlying ledger operation succeeded.
- Distinct from: `succeeded`, `projected`, `webhook_attempt`, `event`
- See: [Architecture/10](../Architecture/10_Event_Webhook%20System.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### deploymentMode

- Domain: Deployment / API
- ID prefix: N/A
- Definition: Canonical enum selecting infrastructure wiring: `hosted`, `customer-validator`, or `self-hosted`. It must not fork public `/v1` grammar or SDK behavior.
- Distinct from: `livemode`, `sandbox`, `dev`, `testnet`, `mainnet`
- See: [Architecture/18](../Architecture/18_Deployment.md), [DECISIONS ADR-0010](./DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar), [README invariant 8](./README.md#cross-phase-invariants-never-violate)

### dev

- Domain: Environment
- ID prefix: N/A
- Definition: Internal or customer development environment used before testnet or mainnet release. Dev may use sandbox ledgers or mock infrastructure only where phase docs explicitly allow, but public API grammar remains stable.
- Distinct from: `sandbox`, `testnet`, `mainnet`, `livemode`
- See: [Architecture/18](../Architecture/18_Deployment.md), [Phase 00](./Phase_00_Foundation.md), [Phase 09](./Phase_09_CICD_Helm_Deployment.md)

### dispatch

- Domain: Runtime
- ID prefix: N/A
- Definition: The act of sending a command, event, webhook, export task, or workflow item from durable state to an external or downstream processor. Dispatch must be retry-safe and traceable.
- Distinct from: `attempt`, `command`, `webhook_delivery`, `operation`
- See: [Architecture/10](../Architecture/10_Event_Webhook%20System.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [Architecture/23](../Architecture/23_Implementation%20Plan.md)

### DLQ

- Domain: Runtime / observability
- ID prefix: N/A
- Definition: Dead-letter queue holding dispatch or processing items that cannot complete automatically after policy-defined retries. DLQ entries require runbook handling or explicit replay.
- Distinct from: `dead_lettered`, `retrying`, `runbook`, `webhook_delivery`
- See: [Architecture/22](../Architecture/22_Pillar%20Observability.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [Phase 10](./Phase_10_GA_Hardening.md)

### docs site

- Domain: Product / developer experience
- ID prefix: N/A
- Definition: Public documentation surface for API reference, guides, changelog, onboarding, and examples. The docs site documents the public grammar and must not teach customers to depend on Canton internals.
- Distinct from: `dashboard`, `workbench`, `SDK`, `CLI`
- See: [Architecture/15](../Architecture/15_SDK%20Design.md), [Phase 07](./Phase_07_SDK_CLI_Workbench.md), [Phase 13](./Phase_13_Dashboard_Docs_Onboarding.md)

### ending_after

- Domain: API / SDK
- ID prefix: N/A
- Definition: Non-canonical pagination name that must not replace Pillar's `ending_before` grammar. If found in public API docs or examples, treat it as a typo or regression.
- Distinct from: `ending_before`, `starting_after`, `cursor`, `has_more`
- See: [REGRESSION_CONTRACT §3.4](./REGRESSION_CONTRACT.md#34-cursor-pagination-grammar), [Phase 02](./Phase_02_API_Contract.md), [Architecture/04](../Architecture/04_Object%20Model.md)

### ending_before

- Domain: API / SDK
- ID prefix: N/A
- Definition: Cursor parameter for reverse pagination ending before the supplied object ID. It is part of the frozen list response grammar.
- Distinct from: `starting_after`, `cursor`, `ledger_offset`, `offset`
- See: [REGRESSION_CONTRACT §3.4](./REGRESSION_CONTRACT.md#34-cursor-pagination-grammar), [Phase 02](./Phase_02_API_Contract.md), [Architecture/04](../Architecture/04_Object%20Model.md)

### error budget

- Domain: Observability
- ID prefix: N/A
- Definition: The allowable amount of unreliability for an SLO over a measurement window. It is consumed according to SLI violations and observed through burn rate.
- Distinct from: `SLO`, `SLI`, `burn rate`, `runbook`
- See: [Architecture/22](../Architecture/22_Pillar%20Observability.md), [Phase 10](./Phase_10_GA_Hardening.md), [REGRESSION_CONTRACT](./REGRESSION_CONTRACT.md#2-invariant-clauses)

### event

- Domain: Pillar public API / webhook system
- ID prefix: `evt_`
- Definition: Immutable API-versioned snapshot of a projected state change. Events are emitted from projected ledger state, not optimistic API state, and may be delivered multiple times through webhooks.
- Distinct from: `webhook_delivery`, `webhook_attempt`, `operation`, `audit log`
- See: [Architecture/10](../Architecture/10_Event_Webhook%20System.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### evidence_file

- Domain: Security / compliance
- ID prefix: `file_`
- Definition: File object whose purpose is compliance, onboarding, dispute, audit, or operational evidence. Evidence files require retention, access control, and audit semantics beyond generic file storage.
- Distinct from: `file`, `decision`, `audit log`, `KYC`
- See: [Architecture/20](../Architecture/20_Files%20Documents%20Evidence.md), [Phase 08](./Phase_08_Security_Compliance.md), [REGRESSION_CONTRACT §2](./REGRESSION_CONTRACT.md#2-invariant-clauses)

### expand

- Domain: API / SDK
- ID prefix: N/A
- Definition: Request parameter grammar for including related objects or privileged trace fragments in a response. Expansion must preserve public API boundaries and must not expose forbidden Canton internals to ordinary callers.
- Distinct from: `metadata`, `trace`, `list response`, `Pillar-Version`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [Phase 02](./Phase_02_API_Contract.md), [REGRESSION_CONTRACT §3.2](./REGRESSION_CONTRACT.md#32-forbidden-fields-in-public-v1-responses)

### expired

- Domain: Status enum
- ID prefix: N/A
- Definition: Terminal state indicating a time-bounded intent, hold, action requirement, key, or delivery window elapsed before completion. Expiration is policy-driven and must be auditable.
- Distinct from: `canceled`, `failed`, `requires_action`, `pending`
- See: [Architecture/06](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [Phase 08](./Phase_08_Security_Compliance.md)

### export_job

- Domain: Search / export / reporting
- ID prefix: `exj_`
- Definition: Async job that produces a downloadable export from projected/audit data under tenant authorization and consistency rules. Export jobs must not become a second source of economic truth.
- Distinct from: `report_template`, `file`, `projection`, `rebuild`
- See: [Architecture/21](../Architecture/21_Search%20Data%20Export%20Reporting.md), [Phase 11](./Phase_11_Search_Export_Reporting.md), [REGRESSION_CONTRACT §8](./REGRESSION_CONTRACT.md#8-projection-contract)

### failed

- Domain: Status enum
- ID prefix: N/A
- Definition: Terminal or classified unsuccessful state for an intent, operation, job, or delivery. Failure must carry enough structured reason and trace data for support without fabricating ledger success.
- Distinct from: `canceled`, `expired`, `dead_lettered`, `unknown`
- See: [Architecture/06](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §5](./REGRESSION_CONTRACT.md#5-ledger-trace-contract)

### file

- Domain: Public API / documents
- ID prefix: `file_`
- Definition: Public object representing an uploaded or generated document, export, evidence artifact, or report artifact. File metadata may be public, but storage URLs and contents remain access-controlled.
- Distinct from: `evidence_file`, `export_job`, `report_template`, `metadata`
- See: [Architecture/20](../Architecture/20_Files%20Documents%20Evidence.md), [Phase 08](./Phase_08_Security_Compliance.md), [Phase 11](./Phase_11_Search_Export_Reporting.md)

### has_more

- Domain: API / SDK
- ID prefix: N/A
- Definition: Boolean field in a list response indicating whether another page exists in the requested direction. It must be deterministic for the chosen cursor and consistency point.
- Distinct from: `cursor`, `starting_after`, `ending_before`, `offset`
- See: [REGRESSION_CONTRACT §3.4](./REGRESSION_CONTRACT.md#34-cursor-pagination-grammar), [Phase 02](./Phase_02_API_Contract.md), [Architecture/04](../Architecture/04_Object%20Model.md)

### hold

- Domain: Pillar public API / ledger-backed workflow
- ID prefix: `hold_`
- Definition: A ledger-backed reservation, lock, or hold-intent over part of a holding so it cannot be spent by conflicting workflows. A hold is traceable through an operation and projected into balances.
- Distinct from: `holding`, `balance`, `transfer_intent`, `operation`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §4](./REGRESSION_CONTRACT.md#4-object-identity-contract)

### holding

- Domain: Pillar public API / projection
- ID prefix: `hld_`
- Definition: A projected representation of ledger-backed ownership or entitlement for a specific account and asset. Holdings are closer to ledger state than balances but still public abstractions, not raw Daml contract IDs.
- Distinct from: `balance`, `hold`, `contract_id`, `asset`
- See: [Architecture/05](../Architecture/05_asset%20read%20model.md), [Phase 05](./Phase_05_Projection_Reconciliation.md), [REGRESSION_CONTRACT §4](./REGRESSION_CONTRACT.md#4-object-identity-contract)

### hosted

- Domain: Deployment
- ID prefix: N/A
- Definition: Deployment mode where Pillar operates the primary platform infrastructure and ledger-facing services for the customer. Hosted changes operational responsibility only; API grammar remains identical.
- Distinct from: `customer-validator`, `self-hosted`, `livemode`, `sandbox`
- See: [Architecture/18](../Architecture/18_Deployment.md), [DECISIONS ADR-0010](./DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar), [Phase 09](./Phase_09_CICD_Helm_Deployment.md)

### idempotency

- Domain: API / runtime
- ID prefix: N/A
- Definition: Contract that retrying the same mutating request with the same tenant, `Idempotency-Key`, and request hash returns the same result and preserves the same operation identity. Idempotency spans public request handling and internal command deduplication.
- Distinct from: `dedup`, `idempotency_key`, `request_hash`, `replay`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [Phase 03](./Phase_03_DB_Idempotency.md), [REGRESSION_CONTRACT §6](./REGRESSION_CONTRACT.md#6-idempotency-contract)

### Idempotency-Key

- Domain: API header
- ID prefix: N/A
- Definition: Required public HTTP header on mutating requests. Same header value plus same tenant and request hash must map to the same response and operation identity; same key with a different request hash is a conflict.
- Distinct from: `idempotency_key`, `request_hash`, `Pillar-Version`, `Pillar-Signature`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [Phase 02](./Phase_02_API_Contract.md), [REGRESSION_CONTRACT §6](./REGRESSION_CONTRACT.md#6-idempotency-contract)

### idempotency_key

- Domain: API / runtime
- ID prefix: N/A
- Definition: Stored normalized value of the `Idempotency-Key` header for a tenant and endpoint. It participates in deriving request identity and operation identity.
- Distinct from: `Idempotency-Key`, `request_hash`, `operation_id`, `command_id`
- See: [Architecture/23](../Architecture/23_Implementation%20Plan.md), [Phase 03](./Phase_03_DB_Idempotency.md), [REGRESSION_CONTRACT §6](./REGRESSION_CONTRACT.md#6-idempotency-contract)

### in_flight

- Domain: Status enum / runtime
- ID prefix: N/A
- Definition: Non-terminal state indicating an operation, command, or delivery has been dispatched and no final completion has been observed. In-flight does not imply ledger commit.
- Distinct from: `submitted`, `ledger_committed`, `processing`, `unknown`
- See: [Architecture/07](../Architecture/07_Canton-native%20runtime.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §5](./REGRESSION_CONTRACT.md#5-ledger-trace-contract)

### intent

- Domain: Runtime / public API pattern
- ID prefix: Type-specific
- Definition: A public or internal record of a user's desired economic change before final ledger confirmation. Intents are state machines that compile into operations and commands.
- Distinct from: `operation`, `command`, `event`, `projection`
- See: [Architecture/06](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md), [DECISIONS ADR-0003](./DECISIONS.md#adr-0003-intent-first-write-path), [README invariant 4](./README.md#cross-phase-invariants-never-violate)

### invoice

- Domain: Usage / billing
- ID prefix: `inv_`
- Definition: Billing object summarizing usage charges, credits, taxes, and payment state for a customer or tenant. Invoices are commercial records and not ledger-backed asset movements unless separately represented by a Pillar economic workflow.
- Distinct from: `usage_event`, `customer`, `tenant`, `report_template`
- See: [Architecture/23](../Architecture/23_Implementation%20Plan.md), [Phase 14](./Phase_14_Usage_Metering_Billing.md), [README](./README.md#1-phase-map)

### issue_intent

- Domain: Pillar public API / ledger-backed workflow
- ID prefix: `issint_`
- Definition: Intent to issue or mint ledger-backed asset quantity under policy and authorization. It progresses through operation and command execution before projected balances change.
- Distinct from: `redeem_intent`, `transfer_intent`, `operation`, `asset`
- See: [Architecture/06](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §4](./REGRESSION_CONTRACT.md#4-object-identity-contract)

### KYB

- Domain: Security / compliance
- ID prefix: N/A
- Definition: Know-your-business checks for legal entities, beneficial owners, and business onboarding. KYB is tenant/customer compliance context, distinct from account-level KYC.
- Distinct from: `KYC`, `AML`, `customer`, `tenant`
- See: [Architecture/19](../Architecture/19_Compliance.md), [Phase 08](./Phase_08_Security_Compliance.md), [Phase 13](./Phase_13_Dashboard_Docs_Onboarding.md)

### KYC

- Domain: Security / compliance
- ID prefix: N/A
- Definition: Know-your-customer checks for natural persons or end users associated with accounts and onboarding. KYC results may gate intents but do not directly change ledger balances.
- Distinct from: `KYB`, `AML`, `sanctions`, `onboarding`
- See: [Architecture/19](../Architecture/19_Compliance.md), [Phase 08](./Phase_08_Security_Compliance.md), [Phase 13](./Phase_13_Dashboard_Docs_Onboarding.md)

### ledger_committed

- Domain: Status enum / runtime
- ID prefix: N/A
- Definition: State indicating the ledger accepted and committed the command. Public finality still waits for projection where the API contract requires projected state or event emission.
- Distinct from: `submitted`, `projected`, `succeeded`, `delivered`
- See: [Architecture/07](../Architecture/07_Canton-native%20runtime.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §5](./REGRESSION_CONTRACT.md#5-ledger-trace-contract)

### ledger_offset

- Domain: Canton runtime / projection
- ID prefix: N/A
- Definition: Ledger stream position used to correlate updates, projection checkpoints, reconciliation, and trace. It is internal and forbidden in public `/v1` responses except privileged trace surfaces.
- Distinct from: `offset`, `cursor`, `checkpoint`, `update_id`
- See: [Architecture/09](../Architecture/09_Pillar%20Ledger%20Sync%20Layer.md), [Phase 05](./Phase_05_Projection_Reconciliation.md), [REGRESSION_CONTRACT §3.2](./REGRESSION_CONTRACT.md#32-forbidden-fields-in-public-v1-responses)

### list response

- Domain: API / SDK
- ID prefix: N/A
- Definition: Standard public response envelope for collection endpoints containing `object`, `data`, pagination fields, and `has_more`. It must preserve cursor grammar across SDKs, CLI, docs, and Workbench.
- Distinct from: `cursor`, `export_job`, `metadata`, `expand`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [Phase 02](./Phase_02_API_Contract.md), [REGRESSION_CONTRACT §3.4](./REGRESSION_CONTRACT.md#34-cursor-pagination-grammar)

### livemode

- Domain: API / environment
- ID prefix: N/A
- Definition: Boolean field indicating whether an object belongs to live production economics versus non-live testing. It is derived from environment/key context and must not be confused with deployment mode.
- Distinct from: `deploymentMode`, `sandbox`, `testnet`, `mainnet`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [REGRESSION_CONTRACT §3.3](./REGRESSION_CONTRACT.md#33-mandatory-public-object-fields), [Phase 02](./Phase_02_API_Contract.md)

### mainnet

- Domain: Environment / deployment
- ID prefix: N/A
- Definition: Production ledger/network environment where live economic workflows run. Mainnet can be served through any deployment mode and normally implies `livemode=true` for public objects.
- Distinct from: `testnet`, `sandbox`, `dev`, `deploymentMode`
- See: [Architecture/18](../Architecture/18_Deployment.md), [Phase 09](./Phase_09_CICD_Helm_Deployment.md), [Phase 10](./Phase_10_GA_Hardening.md)

### manually_replayed

- Domain: Status enum / webhooks/runtime
- ID prefix: N/A
- Definition: State or audit marker indicating an operator or authorized user explicitly replayed a delivery, event, or job. Manual replay preserves original event identity while creating new delivery or attempt evidence where appropriate.
- Distinct from: `replay`, `retrying`, `dead_lettered`, `delivered`
- See: [Architecture/10](../Architecture/10_Event_Webhook%20System.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### metadata

- Domain: API / SDK
- ID prefix: N/A
- Definition: Customer-controlled key-value map present on major public objects for integration context. Metadata is not for secrets, compliance evidence, ledger identifiers, or system state.
- Distinct from: `evidence_file`, `audit log`, `trace`, `expand`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [REGRESSION_CONTRACT §3.3](./REGRESSION_CONTRACT.md#33-mandatory-public-object-fields), [Phase 02](./Phase_02_API_Contract.md)

### offset

- Domain: Runtime / projection
- ID prefix: N/A
- Definition: Generic processing position in a stream, queue, export, index, or projection. Use `ledger_offset` when referring specifically to Canton ledger stream position.
- Distinct from: `ledger_offset`, `cursor`, `checkpoint`, `watermark`
- See: [Architecture/09](../Architecture/09_Pillar%20Ledger%20Sync%20Layer.md), [Phase 05](./Phase_05_Projection_Reconciliation.md), [REGRESSION_CONTRACT §8](./REGRESSION_CONTRACT.md#8-projection-contract)

### onboarding

- Domain: Product / compliance
- ID prefix: `onb_`
- Definition: Customer or account setup workflow collecting business profile, keys, compliance evidence, environment configuration, and readiness checks. Onboarding may create configuration objects but not ledger-backed balances directly.
- Distinct from: `KYC`, `KYB`, `customer`, `tenant`
- See: [Architecture/01](../Architecture/01_Pillar%20Product%20Strategy.md), [Phase 13](./Phase_13_Dashboard_Docs_Onboarding.md), [Phase 08](./Phase_08_Security_Compliance.md)

### operation

- Domain: Runtime / trace
- ID prefix: `op_`
- Definition: Stable internal/public trace object representing one external intended change after request acceptance. Operations connect intent, idempotency, command identity, ledger completion, projection, event, and webhook delivery.
- Distinct from: `intent`, `command`, `attempt`, `event`
- See: [Architecture/23](../Architecture/23_Implementation%20Plan.md), [Phase 03](./Phase_03_DB_Idempotency.md), [REGRESSION_CONTRACT §5](./REGRESSION_CONTRACT.md#5-ledger-trace-contract)

### operation_id

- Domain: Runtime / trace
- ID prefix: `op_`
- Definition: Identifier for an operation, stable for the same tenant, endpoint, idempotency key, and request hash. It is the customer/support handle for tracing a mutation without exposing Canton command IDs.
- Distinct from: `command_id`, `request_id`, `idempotency_key`, `update_id`
- See: [DECISIONS ADR-0004](./DECISIONS.md#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt), [Phase 03](./Phase_03_DB_Idempotency.md), [REGRESSION_CONTRACT §6](./REGRESSION_CONTRACT.md#6-idempotency-contract)

### package_id

- Domain: Canton internal identifier
- ID prefix: N/A
- Definition: Identifier for a compiled Daml package/DAR loaded on ledger infrastructure. It is internal release/runtime state and must not be part of public `/v1` object grammar.
- Distinct from: `template_id`, `contract_id`, `asset`, `Pillar-Version`
- See: [Architecture/17](../Architecture/17_Template%20Registry%20Versioning.md), [REGRESSION_CONTRACT §3.2](./REGRESSION_CONTRACT.md#32-forbidden-fields-in-public-v1-responses), [Phase 12](./Phase_12_Template_Registry_Versioning.md)

### participant

- Domain: Canton topology
- ID prefix: `ptcp_`
- Definition: Canton participant node through which parties submit commands and observe ledger state. Participants are infrastructure/runtime topology, not public account owners.
- Distinct from: `party`, `account`, `validator`, `tenant`
- See: [Architecture/07](../Architecture/07_Canton-native%20runtime.md), [Architecture/18](../Architecture/18_Deployment.md), [REGRESSION_CONTRACT §3.2](./REGRESSION_CONTRACT.md#32-forbidden-fields-in-public-v1-responses)

### party

- Domain: Canton topology
- ID prefix: N/A
- Definition: Canton ledger party that can be an actor, signatory, observer, or controller in Daml workflows. Public users see accounts and tenants, not raw party IDs.
- Distinct from: `account`, `participant`, `tenant`, `customer`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [Architecture/07](../Architecture/07_Canton-native%20runtime.md), [REGRESSION_CONTRACT §3.2](./REGRESSION_CONTRACT.md#32-forbidden-fields-in-public-v1-responses)

### pending

- Domain: Status enum
- ID prefix: N/A
- Definition: Non-terminal state for data, compliance, balance components, or workflow items awaiting confirmation, input, or processing. Pending must not be rendered as ledger success.
- Distinct from: `processing`, `requires_action`, `succeeded`, `projected`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [Phase 02](./Phase_02_API_Contract.md), [Phase 05](./Phase_05_Projection_Reconciliation.md)

### Pillar-Signature

- Domain: Webhook API header
- ID prefix: N/A
- Definition: Header carrying HMAC-SHA256 signature metadata for webhook payload verification. It authenticates delivery origin and freshness; it is not an API request authentication key.
- Distinct from: `secret key`, `api_key`, `webhook_endpoint`, `Pillar-Version`
- See: [Architecture/10](../Architecture/10_Event_Webhook%20System.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### Pillar-Version

- Domain: API header / versioning
- ID prefix: N/A
- Definition: Public request header selecting compatible API response behavior for `/v1` where supported. It must not be used to reveal Canton internals or fork deployment-mode behavior.
- Distinct from: `Pillar-Signature`, `deploymentMode`, `template_id`, `package_id`
- See: [Architecture/03](../Architecture/03_Pillar%20API%20Grammar%20v1.md), [Phase 02](./Phase_02_API_Contract.md), [REGRESSION_CONTRACT §3.1](./REGRESSION_CONTRACT.md#31-v1-stability)

### processing

- Domain: Status enum
- ID prefix: N/A
- Definition: Non-terminal state indicating Pillar accepted work and is progressing through policy, operation, command, projection, or dispatch steps. Processing is broader than submitted or in-flight command state.
- Distinct from: `submitted`, `in_flight`, `projected`, `succeeded`
- See: [Architecture/06](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md), [Phase 02](./Phase_02_API_Contract.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md)

### projected

- Domain: Status enum / projection
- ID prefix: N/A
- Definition: State indicating ledger-derived data has been materialized into Pillar projection tables/read models. Events visible to customers are emitted from projected state, not from optimistic API state.
- Distinct from: `ledger_committed`, `succeeded`, `event`, `projection`
- See: [Architecture/05](../Architecture/05_asset%20read%20model.md), [Phase 05](./Phase_05_Projection_Reconciliation.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### projection

- Domain: Runtime / DB
- ID prefix: N/A
- Definition: Rebuildable DB representation derived from Canton Ledger, PQS, API audit, or config state for reads, search, events, and operations. Projection rows are never the economic source of truth.
- Distinct from: `balance`, `holding`, `audit log`, `reconciliation`
- See: [Architecture/05](../Architecture/05_asset%20read%20model.md), [DECISIONS ADR-0005](./DECISIONS.md#adr-0005-projection--audit--config-split-for-pillar-postgres), [REGRESSION_CONTRACT §8](./REGRESSION_CONTRACT.md#8-projection-contract)

### projection lag

- Domain: Observability / projection
- ID prefix: N/A
- Definition: Distance between the latest known ledger/update position and the latest projected/checkpointed position. Projection lag is an SLI because stale projections delay reads, events, exports, and reconciliation.
- Distinct from: `ledger_offset`, `watermark`, `SLO`, `DLQ`
- See: [Architecture/22](../Architecture/22_Pillar%20Observability.md), [Phase 05](./Phase_05_Projection_Reconciliation.md), [Phase 10](./Phase_10_GA_Hardening.md)

### queued

- Domain: Status enum
- ID prefix: N/A
- Definition: Work has been durably accepted for asynchronous processing but not yet dispatched or executed. Queued state must have a checkpoint or outbox record if recovery matters.
- Distinct from: `submitted`, `processing`, `in_flight`, `retrying`
- See: [Architecture/23](../Architecture/23_Implementation%20Plan.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [Phase 06](./Phase_06_Webhook_Event_System.md)

### rebuild

- Domain: Projection / recovery
- ID prefix: N/A
- Definition: Controlled regeneration of projection/read-model data from ledger/PQS and durable audit/config inputs. Rebuild is a recovery primitive and must not silently invent economic state.
- Distinct from: `replay`, `reconciliation`, `projection`, `export_job`
- See: [Architecture/05](../Architecture/05_asset%20read%20model.md), [Phase 05](./Phase_05_Projection_Reconciliation.md), [REGRESSION_CONTRACT §8](./REGRESSION_CONTRACT.md#8-projection-contract)

### reconciled

- Domain: Status enum / reconciliation
- ID prefix: N/A
- Definition: State indicating observed projection/audit data matches ledger-derived expectations for the checked scope and offset range. Reconciled does not mean immutable; later ledger updates can change future projections.
- Distinct from: `projected`, `succeeded`, `unknown`, `reconciliation`
- See: [Architecture/05](../Architecture/05_asset%20read%20model.md), [Phase 05](./Phase_05_Projection_Reconciliation.md), [REGRESSION_CONTRACT §8](./REGRESSION_CONTRACT.md#8-projection-contract)

### reconciliation

- Domain: Projection / operations
- ID prefix: N/A
- Definition: Process comparing projected/audit state against Canton Ledger/PQS truth to detect drift, corruption, missed updates, or event inconsistencies. Reconciliation reports and repairs projection state but does not authorize asset movement.
- Distinct from: `projection`, `rebuild`, `replay`, `balance`
- See: [Architecture/05](../Architecture/05_asset%20read%20model.md), [Phase 05](./Phase_05_Projection_Reconciliation.md), [REGRESSION_CONTRACT §8](./REGRESSION_CONTRACT.md#8-projection-contract)

### redeem_intent

- Domain: Pillar public API / ledger-backed workflow
- ID prefix: `redint_`
- Definition: Intent to redeem or burn asset quantity under policy and authorization. It creates an operation and ledger command plan before projected balances reflect redemption.
- Distinct from: `issue_intent`, `transfer_intent`, `hold`, `operation`
- See: [Architecture/06](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §4](./REGRESSION_CONTRACT.md#4-object-identity-contract)

### replay

- Domain: Runtime / recovery
- ID prefix: N/A
- Definition: Reprocessing a durable event, ledger update range, webhook event, or job from recorded state. Replay preserves original economic identity where applicable and creates new delivery/attempt evidence only when the replay action is a new attempt.
- Distinct from: `rebuild`, `retrying`, `dedup`, `manually_replayed`
- See: [Architecture/10](../Architecture/10_Event_Webhook%20System.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### report_template

- Domain: Search / export / reporting
- ID prefix: `rpttpl_`
- Definition: Versioned configuration defining a reusable report shape, filters, columns, and output rules. A report template is config; generated reports or files are separate artifacts.
- Distinct from: `export_job`, `file`, `metadata`, `invoice`
- See: [Architecture/21](../Architecture/21_Search%20Data%20Export%20Reporting.md), [Phase 11](./Phase_11_Search_Export_Reporting.md), [Architecture/17](../Architecture/17_Template%20Registry%20Versioning.md)

### request_hash

- Domain: API / idempotency
- ID prefix: N/A
- Definition: Canonical hash of a mutating request payload and relevant routing/version context used with tenant and idempotency key to identify the intended change. Different hash under the same key is an idempotency conflict.
- Distinct from: `idempotency_key`, `request_id`, `operation_id`, `command_id`
- See: [Architecture/23](../Architecture/23_Implementation%20Plan.md), [Phase 03](./Phase_03_DB_Idempotency.md), [REGRESSION_CONTRACT §6](./REGRESSION_CONTRACT.md#6-idempotency-contract)

### request_id

- Domain: API / audit
- ID prefix: `req_`
- Definition: Identifier for one HTTP/API request log entry. Request IDs are per request and do not define economic identity across retries.
- Distinct from: `operation_id`, `idempotency_key`, `request_hash`, `command_id`
- See: [Architecture/11](../Architecture/11.Request%20Logs%20Ledger%20Trace%20Audit.md), [Phase 03](./Phase_03_DB_Idempotency.md), [REGRESSION_CONTRACT §5](./REGRESSION_CONTRACT.md#5-ledger-trace-contract)

### requires_action

- Domain: Status enum
- ID prefix: N/A
- Definition: Non-terminal state indicating user, customer, compliance, or operator input is required before a workflow can proceed. It is not failure and should make the required action explicit.
- Distinct from: `pending`, `processing`, `failed`, `expired`
- See: [Architecture/06](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md), [Phase 02](./Phase_02_API_Contract.md), [Phase 13](./Phase_13_Dashboard_Docs_Onboarding.md)

### restricted key

- Domain: API / security
- ID prefix: `ak_`
- Definition: API key constrained by explicit scopes, environments, objects, or operations. Restricted keys reduce blast radius and must not be treated as full secret keys.
- Distinct from: `secret key`, `api_key`, `scope`, `tenant`
- See: [Architecture/12](../Architecture/12_Security.md), [Phase 08](./Phase_08_Security_Compliance.md), [REGRESSION_CONTRACT §4](./REGRESSION_CONTRACT.md#4-object-identity-contract)

### retrying

- Domain: Status enum / runtime
- ID prefix: N/A
- Definition: Non-terminal state indicating automatic retry policy is active after a failed attempt. Retrying must preserve operation identity and expose enough trace for support.
- Distinct from: `queued`, `in_flight`, `dead_lettered`, `manually_replayed`
- See: [Architecture/10](../Architecture/10_Event_Webhook%20System.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### runbook

- Domain: Observability / operations
- ID prefix: N/A
- Definition: Prescribed operator procedure for alerts, incidents, DLQ handling, projection rebuild, rollback, or deployment recovery. Runbooks must tie symptoms to safe actions and invariants.
- Distinct from: `DLQ`, `SLO`, `trace`, `audit log`
- See: [Architecture/22](../Architecture/22_Pillar%20Observability.md), [Phase 10](./Phase_10_GA_Hardening.md), [REGRESSION_CONTRACT](./REGRESSION_CONTRACT.md#2-invariant-clauses)

### sanctions

- Domain: Security / compliance
- ID prefix: N/A
- Definition: Screening against prohibited persons, entities, jurisdictions, wallets, or counterparties. Sanctions results can block onboarding or operations and must produce auditable decisions.
- Distinct from: `AML`, `KYC`, `KYB`, `decision`
- See: [Architecture/19](../Architecture/19_Compliance.md), [Phase 08](./Phase_08_Security_Compliance.md), [REGRESSION_CONTRACT §2](./REGRESSION_CONTRACT.md#2-invariant-clauses)

### sandbox

- Domain: Environment / developer experience
- ID prefix: N/A
- Definition: Isolated non-live environment for testing API calls, ledger workflows, webhooks, and SDK integrations without affecting live economics. Sandbox is not a deployment mode and normally has `livemode=false`.
- Distinct from: `dev`, `testnet`, `mainnet`, `deploymentMode`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [Phase 00](./Phase_00_Foundation.md), [Phase 07](./Phase_07_SDK_CLI_Workbench.md)

### scope

- Domain: API / security
- ID prefix: N/A
- Definition: Permission boundary attached to API keys, users, services, or internal tokens. Scopes define allowed actions and surfaces; they are not tenants or accounts.
- Distinct from: `restricted key`, `api_key`, `tenant`, `account`
- See: [Architecture/12](../Architecture/12_Security.md), [Phase 08](./Phase_08_Security_Compliance.md), [REGRESSION_CONTRACT §2](./REGRESSION_CONTRACT.md#2-invariant-clauses)

### SDK

- Domain: Product / developer tooling
- ID prefix: N/A
- Definition: Language-specific client library generated or maintained from the Pillar public API contract. SDKs must preserve `/v1` grammar, idempotency, pagination, metadata, versioning, and webhook helpers.
- Distinct from: `CLI`, `workbench`, `docs site`, `dashboard`
- See: [Architecture/15](../Architecture/15_SDK%20Design.md), [Phase 07](./Phase_07_SDK_CLI_Workbench.md), [REGRESSION_CONTRACT §3](./REGRESSION_CONTRACT.md#3-public-api-surface-contract)

### secret key

- Domain: API / security
- ID prefix: N/A
- Definition: Raw credential value used to authenticate API requests or webhook verification secrets. Secret key values are not the same as API key objects and must not be logged or stored in plaintext.
- Distinct from: `api_key`, `restricted key`, `Pillar-Signature`, `scope`
- See: [Architecture/12](../Architecture/12_Security.md), [Phase 08](./Phase_08_Security_Compliance.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### self-hosted

- Domain: Deployment
- ID prefix: N/A
- Definition: Deployment mode where the customer runs Pillar components under their operational control. Self-hosted changes deployment responsibility, not API grammar, idempotency, or webhook semantics.
- Distinct from: `hosted`, `customer-validator`, `mainnet`, `livemode`
- See: [Architecture/18](../Architecture/18_Deployment.md), [DECISIONS ADR-0010](./DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar), [Phase 09](./Phase_09_CICD_Helm_Deployment.md)

### SLI

- Domain: Observability
- ID prefix: N/A
- Definition: Service level indicator, a measurable signal such as projection lag, webhook delivery latency, API availability, or command completion latency. SLIs feed SLO evaluation and error budget burn.
- Distinct from: `SLO`, `error budget`, `burn rate`, `projection lag`
- See: [Architecture/22](../Architecture/22_Pillar%20Observability.md), [Phase 10](./Phase_10_GA_Hardening.md), [REGRESSION_CONTRACT](./REGRESSION_CONTRACT.md#2-invariant-clauses)

### SLO

- Domain: Observability
- ID prefix: N/A
- Definition: Service level objective for an SLI over a defined window. SLOs provide operational promises and determine error budget consumption.
- Distinct from: `SLI`, `error budget`, `burn rate`, `runbook`
- See: [Architecture/22](../Architecture/22_Pillar%20Observability.md), [Phase 10](./Phase_10_GA_Hardening.md), [REGRESSION_CONTRACT](./REGRESSION_CONTRACT.md#2-invariant-clauses)

### starting_after

- Domain: API / SDK
- ID prefix: N/A
- Definition: Cursor parameter for forward pagination beginning after the supplied object ID. It is part of the frozen public list grammar.
- Distinct from: `ending_before`, `cursor`, `offset`, `has_more`
- See: [REGRESSION_CONTRACT §3.4](./REGRESSION_CONTRACT.md#34-cursor-pagination-grammar), [Phase 02](./Phase_02_API_Contract.md), [Architecture/04](../Architecture/04_Object%20Model.md)

### submitted

- Domain: Status enum / runtime
- ID prefix: N/A
- Definition: State indicating a command, job, or dispatch item has been handed to the downstream system. Submitted does not mean in-flight completion, ledger commit, projection, or success.
- Distinct from: `queued`, `in_flight`, `ledger_committed`, `succeeded`
- See: [Architecture/07](../Architecture/07_Canton-native%20runtime.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §5](./REGRESSION_CONTRACT.md#5-ledger-trace-contract)

### succeeded

- Domain: Status enum
- ID prefix: N/A
- Definition: Terminal success state for an intent, operation, job, or workflow according to that object's lifecycle. For economic objects, success must be backed by ledger commit and required projection semantics, not optimistic request acceptance.
- Distinct from: `ledger_committed`, `projected`, `delivered`, `reconciled`
- See: [Architecture/06](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §5](./REGRESSION_CONTRACT.md#5-ledger-trace-contract)

### synchronizer

- Domain: Canton topology
- ID prefix: N/A
- Definition: Canton synchronization domain component coordinating transaction ordering and privacy across participants. It is infrastructure topology and not exposed as a public Pillar object.
- Distinct from: `participant`, `validator`, `party`, `deploymentMode`
- See: [Architecture/07](../Architecture/07_Canton-native%20runtime.md), [Architecture/18](../Architecture/18_Deployment.md), [REGRESSION_CONTRACT §3.2](./REGRESSION_CONTRACT.md#32-forbidden-fields-in-public-v1-responses)

### template_id

- Domain: Canton internal identifier
- ID prefix: N/A
- Definition: Identifier for a Daml template used by ledger contracts. It is internal implementation detail and must not appear in public `/v1` object grammar.
- Distinct from: `package_id`, `contract_id`, `report_template`, `template registry`
- See: [Architecture/17](../Architecture/17_Template%20Registry%20Versioning.md), [REGRESSION_CONTRACT §3.2](./REGRESSION_CONTRACT.md#32-forbidden-fields-in-public-v1-responses), [Phase 12](./Phase_12_Template_Registry_Versioning.md)

### tenant

- Domain: Platform / security boundary
- ID prefix: `ten_`
- Definition: Isolated Pillar platform boundary for API keys, environments, accounts, config, audit, and billing. A tenant is an operational/security scope, not necessarily the same as one customer, account, party, or participant.
- Distinct from: `customer`, `account`, `party`, `participant`
- See: [Architecture/04](../Architecture/04_Object%20Model.md), [Phase 03](./Phase_03_DB_Idempotency.md), [REGRESSION_CONTRACT §6](./REGRESSION_CONTRACT.md#6-idempotency-contract)

### testnet

- Domain: Environment / deployment
- ID prefix: N/A
- Definition: Non-production network environment used to test integrations against realistic infrastructure and ledger behavior. Testnet is not the same as local sandbox and may run any deployment mode.
- Distinct from: `sandbox`, `dev`, `mainnet`, `livemode`
- See: [Architecture/18](../Architecture/18_Deployment.md), [Phase 09](./Phase_09_CICD_Helm_Deployment.md), [Phase 10](./Phase_10_GA_Hardening.md)

### trace

- Domain: Audit / operations
- ID prefix: N/A
- Definition: Correlated evidence chain connecting request, idempotency, intent, operation, command, submission attempt, completion, update, projection, event, and webhook delivery. Trace is an operational support surface and must respect public/private boundary rules.
- Distinct from: `audit log`, `operation`, `event`, `expand`
- See: [Architecture/11](../Architecture/11.Request%20Logs%20Ledger%20Trace%20Audit.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §5](./REGRESSION_CONTRACT.md#5-ledger-trace-contract)

### transfer_intent

- Domain: Pillar public API / ledger-backed workflow
- ID prefix: `trint_`
- Definition: Intent to transfer asset quantity between accounts under authorization, policy, and ledger validation. It is not a direct transaction object; it becomes one or more operations/commands before projected state changes.
- Distinct from: `issue_intent`, `redeem_intent`, `operation`, `command`
- See: [Architecture/06](../Architecture/06_TransferIntent_SettlementIntent%20State%20Machine.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [REGRESSION_CONTRACT §4](./REGRESSION_CONTRACT.md#4-object-identity-contract)

### unknown

- Domain: Status enum / runtime
- ID prefix: N/A
- Definition: Conservative state used when Pillar cannot yet classify a command, operation, projection, or delivery outcome. Unknown must trigger recovery/reconciliation behavior rather than being rendered as success.
- Distinct from: `failed`, `in_flight`, `reconciled`, `succeeded`
- See: [Architecture/07](../Architecture/07_Canton-native%20runtime.md), [Phase 04](./Phase_04_Ledger_Command_Runtime.md), [Phase 10](./Phase_10_GA_Hardening.md)

### update_id

- Domain: Canton runtime / trace
- ID prefix: N/A
- Definition: Internal ledger update identifier observed after command execution or stream processing. It is used for correlation, projection, and reconciliation and is forbidden in public `/v1` responses unless privileged trace expansion allows it.
- Distinct from: `ledger_offset`, `command_id`, `operation_id`, `event`
- See: [Architecture/09](../Architecture/09_Pillar%20Ledger%20Sync%20Layer.md), [Phase 05](./Phase_05_Projection_Reconciliation.md), [REGRESSION_CONTRACT §3.2](./REGRESSION_CONTRACT.md#32-forbidden-fields-in-public-v1-responses)

### usage_event

- Domain: Usage / billing
- ID prefix: `use_`
- Definition: Metering record for billable platform activity such as API calls, ledger commands, webhooks, storage, exports, or environments. Usage events support invoicing and analytics but are not public ledger events.
- Distinct from: `event`, `invoice`, `audit log`, `webhook_delivery`
- See: [Architecture/23](../Architecture/23_Implementation%20Plan.md), [Phase 14](./Phase_14_Usage_Metering_Billing.md), [REGRESSION_CONTRACT](./REGRESSION_CONTRACT.md#2-invariant-clauses)

### validator

- Domain: Canton / deployment
- ID prefix: N/A
- Definition: Canton infrastructure role associated with operating participant/validator services for ledger connectivity. In Pillar docs, validator is infrastructure, not a public customer account or tenant.
- Distinct from: `participant`, `synchronizer`, `deploymentMode`, `customer-validator`
- See: [Architecture/18](../Architecture/18_Deployment.md), [Phase 09](./Phase_09_CICD_Helm_Deployment.md), [DECISIONS ADR-0010](./DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar)

### watermark

- Domain: Runtime / observability
- ID prefix: N/A
- Definition: Highest known safe processing point for a stream, projection, export, or reconciliation process. Watermarks describe freshness and completeness; they are not public pagination cursors.
- Distinct from: `checkpoint`, `offset`, `ledger_offset`, `cursor`
- See: [Architecture/09](../Architecture/09_Pillar%20Ledger%20Sync%20Layer.md), [Architecture/22](../Architecture/22_Pillar%20Observability.md), [Phase 05](./Phase_05_Projection_Reconciliation.md)

### webhook_attempt

- Domain: Webhook runtime
- ID prefix: `wha_`
- Definition: One HTTP attempt to deliver a webhook delivery payload to an endpoint. Attempts record response status, latency, error, and retry evidence; they do not change event identity.
- Distinct from: `webhook_delivery`, `event`, `attempt`, `delivered`
- See: [Architecture/10](../Architecture/10_Event_Webhook%20System.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### webhook_delivery

- Domain: Pillar public API / webhook system
- ID prefix: `wd_`
- Definition: Delivery record for sending one event payload to one webhook endpoint with endpoint-specific version and signature context. Replaying an event creates new delivery evidence while preserving the event ID.
- Distinct from: `event`, `webhook_attempt`, `webhook_endpoint`, `dispatch`
- See: [Architecture/10](../Architecture/10_Event_Webhook%20System.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### webhook_endpoint

- Domain: Pillar public API / webhook system
- ID prefix: `we_`
- Definition: Tenant-configured HTTPS destination and event subscription policy for webhook deliveries, including pinned API version and signing secret lifecycle. It is configuration, not a delivered event.
- Distinct from: `event`, `webhook_delivery`, `webhook_attempt`, `Pillar-Signature`
- See: [Architecture/10](../Architecture/10_Event_Webhook%20System.md), [Phase 06](./Phase_06_Webhook_Event_System.md), [REGRESSION_CONTRACT §7](./REGRESSION_CONTRACT.md#7-webhook-contract)

### workbench

- Domain: Product / developer-admin UI
- ID prefix: N/A
- Definition: Developer/admin UI for API exploration, webhook inspection, ledger trace diagnostics, projection health, sandbox tooling, and operational visibility. It is distinct from the customer-facing dashboard and may expose privileged trace only under authorization.
- Distinct from: `dashboard`, `docs site`, `CLI`, `SDK`
- See: [Architecture/16](../Architecture/16_Pillar%20Workbench%20UX.md), [Phase 07](./Phase_07_SDK_CLI_Workbench.md), [REGRESSION_CONTRACT §3](./REGRESSION_CONTRACT.md#3-public-api-surface-contract)
