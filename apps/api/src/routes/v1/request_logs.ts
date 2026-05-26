import type { FastifyInstance } from 'fastify';
import { renderList } from '../../http/pagination.js';
export async function requestLogsRoutes(s: FastifyInstance){ s.get('/request_logs', async r=>renderList('/v1/request_logs',[{ id:r.requestId, object:'request_log', livemode:r.auth.livemode, api_key_id:r.auth.keyId, principal_id:r.auth.keyId, operation_id:null, masked_request_hash:'sha256:local', scope_decision:{allowed:true}, constraint_decision:{allowed:true}, created:new Date().toISOString() }])); }
