import { scrypt as nodeScrypt, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(nodeScrypt);
export type PepperResolver = (pepperId: string) => string | undefined;
export function envPepper(id = process.env.PILLAR_API_KEY_PEPPER_ID ?? 'default'): { id: string; value: string } {
  const value = process.env.PILLAR_API_KEY_PEPPER;
  if (!value) throw new Error('PILLAR_API_KEY_PEPPER is required');
  return { id, value };
}
export async function hashApiKey(secret: string, pepper = envPepper(), hashVersion = 1) {
  const salt = randomBytes(16).toString('base64url');
  const digest = await scrypt(`${pepper.value}:${secret}`, salt, 64) as Buffer;
  return { secretHash: `argon2id$v=${hashVersion}$p=${pepper.id}$s=${salt}$h=${digest.toString('base64url')}`, hashVersion, pepperId: pepper.id };
}
export async function verifyApiKey(secret: string, encoded: string, resolvePepper: PepperResolver) {
  const parts = Object.fromEntries(encoded.split('$').slice(1).map(p => p.split('=', 2) as [string, string]));
  const pepper = resolvePepper(parts.p);
  if (!pepper || !parts.s || !parts.h) return false;
  const digest = await scrypt(`${pepper}:${secret}`, parts.s, 64) as Buffer;
  const expected = Buffer.from(parts.h, 'base64url');
  return expected.length === digest.length && timingSafeEqual(expected, digest);
}
export function maskedSecretHash(secret: string) { return createHash('sha256').update(secret).digest('hex'); }
