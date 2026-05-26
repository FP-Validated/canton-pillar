import { createServer } from './server.js';
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
const server = await createServer();
await server.listen({ port, host });
server.log.info({ msg: 'Pillar API listening', port, host });
