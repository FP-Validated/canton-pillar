# Pillar Runbooks

Operational runbooks for Pillar Mission Control. Every runbook MUST follow [\_template.md](./_template.md), preserve Canton Ledger as the economic source of truth, and keep public customer communication Canton-invisible unless a regulator or customer contract explicitly requires deeper operational disclosure.

## Authority links

| Artifact                                                                   | Purpose                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [SLO_CATALOG.md](../SLO_CATALOG.md)                                        | SLOs, SLIs, burn-rate thresholds, severity mapping, alert ownership.                                    |
| [THREAT_MODEL.md](../THREAT_MODEL.md)                                      | Threat scenarios, abuse cases, security escalation triggers, evidence requirements.                     |
| [REGRESSION_CONTRACT.md](../REGRESSION_CONTRACT.md)                        | Invariants that cannot be violated during mitigation or recovery.                                       |
| [DECISIONS.md](../DECISIONS.md)                                            | Accepted ADRs governing source-of-truth, idempotency, webhooks, deployment modes, and command identity. |
| [Phase_10_GA_Hardening.md](../Phase_10_GA_Hardening.md)                    | GA resilience, chaos, runbook, backup, restore, and promotion gates.                                    |
| [22 Pillar Observability](../../Architecture/22_Pillar%20Observability.md) | SRE planes, operational SLO model, alert/runbook architecture.                                          |

## Severity tags

| Severity | Meaning                                                                                                                                 | Incident commander required |                           Customer status page |                                    Executive/regulatory review |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------: | ---------------------------------------------: | -------------------------------------------------------------: |
| SEV1     | Customer-impacting outage, safety risk, ledger-affecting uncertainty, suspected compromise, or material compliance deadline risk.       |                         Yes |                                            Yes |          Required if data/security/regulatory trigger applies. |
| SEV2     | Degraded customer experience, delayed finality/projection/webhooks, partial regional or tenant impact, no known economic inconsistency. |                         Yes |                                        Usually | Required if degradation crosses contract/regulatory threshold. |
| SEV3     | Internal issue, single-tenant advisory, non-customer-impacting alert, failed job with safe retry, or investigation-only event.          |                    Optional | No, unless requested by support/account owner. |                No, unless security/compliance trigger applies. |

## Runbook index

| Runbook                                          | Severity tags    | Owner plane                       | One-line use                                                                                                                                                     |
| ------------------------------------------------ | ---------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [incident-response.md](./incident-response.md)   | SEV1, SEV2, SEV3 | SRE / Incident Command            | General incident intake, classification, command roles, communications, escalation, evidence, post-mortem, and regulator trigger handling.                       |
| [participant-down.md](./participant-down.md)     | SEV1, SEV2       | Canton Command Plane / Deployment | Canton participant, Ledger API, synchronizer, or participant-affinity outage causing command submission, completion, projection, or read-only failover impact.   |
| [projection-rebuild.md](./projection-rebuild.md) | SEV1, SEV2, SEV3 | Projection / Reconciliation       | Rebuild customer-visible balances, holdings, intent states, events, or derived indexes from Canton Ledger/PQS after drift, corruption, or migration failure.     |
| [dar-rollback.md](./dar-rollback.md)             | SEV1, SEV2       | Template Registry / Release       | Roll back or freeze a DAR/package rollout while preserving command compatibility, projection readability, and public `/v1` grammar.                              |
| [api-key-rotation.md](./api-key-rotation.md)     | SEV1, SEV2, SEV3 | Security / API Edge               | Rotate suspected-compromised or scheduled API credentials, webhook signing secrets, OAuth clients, or mTLS bindings without breaking idempotency or audit trace. |
| [webhook-dlq-drain.md](./webhook-dlq-drain.md)   | SEV2, SEV3       | Webhook/Event Plane               | Drain, replay, or quarantine webhook deliveries from DLQ while preserving `event.id`, signature rules, endpoint version pinning, and at-least-once delivery.     |
| [db-restore.md](./db-restore.md)                 | SEV1, SEV2       | Data Plane / Database             | Restore Postgres/Redis/queue state for Projection/Audit/Config only, then reconcile against Canton Ledger before reopening write traffic.                        |
| [migration-rollback.md](./migration-rollback.md) | SEV1, SEV2, SEV3 | Release / Data Plane              | Roll back a failed schema/application migration with invariant checks, idempotency preservation, and projection rebuild fallback.                                |

## Runbook selection matrix

| Symptom                                                   | First runbook                                    | Secondary runbook                                | Stop condition                                                                       |
| --------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Multiple SLO alerts or unclear customer impact            | [incident-response.md](./incident-response.md)   | Component-specific runbook after triage          | Incident commander assigns one primary component lead.                               |
| API writes accepted but no terminal intent state          | [participant-down.md](./participant-down.md)     | [projection-rebuild.md](./projection-rebuild.md) | Command completion and projection freshness SLOs are green.                          |
| Balances/holdings stale or inconsistent                   | [projection-rebuild.md](./projection-rebuild.md) | [db-restore.md](./db-restore.md)                 | Reconciliation diff is zero or explicitly explained by ledger-final state.           |
| New package causes command/projection failures            | [dar-rollback.md](./dar-rollback.md)             | [migration-rollback.md](./migration-rollback.md) | Package registry points to safe version and command compatibility tests pass.        |
| Credential leak, suspicious usage, or unauthorized access | [api-key-rotation.md](./api-key-rotation.md)     | [incident-response.md](./incident-response.md)   | Compromised principal is disabled/rotated and audit scope is bounded.                |
| Customer endpoints missing events                         | [webhook-dlq-drain.md](./webhook-dlq-drain.md)   | [incident-response.md](./incident-response.md)   | Delivery state reaches 2xx or durable DLQ classification with customer notice.       |
| Database loss/corruption                                  | [db-restore.md](./db-restore.md)                 | [projection-rebuild.md](./projection-rebuild.md) | Restored Audit/Config is validated and Projection is rebuilt/reconciled from ledger. |
| Release or migration makes service unhealthy              | [migration-rollback.md](./migration-rollback.md) | [incident-response.md](./incident-response.md)   | Previous application/schema compatibility is restored and smoke checks pass.         |

## Non-negotiable operating rules

| Rule             | Requirement                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source of truth  | Never repair economic asset state by editing Projection rows as authority; derive customer-visible asset state from Canton Ledger/PQS.                                      |
| Public API       | Never expose Canton internal identifiers in customer-facing incident updates, workbench exports, public API responses, or support snippets.                                 |
| Idempotency      | Never mitigate by changing `operation_id` or `command_id` semantics for an already accepted external intended change.                                                       |
| Webhooks         | Never mutate `event.id` during replay; replay creates a new delivery identity only.                                                                                         |
| Deployment modes | Hosted, customer-validator, and self-hosted runbooks may differ in ownership and commands, not in public `/v1` behavior.                                                    |
| Evidence         | Preserve request IDs, operation IDs, audit records, logs, metrics, traces, command attempt records, projection checkpoints, and communications before destructive recovery. |
| Communication    | Prefer status-page facts: impact, scope, mitigation, next update. Do not speculate about root cause before evidence review.                                                 |

## Action steps
1. Triage alert scope and affected environment.
2. Capture dashboard, logs, and command/projection evidence.
3. Apply the documented recovery action with incident commander approval.
4. Validate no duplicate ledger commands and attach evidence.

## Exit criteria
- Alert cleared or downgraded.
- Affected SLO is back within burn-rate policy.
- Evidence is attached to the incident record.

## Evidence checklist
- Alert ID and timestamps.
- Dashboard or log excerpt.
- Owner decision record.
- Validation command output.

## Cross-links
- SLO catalog: `infra/observability/slo/catalog.yaml`.
- Dashboards: `infra/observability/grafana/dashboards/`.

## Last reviewed
2026-05-26
