import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import { loadConfig } from './config.js';
import { registerRequestId } from './middleware/request-id.js';
import { registerAuth } from './middleware/auth.js';
import { registerApiVersion } from './middleware/api-version.js';
import { registerRateLimit } from './middleware/rate-limit.js';
import { registerIdempotency } from './middleware/idempotency.js';
import { registerAudit } from './middleware/audit.js';
import { registerEtag } from './middleware/etag.js';
import { registerCacheControl } from './middleware/cache-control.js';
import { registerNetwork } from './middleware/network.js';
import { v1Routes } from './routes/v1/index.js';
import { errorHandler } from './errors/error-presenter.js';
import './types.js';
export async function createServer(){ const config=loadConfig(); const server=Fastify({ logger:false, serializerOpts:{ rounding:'ceil' }, ajv:{ customOptions:{ removeAdditional:false } } });
 server.setSerializerCompiler(() => data => JSON.stringify(data, (_k,v)=>v===undefined?undefined:v));
 server.setErrorHandler(errorHandler); await registerRequestId(server); await registerAuth(server); await registerApiVersion(server,config); await registerNetwork(server); await registerRateLimit(server); await registerIdempotency(server); await registerAudit(server); await registerEtag(server); await registerCacheControl(server); await server.register(v1Routes,{prefix:'/v1'}); return server; }
