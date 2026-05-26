import assert from 'node:assert/strict';
import test from 'node:test';
import one from '../src/webhook/test-vectors/one-secret.json' assert { type: 'json' };
import multi from '../src/webhook/test-vectors/multiple-active-secrets.json' assert { type: 'json' };
import stale from '../src/webhook/test-vectors/stale-timestamp.json' assert { type: 'json' };
import malformed from '../src/webhook/test-vectors/malformed-header.json' assert { type: 'json' };
import mismatch from '../src/webhook/test-vectors/raw-body-mismatch.json' assert { type: 'json' };
import { verifyWebhookSignature } from '../src/index.js';

const vectors = [one, multi, stale, malformed, mismatch] as unknown as Array<{ name:string; timestamp:number; rawBody:string; secrets:string[]; header:string; valid:boolean; now?:number; reason?:string }>;
for (const vector of vectors) {
  test(`verifies ${vector.name}`, () => {
    const result = verifyWebhookSignature(vector.rawBody, vector.header, vector.secrets, 300, () => vector.now ?? vector.timestamp * 1000);
    assert.equal(result.ok, vector.valid);
    if (!vector.valid) assert.equal((result as { reason: string }).reason, vector.reason);
  });
}
