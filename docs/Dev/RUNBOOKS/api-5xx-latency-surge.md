# Api 5Xx Latency Surge

## Incident class
P10 GA hardening incident response for `api-5xx-latency-surge`.

## Prereqs
Access to Workbench, Grafana dashboards, Prometheus alerts, Kubernetes logs, and the latest chaos/perf evidence packet.

## Scope
Stabilize the affected Pillar component while preserving ledger source-of-truth, stable command_id semantics, unique submission_id per attempt, and detect-not-correct reconciliation behavior.

## Action steps
1. Confirm active alert severity and affected environment.
2. Open the relevant Grafana dashboard and capture current SLO burn-rate, request rate, projection lag, webhook backlog, and participant health.
3. Freeze risky manual mutations unless the incident commander approves.
4. Validate command correlation for any retried mutation: command_id must remain stable and submission_id must be unique per retry attempt.
5. Apply the component-specific recovery action: restart participant or worker, drain webhook DLQ, rerun projection rebuild, fail over, rotate keys, or restore backup according to the incident type.
6. Run the matching chaos scenario or deterministic mock and attach the JSON report.
7. Update the incident timeline and customer-facing status when status is degraded, read-only, outage, maintenance, or resolved.

## Exit criteria
- P0/P1 alerts resolved or explicitly downgraded.
- SLO burn-rate is below page threshold for two consecutive windows.
- No duplicate ledger commands observed.
- Projection mismatches are detected and either rebuilt from ledger or documented for follow-up.
- Webhook attempts continue or affected endpoints are disabled with owner approval.

## Evidence checklist
- Alert ID and timestamps.
- Dashboard screenshot or exported panel JSON.
- Chaos/perf report path.
- Sampled ledger command_id/submission_id/operation_id rows.
- Projection watermark and rebuild job result.
- Webhook delivery or DLQ sample.
- Decisions and owner approvals.

## Cross-links
- Dashboard: `/d/executive-slo`, `/d/api`, `/d/projection`, `/d/webhook`, `/d/participant-health`.
- SLO catalog: `infra/observability/slo/catalog.yaml`.
- Alert rules: `infra/observability/prometheus/rules/alert.rules.yaml`.

## Decisions
Use clean cutover and ledger-derived rebuilds. Reconciliation detects discrepancies; it does not silently correct balances or holdings.

## Last reviewed
2026-05-26
