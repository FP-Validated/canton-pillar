# Runbook: Billing discrepancy

## Trigger

| Field                     | Required content                                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alert names               | `pillar_billing_invoices_total{outcome="mismatch"}`, `PIL-INVOICE-GEN-P1`, `PIL-BILLING-CLOSE-P1`, `PIL-USAGE-GAP-P0`.                                                                                     |
| Manual triggers           | Customer support ticket disputing invoice amount, Finance Ops escalation, account-owner escalation, monthly close reconciliation block.                                                                    |
| Affected planes           | External API, Data Plane, Control Plane, Audit/Config commercial records; never Canton economic authority.                                                                                                 |
| Customer-visible symptoms | Customer sees invoice amount different from expected usage, missing/duplicate line items, wrong plan/tax treatment, delayed invoice correction, or disputed auto-charge.                                   |
| SLO / threat references   | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_usage_event_emission_rate`, `pillar_invoice_generation_success`, `pillar_audit_log_completeness`; [RISK_REGISTER.md](../RISK_REGISTER.md) R-015, R-037, R-043. |

### Trigger checklist

| Check                               | Required action                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Is this customer-impacting?         | Classify severity and place affected invoice in dispute review before any auto-charge if amount is uncertain.            |
| Is economic correctness uncertain?  | Billing is not ledger economic state, but over/under-billing can be material; treat widespread invoice mismatch as SEV1. |
| Is compromise suspected?            | Preserve provider webhooks, API keys audit, billing adapter logs, and Finance Ops actions; include Security.             |
| Is regulator notification possible? | Include Compliance/Finance if tax invoice, regulated customer, or statutory invoice correction deadline is involved.     |
| Is public `/v1` behavior affected?  | Include API owner if `/v1/usage`, `/v1/invoices`, or portal URL responses are wrong.                                     |

## Severity classification

| Severity | Use when                                                                                                                                                                                                    | First response owner                            | Communications                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| SEV1     | Widespread discrepancy, for example more than 5% of invoices in a billing run, systematic overcharge, tax misclassification across tenants, or auto-charge already attempted for materially wrong invoices. | Incident Commander + Billing lead + Finance Ops | Status page if broad, direct customer notice, executive/customer escalation. |
| SEV2     | Single customer with material impact above the contract-defined threshold (`>$X`) or one regulated customer invoice dispute requiring formal correction.                                                    | Billing lead + Finance Ops                      | Direct customer notice with line-item breakdown; account-owner escalation.   |
| SEV3     | Minor amount, advisory rollup mismatch, self-hosted/license-only confusion, or internal mismatch caught before invoice finalization.                                                                        | Billing component owner                         | Internal ticket or support response; customer notice if support case exists. |

### Severity downgrade rules

| From | To     | Evidence required                                                                                                              |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| SEV1 | SEV2   | Mismatch is not systemic; fewer than threshold invoices affected; no auto-charge for incorrect invoices; tax exposure bounded. |
| SEV2 | SEV3   | Amount is immaterial, invoice is not finalized/charged, and customer has accepted corrected breakdown or workaround.           |
| Any  | Closed | Invoice corrected or explained, dispute hold cleared, root-cause fix/backfill complete, next reconciliation clean or tracked.  |

## On-call decision tree

```text
Customer dispute or mismatch alert received
  -> classify severity and materiality
  -> identify invoice, tenant, billing period, deployment mode
  -> place invoice in dispute hold before auto-charge if amount uncertain
  -> compare usage_events -> usage_rollups -> provider invoice line items
  -> branch by dropped event, duplicate event, provider lag, plan change, tax classification
  -> escalate to Finance Ops for customer-facing correction
  -> fix/backfill/rebuild root cause where recoverable
  -> verify next-period reconciliation and mismatch metric baseline
```

| Decision                                                 | If yes                                                                                                     | If no                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| More than 5% of invoices mismatch?                       | SEV1; freeze billing close and auto-charge for affected cohort.                                            | Scope to customer/period/materiality.                    |
| Single customer material impact above `>$X`?             | SEV2; dispute hold and Finance Ops escalation.                                                             | SEV3 unless regulated/tax deadline applies.              |
| Invoice already charged?                                 | Finance Ops decides credit memo/refund path; preserve provider evidence.                                   | Hold invoice and prevent auto-charge until verified.     |
| Raw usage events disagree with expected source counters? | Diagnose P14.Q01/P14.Q02 emission or stream ingestion.                                                     | Compare rollups and provider invoice lines.              |
| Rollups disagree with raw usage events?                  | Rebuild rollup idempotently from raw events and fix P14.Q03.                                               | Compare provider export/import.                          |
| Billing/provider invoice lines disagree with rollups?     | Check P14.Q05 adapter, provider webhook lag, idempotency keys, plan/tax mapping.                           | Check customer expectation/contract plan interpretation. |
| Deployment mode is customer-validator/self-hosted?       | Apply advisory/license-only branch; do not promise hosted usage invoice semantics unless contract says so. | Hosted branch owns provider invoice correction.          |

## Pre-checks (commands to run first)

| Purpose                  | Command / query                                                                                                          | Expected result                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Identify invoice context | `pillarctl billing invoice get inv_<id> --include provider,customer,period,line_items`                                   | Invoice ID, customer, tenant, period, status, provider ID, line items, amount, currency, tax known. |
| Capture customer claim   | `pillarctl support case get <case-id> --fields claimed_amount,invoice_id,period,customer_statement`                      | Claimed amount vs system amount and disputed lines recorded.                                        |
| Check mismatch alert     | `pillarctl metrics query 'sum by (tenant_id,period) (increase(pillar_billing_invoices_total{outcome="mismatch"}[24h]))'` | Confirms scope and whether incident is widespread.                                                  |
| Place dispute hold       | `pillarctl billing invoice hold inv_<id> --reason discrepancy --case <case-id>`                                          | Invoice will not auto-charge/finalize while amount is uncertain.                                    |
| Query raw usage events   | `pillarctl billing usage-events query --tenant <tenant> --period <period> --group-by meter,dedupe_key`                   | Raw count/quantity per meter and duplicates/missing windows visible.                                |
| Compare rollups          | `pillarctl billing reconcile usage --tenant <tenant> --period <period> --raw-vs-rollup`                                  | `usage_events` and `usage_rollups` match or diff is explicit.                                       |
| Compare provider lines   | `pillarctl billing reconcile provider --tenant <tenant> --period <period> --invoice inv_<id>`                            | Provider usage records/invoice line items match local rollups or diff is explicit.                  |
| Capture audit context    | `pillarctl audit search --tenant <tenant> --operation billing --period <period>`                                         | Billing close, invoice import, provider webhook, hold, credit memo actions traceable.               |
| Capture logs             | `pillarctl logs bundle --component usage-meter,billing-adapter --since <duration> --output <case-id>.tar.zst`            | Immutable evidence bundle created.                                                                  |

### Evidence preservation before mutation

| Artifact                | Required before destructive action? | Notes                                                                                  |
| ----------------------- | ----------------------------------: | -------------------------------------------------------------------------------------- |
| Invoice snapshot        |                                 Yes | Local `inv_*` object, provider invoice, line items, status, tax, currency, timestamps. |
| Raw usage events        |                                 Yes | Export tenant+period rows or aggregate evidence before backfill/rebuild.               |
| Usage rollups           |                                 Yes | Capture hourly/daily/monthly rollups before recompute.                                 |
| Provider records        |                                 Yes | Billing invoice, usage records, subscription item, tax profile, webhook event IDs.      |
| Audit rows              |                                 Yes | Include billing close, adapter exports/imports, provider webhook, admin actions.       |
| Customer communications |                                 Yes | Support claim, notice, line-item breakdown, credit memo/refund record.                 |

## Diagnose

| Step | Question                                                       | Evidence                                                                              | Branch                                                    |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1    | Is the customer disputing amount, count, tax, timing, or plan? | Support case, invoice line item, customer statement.                                  | Route to amount/count/tax/plan branch.                    |
| 2    | Does `usage_event` count equal expected source counters?       | `pillar_usage_events_expected_total`, API/command/webhook/export audit source counts. | Dropped event P14.Q01/P14.Q02 or expected-counter bug.    |
| 3    | Are duplicate events present?                                  | Duplicate `dedupe_key`, repeated source event, idempotency replay stats.              | Idempotency violation or usage-meter dedupe bug.          |
| 4    | Do rollups equal raw usage events?                             | Raw-vs-rollup reconciliation, rollup worker logs.                                     | P14.Q03 rollup rebuild/fix.                               |
| 5    | Do provider usage records equal rollups?                       | Billing adapter export idempotency keys and provider records.                         | P14.Q05 provider export/import bug.                       |
| 6    | Is provider invoice stale due to webhook lag?                  | Provider webhook IDs, polling fallback, invoice import timestamps.                    | Retry import/poll; do not alter raw usage.                |
| 7    | Did plan change mid-period?                                    | `pricing_plans`, `customer_billing`, effective periods, subscription item changes.    | P14.Q04/P14.Q10 plan-version handling.                    |
| 8    | Is tax classification wrong?                                   | Tax profile, jurisdiction, provider tax result, compliance review.                    | Finance/Compliance correction; no engineering-only close. |
| 9    | Does deployment mode change billing behavior?                  | Tenant `deploymentMode`: hosted, customer-validator, self-hosted.                     | Hosted provider invoice vs advisory/license-only branch.  |

### Possible causes catalog

| Cause                                               | Symptom                                                                       | Root-cause owner                   | Corrective action                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| Dropped `usage_event`                               | Under-billing or missing usage dashboard line                                 | P14.Q01/P14.Q02                    | Fix emission/stream/fallback, backfill from audit/projection source if recoverable.   |
| Duplicate event                                     | Over-billing                                                                  | P14.Q02/P14.Q03                    | Fix dedupe key/idempotency, rebuild rollup from raw unique events, credit if charged. |
| Billing webhook reconciliation lag                   | Local invoice stale or status mismatch                                        | P14.Q05/P14.Q09                    | Poll provider, replay webhook, import canonical provider invoice.                     |
| Plan change mid-period not handled                  | Wrong price/quantity split                                                    | P14.Q04/P14.Q10                    | Apply effective-period split; correct provider invoice or credit memo.                |
| Tax misclassification                               | Wrong tax amount/jurisdiction                                                 | Finance Ops + Compliance + P14.Q05 | Correct tax profile/provider config; issue tax-compliant correction.                  |
| Customer-validator/self-hosted expectation mismatch | Customer expects hosted metered invoice but contract is advisory/license-only | Billing/Product                    | Send contract-specific explanation and dashboard export.                              |

### Required diagnosis outputs

| Output               | Format                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Impact statement     | `customer / tenant / invoice / period / disputed amount / system amount / deployment mode / hold status`                     |
| Affected objects     | `inv_*`, `usage_rollup`, public operation/event IDs when used as usage evidence; provider IDs only internal.                 |
| Timeline             | UTC timestamps for period close, invoice generation, provider sync, customer dispute, hold, mitigation, correction.          |
| Invariant assessment | Billing records are commercial/audit/config only; no ledger economic truth mutation; public responses hide Canton internals. |
| Next action          | Explain, hold, rebuild, backfill, credit memo, provider retry, root-cause fix, or monitor.                                   |

## Mitigate

| Mitigation class     | Allowed actions                                                                                                 | Forbidden actions                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Invoice safety       | Place invoice in dispute hold, stop auto-charge/finalization, pause billing close for affected cohort.          | Charge disputed invoices while amount is uncertain.                                       |
| Customer safety      | Send acknowledgement and expected breakdown timeline; provide current line-item evidence.                       | Admit fault or promise credit before evidence/Finance Ops review.                         |
| Runtime safety       | Freeze billing adapter export for affected period, pause provider invoice finalization, retry provider imports. | Modify raw usage events or rollups without evidence snapshot and audit.                   |
| Data correction      | Rebuild rollups from raw usage events; backfill missing events only from auditable source events.               | Invent usage events from customer claim alone or use projection as economic truth.        |
| Financial correction | Finance Ops issues Billing credit memo/refund/void/reissue when Pillar is at fault.                              | Engineering manually edits provider invoice totals outside approved Finance Ops workflow. |

### Deployment-mode mitigation branches

| Deployment mode      | Immediate hold                                                                                         | Owner boundary                                                                                              | Customer-facing stance                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `hosted`             | Hold provider invoice/auto-charge in Billing or equivalent.                                             | Pillar owns usage emission, rollup, billing adapter, invoice correction.                                    | Provide detailed line-item breakdown and correction/credit if Pillar fault.                                  |
| `customer-validator` | Hold Pillar-managed commercial invoice if applicable; advisory usage may need customer validator logs. | Shared responsibility; customer-operated validator data may be needed.                                      | Explain advisory vs contractual billable usage; request customer evidence if off-platform usage is relevant. |
| `self-hosted`        | Hold license/control-plane invoice if Pillar generated it; local usage invoice usually not v1.         | Customer operates data plane; Pillar supports signed license/entitlement records and local evidence export. | Clarify license-only semantics; do not claim hosted usage invoice reconciliation unless contracted.          |

### Mitigation record

| Field           | Required value                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Action          | Exact hold, pause, rebuild, provider retry, or Finance Ops correction command/action.                                |
| Owner           | Billing lead, Finance Ops, Incident Commander for SEV1/SEV2.                                                         |
| Start/end       | UTC timestamps.                                                                                                      |
| Expected effect | Auto-charge stopped, mismatch isolated, corrected invoice path available.                                            |
| Rollback        | Remove hold only after Verify complete; reverse rebuild by restoring captured rollup snapshot if rebuild is invalid. |
| Evidence link   | Case ID, invoice snapshot, reconciliation report, provider record, audit bundle.                                     |

## Recover

| Recovery step                                      | Required checks                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Explain customer-valid invoice                     | Line-item breakdown reconciles usage events, rollups, provider lines, taxes, and plan periods.                                        |
| Issue credit memo if Pillar at fault               | Finance Ops creates Billing credit memo/refund/void/reissue with audit reference and customer notice.                                  |
| Fix root cause in emission/rollup/provider adapter | P14.Q01/P14.Q02/P14.Q03/P14.Q05/P14.Q10 fix merged and covered by targeted regression.                                                |
| Backfill if recoverable                            | Missing usage backfilled only from source audit/projection events with deterministic dedupe; customer impact reviewed before billing. |
| Rebuild rollups                                    | Rebuild is idempotent and byte-equal on repeated run; provider export idempotency keys preserved.                                     |
| Clear dispute hold                                 | Finance Ops and Billing lead approve; customer notice sent; invoice status updated.                                                   |

## Verify

| Verification                      | Command / source                                                                              | Pass condition                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Raw-vs-rollup reconciliation      | `pillarctl billing reconcile usage --tenant <tenant> --period <period> --raw-vs-rollup`       | Zero unexplained diff; duplicate/missing events classified.                                |
| Rollup-vs-provider reconciliation | `pillarctl billing reconcile provider --tenant <tenant> --period <period> --invoice inv_<id>` | Provider invoice line items match local rollups and plan/tax mapping.                      |
| Invoice mismatch metric           | `pillarctl metrics query 'sum(rate(pillar_billing_invoices_total{outcome="mismatch"}[30m]))'` | Returns to baseline for affected cohort.                                                   |
| Usage emission SLO                | `pillarctl slo status --slo pillar_usage_event_emission_rate --env prod --window 30m`         | No active `PIL-USAGE-GAP-P0/P1` for affected source.                                       |
| Invoice generation SLO            | `pillarctl slo status --slo pillar_invoice_generation_success --env prod --window 30m`        | `pillar_invoice_generation_success` within target or burn stopped.                         |
| Next-period re-reconcile          | `pillarctl billing reconcile cycle --period <next-period> --tenant <tenant>`                  | Next cycle has no repeat mismatch for the same cause.                                      |
| Customer breakdown                | Support/account-owner case artifact                                                           | Customer received detailed line-item breakdown and correction status.                      |
| Audit integrity                   | `pillarctl audit verify --case <case-id>`                                                     | Hold, rebuild/backfill, provider correction, Finance Ops actions, communications recorded. |

## Communicate (customer-facing message templates)

### Initial status-page update

```text
We are investigating a billing discrepancy affecting <scope>. We have placed affected invoice(s) under review and will not auto-charge disputed amounts while validation is in progress. Next update by <UTC time>.
```

### Degraded service update

```text
Billing reconciliation is currently delayed for <scope>. Usage and invoice APIs may show pending review status for affected invoices. Pillar asset movement and ledger-backed operations are not affected by billing review. Next update by <UTC time>.
```

### Recovery update

```text
We have identified the billing discrepancy for invoice <invoice_id> as <cause summary>. We are applying <correction: corrected invoice/credit memo/explanation> and will send a detailed line-item breakdown through Support.
```

### Resolution update

```text
The billing discrepancy affecting <scope> is resolved. We validated raw usage, rollups, provider invoice line items, plan periods, and tax treatment. Affected customers have received invoice-specific details and any applicable correction.
```

### Security/compliance holding statement

```text
We are investigating a potential billing/compliance issue affecting <scope>. We have preserved invoice, provider, usage, and audit evidence and paused affected billing actions while validation continues.
```

## Post-incident

| Time from resolution | Deliverable                                                                                            | Owner                             |
| -------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------- |
| 2 hours              | Customer impact draft with invoices, amount range, hold/correction status.                             | Incident Commander + Billing lead |
| 24 hours             | Initial report with raw event/rollup/provider comparison and Finance Ops disposition.                  | Billing lead + Finance Ops        |
| 5 business days      | Full post-mortem with root cause, prevention, reconciliation guard, and customer communication review. | Billing lead                      |
| Next billing close   | Regression guard included in monthly close and SLO review.                                             | Billing/runtime owner             |

### Post-incident fields

| Field                      | Required content                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Summary                    | Customer-visible invoice impact and duration.                                                                   |
| Root cause                 | Evidence-backed cause: dropped event, duplicate, provider lag, plan split, tax config, or expectation mismatch. |
| Trigger                    | Customer ticket or `pillar_billing_invoices_total{outcome="mismatch"}` alert.                                   |
| Detection gap              | Why P14.Q09 reconciliation, SLOs, or Finance Ops close review did or did not catch it.                          |
| Mitigation                 | Hold, billing close pause, provider retry, customer notice.                                                     |
| Recovery proof             | Reconciliation commands, provider invoice/correction, next-period clean result.                                 |
| Invariant impact           | Billing did not become ledger economic authority; public billing APIs stayed Canton-invisible.                  |
| Customer/regulator actions | Notices, credit memo, tax correction, or rationale for no regulator action.                                     |
| Follow-up work             | P14 ticket IDs, owners, due dates, verification commands.                                                       |

## Related

- SLOs: [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_usage_event_emission_rate`, `pillar_invoice_generation_success`, `pillar_audit_log_completeness`.
- Phase tickets: [P14.Q01-Q10](../Phase_14_Usage_Metering_Billing.md#9-implementation-plan), [P10.L06](../Phase_10_GA_Hardening.md#9-implementation-plan), [P11.M10](../Phase_11_Search_Export_Reporting.md#9-implementation-plan).
- ADRs: [ADR-0001](../DECISIONS.md#adr-0001-canton-ledger-as-sole-source-of-truth), [ADR-0002](../DECISIONS.md#adr-0002-billing-style-external-api-surface-canton-internals-hidden), [ADR-0005](../DECISIONS.md#adr-0005-projection--audit--config-split-for-pillar-postgres), [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar). [ADR-0014](../DECISIONS.md#adr-0014-event-payload-mode) is not applicable because it governs webhook payload mode, not billing provider choice; billing-provider choice remains open question Q14 in [Phase 14](../Phase_14_Usage_Metering_Billing.md).
- Risks: [RISK_REGISTER.md](../RISK_REGISTER.md) R-015 Billing API breakage, R-037 pricing model rejection, R-043 billing usage meter divergence.
- Release policy: [RELEASE_PLAN.md](../RELEASE_PLAN.md) release packet and customer-facing changelog policy for billing-impacting hotfixes.
- Threats: [THREAT_MODEL.md](../THREAT_MODEL.md) billing provider integration, audit integrity, tenant isolation, and metadata/PII handling entries where applicable.
