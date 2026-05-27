import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { getKey } from './jwks.js';
export type GoogleTokenResponse={idToken:string;accessToken:string;refreshToken?:string;expiresIn:number};
export function buildAuthorizationUrl({clientId,redirectUri,state,nonce,codeChallenge,scopes=['openid','email','profile']}:{clientId:string;redirectUri:string;state:string;nonce:string;codeChallenge:string;scopes?:string[]}){const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.searchParams.set('client_id',clientId);u.searchParams.set('redirect_uri',redirectUri);u.searchParams.set('response_type','code');u.searchParams.set('scope',scopes.join(' '));u.searchParams.set('state',state);u.searchParams.set('nonce',nonce);u.searchParams.set('code_challenge',codeChallenge);u.searchParams.set('code_challenge_method','S256');u.searchParams.set('access_type','offline');u.searchParams.set('prompt','consent');return u.toString()}
export async function exchangeCodeForToken({clientId,clientSecret,redirectUri,code,codeVerifier}:{clientId:string;clientSecret:string;redirectUri:string;code:string;codeVerifier:string}):Promise<GoogleTokenResponse>{const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,code,code_verifier:codeVerifier,grant_type:'authorization_code'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});if(!r.ok)throw new Error(`google_token_exchange_failed:${r.status}`);const j:any=await r.json();return{idToken:j.id_token,accessToken:j.access_token,refreshToken:j.refresh_token,expiresIn:j.expires_in}}
function b64url(input:string){return Buffer.from(input.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8')}
function b64urlBytes(input:string){return Buffer.from(input.replace(/-/g,'+').replace(/_/g,'/'),'base64')}
function isCanonicalB64url(input:string){return Buffer.from(input.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('base64url')===input}
export type OAuthVerificationCode='jwk_not_found'|'signature_invalid'|'audience_mismatch'|'issuer_mismatch'|'token_expired'|'token_not_yet_valid';
export class OAuthVerificationError extends Error {
  constructor(public code: OAuthVerificationCode) { super(code); }
}
export async function verifyIdToken(idToken:string,opts:{audience:string;clientId?:string;issuer?:string}|{clientId:string;audience?:string;issuer?:string}){
  const audience=opts.audience ?? opts.clientId;
  const issuer=opts.issuer ?? 'https://accounts.google.com';
  const [h,p,s]=idToken.split('.');
  if(!h||!p||!s)throw new OAuthVerificationError('signature_invalid');
  const header=JSON.parse(b64url(h)) as {alg?:string;kid?:string};
  const payload=JSON.parse(b64url(p)) as Record<string, any>;
  const jwk=header.kid ? await getKey(header.kid) : null;
  if(!jwk)throw new OAuthVerificationError('jwk_not_found');
  const key=createPublicKey({key:jwk,format:'jwk'});
  const ok=header.alg==='RS256' && isCanonicalB64url(s) && verify('RSA-SHA256',Buffer.from(`${h}.${p}`),key,b64urlBytes(s));
  if(!ok)throw new OAuthVerificationError('signature_invalid');
  const now=Math.floor(Date.now()/1000);
  const skew=300;
  if(payload.aud!==audience)throw new OAuthVerificationError('audience_mismatch');
  if(payload.iss!==issuer)throw new OAuthVerificationError('issuer_mismatch');
  if(typeof payload.exp==='number' && payload.exp < now-skew)throw new OAuthVerificationError('token_expired');
  if(typeof payload.iat==='number' && payload.iat > now+skew)throw new OAuthVerificationError('token_not_yet_valid');
  return{sub:String(payload.sub),email:String(payload.email),email_verified:Boolean(payload.email_verified),name:payload.name,picture:payload.picture,hd:payload.hd}
}
export function pkceChallenge(verifier:string){return createHash('sha256').update(verifier).digest('base64url')}
export function pkceVerifier(){return randomBytes(32).toString('base64url')}
