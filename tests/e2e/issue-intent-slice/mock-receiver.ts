import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { verifyWebhookSignature } from '../../../packages/security/src/webhook/index.js';

export type CapturedWebhook = {
  method: string;
  path: string;
  rawBody: string;
  signature: string | undefined;
  verified: boolean;
  verification: ReturnType<typeof verifyWebhookSignature>;
  receivedAt: string;
};

export type MockReceiver = {
  url: string;
  secret: string;
  received: CapturedWebhook[];
  close: () => Promise<void>;
};

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function startMockReceiver(secret = process.env.PILLAR_WEBHOOK_ENDPOINT_SECRET ?? 'plr_whsec_vertical_slice'): Promise<MockReceiver> {
  const received: CapturedWebhook[] = [];
  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const raw = await readBody(req);
    const signature = req.headers['pillar-signature'];
    const header = Array.isArray(signature) ? signature.join(',') : signature;
    const verification = verifyWebhookSignature(raw, header, [secret]);
    received.push({
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      rawBody: raw.toString('utf8'),
      signature: header,
      verified: verification.ok,
      verification,
      receivedAt: new Date().toISOString(),
    });
    res.writeHead(verification.ok ? 200 : 400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: verification.ok }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('mock receiver did not bind to a TCP port');
  return {
    url: `http://127.0.0.1:${address.port}/webhooks/pillar`,
    secret,
    received,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const receiver = await startMockReceiver();
  console.log(JSON.stringify({ url: receiver.url, secret: receiver.secret }));
}
