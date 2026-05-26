export type LedgerSample = { command_id: string; submission_id: string; operation_id: string; duplicate_commands: number };
export async function sampleLedger(seed: string): Promise<LedgerSample> { return { command_id: `cmd_${seed}`, submission_id: `sub_${seed}_${Date.now()}_${Math.random()}`, operation_id: `op_${seed}`, duplicate_commands: 0 }; }
export async function sampleProjection(corrupt = false) { return { rebuilt: true, sourceTotal: "100.000000", projectionTotal: corrupt ? "99.000000" : "100.000000", detectedCorruption: corrupt }; }
export async function sampleWebhooks(failing = false) { return { attempted: failing ? 12 : 3, delivered: failing ? 0 : 3, retryScheduled: failing ? 12 : 0 }; }
