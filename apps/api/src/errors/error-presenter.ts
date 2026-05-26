import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { PillarError } from './pillar-error.js';

export function renderError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const requestId = request.requestId ?? 'req_unknown';
  let e: PillarError;
  if (error instanceof PillarError) e = error;
  else if (error instanceof ZodError) e = PillarError.invalid('invalid_parameter', error.issues[0]?.message ?? 'Invalid request.', error.issues[0]?.path.join('.'));
  else e = PillarError.api(process.env.LOG_LEVEL === 'debug' && error instanceof Error ? error.message : 'Internal API error.');
  reply.status(e.statusCode).send({ error: { type: e.type, code: e.code, message: e.message, ...(e.param ? { param: e.param } : {}), request_id: requestId, doc_url: `https://docs.pillar.example/errors/${e.code}` } });
}
export const errorHandler = (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => renderError(error, request, reply);
