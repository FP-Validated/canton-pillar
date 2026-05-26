# Pillar CLI Reference

`pillar` is the user-facing CLI contract for Pillar's polished `/v1` API. It complements [Phase 07](./Phase_07_SDK_CLI_Workbench.md), keeps Canton internals out of normal UX, and follows release/signing guarantees from [Phase 09](./Phase_09_CICD_Helm_Deployment.md).

## 1. Installation

| Channel  | Command                                                                                   | Contract                                           |
| -------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------- |
| npm      | `npm install -g @pillar/cli`                                                              | Default developer install; Node LTS required.      |
| Homebrew | `brew install pillarhq/tap/pillar`                                                        | macOS/Linux signed bottle.                         |
| Scoop    | `scoop bucket add pillar https://github.com/pillarhq/scoop && scoop install pillar`       | Windows signed shim.                               |
| Docker   | `docker run --rm -it -v $PWD/.pillar:/pillar/config pillarhq/pillar-cli:<version> --help` | CI/container use; mount config and inject secrets. |

Verify provenance after install:

```bash
pillar version --verify-signature
pillar doctor --network
```

## 2. Global flags

| Flag            | Value                                   | Default                       | Description                                                    |
| --------------- | --------------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| `--profile`     | name                                    | `PILLAR_PROFILE` or `default` | Select config profile and credential alias.                    |
| `--api-version` | date/alias                              | profile default               | Sends `Pillar-Version`; rejected if incompatible.              |
| `--output`      | `json`, `table`, `yaml`, `exec=program` | `json`                        | Controls stdout renderer.                                      |
| `--color`       | `auto`, `always`, `never`               | `auto`                        | Human output and stderr diagnostics only.                      |
| `--debug`       | boolean                                 | false                         | Prints request IDs, retries, timing, config sources to stderr. |
| `--quiet`       | boolean                                 | false                         | Suppresses progress; errors still print to stderr.             |
| `--help`        | boolean                                 | false                         | Prints help and exits `0`.                                     |
| `--version`     | boolean                                 | false                         | Prints version and exits `0`.                                  |

Rules: stdout is machine output; stderr is diagnostics. Debug output redacts access tokens, webhook secrets, private keys, keychain values, and one-time secrets after initial display. Mutating API commands accept `--idempotency-key` when supported by `/v1`.

## 3. Environment variables

| Variable              | Purpose                                    | Precedence / safety                                              |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `PILLAR_API_KEY`      | Bearer API key for CI/non-interactive use. | Overrides keychain credential for selected profile; redacted.    |
| `PILLAR_BASE_URL`     | API base URL.                              | Overrides profile URL; HTTPS required outside localhost sandbox. |
| `PILLAR_PROFILE`      | Default profile name.                      | Lower precedence than `--profile`.                               |
| `PILLAR_CONFIG_DIR`   | Config directory.                          | Overrides OS default in §4.                                      |
| `PILLAR_API_VERSION`  | Default `Pillar-Version`.                  | Lower precedence than profile and flag.                          |
| `PILLAR_OUTPUT`       | Default renderer.                          | Lower precedence than `--output`.                                |
| `PILLAR_TIMEOUT_MS`   | HTTP timeout.                              | Default `30000`.                                                 |
| `PILLAR_RETRY_MAX`    | Safe retry count.                          | Default `2`; ignored for unsafe calls without idempotency.       |
| `PILLAR_NO_TELEMETRY` | Disable opt-in telemetry.                  | Any non-empty value disables.                                    |
| `NO_COLOR`            | Disable ANSI color.                        | Equivalent to `--color never`.                                   |
| `CI`                  | Non-interactive hint.                      | Login uses device-code/API-key paths only.                       |

## 4. Configuration profiles

| OS        | Config file                                                      |
| --------- | ---------------------------------------------------------------- |
| macOS     | `~/Library/Application Support/pillar/config.yaml`               |
| Linux     | `${XDG_CONFIG_HOME:-~/.config}/pillar/config.yaml`               |
| Windows   | `%AppData%\Pillar\config.yaml`                                   |
| Docker/CI | `/pillar/config/config.yaml` or `$PILLAR_CONFIG_DIR/config.yaml` |

Config stores metadata only; credentials live in OS keychain or `PILLAR_API_KEY`.

```yaml
current_profile: default
profiles:
  default:
    base_url: https://api.pillar.example/v1
    api_version: 2026-05-26
    mode: live
    output: json
  sandbox:
    base_url: http://127.0.0.1:8080/v1
    api_version: 2026-05-26
    mode: sandbox
    output: table
```

`mode` is `sandbox` or `live`; production deployment modes remain `hosted`, `customer-validator`, and `self-hosted` per [Phase 09](./Phase_09_CICD_Helm_Deployment.md). Sandbox profiles may use localhost HTTP. Live profiles must use HTTPS. `profiles use` changes only `current_profile`; `profiles delete --delete-credential` also asks keychain to remove `pillar:<profile>:api-token`.

## 5. Authentication

`pillar login` performs browser or device-code login and stores credentials in macOS Keychain, Windows Credential Manager, or Linux Secret Service/libsecret. CI should use `PILLAR_API_KEY` or a key created by `pillar keys create` and injected by a secret manager.

Key rotation flow:

1. create or rotate with `pillar keys create` / `pillar keys rotate`;
2. deploy replacement to dependent systems;
3. verify with `pillar whoami --profile <name>`;
4. revoke old key with `pillar keys revoke`.

Profiles are isolated. `pillar logout --profile live` cannot remove `sandbox` credentials unless `--all` is used.

## 6. Command reference

Legend: every command accepts global flags. `EC` lists expected non-zero exits in addition to `0` success. Meanings are defined in §8.

| Command                                   | Synopsis                                                                                    | Description                                                    | Example                                                                                               | EC                                                                                  | Related                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------- |
| `pillar login`                            | `pillar login [--profile <name>] [--base-url <url>] [--device-code]`                        | Authenticate and store credential in keychain.                 | `pillar login --profile live --base-url https://api.pillar.example/v1`                                | `2,3,7,10`                                                                          | `whoami`, `profiles create`                                                                              |
| `pillar logout`                           | `pillar logout [--profile <name>] [--all]`                                                  | Remove stored credential; config remains.                      | `pillar logout --profile live`                                                                        | `2,3,4,10`                                                                          | `login`, `profiles delete`                                                                               |
| `pillar whoami`                           | `pillar whoami [--scopes]`                                                                  | Show principal, tenant, profile, scopes.                       | `pillar whoami --scopes --output table`                                                               | `3,7,8`                                                                             | `login`, `profiles list`                                                                                 |
| `pillar profiles list`                    | `pillar profiles list [--show-path]`                                                        | List configured profiles.                                      | `pillar profiles list --show-path --output yaml`                                                      | `1,10`                                                                              | `profiles use`, `config show`                                                                            |
| `pillar profiles use`                     | `pillar profiles use <name>`                                                                | Set default profile.                                           | `pillar profiles use sandbox`                                                                         | `2,4,10`                                                                            | `profiles list`                                                                                          |
| `pillar profiles create`                  | `pillar profiles create <name> --base-url <url> [--mode sandbox                             | live]`                                                         | Create/update profile metadata.                                                                       | `pillar profiles create sandbox --base-url http://127.0.0.1:8080/v1 --mode sandbox` | `2,5,10`                                                                                                 | `login`, `profiles use`  |
| `pillar profiles delete`                  | `pillar profiles delete <name> [--delete-credential] [--force]`                             | Delete profile metadata and optional credential.               | `pillar profiles delete old-sandbox --delete-credential`                                              | `2,4,10`                                                                            | `logout`, `profiles list`                                                                                |
| `pillar sandbox up`                       | `pillar sandbox up [--detach] [--reset] [--profile sandbox]`                                | Start local compose sandbox and profile.                       | `pillar sandbox up --detach`                                                                          | `2,7,9,10`                                                                          | `sandbox status`, `doctor`                                                                               |
| `pillar sandbox down`                     | `pillar sandbox down [--volumes]`                                                           | Stop sandbox containers.                                       | `pillar sandbox down --volumes`                                                                       | `2,9,10`                                                                            | `sandbox up`, `sandbox reset`                                                                            |
| `pillar sandbox reset`                    | `pillar sandbox reset [--yes] [--seed <name>]`                                              | Recreate local sandbox state and sample data.                  | `pillar sandbox reset --yes --seed transfer-demo`                                                     | `2,9,10`                                                                            | `sandbox up`, `events list`                                                                              |
| `pillar sandbox status`                   | `pillar sandbox status [--watch]`                                                           | Show API, worker, projection, webhook, participant readiness.  | `pillar sandbox status --watch --output table`                                                        | `1,7,9,10`                                                                          | `doctor`, `sandbox logs`                                                                                 |
| `pillar sandbox logs`                     | `pillar sandbox logs [service] [--follow] [--since <duration>]`                             | Stream redacted sandbox logs.                                  | `pillar sandbox logs api --follow`                                                                    | `2,9,10`                                                                            | `sandbox status`                                                                                         |
| `pillar accounts create`                  | `pillar accounts create --name <name> [--metadata k=v]`                                     | Create account object.                                         | `pillar accounts create --name "Acme Treasury" --metadata region=us`                                  | `2,3,5,6,8`                                                                         | `accounts get`, `balances get`                                                                           |
| `pillar accounts list`                    | `pillar accounts list [--limit <n>] [--starting-after <id>]`                                | List accounts.                                                 | `pillar accounts list --limit 25 --output table`                                                      | `2,3,6,8`                                                                           | `accounts get`, `holdings list`                                                                          |
| `pillar accounts get`                     | `pillar accounts get <account_id>`                                                          | Retrieve account by public ID.                                 | `pillar accounts get acct_123 --output json`                                                          | `2,3,4,8`                                                                           | `accounts update`                                                                                        |
| `pillar accounts update`                  | `pillar accounts update <account_id> [--name <name>] [--metadata k=v]`                      | Update account metadata; not balances.                         | `pillar accounts update acct_123 --metadata cost_center=treasury`                                     | `2,3,4,5,8`                                                                         | `accounts get`, `events list`                                                                            |
| `pillar assets create`                    | `pillar assets create --symbol <symbol> --name <name> --precision <n>`                      | Create asset configuration.                                    | `pillar assets create --symbol USDX --name "USD Example" --precision 2`                               | `2,3,5,6,8`                                                                         | `intents issue`                                                                                          |
| `pillar assets list`                      | `pillar assets list [--status active                                                        | suspended] [--limit <n>]`                                      | List asset configurations.                                                                            | `pillar assets list --status active --output table`                                 | `2,3,6,8`                                                                                                | `assets get`             |
| `pillar assets get`                       | `pillar assets get <asset_id>`                                                              | Retrieve asset configuration.                                  | `pillar assets get asset_123`                                                                         | `2,3,4,8`                                                                           | `assets update`                                                                                          |
| `pillar assets update`                    | `pillar assets update <asset_id> [--name <name>] [--metadata k=v]`                          | Update non-economic asset metadata.                            | `pillar assets update asset_123 --metadata issuer=acme`                                               | `2,3,4,5,8`                                                                         | `assets get`                                                                                             |
| `pillar assets suspend`                   | `pillar assets suspend <asset_id> --reason <reason>`                                        | Suspend new operations for an asset.                           | `pillar assets suspend asset_123 --reason compliance_review`                                          | `2,3,4,5,8`                                                                         | `assets reactivate`                                                                                      |
| `pillar assets reactivate`                | `pillar assets reactivate <asset_id>`                                                       | Reactivate a suspended asset.                                  | `pillar assets reactivate asset_123 --idempotency-key reactivate-asset-123`                           | `2,3,4,5,8`                                                                         | `assets suspend`                                                                                         |
| `pillar balances get`                     | `pillar balances get --account <account_id> [--asset <asset_id>]`                           | Read ledger-derived balance projections.                       | `pillar balances get --account acct_123 --asset asset_123 --output table`                             | `2,3,4,7,8`                                                                         | `holdings list`, `traces get`                                                                            |
| `pillar holdings list`                    | `pillar holdings list --account <account_id> [--asset <asset_id>]`                          | List ledger-derived holdings.                                  | `pillar holdings list --account acct_123 --output table`                                              | `2,3,4,7,8`                                                                         | `holdings get`                                                                                           |
| `pillar holdings get`                     | `pillar holdings get <holding_id>`                                                          | Retrieve holding projection.                                   | `pillar holdings get hld_123 --include-events`                                                        | `2,3,4,7,8`                                                                         | `balances get`                                                                                           |
| `pillar intents transfer`                 | `pillar intents transfer --from <acct> --to <acct> --asset <asset> --amount <decimal>`      | Create transfer intent and operation.                          | `pillar intents transfer --from acct_src --to acct_dst --asset asset_usdx --amount 100.00`            | `2,3,4,5,6,8`                                                                       | `intents get`, `operations get`                                                                          |
| `pillar intents issue`                    | `pillar intents issue --to <acct> --asset <asset> --amount <decimal>`                       | Create issuance intent.                                        | `pillar intents issue --to acct_issuer --asset asset_usdx --amount 1000.00 --wait`                    | `2,3,4,5,6,8`                                                                       | `assets create`                                                                                          |
| `pillar intents redeem`                   | `pillar intents redeem --from <acct> --asset <asset> --amount <decimal>`                    | Create redemption intent.                                      | `pillar intents redeem --from acct_123 --asset asset_usdx --amount 25.00`                             | `2,3,4,5,6,8`                                                                       | `balances get`                                                                                           |
| `pillar intents get`                      | `pillar intents get <intent_id>`                                                            | Retrieve intent state and links.                               | `pillar intents get int_123 --expand operation,events`                                                | `2,3,4,8`                                                                           | `operations get`                                                                                         |
| `pillar intents list`                     | `pillar intents list [--account <acct>] [--status <status>]`                                | List intents via projection/search.                            | `pillar intents list --account acct_123 --status completed --output table`                            | `2,3,6,7,8`                                                                         | `events list`                                                                                            |
| `pillar holds create`                     | `pillar holds create --account <acct> --asset <asset> --amount <decimal> --reason <reason>` | Create balance hold intent.                                    | `pillar holds create --account acct_123 --asset asset_usdx --amount 10.00 --reason settlement`        | `2,3,4,5,8`                                                                         | `holds release`                                                                                          |
| `pillar holds release`                    | `pillar holds release <hold_id> [--reason <reason>]`                                        | Release active hold through operation path.                    | `pillar holds release hold_123 --reason order_cancelled --wait`                                       | `2,3,4,5,8`                                                                         | `holds get`                                                                                              |
| `pillar holds list`                       | `pillar holds list [--account <acct>] [--status active                                      | released]`                                                     | List holds.                                                                                           | `pillar holds list --account acct_123 --status active`                              | `2,3,6,8`                                                                                                | `holds get`              |
| `pillar holds get`                        | `pillar holds get <hold_id>`                                                                | Retrieve hold projection and operation links.                  | `pillar holds get hold_123 --expand operation`                                                        | `2,3,4,8`                                                                           | `traces get`                                                                                             |
| `pillar operations get`                   | `pillar operations get <operation_id>`                                                      | Retrieve operation status/result/error/trace links.            | `pillar operations get op_123 --trace`                                                                | `2,3,4,8`                                                                           | `traces get`                                                                                             |
| `pillar operations list`                  | `pillar operations list [--status <status>] [--type <type>]`                                | List operations across workflows.                              | `pillar operations list --status failed --output table`                                               | `2,3,6,7,8`                                                                         | `events list`                                                                                            |
| `pillar events list`                      | `pillar events list [--type <event_type>] [--after <event_id>] [--follow]`                  | List ledger-derived events.                                    | `pillar events list --type intent.completed --limit 10`                                               | `2,3,6,7,8`                                                                         | `webhooks listen`                                                                                        |
| `pillar events get`                       | `pillar events get <event_id>`                                                              | Retrieve event payload and related public IDs.                 | `pillar events get evt_123 --payload`                                                                 | `2,3,4,8`                                                                           | `events replay`                                                                                          |
| `pillar events replay`                    | `pillar events replay <event_id> [--endpoint <endpoint_id>]`                                | Replay existing event preserving event identity.               | `pillar events replay evt_123 --endpoint we_123 --reason support_request`                             | `2,3,4,5,8`                                                                         | `webhooks endpoints list`                                                                                |
| `pillar webhooks endpoints create`        | `pillar webhooks endpoints create --url <url> [--events <csv>]`                             | Create endpoint; print signing secret once.                    | `pillar webhooks endpoints create --url https://example.com/pillar/webhook --events intent.completed` | `2,3,5,6,8`                                                                         | `webhooks test`                                                                                          |
| `pillar webhooks endpoints list`          | `pillar webhooks endpoints list [--status enabled                                           | disabled]`                                                     | List webhook endpoints.                                                                               | `pillar webhooks endpoints list --output table`                                     | `2,3,6,8`                                                                                                | `webhooks endpoints get` |
| `pillar webhooks endpoints get`           | `pillar webhooks endpoints get <endpoint_id>`                                               | Retrieve endpoint config; secrets redacted.                    | `pillar webhooks endpoints get we_123 --delivery-stats`                                               | `2,3,4,8`                                                                           | `webhooks test`                                                                                          |
| `pillar webhooks endpoints update`        | `pillar webhooks endpoints update <endpoint_id> [--url <url>] [--events <csv>]`             | Update endpoint URL/events/description.                        | `pillar webhooks endpoints update we_123 --events intent.completed,holding.updated`                   | `2,3,4,5,8`                                                                         | `webhooks endpoints disable`                                                                             |
| `pillar webhooks endpoints disable`       | `pillar webhooks endpoints disable <endpoint_id> [--reason <reason>]`                       | Disable delivery without deleting audit history.               | `pillar webhooks endpoints disable we_123 --reason endpoint_decommissioned`                           | `2,3,4,5,8`                                                                         | `events replay`                                                                                          |
| `pillar webhooks endpoints rotate_secret` | `pillar webhooks endpoints rotate_secret <endpoint_id> [--overlap <duration>]`              | Rotate signing secret with overlap.                            | `pillar webhooks endpoints rotate_secret we_123 --overlap 24h`                                        | `2,3,4,5,8`                                                                         | `keys rotate`                                                                                            |
| `pillar webhooks listen`                  | `pillar webhooks listen --forward-to <url> [--events <csv>]`                                | Forward signed events to local endpoint.                       | `pillar webhooks listen --forward-to http://localhost:4242/webhook --print-secret`                    | `2,3,7,8,9`                                                                         | `events list`                                                                                            |
| `pillar webhooks trigger`                 | `pillar webhooks trigger <event_type> [--endpoint <url                                      | endpoint_id>]`                                                 | Generate synthetic test event.                                                                        | `pillar webhooks trigger intent.completed --endpoint http://localhost:4242/webhook` | `2,3,4,7,8`                                                                                              | `webhooks listen`        |
| `pillar webhooks test`                    | `pillar webhooks test <endpoint_id> [--event-type <type>]`                                  | Send managed signed test delivery.                             | `pillar webhooks test we_123 --event-type intent.completed`                                           | `2,3,4,7,8`                                                                         | `webhooks endpoints get`                                                                                 |
| `pillar keys create`                      | `pillar keys create --name <name> [--scopes <csv>] [--expires-at <ts>]`                     | Create API key; secret printed once.                           | `pillar keys create --name ci-deploy --scopes accounts:read,intents:write`                            | `2,3,5,8`                                                                           | `keys revoke`                                                                                            |
| `pillar keys list`                        | `pillar keys list [--include-revoked]`                                                      | List API key metadata; no secrets.                             | `pillar keys list --output table`                                                                     | `2,3,6,8`                                                                           | `keys rotate`                                                                                            |
| `pillar keys revoke`                      | `pillar keys revoke <key_id> --reason <reason>`                                             | Revoke API key with audit evidence.                            | `pillar keys revoke key_123 --reason employee_departure`                                              | `2,3,4,5,8`                                                                         | `whoami`                                                                                                 |
| `pillar keys rotate`                      | `pillar keys rotate <key_id> [--overlap <duration>]`                                        | Create replacement key and schedule old-key revocation.        | `pillar keys rotate key_123 --overlap 48h`                                                            | `2,3,4,5,8`                                                                         | `keys revoke`                                                                                            |
| `pillar files upload`                     | `pillar files upload <path> --purpose <purpose>`                                            | Upload evidence/input file; storage metadata only.             | `pillar files upload ./evidence.pdf --purpose compliance_evidence`                                    | `2,3,5,7,8`                                                                         | `files get`                                                                                              |
| `pillar files get`                        | `pillar files get <file_id> [--download <path>]`                                            | Retrieve file metadata or content.                             | `pillar files get file_123 --download ./file_123.pdf --verify-checksum`                               | `2,3,4,7,8`                                                                         | `files list`                                                                                             |
| `pillar files list`                       | `pillar files list [--purpose <purpose>] [--limit <n>]`                                     | List file metadata.                                            | `pillar files list --purpose compliance_evidence --output table`                                      | `2,3,6,8`                                                                           | `exports list`                                                                                           |
| `pillar files delete`                     | `pillar files delete <file_id> [--reason <reason>]`                                         | Delete allowed content; retain audit metadata.                 | `pillar files delete file_123 --reason retention_expired`                                             | `2,3,4,5,8`                                                                         | `operations get`                                                                                         |
| `pillar exports create`                   | `pillar exports create --type <type> --format csv                                           | jsonl                                                          | parquet [--filter <json>]`                                                                            | Create asynchronous export job.                                                     | `pillar exports create --type events --format jsonl --filter '{"created_after":"2026-05-01T00:00:00Z"}'` | `2,3,5,6,8`              | `exports get`       |
| `pillar exports get`                      | `pillar exports get <export_id> [--download <path>]`                                        | Retrieve export status/download.                               | `pillar exports get exp_123 --download ./events.jsonl`                                                | `2,3,4,7,8`                                                                         | `exports cancel`                                                                                         |
| `pillar exports list`                     | `pillar exports list [--type <type>] [--status <status>]`                                   | List export jobs.                                              | `pillar exports list --status running --output table`                                                 | `2,3,6,8`                                                                           | `exports get`                                                                                            |
| `pillar exports cancel`                   | `pillar exports cancel <export_id> [--reason <reason>]`                                     | Cancel queued/running export job.                              | `pillar exports cancel exp_123 --reason requested_by_customer`                                        | `2,3,4,5,8`                                                                         | `operations get`                                                                                         |
| `pillar usage get`                        | `pillar usage get [--period <YYYY-MM>] [--meter <name>]`                                    | Retrieve metered usage rollups.                                | `pillar usage get --period 2026-05 --output table`                                                    | `2,3,4,8`                                                                           | `invoices list`                                                                                          |
| `pillar invoices list`                    | `pillar invoices list [--status open                                                        | paid                                                           | void] [--period <YYYY-MM>]`                                                                           | List invoices.                                                                      | `pillar invoices list --period 2026-05 --output table`                                                   | `2,3,6,8`                | `invoices get`      |
| `pillar invoices get`                     | `pillar invoices get <invoice_id> [--download <path>]`                                      | Retrieve invoice metadata and file links.                      | `pillar invoices get inv_123 --download ./invoice.pdf`                                                | `2,3,4,7,8`                                                                         | `usage get`                                                                                              |
| `pillar onboarding start`                 | `pillar onboarding start [--mode hosted                                                     | customer-validator                                             | self-hosted]`                                                                                         | Start guided onboarding.                                                            | `pillar onboarding start --mode customer-validator --company Acme`                                       | `2,3,5,8`                | `onboarding status` |
| `pillar onboarding status`                | `pillar onboarding status <session_id>`                                                     | Show onboarding checklist and blockers.                        | `pillar onboarding status onb_123 --verbose`                                                          | `2,3,4,8`                                                                           | `doctor`                                                                                                 |
| `pillar onboarding complete`              | `pillar onboarding complete <session_id> --evidence <file_id>`                              | Complete onboarding after checks.                              | `pillar onboarding complete onb_123 --evidence file_123`                                              | `2,3,4,5,8`                                                                         | `files upload`                                                                                           |
| `pillar traces get`                       | `pillar traces get <id> [--format timeline                                                  | graph                                                          | json]`                                                                                                | Resolve public ID into request-to-ledger timeline.                                  | `pillar traces get op_123 --format timeline --output table`                                              | `2,3,4,7,8`              | `operations get`    |
| `pillar admin template_registry list`     | `pillar admin template_registry list [--status <status>]`                                   | Admin-scoped DAR/template registry listing.                    | `pillar admin template_registry list --status active --output table`                                  | `2,3,6,8`                                                                           | `template_registry pin`                                                                                  |
| `pillar admin template_registry upload`   | `pillar admin template_registry upload <dar_path> --version <version>`                      | Upload and validate DAR package.                               | `pillar admin template_registry upload ./pillar-templates.dar --version 2026.05.26`                   | `2,3,5,7,8`                                                                         | `template_registry pin`                                                                                  |
| `pillar admin template_registry pin`      | `pillar admin template_registry pin <template_version> --reason <reason>`                   | Pin validated template version.                                | `pillar admin template_registry pin 2026.05.26 --reason release_2026_05`                              | `2,3,4,5,8`                                                                         | `template_registry rollback`                                                                             |
| `pillar admin template_registry rollback` | `pillar admin template_registry rollback <template_version> --reason <reason>`              | Roll back active template version.                             | `pillar admin template_registry rollback 2026.05.20 --reason failed_activation`                       | `2,3,4,5,8`                                                                         | `migrations verify`                                                                                      |
| `pillar admin migrations status`          | `pillar admin migrations status [--range <name>]`                                           | Show Projection/Audit/Config migration state.                  | `pillar admin migrations status --range 0100_template_registry`                                       | `1,2,3,8`                                                                           | `migrations verify`                                                                                      |
| `pillar admin migrations verify`          | `pillar admin migrations verify [--range <name>] [--fail-on-drift]`                         | Verify migration checksums/order/runtime compatibility.        | `pillar admin migrations verify --fail-on-drift --output json`                                        | `1,2,3,7,8`                                                                         | `doctor`                                                                                                 |
| `pillar config show`                      | `pillar config show [--profile <name>] [--redact                                            | --no-redact]`                                                  | Print effective config and sources.                                                                   | `pillar config show --profile live --sources`                                       | `1,2,4,10`                                                                                               | `profiles list`          |
| `pillar config reset`                     | `pillar config reset [--profile <name>                                                      | --all] [--yes]`                                                | Reset config metadata; credentials remain.                                                            | `pillar config reset --profile sandbox --yes`                                       | `2,4,10`                                                                                                 | `logout`                 |
| `pillar doctor`                           | `pillar doctor [--profile <name>] [--sandbox] [--network]`                                  | Diagnose config, auth, network, sandbox, Docker, API, version. | `pillar doctor --profile live --network`                                                              | `1,2,3,9,10`                                                                        | `sandbox status`                                                                                         |
| `pillar version`                          | `pillar version [--verify-signature] [--check-update]`                                      | Print version, compatibility, build, signature status.         | `pillar version --verify-signature --output json`                                                     | `1,7,8,10`                                                                          | `doctor`                                                                                                 |

### Command catalog notes

The table above documents 77 command entries. Each row is normative: the first column is the command, the synopsis column is the exact invocation shape, the example column is at least one runnable example, `EC` is the command-specific exit-code list, and `Related` names nearby workflows. Detailed flag semantics are intentionally shared through global flags, profile/auth sections, object model conventions, and the `/v1` API contract so implementation does not drift into parallel command pages.

Resource ID prefixes are part of the CLI contract:

| Prefix   | Object             |
| -------- | ------------------ |
| `acct_`  | Account            |
| `asset_` | Asset              |
| `bal_`   | Balance projection |
| `hld_`   | Holding projection |
| `int_`   | Intent             |
| `hold_`  | Hold               |
| `op_`    | Operation          |
| `evt_`   | Event              |
| `we_`    | Webhook endpoint   |
| `key_`   | API key            |
| `file_`  | File               |
| `exp_`   | Export             |
| `inv_`   | Invoice            |
| `onb_`   | Onboarding session |

Mutation rules:

- mutating commands that accept `--idempotency-key` must return the original response for byte-equivalent retries and exit `5` for body mismatch;
- command output must include `request_id` and, when created, `operation_id`;
- commands that create asynchronous work exit `0` after acceptance, not after ledger finality, unless `--wait` is supplied;
- `--wait` observes the public operation endpoint and exits `7` on timeout without cancelling the operation;
- no command may patch ledger-derived balances, holdings, events, or operation history as if the projection database were authoritative.

### Command group contracts

#### Auth and profiles

- `login` must create or refresh exactly one selected profile credential.
- `login --device-code` is the required non-browser interactive path.
- `logout --all` removes all CLI-owned credential aliases and leaves profile metadata unchanged.
- `whoami` is the canonical credential smoke test for support and CI.
- Profile commands must be local-only except when credential deletion requires keychain access.
- Profile file writes must be atomic to avoid corrupting concurrent shell sessions.
- Profile names are case-sensitive and must not contain path separators.
- Sandbox profile creation must not overwrite a live profile unless the name matches exactly.
- Auth errors must exit `3`, not `8`, when the server rejects credentials.
- Config parse errors must exit `1` because the request never reached `/v1`.

#### Sandbox

- Sandbox commands operate only on local developer infrastructure.
- `sandbox up` must wait for API readiness unless `--detach` is supplied.
- `sandbox reset` is destructive and requires `--yes` in non-interactive mode.
- `sandbox status` reports API, projection, webhook, ledger-command, and participant health.
- `sandbox logs` must redact secrets before writing to stdout.
- Sandbox failure is exit `9`; missing Docker/runtime is exit `10`.
- Sandbox profile base URL must default to localhost and `mode: sandbox`.
- Sandbox commands must not contact live profiles unless `--profile` explicitly names one.

#### Accounts, assets, balances, holdings

- Account commands manage public account configuration, not ledger balances.
- Asset commands manage issuance/redeem configuration and lifecycle gates.
- Balance commands read projections derived from the ledger source of truth.
- Holding commands expose holding-first views and must not expose raw contract IDs.
- `accounts update` and `assets update` may change metadata only unless the API contract adds explicit mutable fields.
- `assets suspend` blocks new operations and preserves historical projections.
- `assets reactivate` must be audited and idempotency-safe.
- Balance stale reads must be marked in output when `--include-stale` is used.
- Projection timeout is exit `7`; missing account/asset is exit `4`.

#### Intents and holds

- Intent commands are acceptance commands, not finality commands.
- Successful intent mutation exits `0` when the operation is accepted.
- `--wait` follows the operation state and does not resubmit the mutation.
- `transfer`, `issue`, and `redeem` require decimal amount validation before API call.
- Amount rendering must preserve string decimal precision from API responses.
- Idempotency conflict is exit `5` and must print the original request ID when available.
- Hold creation and release must go through the same intent/operation trace spine.
- Hold release cannot mint replacement event IDs; it must link to the original hold.
- Business validation failures from `/v1` map to exit `2` only when caught locally; server-side validation responses use the API error class and may exit `5` for conflict.

#### Operations, events, and traces

- Operations are the common async status surface for mutations, admin changes, exports, files, onboarding, and webhook actions.
- Events are emitted only from projected ledger-derived state.
- `events replay` preserves the original `evt_` identity and creates delivery attempts, not replacement events.
- `events list --follow` streams ordered events and exits `7` on idle/read timeout when configured.
- `traces get` is the support path from public object ID to request-operation-command-projection-event timeline.
- Trace output may include privileged internals only with `--include-internal` and adequate scope.
- Timeline/table views must use UTC timestamps and public IDs by default.
- Not-found traces exit `4`; slow trace joins exit `7`.

#### Webhooks

- Endpoint creation returns signing secret once and must mark it as one-time output.
- Endpoint retrieval always redacts signing secrets.
- `rotate_secret` supports overlap so old and new signatures verify during migration.
- `listen` is local development tooling and may depend on sandbox/event streaming.
- `trigger` creates synthetic test deliveries and must clearly mark them as test events.
- `test` uses managed dispatcher behavior and validates signing path.
- Webhook commands must never silently drop accepted events.
- Customer endpoint failure is represented in delivery status, not as platform success.
- Replay and test commands must include endpoint and event identifiers in output.

#### Keys and credentials

- `keys create` and `keys rotate` are the only key commands that print secret material.
- Secret output must be suppressed from debug logs and telemetry.
- `keys list` returns metadata, scopes, creation time, expiration, and revocation status only.
- `keys revoke` requires a reason and preserves audit evidence.
- `keys rotate` should create replacement material before scheduling old-key revocation.
- Missing key-management scope exits `3`.
- Duplicate key names or pending rotation conflicts exit `5`.

#### Files and exports

- Files are storage/evidence objects and must not become economic truth.
- `files upload` validates purpose, content type, checksum, and size before upload when possible.
- `files delete` may delete content only when retention policy allows; retention conflict exits `5`.
- Export creation is asynchronous and returns an `exp_` plus `op_` when available.
- Export filters must be JSON objects and validated before API call.
- Export downloads should verify checksum when `--verify-checksum` is supplied.
- Export cancellation is allowed only before terminal state.
- Large upload/download timeout exits `7` and must not hide partial local files.

#### Usage, invoices, and onboarding

- Usage and invoice commands are read paths over billing/reporting state.
- `usage get` must support period filters and meter breakdown without changing units between formats.
- Invoice downloads use file links and the same checksum/download rules as file commands.
- Onboarding start supports `hosted`, `customer-validator`, and `self-hosted` modes.
- Onboarding completion requires evidence and must fail with exit `5` when checklist gates are incomplete.
- Onboarding status must identify the next customer-visible action without exposing Canton internals.
- Billing and onboarding commands must preserve tenant isolation in every renderer.

#### Admin

- Admin commands require explicit admin scope and exit `3` without it.
- Template registry upload validates DAR checksum and compatibility before activation.
- Template registry pin changes runtime selection and must be audited with a reason.
- Template registry rollback must refuse unsafe rollback with exit `5`.
- Migration status reports current/applied/expected ranges for Projection/Audit/Config only.
- Migration verify checks order, checksum, and runtime compatibility.
- Admin output may include package/template identifiers only in admin-scoped contexts.
- Admin commands are gated because deployment mode must not change public API grammar.

#### Debug and local support

- `config show` must redact by default and show source precedence with `--sources`.
- `config reset` is local-only and must not revoke server credentials.
- `doctor` must separate local dependency failures (`10`) from auth failures (`3`) and sandbox failures (`9`).
- `version --verify-signature` binds CLI binary/container to signed release provenance.
- `version --check-update` may exit `1` when an update is available without making the installation unusable.
- Debug commands may print remediation hints to stderr but must keep stdout renderer-stable.
- `doctor --fix` may repair local config but must not mutate live server objects.

#### Pagination and filtering

- List commands use `--limit`, `--starting-after`, and `--ending-before` where supported by `/v1`.
- `--limit` must be bounded by the API maximum and invalid values exit `2`.
- Empty result sets are success with `data: []`, not exit `4`.
- Object `get` commands use exit `4` for missing public IDs.
- Filters must be echoed in debug diagnostics only after redaction.
- Table output must show enough cursor or count context for human continuation.

#### Idempotency and retries

- Safe retries are allowed for GET/list and for mutations with an idempotency key.
- The CLI must not invent idempotency keys unless command help explicitly documents that behavior.
- Retry diagnostics include attempt count and request ID when available.
- Rate-limit responses exit `6` and include retry-after metadata when provided.
- Network timeout exits `7` after retry policy is exhausted.
- Server `5xx` exits `8`; CLI must not remap it to usage error.

#### Security and redaction

- Redaction applies before logs, telemetry, debug output, support bundles, and `exec` child diagnostics.
- One-time secrets are printed only to stdout in the requested renderer.
- Environment variable values must never be printed by default.
- `--no-redact` is accepted only where documented and must require interactive confirmation outside CI.
- Public IDs are safe for ordinary output; internal ledger IDs are privileged.
- Plugin and telemetry behavior must follow the same redaction pipeline.

#### Compatibility

- CLI minor versions may add commands and fields but must not remove existing command grammar within a supported API version.
- `--api-version` pins request behavior and generated output schemas where the API supports versioning.
- Commands must fail fast when the selected API version predates the command.
- Table formatting may change; JSON and YAML key semantics are compatibility surfaces.
- `exec=program` receives JSON regardless of the human table formatter.
- Exit code meanings are stable across CLI releases.

### Command examples by workflow

#### First sandbox transfer

```bash
pillar sandbox up --detach
pillar profiles use sandbox
pillar accounts create --name "Sender"
pillar accounts create --name "Receiver"
pillar assets create --symbol USDX --name "USD Example" --precision 2
pillar intents issue --to acct_sender --asset asset_usdx --amount 1000.00 --wait
pillar intents transfer --from acct_sender --to acct_receiver --asset asset_usdx --amount 25.00 --wait
pillar balances get --account acct_receiver --asset asset_usdx --output table
pillar traces get op_123 --format timeline --output table
```

Expected behavior: every mutation returns a public object ID and request ID. Ledger finality is observed through operations, traces, balances, holdings, and events rather than raw Canton identifiers.

#### Webhook local development

```bash
pillar webhooks listen --forward-to http://localhost:4242/webhook --print-secret
pillar webhooks trigger intent.completed --endpoint http://localhost:4242/webhook
pillar events list --type intent.completed --limit 5
pillar events get evt_123 --delivery-attempts
```

Expected behavior: local forwarding signs requests the same way managed delivery signs them. Synthetic trigger events are visibly marked test-only; replay of a real event preserves the original event ID.

#### Production key rotation

```bash
pillar keys list --output table
pillar keys rotate key_123 --overlap 48h
pillar whoami --profile live --scopes
pillar keys revoke key_old --reason rotated_to_key_456
pillar traces get key_456 --format timeline
```

Expected behavior: create/rotate commands print new secret material once. Listing, trace, and audit commands show metadata only. Missing key-management scope exits `3`.

#### Export and evidence download

```bash
pillar exports create --type events --format jsonl --filter '{"created_after":"2026-05-01T00:00:00Z"}'
pillar exports get exp_123 --output table
pillar exports get exp_123 --download ./events.jsonl --verify-checksum
pillar files upload ./evidence.pdf --purpose compliance_evidence --metadata case=case_123
pillar files get file_123 --verify-checksum
```

Expected behavior: export creation accepts work asynchronously. Download commands verify checksums when requested and exit `7` for timeout without claiming the job failed.

#### Admin release validation

```bash
pillar admin template_registry upload ./pillar-templates.dar --version 2026.05.26 --checksum sha256:abc123
pillar admin template_registry pin 2026.05.26 --reason release_2026_05
pillar admin migrations status --range 0100_template_registry
pillar admin migrations verify --fail-on-drift --output json
pillar version --verify-signature
```

Expected behavior: admin commands require admin scope, produce audit evidence, and never alter the public `/v1` grammar across hosted, customer-validator, or self-hosted deployments.

### Flag compatibility matrix

| Flag                    | Read commands | Mutating commands    | Streaming commands                | Local commands                         | Notes                                                   |
| ----------------------- | ------------- | -------------------- | --------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| `--profile`             | Yes           | Yes                  | Yes                               | Yes                                    | Selects config and credential alias.                    |
| `--api-version`         | Yes           | Yes                  | Yes                               | Limited                                | Local commands use it only when calling `/v1`.          |
| `--output json`         | Yes           | Yes                  | Yes                               | Yes                                    | Streaming may emit JSON lines.                          |
| `--output table`        | Yes           | Yes                  | Diagnostic only                   | Yes                                    | Human-oriented; may omit nested fields.                 |
| `--output yaml`         | Yes           | Yes                  | No for infinite streams           | Yes                                    | Same semantic keys as JSON.                             |
| `--output exec=program` | Yes           | Yes                  | Yes                               | Limited                                | Child receives JSON on stdin.                           |
| `--debug`               | Yes           | Yes                  | Yes                               | Yes                                    | Stderr only; redacted.                                  |
| `--quiet`               | Yes           | Yes                  | Yes                               | Yes                                    | Suppresses progress, not errors.                        |
| `--idempotency-key`     | No            | When supported       | Replay/test only where documented | No                                     | Required for safe customer-controlled mutation retries. |
| `--wait`                | No            | Async mutations only | No                                | Sandbox readiness only when documented | Observes operation state; does not resubmit.            |
| `--limit`               | List only     | No                   | Initial page only                 | Some diagnostics                       | Invalid bounds exit `2`.                                |
| `--starting-after`      | List only     | No                   | Initial page only                 | No                                     | Cursor must match object family.                        |
| `--ending-before`       | List only     | No                   | No                                | No                                     | Cursor must match object family.                        |

### Error object contract

All API-sourced failures rendered as JSON use this shape:

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "parameter_invalid",
    "message": "amount must be greater than zero",
    "param": "amount"
  },
  "request_id": "req_123",
  "operation_id": null
}
```

Rules:

- `error.type` groups auth, invalid request, conflict, rate limit, timeout, and platform errors;
- `error.code` is stable for automation;
- `error.message` is human-readable and not parsed by scripts;
- `error.param` appears only for parameter-specific validation;
- `request_id` is included whenever a request reached Pillar;
- `operation_id` appears when the API accepted asynchronous work before failure classification;
- local-only failures may omit `request_id` and must include a diagnostic source in debug stderr.

### Config precedence

| Precedence | Source               | Example                                     |
| ---------: | -------------------- | ------------------------------------------- |
|          1 | Command flag         | `--profile live --output table`             |
|          2 | Environment variable | `PILLAR_PROFILE=live`, `PILLAR_OUTPUT=json` |
|          3 | Selected profile     | `profiles.live.output`                      |
|          4 | Config root default  | `current_profile`                           |
|          5 | CLI default          | `default`, `json`, `auto`                   |

Precedence applies per setting. A command may read profile `live` while using `PILLAR_OUTPUT=table` and `--api-version 2026-05-26`. `pillar config show --sources` must explain each resolved value without revealing secrets.

### API-version behavior

- The CLI sends one `Pillar-Version` header on every `/v1` request.
- If `--api-version` is omitted, the selected profile value is used.
- If the profile omits a version, the CLI uses its compiled default and prints it in `pillar version`.
- Commands introduced after the selected API version fail before mutation when incompatibility is known.
- Response rendering follows the selected API version, not the CLI package version.
- `pillar doctor --network` should warn when the server deprecates the selected API version.
- Plugins must inherit the resolved API version and cannot silently upgrade it.

### CI behavior

CI environments should avoid interactive prompts:

```bash
export PILLAR_API_KEY="$PILLAR_CI_API_KEY"
export PILLAR_PROFILE=ci
export PILLAR_OUTPUT=json
pillar profiles create ci --base-url https://api.pillar.example/v1 --mode live
pillar whoami --scopes
pillar exports create --type events --format jsonl --filter '{"limit":"daily"}'
```

CI rules:

- missing `PILLAR_API_KEY` with no keychain credential exits `3`;
- browser login is disabled when `CI` is set unless `--device-code` is explicit;
- confirmations require `--yes` or fail with `2`;
- progress spinners are disabled;
- stdout must remain parseable by automation;
- Docker image usage should mount config read-only unless profile creation is required.

### Support bundle guidance

The CLI may be used to collect support evidence without leaking secrets:

```bash
pillar whoami --scopes --output json
pillar config show --sources --redact
pillar doctor --network --output json
pillar operations get op_123 --trace --output json
pillar events get evt_123 --delivery-attempts --output json
pillar traces get op_123 --format timeline --output json
```

Support output must contain public object IDs, request IDs, timestamps, selected API version, and error codes. It must not contain API keys, webhook secrets, raw request bodies, uploaded file contents, contract IDs, party IDs, or participant credentials.

## 7. Output formats

JSON is the default automation contract. Field names match `/v1` objects and public IDs (`acct_`, `asset_`, `bal_`, `hld_`, `int_`, `op_`, `evt_`, `we_`, `file_`, `exp_`). Normal output never exposes `contract_id`, `template_id`, `party_id`, participant endpoints, or ledger offsets.

| Format         | Use                            | Contract                                                                                              |
| -------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `json`         | Automation, SDK parity, tests. | Stable keys; no ANSI; secrets redacted except one-time create/rotate output.                          |
| `table`        | Human terminal use.            | May omit nested fields; not a complete data source.                                                   |
| `yaml`         | Config/support review.         | Same semantic keys as JSON.                                                                           |
| `exec=program` | Scripting.                     | Sends JSON objects to child stdin; child non-zero maps to CLI exit `1` unless command already failed. |

```bash
pillar accounts list --output json
pillar events list --follow --output exec='jq -c .id'
pillar config show --output yaml
```

Renderer rules: paginated responses include `object`, `data`, `has_more`, and cursor fields; errors include `error.type`, `error.code`, `error.message`, `request_id`, and optional `operation_id`; `--debug` never changes stdout; table timestamps are UTC; one-time secrets print only from create/rotate commands.

## 8. Exit code convention

| Code | Meaning                                                                                                    |
| ---: | ---------------------------------------------------------------------------------------------------------- |
|  `0` | Success or accepted asynchronous operation.                                                                |
|  `1` | Generic local failure, failed diagnostic, migration drift, update/signature warning, child `exec` failure. |
|  `2` | Usage error, invalid flags, malformed IDs, client-side validation failure.                                 |
|  `3` | Authentication, authorization, missing scope, credential, or policy failure.                               |
|  `4` | Public object not found.                                                                                   |
|  `5` | Conflict: idempotency mismatch, duplicate, unsafe state transition, retention conflict.                    |
|  `6` | Rate limit or quota exceeded.                                                                              |
|  `7` | Timeout: API, upload/download, stream, readiness, validation, trace lookup.                                |
|  `8` | Pillar server/platform error.                                                                              |
|  `9` | Sandbox not running or sandbox operation failed.                                                           |
| `10` | Local dependency missing/inaccessible: Docker, keychain, browser, config dir, verifier.                    |

Commands may list multiple codes but must not assign command-specific meanings to these numbers.

## 9. Plugin model

Plugins may extend renderers, diagnostics, and local workflow helpers. They cannot replace built-in command semantics, bypass auth/profile resolution, or make Canton internals part of public UX.

Discovery order:

1. built-in commands;
2. signed plugins in `${PILLAR_CONFIG_DIR}/plugins`;
3. signed package-manager plugins;
4. explicit plugin entrypoints if a future `plugins run` command is added.

Security requirements:

- plugin manifest declares command names, requested scopes, network access, and output contracts;
- package signature must chain to a trusted publisher or explicit local allowlist;
- plugin receives resolved profile metadata but not keychain secrets;
- API calls go through the CLI client so retries, redaction, request IDs, and API-version headers are consistent;
- unsigned plugin execution fails with `3` for policy denial or `10` for verifier dependency failure;
- plugin stdout must obey selected `--output` format or the command fails.

## 10. Telemetry

Telemetry is opt-in and never required for CLI functionality.

Sent when enabled: command/subcommand name, CLI version, OS family, install channel, renderer type, duration bucket, exit code, retry count, timeout class, anonymous installation ID, and local sandbox/Workbench feature flags.

Never sent: API keys, keychain values, webhook secrets, file contents, request/response bodies, raw customer object IDs unless attached to an explicit support case, Canton contract IDs, party IDs, ledger offsets, participant details, or environment variable values.

Controls:

```bash
pillar telemetry enable
pillar telemetry disable
PILLAR_NO_TELEMETRY=1 pillar accounts list
```

If telemetry subcommands are omitted from a minimal build, `PILLAR_NO_TELEMETRY=1` and profile `telemetry: false` are still authoritative. Telemetry failure never changes a successful business command into a non-zero exit.
