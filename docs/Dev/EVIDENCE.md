# R6 Executable Evidence

Captured on 2026-05-26 by `122-R6Rescoring` at base commit `06b31e1`. Each entry records the command as executed, observed shell exit, and captured last-line snippet. Commands that include `tail` can mask upstream failures; snippets are therefore treated as evidence content and scored honestly when they show an inner failure.

## P0 Foundation
- Command: `make help 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
    state              - print honest phase status
    reset-ledger       - reset local sandbox ledger (dry-run by default)
    reset-db           - reset local Postgres (dry-run by default)
    seed               - seed local fixtures (no-op in P0)
    dpm-version-check  - verify installed Daml SDK/DPM matches pin
  ```
- Command: `pnpm install 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  Scope: all 22 workspace projects
  Lockfile is up to date, resolution step is skipped
  Already up to date
  
  Done in 477ms
  ```
- Command: `node -v && pnpm -v`
- Exit: 0
- Snippet:
  ```
  v25.9.0
  9.12.3
  ```
- Command: `java -version`
- Exit: 0
- Snippet:
  ```
  openjdk version "21.0.11" 2026-04-21 LTS
  OpenJDK Runtime Environment Temurin-21.0.11+10 (build 21.0.11+10-LTS)
  OpenJDK 64-Bit Server VM Temurin-21.0.11+10 (build 21.0.11+10-LTS, mixed mode, sharing)
  ```
- Command: `dpm --version`
- Exit: 0
- Snippet:
  ```
  version: 1.0.10
  build: "7052375"
  buildDate: "7052375"
  ```

## P1 Daml
- Command: `cd daml && dpm build --all 2>&1 | tail -8`
- Exit: 0
- Snippet:
  ```
    Upgrade this warning to an error -Werror=unused-dependency
    Disable this warning entirely with -Wno-unused-dependency[0m
  
  2026-05-26 21:13:16.24 [INFO]  [build] 
  Created .daml/dist/pillar-test-0.1.0.dar
  ```
- Command: `(cd daml/pillar-core && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```
- Command: `(cd daml/pillar-assets && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```
- Command: `(cd daml/pillar-intents && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```
- Command: `(cd daml/pillar-ops && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```
- Command: `(cd daml/pillar-token-adapter && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```
- Command: `(cd daml/pillar-test && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```

## P2 API contracts
- Command: `pnpm --filter @pillar/api-contracts build 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  
  
  > @pillar/api-contracts@0.1.0 build:openapi /Users/steve/canton-dev/packages/api-contracts
  > tsx src/build-openapi.ts
  ```
- Command: `pnpm --filter @pillar/api-contracts test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 607.272583
  ```
- Command: `pnpm --filter @pillar/api-contracts test:golden 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  
  > @pillar/api-contracts@0.1.0 test:golden /Users/steve/canton-dev/packages/api-contracts
  > tsx scripts/golden-runner.ts
  
  Validated 37 examples and 13 golden files
  ```
- Command: `pnpm --filter @pillar/api-contracts lint:public-contract 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  
  /Users/steve/canton-dev/packages/api-contracts/examples/network/network.json:1:canton
  /Users/steve/canton-dev/packages/api-contracts:
   ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @pillar/api-contracts@0.1.0 lint:public-contract: `tsx scripts/forbidden-substring-lint.ts`
  Exit status 1
  ```

## P3 DB+idempotency
- Command: `DATABASE_URL=$DATABASE_URL pnpm --filter @pillar/migrator exec ./migrator up 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  function create_usage_events_month_partition(timestamp without time zone) does not exist
  undefined
  /Users/steve/canton-dev/tools/migrator:
   ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: ./migrator up
  ```
- Command: `DATABASE_URL=$DATABASE_URL pnpm --filter @pillar/migrator exec ./migrator verify 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  verify failed: 0000_extensions/0001_pgcrypto.sql: SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pgcrypto') AS ok
  undefined
  /Users/steve/canton-dev/tools/migrator:
   ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: ./migrator verify
  ```
- Command: `DATABASE_URL=$DATABASE_URL pnpm --filter @pillar/idempotency test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
      routine: 'parserOpenTable'
    }
  /Users/steve/canton-dev/packages/idempotency:
   ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @pillar/idempotency@0.1.0 test: `node --test --import tsx test/**/*.test.ts`
  Exit status 1
  ```

## P4 Ledger command runtime
- Command: `./gradlew :services:ledger-command:compileKotlin --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :packages:ledger-types:compileJava UP-TO-DATE
  > Task :services:ledger-command:compileKotlin UP-TO-DATE
  
  BUILD SUCCESSFUL in 326ms
  2 actionable tasks: 2 up-to-date
  ```
- Command: `./gradlew :services:ledger-command:test --console=plain 2>&1 | tail -8`
- Exit: 0
- Snippet:
  ```
  > Task :services:ledger-command:testClasses UP-TO-DATE
  > Task :services:ledger-command:test UP-TO-DATE
  
  BUILD SUCCESSFUL in 339ms
  6 actionable tasks: 6 up-to-date
  ```

## P5 Projection / Reconciliation
- Command: `./gradlew :services:projection-worker:compileKotlin --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :packages:ledger-types:compileJava UP-TO-DATE
  > Task :services:projection-worker:compileKotlin UP-TO-DATE
  
  BUILD SUCCESSFUL in 341ms
  2 actionable tasks: 2 up-to-date
  ```
- Command: `./gradlew :services:projection-worker:test --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :services:projection-worker:testClasses UP-TO-DATE
  > Task :services:projection-worker:test UP-TO-DATE
  
  BUILD SUCCESSFUL in 350ms
  6 actionable tasks: 6 up-to-date
  ```
- Command: `./gradlew :services:reconciler:compileKotlin --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :services:reconciler:checkKotlinGradlePluginConfigurationErrors SKIPPED
  > Task :services:reconciler:compileKotlin UP-TO-DATE
  
  BUILD SUCCESSFUL in 322ms
  1 actionable task: 1 up-to-date
  ```
- Command: `./gradlew :services:reconciler:test --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :services:reconciler:testClasses UP-TO-DATE
  > Task :services:reconciler:test UP-TO-DATE
  
  BUILD SUCCESSFUL in 328ms
  4 actionable tasks: 4 up-to-date
  ```

## P6 Webhook + Workflow
- Command: `./gradlew :services:webhook-dispatcher:compileKotlin --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :services:webhook-dispatcher:checkKotlinGradlePluginConfigurationErrors SKIPPED
  > Task :services:webhook-dispatcher:compileKotlin UP-TO-DATE
  
  BUILD SUCCESSFUL in 317ms
  1 actionable task: 1 up-to-date
  ```
- Command: `./gradlew :services:webhook-dispatcher:test --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :services:webhook-dispatcher:testClasses UP-TO-DATE
  > Task :services:webhook-dispatcher:test UP-TO-DATE
  
  BUILD SUCCESSFUL in 338ms
  4 actionable tasks: 4 up-to-date
  ```
- Command: `./gradlew :services:workflow-orchestrator:compileKotlin --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :services:workflow-orchestrator:checkKotlinGradlePluginConfigurationErrors SKIPPED
  > Task :services:workflow-orchestrator:compileKotlin
  
  BUILD SUCCESSFUL in 426ms
  1 actionable task: 1 executed
  ```
- Command: `./gradlew :services:workflow-orchestrator:test --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  
  For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/command_line_interface.html#sec:command_line_warnings in the Gradle documentation.
  
  BUILD SUCCESSFUL in 588ms
  4 actionable tasks: 3 executed, 1 up-to-date
  ```
- Command: `pnpm --filter @pillar/security test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 171.539458
  ```

## P7 SDK + CLI + Workbench
- Command: `pnpm --filter @pillar/sdk-node typecheck 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  > @pillar/sdk-node@0.1.0 typecheck /Users/steve/canton-dev/packages/sdk-node
  > tsc --noEmit -p tsconfig.json
  ```
- Command: `pnpm --filter @pillar/sdk-node build 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  > @pillar/sdk-node@0.1.0 build /Users/steve/canton-dev/packages/sdk-node
  > tsc -p tsconfig.json
  ```
- Command: `pnpm --filter @pillar/sdk-node test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 144.159291
  ```
- Command: `./gradlew :packages:sdk-java:compileJava --console=plain 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  
  BUILD SUCCESSFUL in 486ms
  1 actionable task: 1 executed
  ```
- Command: `./gradlew :packages:sdk-java:test --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  
  For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/command_line_interface.html#sec:command_line_warnings in the Gradle documentation.
  
  BUILD SUCCESSFUL in 594ms
  3 actionable tasks: 1 executed, 2 up-to-date
  ```
- Command: `pnpm --filter @pillar/cli build 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  > @pillar/cli@0.1.0 build /Users/steve/canton-dev/tools/cli
  > tsc -p tsconfig.json
  ```
- Command: `pnpm --filter @pillar/cli test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 64.082833
  ```
- Command: `pnpm --filter @pillar/workbench typecheck 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  > @pillar/workbench@0.1.0 typecheck /Users/steve/canton-dev/apps/workbench
  > tsc --noEmit -p tsconfig.json
  ```

## P8 Security + Compliance
- Command: `pnpm --filter @pillar/security build 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  > @pillar/security@0.1.0 build /Users/steve/canton-dev/packages/security
  > tsc -p tsconfig.json
  ```
- Command: `pnpm --filter @pillar/storage build 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  > @pillar/storage@0.1.0 build /Users/steve/canton-dev/packages/storage
  > tsc -p tsconfig.json
  ```
- Command: `pnpm --filter @pillar/storage test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 108.684459
  ```
- Command: `./gradlew :services:compliance-adapter:test --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :services:compliance-adapter:testClasses UP-TO-DATE
  > Task :services:compliance-adapter:test UP-TO-DATE
  
  BUILD SUCCESSFUL in 322ms
  4 actionable tasks: 4 up-to-date
  ```
- Command: `./gradlew :services:export-worker:compileKotlin --console=plain 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  
  BUILD SUCCESSFUL in 312ms
  1 actionable task: 1 up-to-date
  ```

## P9 CI / Helm
- Command: `helm lint infra/helm/pillar 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ==> Linting infra/helm/pillar
  [INFO] Chart.yaml: icon is recommended
  
  1 chart(s) linted, 0 chart(s) failed
  ```
- Command: `helm template pillar infra/helm/pillar -f infra/helm/pillar/values-dev.yaml >/dev/null && echo helm-dev OK`
- Exit: 0
- Snippet:
  ```
  helm-dev OK
  ```
- Command: `helm template pillar infra/helm/pillar -f infra/helm/pillar/values-testnet.yaml >/dev/null && echo helm-testnet OK`
- Exit: 0
- Snippet:
  ```
  helm-testnet OK
  ```
- Command: `helm template pillar infra/helm/pillar -f infra/helm/pillar/values-mainnet.yaml >/dev/null && echo helm-mainnet OK`
- Exit: 0
- Snippet:
  ```
  helm-mainnet OK
  ```
- Command: `helm unittest infra/helm/pillar 2>&1 | tail -5 || echo 'unittest unavailable'`
- Exit: 0
- Snippet:
  ```
  Test Suites: 9 passed, 9 total
  Tests:       9 passed, 9 total
  Snapshot:    0 passed, 0 total
  Time:        18.91475ms
  ```
- Command: `docker compose -f infra/compose/local.yml config >/dev/null && echo compose OK`
- Exit: 0
- Snippet:
  ```
  compose OK
  ```

## P10 GA Hardening
- Command: `bash -n tests/chaos/*/run.ts 2>/dev/null || npx tsx --check tests/chaos/participant-restart/run.ts 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  <empty snippet>
  ```
- Command: `for f in infra/observability/grafana/dashboards/*.json; do python3 -m json.tool "$f" >/dev/null && echo OK $f; done | tail -8`
- Exit: 0
- Snippet:
  ```
  OK infra/observability/grafana/dashboards/projection.json
  OK infra/observability/grafana/dashboards/search-export.json
  OK infra/observability/grafana/dashboards/template-registry.json
  OK infra/observability/grafana/dashboards/usage-billing.json
  OK infra/observability/grafana/dashboards/webhook.json
  ```
- Command: `for f in infra/observability/prometheus/rules/*.yaml; do python3 -c "import yaml;yaml.safe_load(open('"$f"'))" && echo OK $f; done | tail -8`
- Exit: 0
- Snippet:
  ```
  OK infra/observability/prometheus/rules/search-export.rules.yaml
  OK infra/observability/prometheus/rules/slo.rules.yaml
  OK infra/observability/prometheus/rules/template-registry.rules.yaml
  OK infra/observability/prometheus/rules/usage-billing.rules.yaml
  OK infra/observability/prometheus/rules/validator-health.rules.yaml
  ```

## P11 Search / Export
- Command: `./gradlew :services:search-indexer:compileKotlin --console=plain 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  
  BUILD SUCCESSFUL in 299ms
  1 actionable task: 1 up-to-date
  ```
- Command: `./gradlew :services:search-indexer:test --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :services:search-indexer:testClasses UP-TO-DATE
  > Task :services:search-indexer:test UP-TO-DATE
  
  BUILD SUCCESSFUL in 316ms
  4 actionable tasks: 4 up-to-date
  ```
- Command: `./gradlew :services:export-worker:test --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :services:export-worker:testClasses UP-TO-DATE
  > Task :services:export-worker:test UP-TO-DATE
  
  BUILD SUCCESSFUL in 326ms
  4 actionable tasks: 4 up-to-date
  ```

## P12 Template Registry
- Command: `./gradlew :services:template-registry:compileKotlin --console=plain 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  
  BUILD SUCCESSFUL in 305ms
  1 actionable task: 1 up-to-date
  ```
- Command: `./gradlew :services:template-registry:test --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :services:template-registry:testClasses UP-TO-DATE
  > Task :services:template-registry:test UP-TO-DATE
  
  BUILD SUCCESSFUL in 320ms
  4 actionable tasks: 4 up-to-date
  ```

## P13 Dashboard / Docs / Onboarding
- Command: `pnpm --filter @pillar/onboarding test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ✖ test/engine.test.ts (120.373834ms)
    'test failed'
  /Users/steve/canton-dev/services/onboarding:
   ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @pillar/onboarding@0.1.0 test: `node --test --import tsx test/*.test.ts`
  Exit status 1
  ```
- Command: `pnpm --filter @pillar/dashboard lint 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  
  > @pillar/dashboard@0.1.0 lint /Users/steve/canton-dev/apps/dashboard
  > next lint
  
  ✔ No ESLint warnings or errors
  ```
- Command: `pnpm --filter @pillar/dashboard build 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
    └ other shared chunks (total)          1.85 kB
  
  
  ƒ  (Dynamic)  server-rendered on demand
  ```
- Command: `pnpm --filter @pillar/docs build 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
    └ other shared chunks (total)          1.85 kB
  
  
  ○  (Static)  prerendered as static content
  ```
- Command: `pnpm --filter @pillar/docs check:openapi 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  
  > @pillar/docs@0.1.0 check:openapi /Users/steve/canton-dev/apps/docs
  > tsx scripts/check-openapi.ts
  
  openapi checksum 027b020d054d6b2f7f643d6c59b1fb50aac94961898f6fb272d23d32302fb218
  ```

## P14 Usage / Billing
- Command: `pnpm --filter @pillar/usage-meter test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 110.080833
  ```
- Command: `pnpm --filter @pillar/billing-adapter test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 103.979084
  ```

## M15.A Identity / Google OAuth
- Command: `pnpm --filter @pillar/identity build 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  > @pillar/identity@0.1.0 build /Users/steve/canton-dev/services/identity
  > tsc -p tsconfig.json
  ```
- Command: `pnpm --filter @pillar/identity test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 116.582042
  ```
- Command: `pnpm --filter @pillar/security test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 170.195
  ```
- Command: `DATABASE_URL=$DATABASE_URL pnpm --filter @pillar/api test 2>&1 | tail -10`
- Exit: 124
- Snippet:
  ```
  TIMEOUT
  ```

## M15.B Network / Validator registry
- Command: `pnpm --filter @pillar/validator-registry test 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 106.370084
  ```

## R0 reconcile + honesty pass
- Command: `python3 - <<'PY'
from pathlib import Path
print('Makefile || true gate lines:')
for line in Path('Makefile').read_text().splitlines():
    if '|| true' in line: print(line)
print('README Status lines:')
for line in Path('README.md').read_text().splitlines():
    if 'Status' in line or 'PASS' in line or 'PARTIAL' in line or 'SCAFFOLD' in line or 'STUB' in line: print(line)
print('SCORING preamble:')
for line in Path('docs/Dev/SCORING.md').read_text().splitlines()[:8]: print(line)
PY`
- Exit: 0
- Snippet:
  ```
  ## Status (honest)
  
  This is a planning/development repository. The earlier per-phase 9.5 PASS verdicts were scored against scaffolding deliverables (files in place, typecheck/lint clean) rather than executable Canton-backed correctness. A reviewer audit on 2026-05-26 reset scoring to reflect actual runtime maturity. See Remediation Plan R0..R6 in docs/Dev/REMEDIATION.md.
  
  > Per-phase score sheet. PASS threshold: **≥9.5/10**. Phase advancement is blocked until the current phase passes.
  ```

## R1 Daml lifecycle
- Command: `cd daml && dpm build --all 2>&1 | tail -8`
- Exit: 0
- Snippet:
  ```
    Upgrade this warning to an error -Werror=unused-dependency
    Disable this warning entirely with -Wno-unused-dependency[0m
  
  2026-05-26 21:13:16.24 [INFO]  [build] 
  Created .daml/dist/pillar-test-0.1.0.dar
  ```
- Command: `(cd daml/pillar-core && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```
- Command: `(cd daml/pillar-assets && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```
- Command: `(cd daml/pillar-intents && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```
- Command: `(cd daml/pillar-ops && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```
- Command: `(cd daml/pillar-token-adapter && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```
- Command: `(cd daml/pillar-test && dpm test 2>&1 | tail -5)`
- Exit: 0
- Snippet:
  ```
    0 defined
    0 (100.0%) exercised in any tests
    0 (100.0%) exercised in internal tests
    0 (100.0%) exercised in external tests
  ```

## R2 API correctness
- Command: `grep -rn 'acct_demo\|asst_demo' apps/api/src 2>/dev/null | grep -v PILLAR_DEMO_DATA || echo 'OK no fallback'`
- Exit: 0
- Snippet:
  ```
  OK no fallback
  ```

## R3 ledger-command runtime
- Command: `./gradlew :services:ledger-command:compileKotlin --console=plain 2>&1 | tail -5`
- Exit: 0
- Snippet:
  ```
  > Task :packages:ledger-types:compileJava UP-TO-DATE
  > Task :services:ledger-command:compileKotlin UP-TO-DATE
  
  BUILD SUCCESSFUL in 326ms
  2 actionable tasks: 2 up-to-date
  ```
- Command: `./gradlew :services:ledger-command:test --console=plain 2>&1 | tail -8`
- Exit: 0
- Snippet:
  ```
  > Task :services:ledger-command:testClasses UP-TO-DATE
  > Task :services:ledger-command:test UP-TO-DATE
  
  BUILD SUCCESSFUL in 339ms
  6 actionable tasks: 6 up-to-date
  ```

## R4 Perf/network
- Command: `for f in infra/envoy/*.yaml infra/envoy/policy/*.yaml; do python3 -c "import yaml;yaml.safe_load(open('"$f"'))"; done && echo envoy YAML OK`
- Exit: 0
- Snippet:
  ```
  envoy YAML OK
  ```
- Command: `docker compose -f infra/compose/local.yml config >/dev/null && echo compose OK`
- Exit: 0
- Snippet:
  ```
  compose OK
  ```

## R5 Vertical slice
- Command: `npx tsx --check tests/e2e/issue-intent-slice/run.ts 2>&1 | tail -3`
- Exit: 0
- Snippet:
  ```
  <empty snippet>
  ```

## R6 honest re-scoring
- Command: `test -s /tmp/r6-evidence.json && echo r6 evidence capture OK`
- Exit: 0
- Snippet:
  ```
  r6 evidence capture OK
  ```

## Forbidden Sweep
- Command: `grep -rni 'stripe' apps/ services/ packages/ infra/envoy infra/helm/pillar tools/cli tools/e2e tests/e2e docs/Dev/{SCORING,REMEDIATION,EVIDENCE}.md README.md 2>/dev/null | grep -v node_modules | grep -v .next | grep -v _shared/canton-fixtures 2>&1 | tail -3 && echo 'stripe found above' || echo 'OK no stripe'`
- Exit: 0
- Snippet:
  ```
  stripe found above
  ```

## Toolchain
- Command: `node -v && pnpm -v`
- Exit: 0
  ```
  v25.9.0
  9.12.3
  ```
- Command: `java -version`
- Exit: 0
  ```
  openjdk version "21.0.11" 2026-04-21 LTS
  OpenJDK Runtime Environment Temurin-21.0.11+10 (build 21.0.11+10-LTS)
  OpenJDK 64-Bit Server VM Temurin-21.0.11+10 (build 21.0.11+10-LTS, mixed mode, sharing)
  ```
- Command: `dpm --version`
- Exit: 0
  ```
  version: 1.0.10
  build: "7052375"
  buildDate: "7052375"
  ```
- Command: `helm version && docker -v`
- Exit: 0
  ```
  version.BuildInfo{Version:"v4.1.1", GitCommit:"5caf0044d4ef3d62a955440272999e139aafbbed", GitTreeState:"clean", GoVersion:"go1.25.7", KubeClientVersion:"v1.35"}
  Docker version 29.5.0, build 98f1464960
  ```
