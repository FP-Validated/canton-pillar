import type { FastifyInstance } from 'fastify';
import { requireSuperAdmin } from '../../auth/identity.js';
const users = new Map([['usr_dev', { id: 'usr_dev', email: 'dev@canton-pillar.local', status: 'active' }]]);
const tenants = new Map([['ten_dev', { id: 'ten_dev', slug: 'dev', display_name: 'Development', billing_status: 'active' }]]);
const memberships = new Map([['mem_dev', { id: 'mem_dev', tenant_id: 'ten_dev', user_id: 'usr_dev', role: 'super_admin', status: 'active' }]]);
const invitations = new Map<string, any>();
export async function adminIdentityRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => requireSuperAdmin(req));
  app.get('/admin/identity/users', async () => ({ data: [...users.values()] }));
  app.get('/admin/identity/users/:id', async (req: any) => users.get(req.params.id) ?? null);
  app.post('/admin/identity/users/:id/disable', async (req: any) => ({ ...(users.get(req.params.id) ?? {}), status: 'disabled' }));
  app.post('/admin/identity/users/:id/enable', async (req: any) => ({ ...(users.get(req.params.id) ?? {}), status: 'active' }));
  app.get('/admin/identity/tenants', async () => ({ data: [...tenants.values()] }));
  app.get('/admin/identity/tenants/:id', async (req: any) => tenants.get(req.params.id) ?? null);
  app.post('/admin/identity/tenants/:id/disable', async (req: any) => ({ ...(tenants.get(req.params.id) ?? {}), billing_status: 'disabled' }));
  app.post('/admin/identity/tenants/:id/enable', async (req: any) => ({ ...(tenants.get(req.params.id) ?? {}), billing_status: 'active' }));
  app.get('/admin/identity/memberships', async (req: any) => ({ data: [...memberships.values()].filter((m:any)=> !req.query.tenant_id || m.tenant_id===req.query.tenant_id).filter((m:any)=> !req.query.user_id || m.user_id===req.query.user_id) }));
  app.post('/admin/identity/memberships', async (req: any) => { const id = `mem_${memberships.size+1}`; const row = { id, status: 'active', ...req.body }; memberships.set(id,row); return row; });
  app.post('/admin/identity/memberships/:id/role', async (req: any) => { const row:any = memberships.get(req.params.id); if(row) row.role=req.body.role; return row; });
  app.post('/admin/identity/memberships/:id/disable', async (req: any) => { const row:any = memberships.get(req.params.id); if(row) row.status='disabled'; return row; });
  app.post('/admin/identity/memberships/:id/enable', async (req: any) => { const row:any = memberships.get(req.params.id); if(row) row.status='active'; return row; });
  app.post('/admin/identity/invitations', async (req: any) => { const id = `inv_${invitations.size+1}`; const row = { id, status: 'pending', token: `logged_${id}`, ...req.body }; invitations.set(id,row); app.log.info({ invitation: row }, 'identity invitation created; email delivery is logged-only'); return row; });
  app.post('/admin/identity/invitations/:id/revoke', async (req: any) => { const row:any = invitations.get(req.params.id); if(row) row.status='revoked'; return row; });
}
