import { createHash } from 'node:crypto';
export function slsaSubject(name: string, bytes: Buffer | string) { return { name, digest: { sha256: createHash('sha256').update(bytes).digest('hex') } }; }
