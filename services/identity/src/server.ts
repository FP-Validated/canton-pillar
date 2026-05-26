import Fastify from 'fastify';
export function buildServer(){const app=Fastify();app.get('/internal/identity/health',async()=>({status:'ok'}));return app}
if(import.meta.url===`file://${process.argv[1]}`){const app=buildServer();app.listen({port:Number(process.env.PORT||4015),host:'0.0.0.0'}).catch(e=>{console.error(e);process.exit(1)})}
