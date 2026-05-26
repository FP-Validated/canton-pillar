import { compose, pauseContainer, unpauseContainer } from "../../_shared/docker";
import { sampleLedger, sampleProjection, sampleWebhooks } from "../../_shared/postgres";
import { assertInvariant, deterministicId, finish, now, printReport, type ScenarioReport } from "../../_shared/sandbox";
export async function run(): Promise<ScenarioReport> {
  const scenario = "api-db-partition"; const report: ScenarioReport = { scenario, status: "passed", startedAt: now(), finishedAt: now(), invariants: {}, samples: {}, notes: [] };
  const up = compose(["up", "-d"]); if (up.mocked) report.status = "mocked";
  const commandId = deterministicId("cmd", scenario); const first = await sampleLedger(commandId); const inject = pauseContainer(scenario); const second = await sampleLedger(commandId);
  const projection = await sampleProjection(false); const webhooks = await sampleWebhooks(false); unpauseContainer(scenario); compose(["down", "--remove-orphans"]);
  report.samples = { first, second, projection, webhooks, inject };
  assertInvariant(report, "stable_command_id", first.command_id === second.command_id);
  assertInvariant(report, "unique_submission_id_per_attempt", first.submission_id !== second.submission_id);
  assertInvariant(report, "no_duplicate_ledger_commands", second.duplicate_commands === 0);
  assertInvariant(report, "projection_rebuilds_match_or_corruption_detected", projection.sourceTotal === projection.projectionTotal || projection.detectedCorruption);
  assertInvariant(report, "webhook_attempts_continue", webhooks.attempted > 0);
  return finish(report);
}
if (import.meta.url === `file://${process.argv[1]}`) run().then(printReport).catch((error) => { console.error(error); process.exit(1); });
