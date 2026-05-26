import { buildReceiver } from './server.js';

const port = Number.parseInt(process.env.PORT ?? '9090', 10);
const capacity = Number.parseInt(process.env.CAPACITY ?? '100', 10);
const { app } = buildReceiver({ capacity });

app.listen(port, () => {
  console.log(`pillar webhook-receiver listening on :${port} (capacity=${capacity})`);
});
