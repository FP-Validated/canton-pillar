export function BillingEmptyState({ capabilityEnabled }: { capabilityEnabled: boolean }) { return <div>{capabilityEnabled ? 'No usage yet.' : 'Billing is not enabled for this environment.'}</div>; }
