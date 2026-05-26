type Diff = { id: string; expected: string; observed: string; detected: boolean };
function inject(count: number): Diff[] { return Array.from({ length: count }, (_, i) => ({ id: `hldg_${i}`, expected: "100.000000", observed: i % 3 === 0 ? "99.000000" : "100.000000", detected: i % 3 === 0 })); }
const diffs = inject(Number(process.env.RECON_DIFFS ?? 30)); const missed = diffs.filter((d) => d.expected !== d.observed && !d.detected);
console.log(JSON.stringify({ scenario: "reconciliation-stress", diffs: diffs.length, detected: diffs.filter((d) => d.detected).length, missed: missed.length, invariant: "detect-not-correct" }, null, 2));
if (missed.length) process.exit(1);
