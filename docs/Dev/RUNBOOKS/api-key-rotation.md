# Runbook: API key rotation

## Trigger

| Trigger type               | Examples                                                                                       | Default severity                                         | Immediate owner               | Notes                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------- | --------------------------------------------------- |
| Customer support request   | Customer asks to rotate `rk_live_*`, `sk_live_*`, service account key, or expiring credential. | SEV3                                                     | Support + SRE                 | Planned rotation. Customer controls cutover timing. |
| Scheduled rotation         | Policy-driven quarterly/semiannual rotation, expiring key, control review.                     | SEV3                                                     | SRE                           | Use normal change window and dual-active period.    |
| Suspected leak in repo/log | Raw key appears in Git, CI output, log line, ticket, chat, or paste site.                      | SEV1 if production restricted/secret key; SEV2 otherwise | Incident Commander + Security | Treat as compromise until proven otherwise.         |
| Pen-test finding           | Key exposure, weak scope, missing expiry, missing audit, unsafe Workbench display.             | SEV2/SEV3                                                | Security + SRE                | Escalate if active production key is usable.        |
| Regulatory mandate         | Key rotation required by control failure, audit finding, tenant offboarding, personnel change. | SEV3 unless compromise known                             | Compliance + SRE              | Preserve evidence and approval chain.               |

| Key family                 | Public prefix examples             | Rotation mode                             | Customer-visible? | Runbook stance                                                               |
| -------------------------- | ---------------------------------- | ----------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| Publishable key            | `pk_test_`, `pk_live_`             | Usually regenerate and update clients     | Yes               | Not a ledger mutation credential; still audit.                               |
| Restricted key             | `rk_test_`, `rk_live_`             | Dual-active then revoke                   | Yes               | Default production server credential.                                        |
| Secret key                 | `sk_test_`, `sk_live_`             | Emergency revoke when compromised         | Yes               | Production use is exceptional and high risk.                                 |
| Service account credential | `sa_` owner plus client secret/key | Dual-active or OAuth client rotation      | Sometimes         | Rotate principal-bound credential, not principal identity.                   |
| Webhook signing secret     | `whsec_`                           | Use webhook secret runbook, not this file | Yes               | Related to [webhook-dlq-drain.md](./webhook-dlq-drain.md) only for failures. |

## Severity

| Severity | Condition                                                                                                                 | Required response                                                           | Customer impact statement                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| SEV1     | Known or strongly suspected compromise of production restricted key or production secret key.                             | Start incident; revoke or scope-clamp immediately; regulator trigger check. | Unauthorized production API access may be possible. |
| SEV2     | Suspected exposure of test key, inactive key, scoped production key with no evidence of use, or security-control failure. | Security-led investigation; rotate within controlled window.                | Risk exists; no confirmed production abuse yet.     |
| SEV3     | Planned rotation, support-requested rotation, scheduled expiry, low-risk key hygiene.                                     | Normal change workflow; customer cutover window.                            | No incident unless rotation causes failed requests. |

| Escalation signal                                              | Escalate to                   | Reason                                                  |
| -------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `last_used_at` after alleged leak time                         | Incident Commander + Security | Active use may be attacker-driven.                      |
| Key has broad scopes or party entitlements                     | Security + Compliance         | Blast radius may include asset-affecting endpoints.     |
| Production `sk_live_*` appears in logs/repo                    | Incident Commander            | Secret key is near-root and should not be broadly used. |
| 5xx spike during rotation                                      | API SRE                       | Must protect `pillar_api_5xx_rate`.                     |
| Customer-validator/self-hosted local control plane unavailable | Deployment owner              | Key issuance path differs by deployment mode.           |

## On-call decision tree

| Step | Question                                                           | If yes                                                                  | If no                                                                   |
| ---- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | Is the key production and usable for asset-affecting operations?   | Treat as SEV1 when compromise is known/suspected.                       | Continue scoped investigation as SEV2/SEV3.                             |
| 2    | Is the rotation planned and customer-initiated?                    | Offer dual-active cutover window.                                       | Continue incident path.                                                 |
| 3    | Is raw key material visible in a repository, log, ticket, or chat? | Preserve evidence; remove/redact via approved channel; rotate.          | Inspect audit and key metadata.                                         |
| 4    | Can a new key be safely issued before old key revocation?          | Create replacement and enter dual-active state.                         | Scope-clamp old key or revoke immediately if compromise risk dominates. |
| 5    | Is customer traffic still using old key?                           | Keep dual-active until agreed deadline unless SEV1 requires revocation. | Revoke old key.                                                         |
| 6    | Did `pillar_api_5xx_rate` spike after rotation?                    | Roll back customer cutover instructions, inspect auth edge.             | Continue verification.                                                  |
| 7    | Did audit show revoked key use after revocation timestamp?         | Incident escalation; block credential family if needed.                 | Close after 24h zero-traffic confirmation.                              |

| Deployment mode      | Rotation authority                                                   | Key issuance path                                           | Operational branch                                                                     |
| -------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `hosted`             | Pillar control plane                                                 | Workbench/admin API backed by Pillar config DB              | SRE can issue, clamp, revoke, and monitor centrally.                                   |
| `customer-validator` | Shared: Pillar API config, customer participant                      | Pillar key config plus customer network/IP/mTLS constraints | Coordinate with customer's validator operator before revoking asset-affecting keys.    |
| `self-hosted`        | Customer local control plane unless managed support agreement exists | Local admin API or Helm/config bundle                       | Provide procedure; customer executes. Confirm config bundle sequence and audit export. |

## Pre-checks

| Check                     | Command/source                                                | Required answer                                        | Stop condition                                         |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Identify affected key IDs | Workbench key object, admin API, audit search by prefix/last4 | `ak_*` IDs and public prefixes known                   | Do not rotate by raw secret string in chat/ticket.     |
| Determine environment     | Key metadata `livemode`, tenant, account, environment         | `test`, `sandbox`, or `live`                           | Production live changes need incident/change record.   |
| Identify key type         | `type`, prefix, scope set                                     | restricted, secret, publishable, OAuth/service account | Wrong runbook if webhook secret.                       |
| Determine current status  | key config row and auth cache                                 | active, rotating, revoked, expired                     | Do not reactivate revoked compromised key.             |
| Capture `last_used_at`    | auth audit / metrics                                          | timestamp, source IP, endpoint family                  | If after compromise timestamp, escalate.               |
| Capture current rate      | per-key auth counter, request logs                            | baseline request rate by endpoint                      | Needed to detect cutover completion.                   |
| Identify scopes           | key scope set and constraints                                 | endpoints and object constraints                       | Broad scopes require tighter emergency response.       |
| Identify tenants          | tenant/account/environment mapping                            | tenant list                                            | Multi-tenant blast radius requires Incident Commander. |
| Check auth cache TTL      | deployment config                                             | maximum delay before revocation effective              | Emergency revocation must purge cache.                 |
| Check audit availability  | audit pipeline health                                         | audit writes healthy                                   | If audit down, pause planned rotation.                 |

| Data to record                    | Why                                                    |
| --------------------------------- | ------------------------------------------------------ |
| `key_id` (`ak_*`)                 | Stable object identity; raw secret must not be copied. |
| `rotated_from` / `rotated_to`     | Connect old and new credentials.                       |
| `rotation_grace_until`            | Defines dual-active end.                               |
| `revoked_at`                      | Verification boundary for audit search.                |
| `last_used_at` and `last_used_ip` | Compromise triage.                                     |
| Scope list and party entitlements | Blast-radius analysis.                                 |
| Customer ticket / incident ID     | Communication and evidence chain.                      |

## Diagnose

| Diagnostic question                    | Evidence                                                      | Interpretation                                | Action                                             |
| -------------------------------------- | ------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| Which endpoints accepted the key?      | Auth audit grouped by route and status                        | Determines API blast radius                   | Notify endpoint-owning teams for high-risk routes. |
| Which tenants/accounts were reachable? | Key tenant bindings, org hierarchy                            | Tenant blast radius                           | Split customer comms by tenant if needed.          |
| Was the key used from expected IPs?    | `last_used_ip`, IP allowlist, geolocation only as weak signal | Unexpected IP increases compromise confidence | Escalate and consider immediate revocation.        |
| Did use include mutations?             | Audit route/method, idempotency records                       | Mutations require ledger trace review         | Follow operation trace for `op_*`.                 |
| Did use include sensitive reads?       | API logs and object scopes                                    | Possible data exposure                        | Compliance trigger check.                          |
| Did failures increase?                 | `pillar_api_5xx_rate`, auth 401/403, customer 4xx             | Cutover may be breaking integration           | Adjust customer window if planned.                 |

| Blast-radius dimension | Low           | Medium                              | High                               |
| ---------------------- | ------------- | ----------------------------------- | ---------------------------------- |
| Environment            | test/sandbox  | live read-only                      | live mutation-capable              |
| Key type               | publishable   | restricted narrow                   | secret or broad restricted         |
| Scope                  | single route  | several read routes                 | mutation + party act entitlement   |
| Tenancy                | single tenant | multiple environments same customer | multiple customers or platform key |
| Usage after leak       | none          | failed auth only                    | successful calls after leak        |

## Mitigate

| Step | Planned rotation                                      | Emergency rotation                                                                |
| ---- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1    | Open change/customer ticket and agree cutover window. | Open incident and preserve evidence.                                              |
| 2    | Issue replacement key with same or narrower scopes.   | Issue replacement only if customer needs continuity; otherwise revoke first.      |
| 3    | Set dual-active period where both keys are valid.     | Keep dual-active as short as possible; skip if known attacker use.                |
| 4    | Ask customer to deploy new key and confirm health.    | Provide secure channel instructions; do not transmit raw key in ticket.           |
| 5    | Monitor old-key traffic to zero.                      | Purge auth cache and monitor for old-key attempts.                                |
| 6    | Revoke old key at deadline.                           | Revoke/disable compromised key immediately or after controlled emergency cutover. |
| 7    | Confirm audit and metrics.                            | Run regulator/customer notice trigger check.                                      |

| Control            | Planned default                                                  | Emergency default                                                       | Notes                                                        |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Dual-active period | 24h-7d by customer risk profile                                  | 0-2h; shorter for broad production keys                                 | Both keys valid only during explicit `rotation_grace_until`. |
| Scope changes      | Same scopes unless customer requests least-privilege improvement | Narrow scopes where possible                                            | Do not widen scope during rotation.                          |
| Rate limit         | Same bucket unless key-specific limits need migration            | Lower suspicious-key limits before revoke if immediate revoke is unsafe | Avoid creating 429 storm.                                    |
| Auth cache purge   | Normal propagation                                               | Immediate purge                                                         | Required for SEV1.                                           |
| Old key status     | `rotating` then `revoked`                                        | `revoked` or `disabled_compromised`                                     | Status must be audit-visible.                                |
| Customer comms     | Scheduled notice                                                 | Incident notice                                                         | Use templates below.                                         |

| Deployment mode      | Mitigation detail                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hosted`             | Rotate through central config; verify all API edge pods observe new key state; purge distributed auth cache on emergency path.                          |
| `customer-validator` | Coordinate with customer validator/network operator because IP allowlists, mTLS bindings, and participant-related entitlements may be locally enforced. |
| `self-hosted`        | Customer applies local config/secret update; SRE reviews exported audit/config sequence when available; do not assume Pillar can purge local cache.     |

## Recover

| Recovery step                      | Required evidence                                                        | Owner              |
| ---------------------------------- | ------------------------------------------------------------------------ | ------------------ |
| Customer confirms new key deployed | Successful authenticated requests with new `ak_*` and expected endpoints | Support/SRE        |
| Old-key traffic reaches zero       | Per-key request rate equals 0 for agreed observation interval            | SRE                |
| Old key revoked                    | Key status `revoked`, `revoked_at` set, raw secret unrecoverable         | SRE/Security       |
| Auth caches converged              | Edge cache generation includes revocation                                | SRE                |
| No business errors introduced      | `pillar_api_5xx_rate` does not spike; auth failures explained            | API SRE            |
| 24h zero traffic on revoked key    | No accepted audit entries with old key after revocation timestamp        | SRE                |
| Evidence retained                  | Incident/change record includes key IDs, timestamps, comms               | Incident Commander |

| Recovery guardrail  | Rule                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Raw secret handling | Never paste full key into tickets, logs, docs, or customer-visible comments.                                          |
| Audit continuity    | Do not delete audit rows for leaked-key requests; redact raw secret only.                                             |
| Ledger trace        | For mutation-capable compromise, inspect affected `op_*` traces; do not modify ledger history.                        |
| API availability    | Rotation must not cause platform 5xx; customer 401 from missed cutover is not a platform 5xx but still needs support. |

## Verify

| Verification             | Query/check                                                                                     | Pass condition                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Revoked key blocked      | Auth request using old key in controlled safe environment or auth audit after customer attempts | 401/403; no route handler side effect.                                                      |
| Audit after revocation   | Search `audit_log` for `key_id = old_ak` and `timestamp > revoked_at`                           | No successful authenticated entries. Failed auth attempts may exist and must be classified. |
| New key works            | Customer route smoke or support-observed traffic                                                | Expected 2xx/4xx business responses; no 5xx spike.                                          |
| Old-key traffic 24h zero | Metrics grouped by key ID                                                                       | Accepted request rate remains 0 for 24h after revocation.                                   |
| SLO unaffected           | `pillar_api_5xx_rate`                                                                           | No rotation-correlated spike.                                                               |
| Scope parity/narrowing   | Compare old vs new scopes                                                                       | New key has same or narrower authorized surface unless change approved.                     |
| Regulator trigger        | Compliance checklist                                                                            | Required notices opened or explicitly ruled out.                                            |

| Audit query intent                  | Expected filter                                                        |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Accepted old-key calls after revoke | `key_id = old_ak AND authenticated = true AND timestamp > revoked_at`  |
| Failed attempts after revoke        | `key_id = old_ak AND authenticated = false AND timestamp > revoked_at` |
| New-key cutover                     | `key_id = new_ak AND timestamp BETWEEN issued_at AND now`              |
| Endpoint blast radius               | `key_id = old_ak GROUP BY method,path,status`                          |

## Communicate

| Audience                   | Planned rotation                                         | Emergency rotation                                      |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Customer technical contact | Send cutover instructions, deadline, rollback-free note. | Send immediate security notice with actions required.   |
| Customer account owner     | Inform of timing and support owner.                      | Include impact summary and next update cadence.         |
| Internal support           | Provide key IDs, not raw keys.                           | Provide customer-safe talking points.                   |
| Security/compliance        | Usually FYI for scheduled control evidence.              | Required for compromise and regulator trigger check.    |
| Public status page         | Not needed unless platform impact.                       | Use if many customers or service availability affected. |

| Customer notice template | Text                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planned                  | `We are rotating your Pillar API key <key_id/last4> for <reason>. A replacement key is available through the approved secure channel. Both old and new keys will remain valid until <rotation_grace_until>. Please deploy the new key before that time. No API behavior or object model changes are expected.`                                  |
| Emergency                | `We are rotating your Pillar API key <key_id/last4> because <reason>. Treat the previous key as compromised. Deploy the replacement key immediately through the approved secure channel. Pillar will revoke the previous key at <revocation_time>. We are reviewing audit logs for unauthorized use and will provide confirmed impact details.` |
| Completion               | `The previous key <key_id/last4> was revoked at <revoked_at>. We have observed no accepted traffic using the revoked key since revocation. Continue using the replacement key <new_key_id/last4>.`                                                                                                                                              |

| Regulator notice trigger check               | Required question                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Unauthorized access confirmed?               | Did audit show successful use by untrusted source after exposure?                         |
| Sensitive data exposed?                      | Did routes include customer data, balances, holdings, reports, evidence, or PII metadata? |
| Asset-affecting action possible or observed? | Did the key have mutation scopes and party act entitlement?                               |
| Jurisdictional rule applies?                 | Does tenant regulatory profile require notice on credential compromise alone?             |

## Post-incident

| Item                | Planned rotation                                                 | Emergency rotation                                                  |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Timeline            | Record request, issue, cutover, revoke, verify times.            | Full incident timeline with leak discovery and containment.         |
| Evidence            | Change ticket and audit snapshots.                               | Preserve repository/log/ticket evidence with redaction.             |
| Control improvement | Consider shorter expiry or narrower scopes.                      | Add detection, prevent raw secret logging, tighten scopes.          |
| Customer follow-up  | Confirm rotation complete.                                       | Provide impact report and any required attestations.                |
| Regression update   | File ticket if auth, audit, or cache behavior violated contract. | File ticket and block release if `P8.K01`/`P8.K06` controls failed. |

| Common root cause            | Preventive action                                               |
| ---------------------------- | --------------------------------------------------------------- |
| Key committed to repo        | Secret scanning gate; revoke on detection; developer education. |
| Raw key logged               | Redaction library test; logging sink scrub; regression fixture. |
| Overbroad restricted key     | Scope review and least-privilege template.                      |
| Customer no rotation process | Onboarding checklist and scheduled rotation reminder.           |
| Cache delayed revocation     | Auth cache invalidation test and emergency purge path.          |

## Related

| Type         | Reference                                                                                                                            | Relevance                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Ticket       | [P8.K01](../Phase_08_Security_Compliance.md)                                                                                         | API key object, hashed storage, restricted key controls.                                         |
| Ticket       | [P8.K06](../Phase_08_Security_Compliance.md)                                                                                         | Secret rotation and transport/security hardening controls.                                       |
| ADR          | [ADR-0011](../DECISIONS.md#adr-0011-command_id-derivation-spec)                                                                      | Not applicable to API key rotation; command identity must not change due to credential rotation. |
| ADR          | [ADR-0010](../DECISIONS.md#adr-0010-deployment-mode-independence-hosted--customer-validator--self-hosted-share-identical-v1-grammar) | Deployment mode changes operational ownership, not API grammar.                                  |
| Regression   | [REGRESSION_CONTRACT §10](../REGRESSION_CONTRACT.md#10-security-contract)                                                            | API key secrets hashed only; audit and auth controls.                                            |
| Regression   | [REGRESSION_CONTRACT §9](../REGRESSION_CONTRACT.md#9-deployment-mode-contract)                                                       | Rotation must not fork `/v1` behavior by deployment mode.                                        |
| SLO          | `pillar_api_5xx_rate`                                                                                                                | Must not spike during planned or emergency rotation.                                             |
| Architecture | [12 Security](../../Architecture/12_Security.md)                                                                                     | Credential taxonomy and layered authorization.                                                   |
| Architecture | [18 Deployment](../../Architecture/18_Deployment.md)                                                                                 | Hosted/customer-validator/self-hosted operational branches.                                      |
| Architecture | [22 Observability](../../Architecture/22_Pillar%20Observability.md)                                                                  | Audit, trace, and SRE control surfaces.                                                          |
