import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import YAML from 'yaml';
import { expectedPaths } from '../src/build-openapi.js';

const file = join(process.cwd(), 'openapi/pillar-v1.yaml');
const doc = YAML.parse(readFileSync(file, 'utf8'));
await SwaggerParser.validate(doc);
const missing = expectedPaths.filter((path) => !doc.paths?.[path]);
if (missing.length) throw new Error(`Missing OpenAPI paths: ${missing.join(', ')}`);
console.log(`OpenAPI valid with ${Object.keys(doc.paths).length} paths`);
