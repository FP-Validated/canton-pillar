export const piiPatterns = [/ssn/i,/passport/i,/private[_-]?key/i,/secret/i,/password/i];
export function assertNoMetadataPii(metadata: Record<string,string>) { for (const [k,v] of Object.entries(metadata)) if (piiPatterns.some(p=>p.test(k)||p.test(v))) throw new Error(`metadata contains prohibited sensitive field: ${k}`); return true; }
