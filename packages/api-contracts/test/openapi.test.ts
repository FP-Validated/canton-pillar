import test from 'node:test';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import { buildOpenApi, expectedPaths } from '../src/build-openapi.js';
test('generated OpenAPI validates and contains expected paths', async () => { const doc = buildOpenApi() as any; await SwaggerParser.validate(doc); for (const path of expectedPaths) assert.ok(doc.paths[path], path); });
