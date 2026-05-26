import { randomBytes, timingSafeEqual } from 'node:crypto';
export function createCsrfToken(){return randomBytes(32).toString('base64url')}
export function verifyCsrfToken(a:string,b:string){const aa=Buffer.from(a);const bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb)}
