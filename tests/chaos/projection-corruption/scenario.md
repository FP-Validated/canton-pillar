# projection-corruption

Incident class: chaos drill.
Prereqs: local compose sandbox or deterministic mock fallback.
Scope: command correlation, projection rebuild evidence, webhook retry evidence.
Action steps: start sandbox, inject failure, submit deterministic traffic, sample audit/projection/delivery records, assert invariants, tear down.
Exit criteria: stable command_id, unique submission_id per attempt, no duplicate ledger commands, projection match or detection, webhook attempts continue.
Evidence checklist: JSON report, compose output, invariant table, sampled rows.
Last reviewed: 2026-05-26.
