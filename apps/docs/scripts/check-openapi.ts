import { createHash } from 'node:crypto'; import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'; import { dirname, join } from 'node:path';
const spec = readFileSync(join(process.cwd(), '../../packages/api-contracts/openapi/pillar-v1.yaml'));
const checksum = createHash('sha256').update(spec).digest('hex');
const out = join(process.cwd(), 'dist/openapi-manifest.json'); mkdirSync(dirname(out), { recursive:true }); writeFileSync(out, JSON.stringify({ checksum }, null, 2));
const rendered = JSON.parse(readFileSync(out, 'utf8')); if (rendered.checksum !== checksum) throw new Error('OpenAPI checksum mismatch'); console.log(`openapi checksum ${checksum}`);
