import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryObjectStorageProvider, PresignedUrlService, DeterministicVirusScanAdapter, canDelete } from '../src/index.js';

test('presigned upload then download', async () => { const p=new MemoryObjectStorageProvider('minio'); const svc=new PresignedUrlService(p); assert.match(await svc.upload('a',30), /upload/); assert.match(await svc.download('a',30), /download/); });
test('virus scan and retention', async () => { assert.equal((await new DeterministicVirusScanAdapter().scan('eicar.txt')).state,'infected'); assert.equal(canDelete({retainUntil:new Date(Date.now()-1), legalHold:false, worm:true}), true); });
