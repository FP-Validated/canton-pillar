export interface RetentionPolicy { retainUntil: Date; legalHold: boolean; worm: boolean; }
export function assertRetention(policy: RetentionPolicy, now = new Date()) { if (policy.worm && policy.retainUntil <= now) throw new Error('WORM retention must be in the future'); return policy; }
export function canDelete(policy: RetentionPolicy, now = new Date()) { return !policy.legalHold && now > policy.retainUntil; }
