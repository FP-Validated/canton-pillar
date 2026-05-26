import type { ScenarioReport } from "../../_shared/sandbox";
export function assertReport(report: ScenarioReport): void { if (Object.values(report.invariants).some((v) => !v)) throw new Error("DR failover invariant failed"); }
