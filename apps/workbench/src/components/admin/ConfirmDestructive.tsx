'use client';
export function ConfirmDestructive({ label, onConfirm }: { label: string; onConfirm: () => Promise<void> }) { return <button data-destructive onClick={async () => { if (confirm(`Confirm ${label}`)) await onConfirm(); }}>{label}</button>; }
