export type ScenarioStatus = "passed" | "failed" | "mocked";
export type ScenarioReport = { scenario: string; status: ScenarioStatus; startedAt: string; finishedAt: string; invariants: Record<string, boolean>; samples: Record<string, unknown>; notes: string[] };
export function now(): string { return new Date().toISOString(); }
export function deterministicId(prefix: string, seed: string): string { return `${prefix}_${Buffer.from(seed).toString("hex").slice(0, 20)}`; }
export function assertInvariant(report: ScenarioReport, key: string, value: boolean): void { report.invariants[key] = value; if (!value) report.status = "failed"; }
export function finish(report: ScenarioReport): ScenarioReport { report.finishedAt = now(); return report; }
export function printReport(report: ScenarioReport): void { console.log(JSON.stringify(report, null, 2)); }
