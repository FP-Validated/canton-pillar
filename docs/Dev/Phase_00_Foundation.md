# Phase 00 — Foundation

> Establish the Pillar monorepo, pinned toolchain, local sandbox runtime, and base automation needed for every later phase without introducing product behavior.

## 1. Executive Summary

Phase 00 maps to M0/M1 in the implementation plan: architecture freeze plus monorepo bootstrap. It creates the repository shape and local developer runtime for Pillar, a Stripe-like API surface backed by Canton-native execution, while deliberately avoiding service logic, schema migrations, ledger templates, and public API behavior.

Implemented architecture references:

| Source                                                                                                    | Relevance                                                                                              |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [23 Implementation Plan](../Architecture/23_Implementation%20Plan.md)                                     | Canonical Phase 0 deliverables, local compose skeleton, task breakdown A01-A05, M0/M1 acceptance.      |
| [13 Pillar Developer Test Environment](../Architecture/13_Pillar%20Developer%20Test%20Environment.md)     | Local Canton sandbox expectations, DPM sandbox usage, ledger-backed test-mode principle.               |
| [02 Pillar Complete System Architecture](../Architecture/02_Pillar%20Complete%20System%20Architecture.md) | Core invariant that Canton/Daml state is the economic source of truth and DB state is projection only. |

Phase 00 is successful when a fresh checkout can install JavaScript dependencies, enumerate Gradle projects, build the Daml workspace, and validate local compose configuration for Postgres, Redis, Canton sandbox, webhook receiver, and migrator stub.

Core principles embedded from day one:

| Principle                                              | Phase 00 interpretation                                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Canton Ledger is the source of truth.                  | Local runtime centers on `dpm sandbox`; no DB-backed asset truth is introduced.                                             |
| Pillar DB stores only Projection / Audit / Config.     | No DB schema exists in this phase; compose only provisions Postgres for later migrations.                                   |
| External API must be Stripe-like and Canton-invisible. | API grammar is not implemented here, but scaffolding must not leak Canton concepts into public package names or sample env. |
| Internal runtime must be Canton-native.                | Daml/DPM workspace and Canton sandbox are first-class bootstrap targets.                                                    |
| Operations must be ledger-traceable.                   | Tooling prepares for ledger-backed flows instead of mocks.                                                                  |
| Balance/Holding-first, not contract-first.             | No contract-first public object is scaffolded.                                                                              |
| Intent-first, not transaction-first.                   | No transaction endpoints are scaffolded.                                                                                    |
| Webhook-first for async workflow.                      | Local compose includes a webhook receiver test surface.                                                                     |
| API grammar must be Stripe-grade from day one.         | M0 architecture freeze keeps API grammar separate from scaffolding.                                                         |
| Deployment model changes, API experience does not.     | Compose/Dockerfiles are local-only precursors to P9 Helm/CI without changing `/v1` grammar.                                 |

## 2. Goals / Non-goals

### Goals

| Goal                      | Concrete output                                                     | Acceptance signal                                                                            |
| ------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Monorepo bootstrap        | Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`            | `pnpm install` exits 0.                                                                      |
| JVM workspace bootstrap   | `settings.gradle.kts`, `build.gradle.kts`, Gradle wrapper if absent | `./gradlew projects` lists the multi-project structure.                                      |
| Daml workspace bootstrap  | `daml/multi-package.yaml` plus package directories                  | `dpm build` exits 0 for all declared packages.                                               |
| Common developer commands | Root `Makefile`                                                     | `make bootstrap`, `make daml-build`, `make codegen`, `make test`, `make dev-up` are defined. |
| Codegen hook              | `tools/codegen/generate-all.sh`                                     | `make codegen` has a deterministic entrypoint even before generated clients exist.           |
| Local compose skeleton    | `infra/compose/local.yml`                                           | `docker compose -f infra/compose/local.yml config` validates.                                |
| Base Dockerfiles          | `infra/docker/*.Dockerfile` limited to base/local targets           | Images have pinned bases and no production release policy.                                   |
| CI skeleton               | `.github/workflows/ci.yml`, `.github/workflows/daml.yml`            | Pull requests can run bootstrap/build checks once repository hosting is connected.           |
| Local env convention      | `.env.example`                                                      | Developers can copy env without real secrets.                                                |

### Non-goals

| Non-goal                                                | Deferred phase | Reason                                               |
| ------------------------------------------------------- | -------------- | ---------------------------------------------------- |
| Public API routes, object serializers, OpenAPI behavior | Phase 02       | This phase creates scaffolding only.                 |
| Ledger command runtime                                  | Phase 04       | No intent compiler or command submission exists yet. |
| Projection schema, migrations, checkpoint tables        | Phase 03       | DB schema is intentionally absent.                   |
| Webhook dispatcher, signatures, delivery retries        | Phase 06       | Only a receiver test container is scaffolded.        |
| SDK, CLI, Workbench                                     | Phase 07       | Tooling exists only for repository bootstrap.        |
| Security/auth/compliance implementation                 | Phase 08       | Only local secrets hygiene is enforced.              |
| Helm charts, release promotion, full CI/CD              | Phase 09       | Phase 00 owns compose and base Dockerfiles only.     |
| GA hardening, chaos, performance, runbooks              | Phase 10       | Requires working services.                           |

## 3. Architecture

Phase 00 establishes the after-bootstrap tree shape. It contains no product service code beyond placeholders required for builds and containers.

```text
canton-dev/
  .github/
    workflows/
      ci.yml
      daml.yml
  .env.example
  Makefile
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  turbo.json
  settings.gradle.kts
  build.gradle.kts
  gradlew
  gradlew.bat
  gradle/
    wrapper/
      gradle-wrapper.jar
      gradle-wrapper.properties
  daml/
    multi-package.yaml
    pillar-core/
      daml.yaml
      daml/
      test/
    pillar-test-fixtures/
      daml.yaml
      daml/
      test/
  apps/
    api/
      package.json
      src/
    webhook-receiver/
      package.json
      src/
  services/
    migrator/
      build.gradle.kts
      src/main/kotlin/
    ledger-command/
      build.gradle.kts
      src/main/kotlin/
    workflow-orchestrator/
      build.gradle.kts
      src/main/kotlin/
    projection-worker/
      build.gradle.kts
      src/main/kotlin/
  packages/
    api-contracts/
      package.json
    shared/
      package.json
  tools/
    codegen/
      generate-all.sh
  infra/
    compose/
      local.yml
      webhook-test.yml
    docker/
      api.Dockerfile
      webhook-receiver.Dockerfile
      migrator.Dockerfile
      ledger-command.Dockerfile
      projection-worker.Dockerfile
      base-node.Dockerfile
      base-jvm.Dockerfile
      dpm-sandbox.Dockerfile
```

### Workspace boundaries

| Boundary                          | Owner in later phases  | Phase 00 rule                                                            |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| `daml/`                           | Phase 01               | Create DPM workspace and packages only; do not model assets yet.         |
| `packages/api-contracts/`         | Phase 02               | Reserve contract/codegen destination; do not define public objects here. |
| `services/migrator/`              | Phase 03               | Stub executable only; no migrations.                                     |
| `apps/api/`                       | Phase 02/05            | Stub package/container only; no `/v1` behavior.                          |
| `services/ledger-command/`        | Phase 04               | Stub package/container only; no command submission.                      |
| `services/workflow-orchestrator/` | Phase 06               | Stub package/container only; no orchestrator behavior.                   |
| `services/projection-worker/`     | Phase 05               | Stub package/container only; no projection logic.                        |
| `apps/webhook-receiver/`          | Phase 00/06            | Local receiver harness only; dispatcher/signing deferred.                |
| `infra/compose/`                  | Phase 00 then Phase 09 | Local compose is owned now; Helm and promotion CI are P9.                |

### Local compose topology

`infra/compose/local.yml` is a developer-only topology:

```text
postgres:16
redis:7
webhook-receiver
canton-sandbox  -> dpm sandbox --port 6865 --json-api-port 7575 --dar /daml/pillar.dar
migrator        -> stub migrate up, depends on postgres
```

The implementation plan also sketches future service containers (`api`, `ledger-command`, `projection-worker`, `webhook-dispatcher`). Phase 00 should not make those required for `dev-up` unless they are inert stubs, because service behavior belongs to later phases.

### Base automation graph

```text
make bootstrap
  -> pnpm install
  -> ./gradlew projects
  -> dpm build

make daml-build
  -> dpm build

make codegen
  -> tools/codegen/generate-all.sh

make test
  -> pnpm -w test
  -> ./gradlew test
  -> dpm test

make dev-up
  -> docker compose -f infra/compose/local.yml up
```

## 4. API / Object Model

Not in scope for this phase. See Phase 02.

Phase 00 must not introduce public request/response objects, `/v1` routes, OpenAPI schemas, SDK models, or API examples that imply object semantics. The only API-related artifact allowed is an empty or placeholder API-contract workspace needed for future codegen wiring.

## 5. Internal Runtime

### Developer runtime entrypoints

| Entrypoint                | Command                                                                | Purpose                                                              |
| ------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Dependency bootstrap      | `make bootstrap`                                                       | Install JS deps, validate Gradle project graph, build Daml packages. |
| Local stack               | `make dev-up`                                                          | Start compose services from `infra/compose/local.yml`.               |
| Daml build                | `make daml-build`                                                      | Run DPM build across `daml/multi-package.yaml`.                      |
| Canton sandbox direct     | `dpm sandbox`                                                          | Run ledger locally outside compose for Daml/package debugging.       |
| Compose config validation | `docker compose -f infra/compose/local.yml config`                     | Verify local YAML and environment interpolation.                     |
| Webhook receiver test     | `docker compose -f infra/compose/webhook-test.yml up webhook-receiver` | Exercise local webhook receiver harness only.                        |

### Runtime services in Phase 00

| Service             | Required in local compose | Behavior in this phase                                  | Later owner |
| ------------------- | ------------------------- | ------------------------------------------------------- | ----------- |
| `postgres`          | Yes                       | Empty database, persistence volume.                     | Phase 03    |
| `redis`             | Yes                       | Local cache/queue dependency placeholder.               | Phase 06/P9 |
| `canton-sandbox`    | Yes                       | DPM sandbox exposing Ledger API and JSON API ports.     | Phase 01/P4 |
| `webhook-receiver`  | Yes                       | Local HTTP receiver for later webhook tests.            | Phase 06    |
| `migrator`          | Yes                       | Stub command that exits cleanly without schema changes. | Phase 03    |
| `api`               | Optional/inert            | No public API behavior.                                 | Phase 02/05 |
| `ledger-command`    | Optional/inert            | No command runtime behavior.                            | Phase 04    |
| `projection-worker` | Optional/inert            | No projection behavior.                                 | Phase 05    |

### DPM sandbox contract

The developer test environment defines test mode as ledger-backed, not DB-fixture-backed. Phase 00 therefore uses DPM/Canton locally even before business templates exist.

```text
dpm build
  -> creates local DAR artifacts from Daml packages

dpm sandbox --port 6865 --json-api-port 7575
  -> starts Canton sandbox
  -> exposes Ledger API for future command runtime
  -> exposes JSON API for local debugging where enabled
```

### Hot reload story

| Stack                    | Phase 00 expectation                                                                        | Constraint                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| TypeScript apps/packages | `pnpm` workspace scripts may run in watch mode once code exists.                            | Watch scripts must stay inside workspace packages; no global installs.             |
| Gradle services          | Gradle multi-project supports `./gradlew :service:classes` and later application run tasks. | No custom daemon magic or hidden IDE dependency.                                   |
| Daml packages            | Re-run `dpm build`; sandbox should mount `daml/.daml/dist` in compose.                      | DPM/SDK versions must be pinned; hot reload is rebuild/restart, not live patching. |
| Compose stack            | `make dev-up` is the canonical stack command.                                               | Local compose remains developer-only and must not encode production policy.        |

## 6. DB Schema

DB schema not introduced this phase. See Phase 03.

Postgres exists only as a local dependency target. No migrations, tables, seed data, or projection rows are created in Phase 00. This preserves the system architecture rule: DB state is projection/audit/config only and never the economic source of truth.

## 7. Failure Modes

| Failure mode                   | Symptom                                                                          | Root cause                                                                         | Prevention                                                                                                             | Detection                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Toolchain drift                | Bootstrap passes on one machine and fails on another.                            | Unpinned Node, pnpm, Gradle, JDK, Daml SDK, DPM, Docker base versions.             | Commit version pins via package manager metadata, Gradle wrapper, Daml package config, and Docker `ARG`/digest policy. | `make bootstrap` and CI skeleton fail early.                                              |
| DPM version mismatch           | `dpm build` or `dpm sandbox` rejects workspace config.                           | Local DPM differs from `daml/multi-package.yaml`/package `daml.yaml` expectations. | Document required DPM version in `.env.example` or toolchain file; avoid implicit latest.                              | `dpm build` in Build gate.                                                                |
| Daml SDK pinning mismatch      | Daml packages build locally but not in CI/container.                             | Package SDK versions differ across Daml packages or image base.                    | Keep package SDK versions aligned; base image must install the same SDK/DPM version.                                   | `dpm build` and container build smoke in later gates.                                     |
| Docker base image drift        | Compose suddenly pulls incompatible runtime.                                     | Floating image tags such as `latest` or unreviewed major updates.                  | Use explicit major/minor tags at minimum; prefer digests for release images later.                                     | `docker compose config` plus review of Dockerfiles.                                       |
| Compose service overreach      | Phase 00 stack starts failing because later-phase services require missing code. | Local compose made non-stub services mandatory too early.                          | Keep only Postgres, Redis, Canton sandbox, webhook receiver, and migrator stub required.                               | `docker compose -f infra/compose/local.yml config`; `make dev-up` smoke once stubs exist. |
| Hidden global dependency       | A command works only on one developer laptop.                                    | Scripts call globally installed CLIs not declared in workspace/toolchain.          | Use `pnpm exec`, Gradle wrapper, checked-in scripts, and DPM version docs.                                             | Fresh checkout bootstrap.                                                                 |
| Generated files without source | Codegen output changes without deterministic generator.                          | Missing `tools/codegen/generate-all.sh` contract.                                  | Codegen entrypoint exists even before actual generators are implemented.                                               | `make codegen` exits deterministically.                                                   |
| Sandbox port collision         | Compose or `dpm sandbox` fails to bind ports.                                    | Local machine already uses 6865, 7575, 5432, 6379, or 9090.                        | Keep ports centralized in compose/env; allow override by `.env`.                                                       | Compose startup error names occupied port.                                                |
| Secrets committed              | Real API keys or ledger credentials enter git history.                           | Developers copy local env into tracked files.                                      | Track `.env.example`; ignore `.env`; use fake local defaults only.                                                     | Secret scan in later CI/security phase.                                                   |

## 8. Security / Compliance

Phase 00 security is minimal but mandatory: prevent accidental credential leakage and avoid encoding production security claims into local-only tooling.

| Control        | Requirement                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `.env.example` | Contains only fake local values such as `pillar`, `localhost`, and documented placeholders.                         |
| Real secrets   | Never committed. Local `.env` must be ignored.                                                                      |
| API keys       | No real `sk_live_*`, `sk_test_*`, JWT signing key, mTLS key, Canton participant credential, or cloud token in repo. |
| Dockerfiles    | No secrets in `ARG`, `ENV`, layers, or sample commands.                                                             |
| Compose        | Local passwords are acceptable only for developer Postgres and must be clearly non-production.                      |
| CI skeleton    | Must not require production credentials.                                                                            |
| Compliance     | No audit/compliance adapter implementation in this phase.                                                           |

Security principle for this phase:

```text
Local defaults may be convenient.
Tracked defaults must be fake.
Production credentials must be absent.
```

## 9. Implementation Plan

| ID     | Title                                        | Path                                                                                                                                                                                                                                            | Output                                                                                                                                                               | Deps                           | Acceptance                                                                                                                                                                                                                | Risk                                                                                        |
| ------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| P0.A01 | Create pnpm workspace                        | `package.json`, `pnpm-workspace.yaml`, `turbo.json`                                                                                                                                                                                             | Root package metadata, workspace package globs, base task graph                                                                                                      | —                              | `pnpm install` succeeds on a fresh checkout                                                                                                                                                                               | medium: package manager/version drift can poison every later phase                          |
| P0.A02 | Create Gradle workspace                      | `settings.gradle.kts`, `build.gradle.kts`, `gradle/wrapper/*`, `gradlew`                                                                                                                                                                        | Multi-project JVM scaffold for services                                                                                                                              | P0.A01                         | `./gradlew projects` lists declared service projects                                                                                                                                                                      | medium: JVM/Gradle mismatch blocks service phases                                           |
| P0.A03 | Create Daml workspace                        | `daml/multi-package.yaml`, `daml/pillar-core/`, `daml/pillar-test-fixtures/`                                                                                                                                                                    | DPM multi-package workspace with empty/minimal packages                                                                                                              | —                              | `dpm build` succeeds for all packages                                                                                                                                                                                     | high: DPM/SDK mismatch blocks Canton source-of-truth model                                  |
| P0.A04 | Add Make targets                             | `Makefile`, `tools/codegen/generate-all.sh`                                                                                                                                                                                                     | Canonical bootstrap, build, codegen, test, and dev-up commands                                                                                                       | P0.A01, P0.A02, P0.A03         | `make bootstrap`, `make daml-build`, `make codegen`, `make test`, `make dev-up` resolve to declared commands                                                                                                              | medium: hidden command divergence creates non-reproducible development                      |
| P0.A05 | Add CI skeleton                              | `.github/workflows/ci.yml`, `.github/workflows/daml.yml`                                                                                                                                                                                        | PR workflow skeleton for pnpm, Gradle, Daml checks                                                                                                                   | P0.A01, P0.A02, P0.A03, P0.A04 | Workflows are valid YAML and trigger on pull requests                                                                                                                                                                     | low: full release CI intentionally deferred to P9                                           |
| P0.J01 | Add local compose                            | `infra/compose/local.yml`                                                                                                                                                                                                                       | Local compose with `postgres`, `redis`, `canton-sandbox`, `webhook-receiver`, `migrator` stub                                                                        | P0.A03, P0.J03                 | `docker compose -f infra/compose/local.yml config` exits 0                                                                                                                                                                | medium: making later services mandatory too early causes false failures                     |
| P0.J02 | Add webhook receiver compose profile         | `infra/compose/webhook-test.yml`, `apps/webhook-receiver/`                                                                                                                                                                                      | Minimal local receiver harness for future webhook tests                                                                                                              | P0.A01, P0.J03                 | `docker compose -f infra/compose/webhook-test.yml config` exits 0 and exposes receiver port                                                                                                                               | low: webhook signing/delivery is out of scope until P6                                      |
| P0.J03 | Add base Dockerfiles only                    | `infra/docker/base-node.Dockerfile`, `infra/docker/base-jvm.Dockerfile`, `infra/docker/dpm-sandbox.Dockerfile`, `infra/docker/webhook-receiver.Dockerfile`, `infra/docker/migrator.Dockerfile`, `infra/docker/workflow-orchestrator.Dockerfile` | Pinned local build images for Node, JVM, DPM sandbox, receiver, migrator stub, and workflow orchestrator stub                                                        | P0.A01, P0.A02, P0.A03         | Dockerfiles reference explicit base versions and do not contain secrets                                                                                                                                                   | medium: base image drift and DPM/SDK mismatch can invalidate local runtime                  |
| P0.A06 | Add repository formatting baselines          | `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs`, `ktlint.yml`                                                                                                                                                       | EditorConfig, Prettier, ESLint flat-config base, Kotlin style baseline, ktlint baseline config; scalafmt explicitly omitted as N/A because no Scala workspace exists | P0.A01, P0.A02                 | `test -f .editorconfig && pnpm exec prettier --check . --ignore-unknown` exits 0; `test ! -f .scalafmt.conf` confirms scalafmt is not introduced                                                                          | low: inconsistent formatting creates noisy diffs and weakens later generated-code review    |
| P0.A07 | Add commit policy and changelog skeleton     | `commitlint.config.cjs`, `CHANGELOG.md`                                                                                                                                                                                                         | Conventional Commits commitlint config and empty Keep-a-Changelog-style release log skeleton                                                                         | P0.A01                         | `pnpm exec commitlint --from=HEAD~1 --to=HEAD` exits 0 on a compliant commit history sample or reports only non-compliant commit messages                                                                                 | low: unstructured commits weaken release automation and ADR/ticket traceability             |
| P0.A08 | Add release automation config under tools    | `tools/release/release-please-config.json`, `tools/release/.release-please-manifest.json`, `tools/release/README.md`                                                                                                                            | Release-please or Changesets-compatible config reserved under `tools/release/` without publishing packages yet                                                       | P0.A07                         | `test -f tools/release/release-please-config.json && test -f tools/release/.release-please-manifest.json` exits 0                                                                                                         | low: release metadata drift causes later P9 promotion ambiguity                             |
| P0.A09 | Add OpenAPI SDK codegen skeleton             | `tools/codegen/openapi-to-sdks/package.json`, `tools/codegen/openapi-to-sdks/README.md`, `tools/codegen/openapi-to-sdks/generate.sh`                                                                                                            | Stub generator boundary for future Node, Python, and Java SDK generation; no generated SDK output committed                                                          | P0.A04                         | `tools/codegen/openapi-to-sdks/generate.sh --check` exits 0 and prints that OpenAPI SDK generation is not implemented in P0                                                                                               | medium: premature codegen could freeze incomplete API grammar before P2                     |
| P0.A10 | Add Daml codegen stub                        | `tools/codegen/daml-codegen/generate.sh`, `tools/codegen/daml-codegen/README.md`                                                                                                                                                                | Stub for future Daml Java/TypeScript bindings generation; no bindings generated yet                                                                                  | P0.A03, P0.A04                 | `tools/codegen/daml-codegen/generate.sh --check` exits 0 and reports that Daml binding generation is deferred                                                                                                             | medium: Daml SDK mismatch can break later ledger-command bindings                           |
| P0.A11 | Add developer lifecycle script stubs         | `tools/dev/up.sh`, `tools/dev/down.sh`, `tools/dev/reset-ledger.sh`, `tools/dev/reset-db.sh`, `tools/dev/seed.sh`                                                                                                                               | Checked-in executable stubs wrapping compose up/down and documenting reset/seed commands without destructive behavior by default                                     | P0.J01                         | `tools/dev/up.sh --check && tools/dev/down.sh --check && tools/dev/reset-ledger.sh --check && tools/dev/reset-db.sh --check && tools/dev/seed.sh --check` exits 0                                                         | medium: unsafe local reset scripts can delete developer data or hide production assumptions |
| P0.A12 | Add diagnostics collection stub              | `tools/scripts/diagnostics/collect-logs.sh`                                                                                                                                                                                                     | Minimal executable collecting compose logs and environment diagnostics into a local ignored directory without secrets                                                | P0.J01                         | `tools/scripts/diagnostics/collect-logs.sh --check` exits 0 and confirms no secret-bearing `.env` contents are printed                                                                                                    | medium: diagnostics that leak secrets violate P0 security hygiene                           |
| P0.A13 | Add ownership map                            | `CODEOWNERS`                                                                                                                                                                                                                                    | Placeholder owner labels for top-level repository areas including apps, services, packages, daml, infra, tools, and docs                                             | P0.A01                         | `test -f CODEOWNERS && python3 -c "from pathlib import Path; text=Path('CODEOWNERS').read_text(); assert all(path in text for path in ['/apps/', '/services/', '/daml/', '/infra/', '/tools/'])"` exits 0                 | low: missing ownership slows review routing for phase-gated tickets                         |
| P0.A14 | Add security disclosure policy               | `SECURITY.md`                                                                                                                                                                                                                                   | Vulnerability disclosure inbox, supported branch placeholder, and no-production-secrets reporting guidance                                                           | P0.A13                         | `test -f SECURITY.md && grep -i 'vulnerability' SECURITY.md && grep -i 'security@' SECURITY.md` exits 0                                                                                                                   | medium: unclear disclosure flow delays security fixes                                       |
| P0.A15 | Add contribution guide                       | `CONTRIBUTING.md`                                                                                                                                                                                                                               | Workflow, branch naming, ticket ID convention, local bootstrap, review, and non-secret policy for contributors                                                       | P0.A07, P0.A13                 | `test -f CONTRIBUTING.md && grep 'P<phase>.<area-letter><nn>' CONTRIBUTING.md && grep -i 'conventional commits' CONTRIBUTING.md` exits 0                                                                                  | low: inconsistent contributor workflow causes unreviewable phase drift                      |
| P0.A16 | Add license placeholder                      | `LICENSE`                                                                                                                                                                                                                                       | Explicit placeholder license text requiring legal replacement before external distribution                                                                           | P0.A13                         | `test -f LICENSE && grep -i 'placeholder' LICENSE` exits 0                                                                                                                                                                | medium: ambiguous licensing blocks external SDK/docs distribution                           |
| P0.A17 | Add git attributes and DAR LFS policy        | `.gitattributes`                                                                                                                                                                                                                                | LF normalization plus Git LFS patterns for `*.dar` and other large generated artifacts                                                                               | P0.A03                         | `test -f .gitattributes && grep '\*.dar' .gitattributes && grep 'text=auto eol=lf' .gitattributes` exits 0                                                                                                                | medium: line-ending drift and binary DAR diffs break reproducible builds                    |
| P0.A18 | Pin local tool versions                      | `.nvmrc`, `.tool-versions`, `gradle.properties`                                                                                                                                                                                                 | Node, pnpm, JDK, Daml SDK/DPM, Kotlin, and Gradle version pins aligned with wrapper and Daml package metadata                                                        | P0.A01, P0.A02, P0.A03         | `test -f .nvmrc && test -f .tool-versions && test -f gradle.properties && ./gradlew properties --quiet` exits 0                                                                                                           | high: toolchain drift blocks every later phase                                              |
| P0.A19 | Add OpenTelemetry collector to local compose | `infra/compose/local.yml`, `infra/observability/otel-collector.yaml`                                                                                                                                                                            | Local `otel-collector` service and minimal collector config accepting OTLP with no application instrumentation yet                                                   | P0.J01, P0.J08                 | `docker compose -f infra/compose/local.yml config otel-collector` exits 0                                                                                                                                                 | low: observability wiring deferred too long makes later SLO work harder                     |
| P0.A20 | Add Postgres extension provisioning stub     | `infra/postgres/init/0000_extensions.sql`, `infra/compose/local.yml`                                                                                                                                                                            | Idempotent init script documenting `pgcrypto` and `pg_partman` as future extensions without enabling `pg_partman` yet                                                | P0.J01                         | `grep -i 'pgcrypto' infra/postgres/init/0000_extensions.sql && grep -i 'pg_partman' infra/postgres/init/0000_extensions.sql` exits 0; `docker compose -f infra/compose/local.yml config postgres` includes the init mount | medium: extension provisioning ambiguity can cause migration drift in P3                    |
| P0.A21 | Extend Makefile quality targets              | `Makefile`, `tools/codegen/generate-all.sh`                                                                                                                                                                                                     | `make lint`, `make format`, `make codegen`, and `make typecheck` targets wired to workspace-safe commands and stubs                                                  | P0.A04, P0.A06, P0.A09, P0.A10 | `make lint && make format && make codegen && make typecheck` exits 0 on a fresh P0 checkout                                                                                                                               | medium: missing quality targets creates parallel local and CI command surfaces              |
| P0.A22 | Add DPM version check                        | `tools/dev/dpm-version-check.sh`, `.tool-versions`, `daml/multi-package.yaml`                                                                                                                                                                   | Executable fail-fast check comparing installed DPM/Daml SDK versions to pinned repository versions                                                                   | P0.A03, P0.A18                 | `tools/dev/dpm-version-check.sh` exits 0 when installed DPM/Daml SDK matches pins and exits non-zero with a clear mismatch message otherwise                                                                              | high: DPM/Daml SDK mismatch invalidates Canton source-of-truth builds                       |
| P0.J04 | Add local auth compose skeleton              | `infra/compose/local-auth.yml`                                                                                                                                                                                                                  | Compose override/profile placeholder for future local JWT/auth dependencies without Pillar JWT validation logic                                                      | P0.J01, P0.A18                 | `docker compose -f infra/compose/local.yml -f infra/compose/local-auth.yml config` exits 0                                                                                                                                | medium: auth profile overreach could introduce P8 behavior before contracts exist           |
| P0.J05 | Add localnet compose skeleton                | `infra/compose/localnet.yml`                                                                                                                                                                                                                    | Compose override/profile placeholder for future multi-validator topology with no production deployment policy                                                        | P0.J01, P0.A18                 | `docker compose -f infra/compose/local.yml -f infra/compose/localnet.yml config` exits 0                                                                                                                                  | medium: multi-validator naming must not change `/v1` deployment-mode grammar                |
| P0.J06 | Add dedicated webhook receiver app scaffold  | `apps/webhook-receiver/package.json`, `apps/webhook-receiver/src/server.ts`, `apps/webhook-receiver/src/index.ts`, `apps/webhook-receiver/test/smoke.test.ts`                                                                                   | Minimal Express receiver exposing health and capture endpoints for local webhook tests only; no Pillar signature verification or dispatcher behavior                 | P0.A01, P0.J02                 | `pnpm --filter @pillar/webhook-receiver test` exits 0 and verifies health/capture routes                                                                                                                                  | medium: receiver must remain a harness and not become webhook-dispatcher logic              |
| P0.J07 | Dockerize webhook receiver                   | `infra/docker/webhook-receiver.Dockerfile`, `apps/webhook-receiver/package.json`                                                                                                                                                                | Explicit local Dockerfile building/running the webhook receiver scaffold with pinned Node base                                                                       | P0.J03, P0.J06                 | `docker build -f infra/docker/webhook-receiver.Dockerfile --target local .` exits 0                                                                                                                                       | medium: Dockerfile drift can make compose webhook tests unreliable                          |
| P0.J08 | Add OpenTelemetry collector Dockerfile       | `infra/docker/otel-collector.Dockerfile`, `infra/observability/otel-collector.yaml`                                                                                                                                                             | Local collector image wrapper with pinned OpenTelemetry Collector base and checked-in config                                                                         | P0.J03                         | `docker build -f infra/docker/otel-collector.Dockerfile --target local .` exits 0                                                                                                                                         | low: unpinned collector image can destabilize local observability                           |

### Ticket sequencing

```text
P0.A01 ─┬─> P0.A04 ─┬─> P0.A05
        │           ├─> P0.A09 ─┐
        │           ├─> P0.A10 ─┼─> P0.A21
        │           └─> P0.J01 ─┬─> P0.A11 ─> P0.A12
P0.A02 ─┤                       ├─> P0.A19
P0.A03 ─┴─> P0.A17 ─> P0.A18 ─┬─┼─> P0.A22
                               │ ├─> P0.A20
P0.A06 ────────────────────────┘ ├─> P0.J04
P0.A07 ─┬─> P0.A08               └─> P0.J05
        └─> P0.A15
P0.A13 ─┬─> P0.A14
        ├─> P0.A15
        └─> P0.A16

P0.J03 ─┬─> P0.J01
        ├─> P0.J02 ─> P0.J06 ─> P0.J07
        └─> P0.J08 ─> P0.A19
```

### Cutover rule

Phase 00 is a clean cutover: the repository should not carry alternate package managers, duplicate Gradle layouts, or parallel compose entrypoints. If pre-existing scaffolding conflicts with this plan, consolidate to the canonical files above rather than preserving aliases.

## 10. Open Questions

| Question                                                                                                                                         | Current resolution                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Should Phase 00 compose include `api`, `ledger-command`, `projection-worker`, and `webhook-dispatcher` from the full implementation-plan sketch? | No for required P0 acceptance. Phase 00 scope explicitly selects compose/Dockerfiles only and names no service code yet. If present, these services must be inert/stubbed or profile-gated so local foundation checks do not depend on later phases. |
| Should local compose run `docker compose up` or only validate config?                                                                            | Build gate requires `docker compose -f infra/compose/local.yml config`. The implementation plan also lists `make dev-up`; startup smoke can be added once stub images exist.                                                                         |
| Should `migrator` create schema?                                                                                                                 | No. DB schema is Phase 03; P0 migrator is a stub that proves the command path exists.                                                                                                                                                                |
| Should Dockerfiles be production-grade?                                                                                                          | No. Base Dockerfiles are local foundations only. Helm, promotion, image signing, release policy, and full CI/CD are Phase 09.                                                                                                                        |
| Should Daml package directories contain real templates?                                                                                          | No. Phase 01 owns the Canton source-of-truth model. Phase 00 only proves the workspace can build.                                                                                                                                                    |

## 11. Agent-ready Checklist

### Build gate

- [ ] `pnpm install`
- [ ] `./gradlew projects`
- [ ] `dpm build`
- [ ] `docker compose -f infra/compose/local.yml config`
- [ ] `make lint`
- [ ] `make format`
- [ ] `tools/dev/dpm-version-check.sh`

### Verify gate

- [ ] `docs/Dev/Phase_00_Foundation.md` exists and follows the 11-section mission-control layout.
- [ ] Root workspace files are present: `package.json`, `pnpm-workspace.yaml`, `turbo.json`.
- [ ] Gradle workspace files are present: `settings.gradle.kts`, `build.gradle.kts`, Gradle wrapper files.
- [ ] Daml workspace files are present: `daml/multi-package.yaml` and declared package directories.
- [ ] Developer command surface exists in `Makefile`: `bootstrap`, `daml-build`, `codegen`, `test`, `dev-up`.
- [ ] Codegen entrypoint exists at `tools/codegen/generate-all.sh`.
- [ ] Local compose defines `postgres`, `redis`, `canton-sandbox`, `webhook-receiver`, and `migrator` stub.
- [ ] Webhook test compose exists or local compose has an equivalent webhook receiver profile.
- [ ] Base Dockerfiles use explicit versions and contain no secrets.
- [ ] `.env.example` contains fake local values only.
- [ ] Repository policy files are present: `.editorconfig`, `CODEOWNERS`, `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE`, `.tool-versions`.
- [ ] Codegen and dev-tool stubs exist at `tools/codegen/openapi-to-sdks/`, `tools/codegen/daml-codegen/`, `tools/dev/`, and `tools/scripts/diagnostics/`.
- [ ] Compose skeletons exist for local auth, localnet, and local OpenTelemetry collector profiles without introducing production auth or instrumentation behavior.
- [ ] No public API route, DB migration, ledger command runtime, projection logic, or webhook dispatcher behavior is introduced by this phase.

### Invariant gate

- [ ] Public API exposes no Canton contract-first fields.
- [ ] DB asset state is not introduced; Postgres is an empty local dependency only.
- [ ] No mutation path exists yet; stable `operation_id` and `command_id` are deferred to Phase 03/04.
- [ ] Projection is not introduced yet, but the architecture keeps it rebuildable by reserving DB for projection/audit/config only.
- [ ] Webhook delivery signing/replay is not introduced yet; only a local receiver harness exists.
- [ ] Deployment mode does not change `/v1` grammar.
