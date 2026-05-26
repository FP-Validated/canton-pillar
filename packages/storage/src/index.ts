export interface ObjectStorageProvider { name: string; exists(key: string): Promise<boolean>; presignUpload(key: string, ttlSeconds: number): Promise<string>; presignDownload(key: string, ttlSeconds: number): Promise<string>; }
export class MemoryObjectStorageProvider implements ObjectStorageProvider { constructor(public name='memory', private keys = new Set<string>()) {} async exists(key:string){ return this.keys.has(key); } async presignUpload(key:string, ttlSeconds:number){ this.keys.add(key); return `https://storage.local/${this.name}/${encodeURIComponent(key)}?op=upload&ttl=${ttlSeconds}`; } async presignDownload(key:string, ttlSeconds:number){ if(!await this.exists(key)) throw new Error('Object missing'); return `https://storage.local/${this.name}/${encodeURIComponent(key)}?op=download&ttl=${ttlSeconds}`; } }
export { MemoryObjectStorageProvider as S3Provider } from './providers/s3.js';
export { MemoryObjectStorageProvider as GcsProvider } from './providers/gcs.js';
export { MemoryObjectStorageProvider as AzureProvider } from './providers/azure.js';
export { MemoryObjectStorageProvider as MinioProvider } from './providers/minio.js';
export * from './presign/PresignedUrlService.js';
export * from './scan/VirusScanAdapter.js';
export * from './retention/RetentionPolicy.js';
