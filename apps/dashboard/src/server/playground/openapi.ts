if (process.env.NODE_ENV !== 'test') await import('server-only');
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

export type PlaygroundOperation = {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
  parameters: Array<{ name: string; in: string; required?: boolean }>;
};

let cached: { operations: PlaygroundOperation[]; byId: Map<string, PlaygroundOperation> } | undefined;

export function loadPlaygroundOpenApi() {
  if (cached) return cached;
  const file = join(process.cwd(), '../../packages/api-contracts/openapi/pillar-v1.yaml');
  const doc = YAML.parse(readFileSync(file, 'utf8')) as any;
  const operations: PlaygroundOperation[] = [];
  for (const [path, item] of Object.entries<any>(doc.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = item?.[method];
      if (!op?.operationId) continue;
      operations.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        summary: op.summary ?? op.operationId,
        tags: op.tags ?? ['API'],
        parameters: (op.parameters ?? []).map((p: any) => ({ name: p.name, in: p.in, required: p.required })),
      });
    }
  }
  operations.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  cached = { operations, byId: new Map(operations.map(op => [op.operationId, op])) };
  return cached;
}

export function getPlaygroundOperation(operationId: string) {
  return loadPlaygroundOpenApi().byId.get(operationId);
}

export function defaultPlaygroundOperation() {
  return loadPlaygroundOpenApi().operations.find(op => op.method === 'POST' && op.path === '/transfer_intents') ?? loadPlaygroundOpenApi().operations[0];
}
