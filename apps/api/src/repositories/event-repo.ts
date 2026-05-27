import pg from 'pg';
import { ulid } from 'ulid';
import { renderEvent, type RenderMode } from '../events/rendering.js';

const memoryEvents: any[] = [];
const memoryReplays = new Map<string, any>();
const useMemory = () => process.env.PILLAR_DB === 'memory' || !process.env.DATABASE_URL;
let pool: pg.Pool | undefined;
function db() { return pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL }); }
function now() { return new Date().toISOString(); }
function seed(tenantId: string, livemode = false) {
  if (!memoryEvents.some(e => e.tenant_id === tenantId && e.livemode === livemode)) {
    memoryEvents.push({ id: 'evt_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZE', tenant_id: tenantId, type: 'transfer_intent.succeeded', event_type: 'transfer_intent.succeeded', livemode, created_at: now(), payload: { id: 'trint_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZE', object: 'transfer_intent', status: 'succeeded' }, request_id: 'req_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZR' });
  }
}
function fromRow(row: any) { return { ...row, type: row.event_type ?? row.type, created: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at }; }

export async function listEvents(filters: any = {}) {
  const tenantId = filters.tenantId ?? filters.accountId;
  if (!tenantId) throw new Error('tenantId required');
  if (useMemory()) {
    seed(tenantId, !!filters.livemode);
    return memoryEvents
      .filter(e => e.tenant_id === tenantId && (!filters.types?.length || filters.types.includes(e.type ?? e.event_type)) && (!('livemode' in filters) || e.livemode === filters.livemode))
      .map(e => renderEvent(fromRow(e), filters.mode ?? 'thin', filters.apiVersion));
  }
  const params: any[] = [tenantId, !!filters.livemode];
  let sql = 'select * from event_log where tenant_id=$1 and livemode=$2';
  if (filters.types?.length) { params.push(filters.types); sql += ` and event_type = any($${params.length}::text[])`; }
  sql += ' order by created_at desc, id desc limit 100';
  const result = await db().query(sql, params);
  return result.rows.map(row => renderEvent(fromRow(row), filters.mode ?? 'thin', filters.apiVersion));
}

export async function getEvent(id: string, tenantIdOrMode?: string | RenderMode, modeOrApiVersion: RenderMode | string = 'thin', apiVersion = '2026-05-26') {
  const tenantId = tenantIdOrMode === 'thin' || tenantIdOrMode === 'snapshot' || tenantIdOrMode == null ? undefined : tenantIdOrMode;
  const mode = (tenantId ? modeOrApiVersion : tenantIdOrMode) === 'snapshot' ? 'snapshot' : 'thin';
  const version = tenantId ? apiVersion : (typeof modeOrApiVersion === 'string' && modeOrApiVersion !== 'thin' && modeOrApiVersion !== 'snapshot' ? modeOrApiVersion : apiVersion);
  if (!tenantId) throw new Error('tenantId required');
  if (useMemory()) {
    seed(tenantId, false);
    const event = memoryEvents.find(e => e.tenant_id === tenantId && e.id === id);
    return event ? renderEvent(fromRow(event), mode, version) : null;
  }
  const result = await db().query('select * from event_log where tenant_id=$1 and id=$2 limit 1', [tenantId, id]);
  return result.rows[0] ? renderEvent(fromRow(result.rows[0]), mode, version) : null;
}

export async function enqueueReplay(id: string, opts: any = {}) {
  const tenantId = opts.tenantId ?? opts.accountId;
  if (!tenantId) throw new Error('tenantId required');
  const key = `${tenantId}:${id}:${opts.idempotencyKey ?? ''}`;
  if (useMemory()) {
    if (memoryReplays.has(key)) return memoryReplays.get(key);
    const event = await getEvent(id, tenantId, 'thin', opts.apiVersion);
    if (!event) return null;
    const replay = { ...event, replay: { id: `rpl_${ulid()}`, event_id: id, status: 'queued', range: { from: opts.from, to: opts.to } } };
    memoryReplays.set(key, replay);
    return replay;
  }
  const original = await db().query('select * from event_log where tenant_id=$1 and id=$2 limit 1', [tenantId, id]);
  if (!original.rows[0]) return null;
  const replayId = `evt_${ulid()}`;
  const payload = { original_event: renderEvent(fromRow(original.rows[0]), 'thin', opts.apiVersion), replay: { id: `rpl_${ulid()}`, event_id: id, status: 'queued', range: { from: opts.from, to: opts.to } } };
  await db().query('insert into event_log(id, tenant_id, operation_id, request_id, idempotency_key_hash, event_type, payload, livemode) values($1,$2,$3,$4,$5,$6,$7,$8)', [replayId, tenantId, original.rows[0].operation_id, original.rows[0].request_id, original.rows[0].idempotency_key_hash, 'event.replay_requested', payload, original.rows[0].livemode]);
  return renderEvent({ id: replayId, type: 'event.replay_requested', livemode: original.rows[0].livemode, payload, request_id: original.rows[0].request_id, created_at: now() }, 'snapshot', opts.apiVersion);
}
