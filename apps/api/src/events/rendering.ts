import { requireKnownEventType } from './registry.js';
export type RenderMode = 'thin' | 'snapshot';
export function renderEvent(event: any, mode: RenderMode = 'thin', apiVersion = event.api_version ?? '2026-05-26') {
  requireKnownEventType(event.type);
  const source = event.payload ?? event.data?.object ?? event.object_payload ?? { id: event.object_id ?? event.id.replace('evt_', 'obj_'), object: event.type.split('.')[0] };
  const object = mode === 'snapshot' ? source : { id: source.id ?? event.object_id ?? event.id, object: source.object ?? event.type.split('.')[0], url: `/v1/${(source.object ?? event.type.split('.')[0])}s/${source.id ?? event.object_id ?? event.id}` };
  return { id: event.id, object: 'event', created: event.created ?? event.created_at ?? new Date().toISOString(), livemode: !!event.livemode, type: event.type, api_version: apiVersion, data: { object, previous_attributes: event.previous_attributes ?? {} }, request: { id: event.request_id ?? 'req_01HY4Z7Z7Z7Z7Z7Z7Z7Z7Z7ZR', idempotency_key: event.idempotency_key }, metadata: event.metadata ?? {} };
}
