# Runbook: SDK release rollback

## Trigger

| Field                     | Required content                                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alert names               | `PIL-SDK-REGRESSION`, `PIL-SDK-DOWNLOAD-SPIKE-BROKEN`, `PIL-SDK-HOTFIX-REQUIRED`; manual-only until SDK telemetry exists.                                                                                               |
| Manual triggers           | Customer support ticket, account-owner escalation, SDK GitHub issue, package-registry abuse/security notice, release manager stop-ship.                                                                                 |
| Affected planes           | External API, SDK, CLI/Workbench snippets, Data Plane only if SDK behavior can corrupt submitted requests.                                                                                                              |
| Customer-visible symptoms | New Node/Python/Java SDK version fails install, changes request shape, breaks webhook verification, retries unsafe calls, sends wrong `Pillar-Version`, or produces incorrect customer-visible results.                 |
| SLO / threat references   | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_api_p99_latency`, `pillar_api_5xx_rate`, `pillar_idempotency_replay_correctness`; [REGRESSION_CONTRACT.md](../REGRESSION_CONTRACT.md) public `/v1` and idempotency clauses. |

### Trigger checklist

| Check                               | Required action                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Is this customer-impacting?         | Classify SEV before registry mutation; identify affected language(s), versions, and install channels.                          |
| Is economic correctness uncertain?  | Treat as SEV1 when SDK can emit duplicate mutations, wrong idempotency keys, wrong amounts/assets/accounts, or unsafe retries. |
| Is compromise suspected?            | Preserve package artifact, provenance, CI logs, and registry audit; involve Security lead.                                     |
| Is regulator notification possible? | Include Compliance lead if regulated customers submitted incorrect live operations.                                            |
| Is public `/v1` behavior affected?  | Include API owner; verify whether bug is SDK-only or OpenAPI/API drift.                                                        |

## Severity classification

| Severity | Use when                                                                                                                                                                                   | First response owner                       | Communications                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| SEV1     | Data corruption risk, duplicate economic command risk, wrong asset/account/amount serialization, webhook verifier accepting forged payloads, or SDK changes default API date incompatibly. | Incident Commander + SDK owner + API owner | Status page, direct customer escalation, changelog correction, package-registry advisory. |
| SEV2     | Functional regression blocks normal SDK use for supported Node/Python/Java customers without evidence of economic inconsistency.                                                           | SDK owner + release manager                | Customer notice for affected language/version; status page if broad.                      |
| SEV3     | Cosmetic docs/snippet/package metadata issue, install warning, type-only regression with workaround, or sandbox-only issue.                                                                | SDK language owner                         | Changelog/support notice; no status page unless requested.                                |

### Severity downgrade rules

| From | To     | Evidence required                                                                                                                                         |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEV1 | SEV2   | No live duplicate command, wrong amount/asset/account, forged webhook acceptance, or idempotency divergence; affected SDK calls are blocked or read-only. |
| SEV2 | SEV3   | Regression is bounded to docs/types/cosmetic issue with safe workaround and no production failed operations.                                              |
| Any  | Closed | Broken version deprecated/yanked where possible, hotfix available, customers notified, download stats shift, no new reports for the monitoring window.    |

## On-call decision tree

```text
Broken SDK report received
  -> classify SEV1 if data corruption or unsafe retry is plausible
  -> identify language/version/API date/registry channel
  -> freeze SDK release workflow P7.I14
  -> preserve release artifacts and registry state
  -> compare broken version against previous known-good
  -> choose registry mitigation by language
  -> publish hotfix pinned to prior known-good behavior
  -> communicate downgrade/hotfix instructions
  -> verify customer migration and absence of new reports
```

| Decision                                             | If yes                                                                                                       | If no                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| SDK can submit wrong or duplicate economic requests? | SEV1; instruct customers to stop using affected version; audit operations created by SDK user-agent/version. | Continue functional triage.                                     |
| Only one language is affected?                       | Freeze that package and still check P7.I14 manifest parity.                                                  | Treat as synchronized release incident across Node/Python/Java. |
| OpenAPI drift suspected?                             | Compare SDK generated output to `packages/api-contracts/openapi/pillar-v1.yaml` and golden fixtures.         | Compare handwritten wrapper/dependency diff first.              |
| Registry removal possible?                           | Deprecate/yank per registry policy and publish hotfix.                                                       | Publish higher patch and mark broken version prominently.       |
| Customer action required?                            | Send downgrade/hotfix notice with exact commands.                                                            | Internal release correction may be sufficient.                  |
| Deployment-mode-specific?                            | Include hosted/customer-validator/self-hosted install guidance; API grammar remains identical.               | Use standard package instructions.                              |

## Pre-checks (commands to run first)

| Purpose                             | Command / query                                                                                                                                           | Expected result                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Identify affected SDK versions      | `pillarctl sdk releases list --api-version <YYYY-MM-DD> --language all --since <release-time>`                                                            | Shows Node/Python/Java versions, registry URLs, checksums, default `Pillar-Version`, CI run, release manifest. |
| Capture customer reports            | `pillarctl support cases search --tag sdk-regression --since <release-time> --output <case-id>-support.json`                                              | Reports grouped by language, version, endpoint, deployment mode, severity.                                     |
| Check registry version state        | `npm view @pillar/pillar-js versions --json`; `python -m pip index versions pillar-sdk`; `mvn dependency:get -Dartifact=com.pillar:pillar-java:<version>` | Broken and prior versions are visible; publish/deprecate capability known.                                     |
| Check download/install stats        | `pillarctl sdk registry-stats --package <pkg> --version <version> --window 24h`                                                                           | Install/download volume and affected customer population estimated.                                            |
| Compare against previous known-good | `pillarctl sdk diff --language <node                                                                                                                      | python                                                                                                         | java> --from <prev> --to <broken> --include generated,wrapper,deps` | Regression area identified: generated, wrapper, dependency, packaging, docs/snippet. |
| Check OpenAPI drift                 | `pillarctl api diff --from-release <prev-release> --to-release <broken-release> --contract packages/api-contracts/openapi/pillar-v1.yaml`                 | Diff is additive-only or identifies drift requiring API owner.                                                 |
| Check release sync wrapper          | `pillarctl release evidence sdk --workflow P7.I14 --run <run-id>`                                                                                         | P7.I14 emitted same API date and release manifest for all SDKs; no partial publish hidden.                     |
| Capture audit context               | `pillarctl audit search --operation sdk_release --release <sdk-version>`                                                                                  | Release approval, workflow, package checksum, and changelog evidence exists.                                   |
| Capture logs                        | `pillarctl logs bundle --component sdk-release --since <duration> --output <case-id>.tar.zst`                                                             | Immutable release evidence bundle created.                                                                     |

### Evidence preservation before mutation

| Artifact                  | Required before destructive action? | Notes                                                                                  |
| ------------------------- | ----------------------------------: | -------------------------------------------------------------------------------------- |
| Package tarball/wheel/JAR |                                 Yes | Store exact broken and previous known-good artifacts with registry checksums.          |
| Release manifest          |                                 Yes | Include P7.I14 manifest, OpenAPI artifact, generated SDK metadata, changelog fragment. |
| Registry metadata         |                                 Yes | Capture deprecation/yank state before changing it.                                     |
| Customer reports          |                                 Yes | Preserve versions, stack traces, request IDs, language runtime versions.               |
| Operation traces          |                        Yes for SEV1 | Query by SDK user-agent/version; do not expose Canton internals to customers.          |
| Communications            |                                 Yes | Preserve status page, support advisories, changelog corrections.                       |

## Diagnose

| Step | Question                                         | Evidence                                                                       | Branch                                                           |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1    | Which SDK language and version is broken?        | Registry metadata, user-agent/version headers, support cases.                  | Language-specific hotfix or synchronized hotfix.                 |
| 2    | Is the broken behavior generated or handwritten? | SDK diff, generated directory checksum, wrapper diff.                          | OpenAPI/codegen owner or language wrapper owner.                 |
| 3    | Did default `Pillar-Version` change?             | SDK manifest, constructor defaults, release packet.                            | API owner + release manager; treat as SEV1/SEV2 based on impact. |
| 4    | Did request serialization change?                | Golden request fixtures, customer request logs, OpenAPI schema diff.           | Hotfix serialization; audit live operations.                     |
| 5    | Did retry/idempotency behavior change?           | SDK retry tests, idempotency headers, `pillar_idempotency_replay_correctness`. | SEV1 if duplicate economic effect possible.                      |
| 6    | Did webhook verifier change?                     | Shared webhook vectors from P7.I10/P7.I12/P7.I13.                              | Security escalation if forged payload accepted.                  |
| 7    | Is dependency conflict causing runtime failure?  | Lockfile/package metadata, customer runtime versions.                          | Pin/replace dependency in hotfix.                                |
| 8    | Is CLI/Workbench snippet generator affected?     | P7.I14 docs metadata handoff, apps/docs snippets.                              | Correct docs/snippets and customer examples.                     |

### Required diagnosis outputs

| Output               | Format                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Impact statement     | `language / version / API date / customer count / failure mode / since UTC / current mitigation`                          |
| Affected objects     | Public request IDs, operation IDs, event IDs, package versions; internal command IDs only in privileged incident channel. |
| Timeline             | UTC timestamps for publish, first install, first report, freeze, registry mitigation, hotfix, customer notice.            |
| Invariant assessment | Public Canton-invisibility, API version pinning, idempotency, webhook signature, and deployment-mode parity impact.       |
| Next action          | Deprecate/yank, publish hotfix, customer downgrade, API drift fix, or monitor.                                            |

## Mitigate

| Mitigation class    | Allowed actions                                                                                                                                                                                      | Forbidden actions                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Registry control    | `npm deprecate @pillar/pillar-js@<broken> "critical regression; install <hotfix>"`; yank/remove from PyPI if policy permits; publish higher Maven patch because Maven Central yank is not available. | Mutate existing package bits, republish same semver, hide provenance, or delete evidence.         |
| Customer stopgap    | Send downgrade commands pinned to previous known-good; provide lockfile constraints and SDK constructor `apiVersion` pin.                                                                            | Tell customers to change public `/v1` behavior or expose Canton internals as workaround.          |
| Release freeze      | Disable `.github/workflows/sdk-release.yml` publish jobs or require release-manager approval until hotfix passes.                                                                                    | Freeze unrelated runtime deploys unless evidence links them to the incident.                      |
| Hotfix              | Publish minimal SDK patch that reverts generated/wrapper/dependency behavior to prior known-good and preserves API date.                                                                             | Bundle features, change default API date silently, weaken retry/idempotency/webhook verification. |
| SEV1 runtime safety | Audit operations from broken SDK version; contact affected customers before retries/replays.                                                                                                         | Patch projection rows as truth or issue compensating operations without customer/ledger evidence. |

### Registry mitigation matrix

| Registry      | Broken-version action                                                                                                     | Hotfix action                                                               | Customer instruction                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| npm           | `npm deprecate @pillar/pillar-js@<broken> "Broken release; use <hotfix> or <previous>"`                                   | Publish `<patch+1>` with provenance and changelog.                          | `npm install @pillar/pillar-js@<hotfix>` or pin previous known-good in lockfile.            |
| PyPI          | Yank broken file/version where PyPI policy and install impact permit; otherwise update project description/release notes. | Publish `<patch+1>` wheel/sdist.                                            | `pip install 'pillar-sdk==<hotfix>'` or constraints file pin.                               |
| Maven Central | Yank is not available for normal releases; do not rely on deletion.                                                       | Publish `<patch+1>` artifact and mark broken version in changelog/advisory. | Update Gradle/Maven coordinate to `<hotfix>`; enforce dependency resolution rule if needed. |
| Docs/snippets | Remove recommendation of broken version; add warning banner.                                                              | Regenerate snippets from hotfix manifest.                                   | Follow language-specific install command and rerun sample smoke.                            |

### Mitigation record

| Field           | Required value                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Action          | Exact registry command, workflow freeze, customer advisory, or hotfix publish command.                               |
| Owner           | SDK language owner plus release manager; IC for SEV1/SEV2.                                                           |
| Start/end       | UTC timestamps.                                                                                                      |
| Expected effect | New installs shift to hotfix; customer errors stop; no new SEV reports.                                              |
| Rollback        | Registry deprecation text can be corrected; hotfix can be superseded by newer patch, never by mutating old artifact. |
| Evidence link   | Support case, release manifest, registry screenshots/API output, CI run, package checksum.                           |

## Recover

| Recovery step            | Required checks                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Publish hotfix           | Node/Python/Java common walkthrough passes when affected; manifest default API date unchanged; checksums/provenance recorded. |
| Restore release workflow | P7.I14 dry-run passes all supported SDKs and blocks partial publish.                                                          |
| Customer migration       | Affected customers confirm downgrade/hotfix; support tickets updated with exact version.                                      |
| SEV1 operation review    | Operations from broken SDK version reconciled with ledger/projection; customers receive per-operation guidance.               |
| Changelog correction     | Broken version, mitigation, hotfix, and install commands recorded in customer-facing changelog.                               |
| Status page resolution   | Resolution message links to hotfix and says whether customer action is required.                                              |

## Verify

| Verification       | Command / source                                                                                        | Pass condition                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| Registry state     | `pillarctl sdk registry-state --language all --versions <broken>,<hotfix>`                              | Broken version is deprecated/yanked where possible; hotfix visible and installable.   |
| Download shift     | `pillarctl sdk registry-stats --version <broken>,<hotfix> --window 6h`                                  | New downloads shift to hotfix/previous; broken installs trend down.                   |
| Common walkthrough | `pillarctl sdk smoke --language <node                                                                   | python                                                                                | java> --version <hotfix> --api-version <YYYY-MM-DD>` | Create/read/list intent, webhook verify, idempotency option all pass. |
| OpenAPI parity     | `pillarctl sdk conformance --release <hotfix> --contract packages/api-contracts/openapi/pillar-v1.yaml` | Generated public surface matches OpenAPI; no forbidden Canton identifiers.            |
| Idempotency safety | `pillarctl smoke idempotency --sdk-version <hotfix>`                                                    | Same request/key returns same operation/response; conflicting body returns 409.       |
| Webhook verifier   | `pillarctl sdk webhook-vectors --language <affected> --version <hotfix>`                                | Shared positive/negative vectors pass, including raw-body tamper and stale timestamp. |
| Error reports      | `pillarctl support cases search --tag sdk-regression --since <hotfix-time>`                             | No new reports for the hotfix version.                                                |
| Audit integrity    | `pillarctl audit verify --case <case-id>`                                                               | Registry actions, release freeze, hotfix publish, and communications are recorded.    |

## Communicate (customer-facing message templates)

### Initial status-page update

```text
We are investigating a regression in Pillar SDK version <version> for <Node/Python/Java>. The issue affects <capability>. Customers using earlier versions are not known to be affected. We will provide the next update by <UTC time>.
```

### Degraded service update

```text
Pillar SDK <language> version <version> is currently not recommended for production use because <customer-visible symptom>. Please pin to <previous-known-good> while we prepare a hotfix. Accepted Pillar operations remain traceable; customers with live operations using this SDK version should contact Support with request IDs.
```

### Recovery update

```text
We have published Pillar SDK <language> version <hotfix>. Customers should upgrade with: <install command>. The previous broken version has been <deprecated/yanked/marked superseded> where the package registry permits. We are monitoring package downloads and support reports.
```

### Resolution update

```text
The SDK regression affecting <language> version <broken> is resolved. We validated <hotfix> against the pinned API version <YYYY-MM-DD>, webhook verification vectors, and idempotency smoke tests. Customers should remain on <hotfix> or later.
```

### Security/compliance holding statement

```text
We are investigating whether the SDK regression affected request integrity or webhook verification for <scope>. We have preserved release artifacts and registry evidence and will notify affected customers and regulators as required after validation.
```

## Post-incident

| Time from resolution | Deliverable                                                                                       | Owner                       |
| -------------------- | ------------------------------------------------------------------------------------------------- | --------------------------- |
| 2 hours              | Impact draft with affected package versions, customer count, registry actions, and hotfix status. | Incident Commander          |
| 24 hours             | Initial post-incident report with regression diff and missing gate analysis.                      | SDK owner + release manager |
| 5 business days      | Full post-mortem; add/strengthen P7.I14 release gate and shared SDK vectors.                      | SDK lead                    |
| Next release gate    | Verify P7.I14 rejects the exact failure class and docs snippets consume hotfix manifest.          | Release engineering         |

### Post-incident fields

| Field                      | Required content                                                                 |
| -------------------------- | -------------------------------------------------------------------------------- |
| Summary                    | Customer-visible SDK impact and duration by language/version.                    |
| Root cause                 | Evidence-backed generated/wrapper/dependency/release-sync cause.                 |
| Trigger                    | Customer report, support ticket, registry stats, or release validation failure.  |
| Detection gap              | Why SDK tests, P7.I14, OpenAPI drift check, or common walkthrough missed it.     |
| Mitigation                 | Registry deprecation/yank status, downgrade notice, workflow freeze.             |
| Recovery proof             | Hotfix install, conformance, webhook vectors, idempotency smoke, download shift. |
| Invariant impact           | API version pinning, idempotency, Canton invisibility, deployment-mode parity.   |
| Customer/regulator actions | Notices sent or rationale for not sending.                                       |
| Follow-up work             | Ticket IDs, owners, due dates, verification commands.                            |

## Related

- SLOs: [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_api_p99_latency`, `pillar_api_5xx_rate`, `pillar_idempotency_replay_correctness`.
- Phase tickets: [P7.I01-P7.I03](../Phase_07_SDK_CLI_Workbench.md#9-implementation-plan), [P7.I10-P7.I14](../Phase_07_SDK_CLI_Workbench.md#9-implementation-plan), [P10.L06](../Phase_10_GA_Hardening.md#9-implementation-plan).
- Release policy: [RELEASE_PLAN.md §5 SDK release matrix](../RELEASE_PLAN.md#5-sdk-release-matrix), [RELEASE_PLAN.md §8 changelog policy](../RELEASE_PLAN.md#8-customer-facing-changelog-policy).
- ADRs: [ADR-0002](../DECISIONS.md#adr-0002-stripe-style-external-api-surface-canton-internals-hidden), [ADR-0004](../DECISIONS.md#adr-0004-stable-operation_id--stable-command_id-unique-submission_id-per-attempt), [ADR-0006](../DECISIONS.md#adr-0006-webhook-first-async-with-hmac-sha256-signing-and-per-endpoint-version-pinning), [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar), [ADR-0013](../DECISIONS.md#adr-0013-initial-sdk-scope).
- Risks: [RISK_REGISTER.md](../RISK_REGISTER.md) R-039 runbook drift, R-044 public API grammar leak.
- Threats: [THREAT_MODEL.md](../THREAT_MODEL.md) SDK supply-chain, webhook signature, API contract drift entries where applicable.
