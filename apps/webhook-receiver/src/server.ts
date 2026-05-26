import express, { type Express, type Request, type Response } from 'express';

export interface CapturedRequest {
  receivedAt: string;
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  bodyRaw: string;
  bodyJson: unknown;
}

export interface ReceiverOptions {
  capacity?: number;
}

export function buildReceiver(options: ReceiverOptions = {}): {
  app: Express;
  captured: CapturedRequest[];
} {
  const capacity = options.capacity ?? 100;
  const captured: CapturedRequest[] = [];
  const app = express();

  app.use(
    express.raw({
      type: () => true,
      limit: '5mb',
    }),
  );

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', captured: captured.length, capacity });
  });

  app.get('/capture', (_req: Request, res: Response) => {
    res.json({ count: captured.length, items: captured });
  });

  app.delete('/capture', (_req: Request, res: Response) => {
    captured.length = 0;
    res.json({ cleared: true });
  });

  app.post(/^\/capture(\/.*)?$/, captureHandler(captured, capacity));

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  return { app, captured };
}

function captureHandler(captured: CapturedRequest[], capacity: number) {
  return (req: Request, res: Response): void => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : '';
    let bodyJson: unknown = null;
    try {
      bodyJson = raw.length > 0 ? JSON.parse(raw) : null;
    } catch {
      bodyJson = null;
    }
    const entry: CapturedRequest = {
      receivedAt: new Date().toISOString(),
      method: req.method,
      path: req.path,
      headers: req.headers as Record<string, string | string[] | undefined>,
      bodyRaw: raw,
      bodyJson,
    };
    captured.push(entry);
    while (captured.length > capacity) captured.shift();
    res.status(202).json({ accepted: true, index: captured.length - 1 });
  };
}
