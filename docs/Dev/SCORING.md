# Pillar Phase Implementation Scoring

> Per-phase score sheet. PASS threshold: **≥9.5/10**. Phase advancement is blocked until the current phase passes.

## Rubric (per phase, out of 10)

| Weight | Criterion               | What "full credit" looks like                                                                                                 |
| -----: | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
|    2.0 | Ticket completeness     | Every ticket's `Path`+`Output` from the phase doc has matching files on disk. No missing tickets.                             |
|    2.0 | Build gate              | Every `### Build gate` command in the phase doc exits 0, verified by a subagent with shell access. Output snippet recorded.   |
|    2.0 | Verify gate             | Every `### Verify gate` item satisfied with file/test/run evidence.                                                           |
|    1.5 | Invariant gate          | Cross-phase invariants enforced (Canton-invisible API, projection-only DB, signed webhooks, deploymentMode neutrality, etc.). |
|    1.0 | No fabrication          | Every claimed test/check is real and runnable. No fake stubs. No placeholders in production paths.                            |
|    1.0 | Code quality            | Idiomatic per language; error handling; no obvious bugs; follows project conventions.                                         |
|    0.5 | Cross-phase consistency | Uses canonical paths registry, migration range registry, deployment-mode enum, ticket ID scheme, ADR decisions.               |

## Score sheet

| Phase | Status        | Score | Verified by | Notes |
| ----- | ------------- | ----: | ----------- | ----- |
| P0    | PASS          | 10.0 | P0 remediation subagent | HEAD 67b1763edf5fea89127ddf157f9d1dd0416c287e; rotated Daml SDK pin to 3.4.11, fixed DPM multi-package schema, updated DPM build commands to `dpm build --all`, corrected SDK version check, rebased onto origin/main, and pushed. |
| P1    | PASS          | 9.5 | 77-P1Verify | HEAD efe5323a10e32b12b7b50351af74cb5c7fb401cb; `dpm build --all`, all six package `dpm test` runs, P0 regression commands, rebase, and push succeeded. Conservative notes: M2 adapter boundary is compile-oriented and some phase-doc exact script/module filenames are represented by equivalent scripts/modules. |
| P2    | PASS          | 9.5 | 95-P2RemediateTests | HEAD 515ba4339f04d78035db0eb49e21eb480efb0514; split `apps/api/test/core.test.ts` into 19 per-topic files plus `_helpers.ts`; api typecheck=0, api build=0, api test=0 (36 tests), api-contracts test=0 (8 tests), web typecheck=0. |
| P3    | blocked on P2 |     — | —           | —     |
| P4    | blocked on P3 |     — | —           | —     |
| P5    | blocked on P4 |     — | —           | —     |
| P6    | blocked on P5 |     — | —           | —     |
| P7    | blocked on P6 |     — | —           | —     |
| P8    | blocked on P7 |     — | —           | —     |
| P9    | blocked on P8 |     — | —           | —     |
| P10   | blocked on P9 |     — | —           | —     |
| P11   | blocked on P9 |     — | —           | —     |
| P12   | blocked on P9 |     — | —           | —     |
| P13   | blocked on P9 |     — | —           | —     |
| P14   | blocked on P9 |     — | —           | —     |

## Mission completion criterion

All 15 phases PASS (≥9.5/10).
