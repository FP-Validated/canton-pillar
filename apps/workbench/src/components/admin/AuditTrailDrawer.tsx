export function AuditTrailDrawer({ events }: { events: unknown[] }) { return <aside className="drawer"><h2>Audit trail</h2><pre>{JSON.stringify(events, null, 2)}</pre></aside>; }
