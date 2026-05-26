import type { FastifyInstance } from 'fastify';
import { SUPPORTED_API_VERSION, type Config } from '../config.js';
import { PillarError } from '../errors/pillar-error.js';
export async function registerApiVersion(server: FastifyInstance, config: Config) {
  server.addHook('preHandler', async (request, reply) => {
    const version = (request.headers['pillar-version'] as string | undefined) ?? config.apiVersion ?? (request.headers['x-pillar-sdk-pinned-version'] as string | undefined) ?? SUPPORTED_API_VERSION;
    if (version !== SUPPORTED_API_VERSION) throw PillarError.version();
    request.apiVersion = version;
    reply.header('Pillar-Version', version).header('Pillar-Mode', request.auth?.livemode ? 'live' : 'test');
  });
}
