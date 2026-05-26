import { signDashboardToken } from '@pillar/security';
import { getServerSession } from '../pillar-client';
import { createEventStream } from './clientFactory';

export async function tenantStream(request: Request) {
  const session = await getServerSession(request);
  if (!session) return new Response('unauthorized', { status: 401 });
  const role = session.memberships.find(m => m.tenant.id === session.active_tenant_id)?.role ?? 'viewer';
  const token = signDashboardToken({ tenant_id: session.active_tenant_id, user_id: session.user.id, role: role as any, livemode: Boolean((session as any).livemode) }, { secret: process.env.PILLAR_DASHBOARD_JWT_SECRET ?? process.env.PILLAR_INTERNAL_JWT_SECRET ?? 'dev-dashboard-secret' });
  const base = (process.env.PILLAR_API_BASE_URL ?? 'http://api:4000') + '/v1';
  const upstream = createEventStream(`/events:stream${new URL(request.url).search}`, { baseUrl: base, token, lastEventId: request.headers.get('last-event-id') ?? undefined });
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      try {
        for await (const msg of upstream) controller.enqueue(encoder.encode(`${msg.id ? `id: ${msg.id}\n` : ''}event: ${msg.event}\ndata: ${msg.data}\n\n`));
      } catch (e: any) { controller.error(e); }
    }
  }), { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform' } });
}
