import pg from 'pg';
import type { SseBroker } from './Broker.js';

type TailerOptions = { connectionString?: string; tenantId: string; livemode: boolean; pollMs?: number };

export class EventLogTailer {
  private stopped = false;
  private lastSeen = new Date(0);
  private listener?: pg.Client;
  private pollTimer?: NodeJS.Timeout;
  constructor(private readonly broker: SseBroker, private readonly options: TailerOptions) {}

  async start() {
    try {
      this.listener = new pg.Client({ connectionString: this.options.connectionString ?? process.env.DATABASE_URL });
      await this.listener.connect();
      await this.listener.query('LISTEN "pillar.event_log"');
      this.listener.on('notification', msg => { void this.handleNotification(msg.payload ?? ''); });
    } catch {
      await this.listener?.end().catch(() => undefined);
      this.listener = undefined;
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    await this.listener?.end().catch(() => undefined);
  }

  private async handleNotification(payload: string) {
    const [tenantId, mode, eventId] = payload.split(':');
    if (tenantId !== this.options.tenantId || (mode === 'live') !== this.options.livemode || !eventId?.startsWith('evt_')) return;
    await this.pollOnce();
  }

  private schedulePoll() {
    if (this.stopped) return;
    this.pollTimer = setTimeout(async () => { await this.pollOnce().catch(() => undefined); this.schedulePoll(); }, this.options.pollMs ?? 1000);
  }

  async pollOnce() {
    const client = new pg.Client({ connectionString: this.options.connectionString ?? process.env.DATABASE_URL });
    await client.connect();
    try {
      const res = await client.query(
        'select id, type, payload, created_at from event_log where tenant_id=$1 and livemode=$2 and created_at>$3 order by created_at asc limit 512',
        [this.options.tenantId, this.options.livemode, this.lastSeen]
      );
      for (const row of res.rows) {
        this.lastSeen = row.created_at;
        this.broker.publish(this.options.tenantId, this.options.livemode, { id: row.id, type: row.type, data: row.payload, ts: new Date(row.created_at).getTime() });
      }
    } finally { await client.end(); }
  }
}
