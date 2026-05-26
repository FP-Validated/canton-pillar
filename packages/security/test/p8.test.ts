import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiKey, parseApiKey, hashApiKey, verifyApiKey, issueServiceJwt, verifyServiceJwt, InMemoryHierarchicalRateLimiter, envelopeEncrypt, envelopeDecrypt, LocalKms, validateCallback, hashState } from '../src/index.js';

test('api key format and hash verify', async () => { const k=createApiKey('sk','test','ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'); assert.equal(parseApiKey(k.secret).mode,'test'); const h=await hashApiKey(k.secret,{id:'p1',value:'pepper'}); assert.equal(await verifyApiKey(k.secret,h.secretHash,id=>id==='p1'?'pepper':undefined), true); });
test('jwt round trip', () => { const t=issueServiceJwt({sub:'svc',aud:'api',tenant_id:'t',mode:'test'}, 's'); assert.equal(verifyServiceJwt(t,'api','s').sub,'svc'); });
test('limiter denies exhausted hierarchy', () => { const l=new InMemoryHierarchicalRateLimiter(); assert.equal(l.check([{key:'a',capacity:1,refillPerSecond:1}]).allowed,true); assert.equal(l.check([{key:'a',capacity:1,refillPerSecond:1}]).allowed,false); });
test('envelope encryption round trip', async () => { const kms=new LocalKms(); const e=await envelopeEncrypt(kms,'k','secret'); assert.equal(await envelopeDecrypt(kms,e),'secret'); });
test('oidc callback validates state nonce audience', () => { const s='s', n='n'; assert.equal(validateCallback({state:s,nonce:n,expectedStateHash:hashState(s),expectedNonceHash:hashState(n),aud:'a',expectedAud:'a',sub:'u',tenantId:'t',mode:'test'}).subject,'u'); });
