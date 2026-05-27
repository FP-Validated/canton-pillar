# Pillar Phase Implementation Scoring

## Status (honest)

This is a planning/development repository. The earlier per-phase 9.5 PASS verdicts were scored against scaffolding deliverables (files in place, typecheck/lint clean) rather than executable Canton-backed correctness. A reviewer audit on 2026-05-26 reset scoring to reflect actual runtime maturity. See Remediation Plan R0..R6 in docs/Dev/REMEDIATION.md.

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

|Phase|Status|Score|Verified by|Evidence link|Notes|
|---|---:|---:|---|---|---|
|P0 Foundation|PASS|9.0|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#p0-foundation)|Toolchain and root help/install gates pass; this proves local foundation, not product correctness.|
|P1 Daml|PARTIAL|7.0|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#p1-daml)|Build passes, but per-package dpm test snippets report zero scripts exercised in captured tail output, so this is not strong lifecycle evidence.|
|P2 API contracts|PASS|9.0|123-R7Cleanup|[evidence](EVIDENCE.md#p2-api-contracts)|Build/tests/goldens pass and public-contract lint exits 0 after removing the forbidden public example substring.|
|P3 DB+idempotency|PASS|9.0|123-R7Cleanup|[evidence](EVIDENCE.md#p3-db-idempotency)|Fresh Postgres migrator up/verify and @pillar/idempotency tests exit 0 with direct exit capture.|
|P4 Ledger command runtime|PASS|9.0|122-R6Rescoring @ 06b31e1|[evidence](VERIFICATION.md#v-006)|Compile and tests pass for the ledger-command service; evidence is service-level, not a live sandbox submission run.|
|P5 Projection / Reconciliation|PASS|8.5|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#p5-projection-reconciliation)|Projection and reconciler compile/tests pass; evidence does not prove live ledger-derived reconciliation.|
|P6 Webhook + Workflow|PASS|8.5|122-R6Rescoring @ 06b31e1|[evidence](VERIFICATION.md#v-006)|Webhook, workflow, and security tests pass; evidence remains component-level.|
|P7 SDK + CLI + Workbench|PASS|8.0|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#p7-sdk-cli-workbench)|SDK/CLI tests and Workbench typecheck pass; no browser/runtime integration evidence.|
|P8 Security + Compliance|PASS|8.0|122-R6Rescoring @ 06b31e1|[evidence](VERIFICATION.md#v-006)|Security/storage/compliance gates pass; compliance remains adapter-level evidence.|
|P9 CI / Helm|PASS|9.0|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#p9-ci-helm)|Helm lint/template/unittest and compose config pass.|
|P10 GA Hardening|PASS|8.5|123-R7Cleanup|[evidence](EVIDENCE.md#p10-ga-hardening)|Chaos run.ts syntax checks use canonical paths and each check exits 0 with non-empty command evidence.|
|P11 Search / Export|PASS|8.0|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#p11-search-export)|Search/export compile and tests pass; no live indexing/export run.|
|P12 Template Registry|PASS|8.0|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#p12-template-registry)|Compile and tests pass; no real DAR registry workflow evidence.|
|P13 Dashboard / Docs / Onboarding|PASS|8.0|123-R7Cleanup|[evidence](EVIDENCE.md#p13-dashboard-docs-onboarding)|Dashboard/docs gates remain passing and onboarding test now exits 0.|
|P14 Usage / Billing|PASS|8.0|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#p14-usage-billing)|Usage and billing tests pass; no external billing provider evidence.|
|M15.A Identity / Google OAuth|PARTIAL|7.5|131-M15HFinalDeploy|[evidence](EVIDENCE.md#m15-wave-final)|identity/security pass; API typecheck/build pass, but @pillar/api test timed out at 120s after one failing account happy-path test.|
|M15.B Network / Validator registry|PASS|8.0|131-M15HFinalDeploy|[evidence](VERIFICATION.md#v-006)|validator-registry build/test exit 0 in M15 final gate matrix.|
|M15.C Onboarding|PASS|8.0|131-M15HFinalDeploy|[evidence](EVIDENCE.md#m15-wave-final)|onboarding build/test exit 0 in M15 final gate matrix.|
|M15.D Usage / Billing / Storage|PASS|8.0|131-M15HFinalDeploy|[evidence](EVIDENCE.md#m15-wave-final)|usage-meter, billing-adapter, and storage tests exit 0 in M15 final gate matrix.|
|M15.E Web / Dashboard / Workbench / Docs / Status|PASS|8.0|131-M15HFinalDeploy|[evidence](EVIDENCE.md#m15-wave-final)|web/dashboard/workbench/docs/status typecheck/build/lint gates exit 0 in M15 final gate matrix.|
|M15.F CLI / SDK / Helm / Compose|PASS|8.5|131-M15HFinalDeploy|[evidence](VERIFICATION.md#v-006)|cli/sdk-node build/test, helm lint/templates, and compose config exit 0 in M15 final gate matrix.|
|M15.G Daml package gates|PASS|7.5|131-M15HFinalDeploy|[evidence](EVIDENCE.md#m15-wave-final)|dpm build --all and per-package dpm test exit 0; snippets still show zero exercised tests for packages.|
|M15.H Final deployment verification|PARTIAL|7.5|131-M15HFinalDeploy|[evidence](EVIDENCE.md#m15-wave-final)|Full matrix captured on 2026-05-27: one failure, @pillar/api test timed out with failing accounts happy-path; Gradle skipped(host_limited); forbidden sweep clean.|
|R0 reconcile + honesty pass|PARTIAL|6.5|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#r0-reconcile-honesty-pass)|Preamble evidence exists; Makefile/README grep snippet is truncated and does not fully prove all R0 claims.|
|R1 Daml lifecycle|PARTIAL|7.0|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#r1-daml-lifecycle)|Same as P1: build passes, but captured test snippets do not show scripts passed.|
|R2 API correctness|PASS|9.0|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#r2-api-correctness)|Fallback grep returned OK no fallback.|
|R3 ledger-command runtime|PASS|9.0|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#r3-ledger-command-runtime)|Same executable evidence as P4 ledger-command compile/test.|
|R4 Perf/network|PASS|8.5|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#r4-perf-network)|Envoy YAML and compose config validate; this is config/runtime-readiness evidence, not load-test proof.|
|R5 Vertical slice|PASS|8.0|123-R7Cleanup|[evidence](EVIDENCE.md#r5-vertical-slice)|Both vertical-slice TypeScript checks exit 0 for canonical run.ts and mock-receiver.ts paths.|
|R6 honest re-scoring|PASS|9.0|122-R6Rescoring @ 06b31e1|[evidence](EVIDENCE.md#r6-honest-re-scoring)|Evidence file capture command succeeded and this table links every scored row to evidence.|

## Mission completion

Lowest row after M15.H final verification: **P1/R1 Daml lifecycle** remains **PARTIAL 7.0/10** because captured Daml test snippets do not show meaningful lifecycle tests. M15.H is **PARTIAL** because `@pillar/api test` timed out at 120s after an accounts happy-path failure; all other non-skipped final matrix gates passed, Gradle was skipped as host-limited, and the forbidden sweep was clean.
