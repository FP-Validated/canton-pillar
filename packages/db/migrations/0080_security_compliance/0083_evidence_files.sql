-- ticket: P8
-- owner: security-compliance
-- forward-only: yes
CREATE TABLE IF NOT EXISTS audit.evidence_files (id text primary key, tenant_id text not null, account_id text not null, mode text not null check(mode in ('test','live')), storage_provider text not null, storage_object_key_ref text not null, content_hash text not null, content_hash_visibility text not null check(content_hash_visibility in ('public','masked','internal')), evidence_status text not null check(evidence_status in ('pending_upload','uploaded','scan_pending','clean','infected','quarantined','deleted')), retention_policy text not null, retain_until timestamptz not null, legal_hold boolean not null default false, linked_object_type text, linked_object_id text, created_at timestamptz not null default now(), unique(storage_provider,storage_object_key_ref));
CREATE INDEX IF NOT EXISTS evidence_files_link_idx ON audit.evidence_files(linked_object_type,linked_object_id);
-- verify:
SELECT to_regclass('audit.evidence_files') IS NOT NULL AS ok;
-- /verify
