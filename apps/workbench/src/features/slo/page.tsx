const rows = [
  { id: "api-availability", target: "99.9%", burn: "0.7x", status: "within budget" },
  { id: "projection-freshness", target: "99.5%", burn: "1.2x", status: "watch" },
  { id: "webhook-delivery", target: "99.0%", burn: "0.4x", status: "within budget" },
];
export default function SloFeaturePage() { return <main className="space-y-6"><h1 className="text-2xl font-semibold">SLO catalog</h1><table className="w-full text-left"><thead><tr><th>SLO</th><th>Target</th><th>Burn rate</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.target}</td><td>{row.burn}</td><td>{row.status}</td></tr>)}</tbody></table></main>; }
