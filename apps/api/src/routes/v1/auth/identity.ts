import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes, createHash } from 'node:crypto';
import { buildAuthorizationUrl, pkceChallenge, createCsrfToken } from '@pillar/security';

type Session = { user: { id: string; email: string; display_name?: string }; active_tenant_id: string; role: string; livemode: boolean };
declare module 'fastify' { interface FastifyRequest { session?: Session } }
const states = new Map<string, { codeVerifier: string; nonce: string; returnTo: string; expiresAt: number }>();
const sessions = new Map<string, Session & { csrf: string }>();
const h = (v: string) => createHash('sha256').update(v).digest('hex');
function cookie(req: FastifyRequest, name: string) { return (req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1); }
export async function identityAuthRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => { const token = cookie(req, 'pillar_session'); if (token && sessions.has(token)) req.session = sessions.get(token); });
  app.post('/auth/oauth/google/start', async (req: any) => { const state = randomBytes(24).toString('base64url'); const nonce = randomBytes(24).toString('base64url'); const codeVerifier = randomBytes(32).toString('base64url'); const returnTo = req.body?.return_to ?? '/dashboard'; states.set(h(state), { codeVerifier, nonce, returnTo, expiresAt: Date.now() + 300000 }); const authorization_url = buildAuthorizationUrl({ clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? 'dev-client', redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? 'http://localhost:3001/v1/auth/oauth/google/callback', state, nonce, codeChallenge: pkceChallenge(codeVerifier) }); return { authorization_url, state }; });
  app.get('/auth/oauth/google/callback', async (req: any, reply) => { const state = String(req.query.state ?? ''); const stored = states.get(h(state)); if (!stored || stored.expiresAt < Date.now()) return reply.code(400).send({ error: { code: 'invalid_oauth_state' } }); states.delete(h(state)); const token = `sess_${randomBytes(32).toString('base64url')}`; const csrf = createCsrfToken(); const session = { user: { id: 'usr_dev', email: 'dev@canton-pillar.local', display_name: 'Canton Pillar User' }, active_tenant_id: 'ten_dev', role: 'super_admin', livemode: false, csrf }; sessions.set(token, session); reply.header('set-cookie', `pillar_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`); return { csrf_token: csrf, return_to: stored.returnTo }; });
  app.post('/auth/logout', async (req, reply) => { const token = cookie(req, 'pillar_session'); if (token) sessions.delete(token); reply.header('set-cookie', 'pillar_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'); return { ok: true }; });
  app.get('/auth/session', async (req, reply) => { if (!req.session) return reply.code(401).send({ error: { code: 'not_authenticated' } }); return { user: req.session.user, memberships: [{ tenant: { id: req.session.active_tenant_id, slug: 'dev', display_name: 'Development' }, role: req.session.role }], active_tenant_id: req.session.active_tenant_id }; });
  app.post('/auth/switch_tenant', async (req: any, reply) => { if (!req.session) return reply.code(401).send({ error: { code: 'not_authenticated' } }); req.session.active_tenant_id = req.body.tenant_id; return { active_tenant_id: req.session.active_tenant_id }; });
}
export function requireSuperAdmin(req: FastifyRequest) { if (req.session?.role !== 'super_admin') throw Object.assign(new Error('super_admin_required'), { statusCode: 403 }); }
