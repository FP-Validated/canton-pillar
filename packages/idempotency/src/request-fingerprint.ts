import { canonicalRequestHash, type CanonicalRequest } from './canonical-hash.js';
export function requestFingerprint(req: CanonicalRequest) { return { method: req.method.toUpperCase(), path_template: req.path_template, api_version: req.api_version, request_hash: canonicalRequestHash(req) }; }
