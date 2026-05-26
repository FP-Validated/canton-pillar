import { timingSafeEqual } from 'node:crypto';
import { signWebhookPayload, type RawWebhookBody } from './sign.js';

export type WebhookSignatureVerification = { ok: true; timestamp: number; matchedSecretIndex: number } | { ok: false; reason: 'malformed_header' | 'timestamp_out_of_tolerance' | 'no_matching_signature' };

function parseHeader(header: string): { timestamp: number; signatures: string[] } | null {
  const parts = header.split(',');
  const ts = parts.find(p => p.startsWith('t='))?.slice(2);
  if (!ts || !/^\d+$/.test(ts)) return null;
  const signatures = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (signatures.length === 0 || signatures.some(s => !/^[0-9a-f]{64}$/i.test(s))) return null;
  return { timestamp: Number(ts), signatures };
}

function safeHexEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyWebhookSignature(rawBody: RawWebhookBody, header: string | undefined | null, secrets: string[], toleranceSeconds = 300, now: () => number = Date.now): WebhookSignatureVerification {
  if (!header || secrets.length === 0) return { ok: false, reason: 'malformed_header' };
  const parsed = parseHeader(header);
  if (!parsed) return { ok: false, reason: 'malformed_header' };
  const age = Math.abs(Math.floor(now() / 1000) - parsed.timestamp);
  if (age > toleranceSeconds) return { ok: false, reason: 'timestamp_out_of_tolerance' };
  let matched = false; let matchedSecretIndex = -1;
  secrets.forEach((secret, i) => {
    const expected = signWebhookPayload(secret, parsed.timestamp, rawBody);
    for (const sig of parsed.signatures) if (safeHexEquals(expected, sig)) { matched = true; if (matchedSecretIndex < 0) matchedSecretIndex = i; }
  });
  return matched ? { ok: true, timestamp: parsed.timestamp, matchedSecretIndex } : { ok: false, reason: 'no_matching_signature' };
}
