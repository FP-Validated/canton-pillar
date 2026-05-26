# DR Failover

Incident class: regional failover drill.
Prereqs: local compose sandbox or deterministic mock fallback.
Scope: failover preserves command correlation and projections.
Action steps: start sandbox, fail primary dependency, replay traffic, sample state, tear down.
Exit criteria: stable command_id, unique submission_id, matching projection, continued webhook attempts.
Evidence checklist: JSON report and invariant table.
Last reviewed: 2026-05-26.
