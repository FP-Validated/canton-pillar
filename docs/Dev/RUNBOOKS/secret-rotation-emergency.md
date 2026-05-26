# Runbook: Secret rotation emergency

## Trigger

| Field                     | Required content                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alert names               | `PIL-SECRET-EXPOSED-P0`, `PIL-AUDIT-GAP-P0`, `PIL-WH-SIGNING-FAIL-P1`, `PIL-COMP-ENGINE-DOWN-P0`, `PIL-DAR-SIGNATURE-P1`, secret-scanner production hit, KMS unauthorized-use alarm.                                                                                                                 |
| Manual triggers           | Security report, customer report, regulator inquiry, vendor breach notice, repo/log/ticket/chat exposure, phishing report, insider-risk escalation, failed rotation drill.                                                                                                                           |
| Affected planes           | Security, Compliance, External API, Webhook, Canton Command, Control Plane, Data Plane, Template Registry.                                                                                                                                                                                           |
| Customer-visible symptoms | Authentication failures, webhook signature changes, revoked sessions, delayed KYC/Billing workflows, mTLS reconnects, template deployment pause, or emergency customer cutover notice.                                                                                                                |
| SLO / threat references   | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_secret_rotation_age_seconds`, `pillar_audit_log_completeness`, `pillar_api_5xx_rate`, `pillar_webhook_delivery_success`, `pillar_dar_upload_success`; [THREAT_MODEL.md](../THREAT_MODEL.md) credential exposure, signing-key compromise, insider misuse. |

### Trigger checklist

| Check                                                                       | Required action                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Is compromise confirmed?                                                    | Classify SEV1, assign Incident Commander, freeze evidence, rotate immediately.                          |
| Is compromise suspected but unconfirmed?                                    | Classify SEV2, rotate or scope-clamp based on blast radius, preserve full evidence.                     |
| Is this only scheduled hygiene?                                             | Use normal rotation runbooks, not this emergency path.                                                  |
| Is public `/v1` behavior affected?                                          | Include API owner; preserve Billing-like grammar and idempotency semantics.                              |
| Is regulator notification possible?                                         | Include Compliance lead immediately; do not wait for root cause.                                        |
| Is the secret customer-owned in `customer-validator` or `self-hosted` mode? | Coordinate with customer operator; Pillar can advise but may not be able to mutate local secret stores. |

## Severity

| Severity | Use when                                                                                                                                                                                                               | First response owner                          | Communications                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| SEV1     | Confirmed compromise, successful unauthorized use after leak timestamp, platform signing key exposed, production KMS/DAR/JWT/mTLS key loss, regulator clock active, or audit evidence gap during suspected compromise. | Incident Commander + Security Lead + SRE Lead | Status page if customer-visible, direct customer notice, executive escalation, regulator decision within required deadline. |
| SEV2     | Suspected compromise, exposed non-production key with production path uncertainty, vendor breach notice without observed use, stale rotation-age breach, or failed emergency rotation drill.                           | Security Lead + component owner               | Customer notice if action required; status page only for broad degradation.                                                 |
| SEV3     | Planned validation of emergency path, inactive/expired secret found with no production reachability, or single-tenant advisory with no exposure.                                                                       | Component owner                               | Internal channel; customer notice only by support/account-owner decision.                                                   |

### Severity downgrade rules

| From | To     | Evidence required                                                                                                                                    |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEV1 | SEV2   | No accepted use after compromise timestamp, old secret revoked, audit trace complete, no data exposure/regulator clock, and customer impact bounded. |
| SEV2 | SEV3   | Secret inactive or non-production, no customer action required, no live traffic acceptance, and control gap ticket opened.                           |
| Any  | Closed | Verify section complete for the secret kind, old secret invalidated, audit search after revocation is clean, and 5-day report owner assigned.        |

## On-call decision tree

```text
Secret exposure alert/manual report received
  -> classify confirmed vs suspected compromise
  -> assign SEV1/SEV2 owner and preserve evidence
  -> identify secret kind, tenant scope, environment, deployment mode
  -> capture last-known-good timestamp and first-exposure timestamp
  -> choose per-secret mitigation row
  -> rotate/provision new secret by reference, not inline value
  -> invalidate old secret and purge caches/channels where applicable
  -> run targeted smoke tests
  -> decide customer/regulator communication
  -> produce 5-day incident report
```

| Secret kind         | Immediate branch                                                                                                                        | Customer overlap                                                                          | Primary invariant protected                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Webhook signing key | Dual-active rotation; create new `whsec` version, sign with active key, verify old during overlap, then revoke old.                     | 24h overlap unless active abuse requires shorter window.                                  | Webhook-first async integrity; event identity preserved.     |
| API key pepper      | Enable P8.K06 dual-pepper verifier; hash existing keys with old + new pepper during overlap; migrate hashes; remove old pepper.         | Usually invisible; customer action not required unless auth failures occur.               | API credential secrecy; no raw API key storage.              |
| JWT signing key     | Generate new signing key with new `kid`; revoke all sessions/service tokens; reject old `kid`; re-issue tokens.                         | Immediate token refresh; customer dashboard/Workbench sessions may be forced to log in.   | Service/user auth integrity.                                 |
| mTLS cert           | Provision new cert/key/trust material; update Helm secret reference; rolling restart `ledger-command` pods; verify participant channel. | None for public API; customer-validator/self-hosted may require customer operator action. | Canton command channel confidentiality and participant auth. |
| KMS key             | Trigger KMS rotation; re-encrypt at-rest secrets/envelope keys; schedule deferred metric until all ciphertext versions migrated.        | Usually none; expose maintenance if decrypt path degraded.                                | Secret-at-rest protection and auditability.                  |
| Billing API key      | Rotate in Billing dashboard; update `PILLAR_BILLING_API_KEY_SECRET_REF`; restart only dependent payment/billing worker if required.       | Billing/payment flows may pause; no ledger mutation shortcut.                             | Third-party payment integration isolation.                   |
| KYC vendor key      | Rotate in vendor portal; update compliance-adapter secret reference/config; verify KYB/sanctions calls.                                 | Onboarding/KYB may be delayed; never auto-approve on outage.                              | Compliance decision integrity.                               |
| DAR signing key     | Rotate via KMS; re-sign current production DAR; update template-registry artifact/signature metadata; block unsigned activation.        | Usually internal; release/deploy pause if validation fails.                               | Supply-chain and template-registry integrity.                |

| Decision                                              | If yes                                                                 | If no                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Is any customer or tenant key specifically affected?  | Scope notifications and audit queries by tenant/environment/key ID.    | Treat as platform blast radius until proven otherwise.            |
| Is the old secret still accepting production traffic? | Revoke, purge cache, restart or reload dependent workloads.            | Continue forensic audit and verify no post-revocation acceptance. |
| Is the secret used to sign data customers verify?     | Provide dual-active/verification guidance and exact cutoff time.       | Keep communication internal unless customer workflows degrade.    |
| Does rotation affect ledger-command connectivity?     | Use mTLS/JWT branch and monitor participant availability/command SLOs. | Continue service-specific smoke tests.                            |
| Does rotation affect deployment artifacts?            | Freeze promotion, re-sign/re-register, verify DAR/image provenance.    | Continue runtime mitigation.                                      |

### Deployment-mode branches

| Deployment mode      | Authority                                                                                          | Emergency branch                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hosted`             | Pillar owns control plane, secret store, Helm release, workload restarts, and audit export.        | Execute centrally with ExternalSecrets/KMS references; status/customer comms from Pillar.                                                             |
| `customer-validator` | Pillar owns Pillar services; customer owns participant/validator and may own mTLS endpoint policy. | Rotate Pillar-held secrets centrally; coordinate participant mTLS/JWT trust changes with customer validator operator before rolling `ledger-command`. |
| `self-hosted`        | Customer owns local control plane and secret store unless managed support agreement grants access. | Provide exact commands/config changes; customer executes and returns audit/config evidence; Pillar does not assume cache purge or KMS access.         |

## Pre-checks

| Purpose                                   | Command / query                                                                                                              | Expected result                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Identify deployment context               | `pillarctl env describe --tenant <tenant> --env prod`                                                                        | Shows `deploymentMode`, region, release, chart, secret-provider, data-plane owner.                      |
| Identify secret inventory row             | `pillarctl secrets inventory --env prod --kind <kind> --tenant <tenant-or-all>`                                              | Secret references, owners, active versions, `last_rotated_at`, consumers. Raw values are never printed. |
| Identify scope                            | `pillarctl audit search --env prod --resource-kind secret --secret-ref <ref> --since <duration>`                             | Admin reads/writes, rotations, dependent service reloads, and tenant scope known.                       |
| Capture last-known-good timestamp         | `pillarctl secrets attest --secret-ref <ref> --before <suspected_time>`                                                      | Last clean attestation or rotation drill timestamp known.                                               |
| Check audit completeness                  | `pillarctl audit verify --env prod --window <start..now> --subjects secrets,auth,admin`                                      | No audit hash-chain gaps before mutation.                                                               |
| Check current SLO state                   | `pillarctl slo status --env prod --slo pillar_secret_rotation_age_seconds,pillar_audit_log_completeness,pillar_api_5xx_rate` | Baseline known before rotation.                                                                         |
| Capture logs evidence bundle              | `pillarctl logs bundle --env prod --since <duration> --redact --output <case-id>.tar.zst`                                    | Immutable, redacted bundle created before destructive action.                                           |
| Check active consumers                    | `pillarctl secrets consumers --secret-ref <ref> --env prod`                                                                  | Workloads, pods, jobs, external vendors, cache TTLs, and reload mode known.                             |
| Check exposure source                     | `pillarctl security exposure inspect --case <case-id>`                                                                       | Repo/log/ticket/chat/vendor/phishing/insider source classified.                                         |
| Check tenant and environment blast radius | `pillarctl secrets blast-radius --secret-ref <ref>`                                                                          | Affected tenants, regions, modes, scopes, public objects, and vendor accounts listed.                   |

### Evidence preservation before mutation

| Artifact                  |      Required before destructive action? | Notes                                                                                                              |
| ------------------------- | ---------------------------------------: | ------------------------------------------------------------------------------------------------------------------ |
| Secret metadata           |                                      Yes | Record reference, version, checksum/fingerprint where safe, creation/rotation/revocation timestamps.               |
| Raw secret value          |                                       No | Never copy into incident notes. If already exposed, preserve original location under restricted evidence controls. |
| Audit rows                |                                      Yes | Include admin actions, auth use, signing verification, vendor calls, KMS decrypt/sign calls, deployment changes.   |
| Logs/traces               |                                      Yes | Redacted structured logs; include request IDs and operation IDs, not plaintext credentials.                        |
| Repo/CI evidence          | Yes if source is repository or pipeline. | Preserve commit SHA, job URL, artifact ID; use approved purge/redaction separately.                                |
| Vendor dashboard evidence |                  Yes if third-party key. | Screenshot/export under restricted security evidence storage; do not paste key material.                           |
| Customer communications   |                                      Yes | Preserve notices, status page updates, and support replies.                                                        |

### Scope worksheet

| Dimension                   | Required answer                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which keys?                 | Secret refs and safe fingerprints: webhook endpoint IDs, API pepper version, JWT `kid`, cert serial, KMS key ID, vendor key alias, DAR signing key alias. |
| Which tenants?              | Tenant IDs/public customer names, environment, livemode, regulated profile, customer action owner.                                                        |
| Which time window?          | `last_known_good_at`, `first_exposed_at`, `first_suspicious_use_at`, `revoked_at`, `verified_clean_after`.                                                |
| Which data signed/verified? | Events, JWTs, participant channels, DAR artifacts, API key hashes, vendor calls, encrypted fields.                                                        |
| Which dependent services?   | API, webhook-dispatcher, ledger-command, compliance-adapter, template-registry, usage/billing workers, dashboard/workbench.                               |

## Diagnose

| Step | Question                                         | Evidence                                                                                                             | Branch                                                    |
| ---- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1    | What kind of secret is exposed?                  | Inventory, alert labels, secret ref, safe fingerprint.                                                               | Select mitigation table row.                              |
| 2    | How did it leak?                                 | Repo commit, CI log, application log dump, ticket/chat paste, vendor incident, insider action, phishing timeline.    | Start source containment and preventive action.           |
| 3    | Was it production-live and active?               | Secret inventory status, consumer list, auth/sign/decrypt metrics.                                                   | Production active means SEV1 if compromise confirmed.     |
| 4    | Which tenants/environments were reachable?       | Blast-radius query, key scopes, vendor account mapping, endpoint mapping.                                            | Split notification and recovery checks by tenant.         |
| 5    | What could have been signed or verified with it? | Route/signing logs, webhook deliveries, JWT validation logs, KMS `Sign/Decrypt`, DAR registry entries, vendor calls. | Determine data integrity and customer/regulator impact.   |
| 6    | Was there accepted use after exposure?           | Audit grouped by safe fingerprint and timestamp.                                                                     | Unauthorized accepted use triggers SEV1/regulator review. |
| 7    | Are dependent services failing during rotation?  | `pillar_api_5xx_rate`, webhook delivery, command success, compliance latency, DAR upload success.                    | Pause rollout or use recovery branch.                     |

### Leak-source diagnosis

| Source            | Confirm with                                                          | Containment                                                                                       |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Repo commit       | Commit SHA, branch, PR, secret-scanner finding, clone/fork exposure.  | Rotate first; then purge/rewrite only through approved security process; invalidate CI artifacts. |
| Log dump          | Log sink, retention bucket, query, support export, log line template. | Rotate; redact sink; disable offending log field; preserve evidence of who accessed dump.         |
| Ticket/chat/paste | URL/message ID, participants, export history.                         | Rotate; restrict/remove message; notify recipients of handling rule.                              |
| Insider           | Audit of admin read/export, IAM session, unusual access.              | Disable account/session; preserve forensic evidence; legal/compliance lead owns people process.   |
| Phishing          | User report, IdP logs, token/session use, MFA events.                 | Revoke user sessions and credentials; rotate secrets reachable by compromised user.               |
| Vendor breach     | Vendor notice, affected account/key, API logs.                        | Rotate vendor key; verify no unsafe vendor callback decisions.                                    |

### Required diagnosis outputs

| Output               | Format                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Impact statement     | `who / what secret kind / since when / current status / customer action`                                                                        |
| Affected objects     | Public object IDs only: `we_*`, `ak_*`, `onb_*`, `tpl_*`, `tplv_*`, `op_*`, `evt_*`; no raw Canton identifiers in customer-facing notes.        |
| Timeline             | UTC timestamps for first exposure, detection, ack, mitigation start, new secret active, old secret revoked, verification.                       |
| Invariant assessment | Whether API grammar, ledger source-of-truth, webhook event identity, audit trace, deployment parity, and secret-at-rest controls stayed intact. |
| Next action          | Rotate, revoke, re-encrypt, re-sign, restart, customer notice, regulator notice, or monitor.                                                    |

## Mitigate

| Secret kind         | Required mitigation                                                                                                                                                                                                                | Forbidden actions                                                                                                                                        | Rollback / fallback                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Webhook signing key | Create new endpoint secret version; mark dual-active; dispatcher signs new deliveries with new version; verifier accepts old+new for 24h; notify customers; revoke old at cutoff.                                                  | Changing `evt_*` IDs, replaying with replacement events, revealing secret in email/ticket, silently shortening overlap without abuse evidence.           | Extend overlap if customer cannot deploy and no active abuse; if abuse confirmed, revoke old immediately and support customer verification failure handling. |
| API key pepper      | Deploy new pepper ref; enable P8.K06 dual-pepper verify; on successful old-pepper verification, rewrite hash with new pepper; batch rehash active key hashes; monitor auth failures; remove old pepper after zero old-pepper hits. | Storing raw API keys, forcing customer key reissue solely because pepper changed, accepting unaudited fallback hash, disabling idempotency/auth checks.  | Keep dual-pepper until migration complete; if auth failures spike, restore old-pepper verification while preserving new-pepper writes.                       |
| JWT signing key     | Generate new key and `kid`; publish verifier config; revoke all sessions/tokens signed by old `kid`; issue new service tokens; force dashboard/workbench re-login; audit old `kid` attempts.                                       | Accepting old `kid` indefinitely, issuing tokens without audience/tenant/mode, bypassing service-to-service auth.                                        | Temporarily allow old `kid` only for bounded non-compromised graceful rollover; not allowed for confirmed compromise.                                        |
| mTLS cert           | Provision new cert/key/trust bundle; update Helm secret reference (`ledgerCommand.mtls.secretRef`); roll `ledger-command` with maxUnavailable 0; verify participant TLS; remove old cert from trust where possible.                | Inline cert/key in Helm values, deleting old cert before new channel works in customer-validator mode, dropping in-flight attempt audit.                 | Restore previous secret reference only if compromise not confirmed; otherwise fail closed and keep commands queued.                                          |
| KMS key             | Enable provider rotation or create replacement CMK; update secret-provider alias; re-encrypt secrets/envelope data keys; track deferred migration metric until all ciphertext versions updated.                                    | Manual DB plaintext export, deleting old key before decrypt/re-encrypt completes, bypassing envelope metadata.                                           | Keep old key disabled-but-recoverable per provider policy until re-encryption verified; never re-enable for new encrypt.                                     |
| Billing API key      | Rotate in Billing dashboard; store new secret in secret manager; update `PILLAR_BILLING_API_KEY_SECRET_REF`; reload billing/payment worker; verify Billing auth and webhook/payment flows.                                            | Posting key into Helm values/tickets, mixing test/live keys, retrying charges outside idempotent Billing semantics.                                       | Pause Billing-dependent flows; no ledger mutation shortcut for payment uncertainty.                                                                           |
| KYC vendor key      | Rotate via vendor portal; update compliance-adapter config/secret ref; reload adapter; verify KYB/sanctions calls; leave onboarding in pending/requires_action while vendor unavailable.                                           | Auto-approving KYB, storing vendor raw PII in incident notes, bypassing P8.K20 adapter normalization.                                                    | Use alternate configured vendor only if policy allows; otherwise pause onboarding/KYB step.                                                                  |
| DAR signing key     | Rotate signing key through KMS; re-sign current production DAR; update template-registry artifact signature and key metadata; block activation of unsigned/mismatched artifacts; verify release provenance.                        | Editing DAR bytes, changing template policy without registry event, accepting unsigned DAR in production, exposing package internals in customer notice. | Freeze deployments; continue running current verified DAR until new signature validates.                                                                     |

### Mode-specific mitigation commands

| Mode                 | Command / action                                                                                                                   | Notes                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `hosted`             | `pillarctl secrets rotate --env prod --kind <kind> --secret-ref <ref> --case <case-id>`                                            | Central rotation with audit and ExternalSecrets/KMS integration.                    |
| `hosted`             | `helm upgrade pillar infra/helm/pillar -n pillar-runtime -f values-prod.yaml --reuse-values --set <component>.secretRef=<new-ref>` | Use refs only; render must contain no secret-like values.                           |
| `customer-validator` | `pillarctl customer-validator rotation-plan --tenant <tenant> --kind mtls --case <case-id>`                                        | Produces customer coordination checklist for participant trust/mTLS changes.        |
| `self-hosted`        | `pillarctl support export-rotation-instructions --mode self-hosted --kind <kind> --case <case-id>`                                 | Customer runs local secret-manager/Helm commands and returns audit/config evidence. |

### Mitigation record

| Field           | Required value                                                                        |
| --------------- | ------------------------------------------------------------------------------------- |
| Action          | Exact command, vendor action, KMS operation, Helm diff, or dashboard rotation action. |
| Owner           | Security, SRE, Compliance, Release, customer operator, or vendor owner.               |
| Start/end       | UTC timestamps.                                                                       |
| Expected effect | Old secret no longer accepted; new secret accepted; relevant SLO stable.              |
| Rollback        | Allowed only when compromise is not confirmed; otherwise fail closed or queue work.   |
| Evidence link   | Incident ID, audit query, dashboard snapshot, log bundle, vendor ticket.              |

## Recover

| Recovery step                    | Required checks                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirm new secret in production | Secret inventory shows new active version/ref; dependent pods/jobs/adapters report loaded generation; vendor dashboard shows active key where relevant. |
| Confirm old secret invalidated   | Status `revoked`, old `kid` rejected, old cert removed/expired, old KMS version disabled for new encrypt/sign, old vendor key disabled.                 |
| Confirm no use after revocation  | Audit search for old safe fingerprint after `revoked_at` returns zero accepted uses; failed attempts are classified.                                    |
| Resume paused workflows          | Webhook dispatcher, onboarding/KYB, billing/Billing, DAR promotion, or ledger-command queues resume only after targeted smoke tests pass.                |
| Reconcile signed/verified data   | Events/JWTs/DARs/vendor decisions during exposure window are classified as valid, re-signed/re-issued, or customer-notified.                            |
| Re-enable deploys                | Release freeze lifted only after audit completeness and regression/control tickets are accepted.                                                        |
| Customer closeout                | Customers with action received new secret/cutover instructions and completion notice.                                                                   |

### Per-kind recovery evidence

| Secret kind         | Evidence                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook signing key | New deliveries signed with new version; old version rejected after cutoff; no duplicate event IDs.                                          |
| API key pepper      | Active key hashes migrated to new pepper marker; old-pepper accepted count zero after overlap.                                              |
| JWT signing key     | Old `kid` rejected; new tokens have expected audience, tenant/mode, expiry; dashboard/workbench sessions recovered.                         |
| mTLS cert           | `ledger-command` pods all on new secret generation; participant channel healthy; pending command attempts not duplicated.                   |
| KMS key             | Re-encryption job complete or deferred metric explicitly tracking remaining ciphertext; no decrypt failures.                                |
| Billing API key      | Billing test API call succeeds with new ref; no live/test key mix; idempotent payment/billing checks pass.                                   |
| KYC vendor key      | Compliance adapter health passes; fixture and live vendor auth calls succeed; pending onboarding sessions progress only by valid decisions. |
| DAR signing key     | Current production DAR signature verifies under new key; template-registry points to new signature metadata; activation gate passes.        |

## Verify

| Verification        | Command / source                                                                                                             | Pass condition                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| SLO recovery        | `pillarctl slo status --env prod --slo pillar_secret_rotation_age_seconds,pillar_audit_log_completeness,pillar_api_5xx_rate` | Rotation-age alert cleared or acknowledged; audit complete; no API 5xx spike.                     |
| Audit integrity     | `pillarctl audit verify --case <case-id>`                                                                                    | Incident actions, admin changes, secret loads, and revocations are recorded and hash-chain valid. |
| Old secret blocked  | `pillarctl secrets test-old --secret-ref <old-ref> --kind <kind> --safe`                                                     | Old secret cannot authenticate/sign/decrypt/verify where revocation requires rejection.           |
| New secret accepted | `pillarctl secrets smoke --secret-ref <new-ref> --kind <kind> --env prod`                                                    | New secret works through normal service path.                                                     |
| Deployment parity   | `pillarctl smoke api --env prod --mode hosted,customer-validator,self-hosted --contract-only`                                | `/v1` grammar unchanged by rotation; only ownership/config differs.                               |

### Targeted smoke tests

| Secret kind         | Smoke test                                                                              | Pass condition                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Webhook signing key | `pillarctl webhooks test --endpoint <we_...> --signing-version current`                 | Customer/dummy endpoint verifies new signature; old signature rejected after overlap; `pillar_webhook_delivery_success` stable. |
| API key pepper      | `pillarctl auth smoke --key-id <ak_...> --expect-pepper-version current`                | Existing API key authenticates once and hash upgrades; same key with changed body still respects idempotency conflict behavior. |
| JWT signing key     | `pillarctl auth jwt-smoke --aud ledger-command --kid current`                           | Valid new token accepted; old `kid`, wrong audience, expired token rejected and audited.                                        |
| mTLS cert           | `pillarctl ledger mtls-smoke --tenant <tenant> --participant <alias>`                   | TLS handshake succeeds with new cert; command health gate ready; no raw cert material in logs.                                  |
| KMS key             | `pillarctl secrets reencryption verify --key <kms-key> --env prod`                      | All mandatory secret classes re-encrypted or listed in deferred metric with owner and deadline.                                 |
| Billing API key      | `pillarctl billing billing-smoke --env prod --no-charge`                                 | Billing authentication succeeds; no mutation outside idempotent/no-charge check.                                                 |
| KYC vendor key      | `pillarctl compliance vendor-smoke --provider <provider> --fixture sanctioned-negative` | Adapter returns normalized decision; outage remains pending/requires_action, not approved.                                      |
| DAR signing key     | `pillarctl template-registry verify-dar --template <tpl_...> --version <tplv_...>`      | DAR signature, checksum, registry metadata, and activation policy verify.                                                       |

## Communicate

| Audience                           | Notify when                                                                                          | Message posture                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Security/Compliance                | Always SEV1/SEV2.                                                                                    | Evidence-preserving, exact secret kind/scope, no raw values.                           |
| Customer technical contacts        | Customer action required, customer-owned secret affected, verified exposure, or service degradation. | Direct instructions, cutoff times, safe fingerprints, impact window, next update.      |
| Customer executives/account owners | SEV1, regulated tenant, broad platform impact, or contractual requirement.                           | Business impact, containment state, report timing.                                     |
| Regulator                          | Unauthorized access/data exposure/material control failure meets jurisdictional threshold.           | Compliance-owned notice with evidence-backed facts only.                               |
| Public status page                 | Multi-customer degradation/outage or contractual status requirement.                                 | Customer-visible capability degradation; no secret details beyond safe classification. |

### Customer decision tree

| Condition                                                                       | Customer notice                                                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook signing key rotation requires endpoint update                           | Send immediate technical notice with new secret delivery channel, 24h dual-active overlap, old-secret cutoff, signature verification instructions. |
| Customer API traffic may fail due to JWT/session/key impact                     | Send login/token refresh guidance and status page if broad.                                                                                        |
| Customer-validator/self-hosted participant mTLS trust changes                   | Coordinate maintenance with customer operator; confirm trust bundle and rolling restart sequence.                                                  |
| Confirmed unauthorized use involving customer data or asset-affecting authority | Send incident notice with impact window, affected objects, current containment, and report timeline; Compliance decides regulator notice.          |
| No customer action and no customer impact                                       | Internal incident only unless contract requires advisory.                                                                                          |

### Regulator decision tree

| Question                                                                                             | If yes                                                         | If no                                         |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| Was unauthorized access confirmed?                                                                   | Compliance opens regulator notification workflow.              | Record rationale and continue investigation.  |
| Was sensitive customer data, PII, KYB evidence, balances/holdings metadata, or payment data exposed? | Prepare jurisdiction-specific disclosure and customer notice.  | Continue technical containment.               |
| Could asset-affecting operations be authorized by exposed material?                                  | Include ledger trace and operation review in regulator packet. | State no ledger mutation authority if proven. |
| Did audit completeness fail?                                                                         | Treat as material control failure until resolved.              | Attach audit verification to closure.         |

### Message templates

| Template                         | Text                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial customer security notice | `We are rotating <secret kind / safe identifier> for <scope> after identifying <confirmed/suspected> exposure at <UTC>. We have contained the affected credential path and are preserving evidence. Required action: <action>. Next update by <UTC>. Do not send secrets through support tickets or email.` |
| Webhook overlap notice           | `A new webhook signing secret is available through <secure channel>. Pillar will sign new deliveries with the new secret and accept both old and new signatures until <cutoff UTC>. After cutoff, the old secret will be rejected. Event IDs and payload schemas are unchanged.`                            |
| Recovery notice                  | `The old <secret kind / safe identifier> was revoked at <UTC>. We verified no accepted use after revocation and confirmed <smoke summary>. Continue using <new safe identifier/ref>. A post-incident report will be provided within 5 business days when required.`                                         |
| Status-page update               | `We are mitigating a credential-related issue affecting <capability/scope>. Some customers may need to update credentials or retry authentication. Ledger-backed operations remain traceable; we will provide the next update by <UTC>.`                                                                    |

## Post-incident

| Time from resolution | Deliverable                                                                                                                                | Owner                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 2 hours              | Incident timeline draft, affected secret kinds/tenants, mitigation/recovery proof, customer action list.                                   | Incident Commander                         |
| 24 hours             | Initial report with root cause hypothesis, exposure window, audit evidence, communications sent, and immediate prevention.                 | Incident Commander + Security Lead         |
| 5 business days      | Full report: root cause, contributing controls, blast-radius proof, regulator/customer final disposition, action items, owners, due dates. | Security Lead + SRE Lead + Compliance Lead |
| Next release gate    | Regression/control updates for scanner, redaction, secret provider, rotation drill, Helm ref validation, or vendor adapter behavior.       | Phase owner                                |

### Post-incident fields

| Field                      | Required content                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary                    | Customer-visible impact and duration, grouped by secret kind and tenant scope.                                                                  |
| Root cause                 | Evidence-backed leak source: repo, log, insider, phishing, vendor, process, or tooling.                                                         |
| Trigger                    | Alert/manual report/vendor notice/regulator inquiry/customer ticket.                                                                            |
| Detection gap              | Why scanners, SLO `pillar_secret_rotation_age_seconds`, audit, or vendor monitoring did or did not catch it earlier.                            |
| Mitigation                 | Rotation/revocation/re-encryption/re-signing/restart actions with timestamps.                                                                   |
| Recovery proof             | Targeted smoke tests, audit search after revocation, SLO recovery, customer confirmations.                                                      |
| Invariant impact           | Whether ledger truth, public API grammar, event identity, audit trace, deployment parity, and secret-reference-only deployment remained intact. |
| Customer/regulator actions | Notices sent or explicit rationale for no notice.                                                                                               |
| Follow-up work             | Ticket IDs, owners, due dates, verification commands.                                                                                           |

### Preventive action catalog

| Root cause           | Required preventive action                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Repo commit          | Strengthen secret scanning, pre-receive block, history purge playbook, developer training.                 |
| Log dump             | Add redaction fixture and structured logging ban for credential fields.                                    |
| Ticket/chat paste    | Secure-channel education and automated detection in support tools.                                         |
| Insider misuse       | Narrow secret read IAM, just-in-time access, dual control, audit review.                                   |
| Phishing             | Revoke sessions, require phishing-resistant MFA for secret access, reduce blast radius.                    |
| Vendor breach        | Shorten vendor key rotation window, vendor account scoping, alternate-provider readiness if policy allows. |
| Rotation path failed | Add staging drill, alert on stale secret age, and CI checks for Helm secret refs.                          |

## Related

| Type         | Reference                                                                                                                            | Relevance                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| SLO          | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_secret_rotation_age_seconds`                                                             | Rotation-age control and emergency rotation freshness.                                             |
| SLO          | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_audit_log_completeness`                                                                  | Privileged actions, rotations, and incident actions must be auditable.                             |
| SLO          | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_webhook_delivery_success`                                                                | Webhook signing rotation must not break delivery or event identity.                                |
| SLO          | [SLO_CATALOG.md](../SLO_CATALOG.md) `pillar_dar_upload_success`                                                                      | DAR signing-key rotation must preserve upload/activation integrity.                                |
| Ticket       | [P8.K06](../Phase_08_Security_Compliance.md#9-implementation-plan)                                                                   | Secret rotation runbook and hooks for API key, pepper, JWT, mTLS, vendor, webhook-secret rotation. |
| Ticket       | [P8.K11](../Phase_08_Security_Compliance.md#9-implementation-plan)                                                                   | Participant mTLS credential lifecycle.                                                             |
| Ticket       | [P8.K15](../Phase_08_Security_Compliance.md#9-implementation-plan)                                                                   | Secrets management integration and ExternalSecrets/KMS wiring.                                     |
| Ticket       | [P12.N03](../Phase_12_Template_Registry_Versioning.md#9-implementation-plan)                                                         | Template registry metadata updated after DAR signing-key rotation.                                 |
| Ticket       | [P9.J17](../Phase_09_CICD_Helm_Deployment.md#9-implementation-plan)                                                                  | Helm ExternalSecrets refs; values contain no raw secrets.                                          |
| ADR          | [ADR-0011](../DECISIONS.md#adr-0011-command_id-derivation-spec)                                                                      | Credential rotation must not change command identity or create duplicate economic commands.        |
| ADR          | [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar) | Deployment mode changes ownership/wiring, not `/v1` grammar.                                       |
| Regression   | [REGRESSION_CONTRACT §10](../REGRESSION_CONTRACT.md#10-security-contract)                                                            | Secret handling, audit, auth, and credential storage controls.                                     |
| Regression   | [REGRESSION_CONTRACT §9](../REGRESSION_CONTRACT.md#9-deployment-mode-contract)                                                       | Hosted/customer-validator/self-hosted parity during rotation.                                      |
| Architecture | [12 Security](../../Architecture/12_Security.md)                                                                                     | Credential taxonomy, least privilege, and layered controls.                                        |
| Architecture | [18 Deployment](../../Architecture/18_Deployment.md)                                                                                 | Secret references, KMS, ExternalSecrets, and deployment ownership.                                 |
| Architecture | [22 Pillar Observability](../../Architecture/22_Pillar%20Observability.md)                                                           | Audit, trace, SLO, and incident evidence surfaces.                                                 |
