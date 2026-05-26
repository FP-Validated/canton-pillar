import { createHmac } from 'node:crypto';

export type RawWebhookBody = string | Buffer | Uint8Array;

export function signWebhookPayload(secret: string, timestamp: number, rawBody: RawWebhookBody): string {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  return createHmac('sha256', secret).update(String(timestamp)).update('.').update(body).digest('hex');
}

export function buildSignatureHeader(signatures: { timestamp: number; signature: string }[] | { timestamp: number; signatures: string[] }): string {
  if (Array.isArray(signatures)) {
    if (signatures.length === 0) throw new Error('at least one signature is required');
    const timestamp = signatures[0]!.timestamp;
    return `t=${timestamp},${signatures.map(s => `v1=${s.signature}`).join(',')}`;
  }
  return `t=${signatures.timestamp},${signatures.signatures.map(s => `v1=${s}`).join(',')}`;
}
