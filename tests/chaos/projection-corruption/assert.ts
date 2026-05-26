import type { ScenarioReport } from "../../_shared/sandbox";
export function assertReport(report: ScenarioReport): void { for (const [name, ok] of Object.entries(report.invariants)) if (!ok) throw new Error(`${report.scenario} invariant failed: ${name}`); }
