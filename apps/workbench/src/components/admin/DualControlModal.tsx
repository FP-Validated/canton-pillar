'use client';
import { useState } from 'react';
export function DualControlModal({ title, actionLabel, onApprove }: { title: string; actionLabel: string; onApprove: (email: string) => Promise<void> }) {
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(''); const [pending, setPending] = useState(false);
  async function submit() { setPending(true); await onApprove(email); setPending(false); setOpen(false); window.dispatchEvent(new CustomEvent('admin:toast', { detail: `${actionLabel} requested` })); }
  return <><button onClick={() => setOpen(true)}>{actionLabel}</button>{open ? <div role="dialog" aria-modal="true" aria-label={title} className="modal"><h2>{title}</h2><p>Production-critical transition requires a second approver.</p><label>Second approver email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></label><button disabled={!email.includes('@') || pending} onClick={submit}>Submit dual-control approval</button><button onClick={() => setOpen(false)}>Cancel</button></div> : null}</>;
}
