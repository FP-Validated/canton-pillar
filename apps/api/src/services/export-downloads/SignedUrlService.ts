export function createSignedUrl(job: { id:string; tenant_id:string; sha256:string }, ttlSeconds = 900) {
  if (ttlSeconds <= 0 || ttlSeconds > 3600) throw Object.assign(new Error('signed URL TTL out of bounds'), { code: 'invalid_ttl' });
  return { id: job.id, object: 'export_download_url', url: `https://storage.pillar.local/${job.tenant_id}/${job.id}?ttl=${ttlSeconds}&hash=${job.sha256}`, expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
}
