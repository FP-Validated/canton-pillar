import { createHash, X509Certificate } from 'node:crypto';
export function spkiPin(pem: string) { return 'sha256/' + createHash('sha256').update(new X509Certificate(pem).publicKey.export({ type:'spki', format:'der' })).digest('base64'); }
export function validateTrustPin(pem: string, allowedPins: readonly string[]) { const pin = spkiPin(pem); if (!allowedPins.includes(pin)) throw new Error('TLS trust pin mismatch'); return { pin, valid: true }; }
