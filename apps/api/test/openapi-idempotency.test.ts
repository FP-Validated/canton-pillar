import test from 'node:test';
import assert from 'node:assert/strict';
import openapi from '@pillar/api-contracts/openapi/pillar-v1.json' assert { type: 'json' };

test('every mutating OpenAPI operation requires Idempotency-Key', () => {
  const missing: string[] = [];
  for (const [path, item] of Object.entries((openapi as any).paths)) {
    const post = (item as any).post;
    if (!post?.operationId) continue;
    const parameters = post.parameters ?? [];
    const idem = parameters.find((parameter: any) => parameter.name === 'Idempotency-Key' && parameter.in === 'header');
    if (!idem?.required) missing.push(`${post.operationId} ${path}`);
  }
  assert.deepEqual(missing, []);
});
