-- ticket: P8
-- owner: security-compliance
-- forward-only: yes
CREATE TABLE IF NOT EXISTS audit.sanctions_lists (id text primary key, provider text not null, list_name text not null, version text not null, content_hash text not null, entry_count integer not null, ingested_at timestamptz not null default now(), active boolean not null default false, unique(provider,list_name,version));
-- verify:
SELECT to_regclass('audit.sanctions_lists') IS NOT NULL AS ok;
-- /verify
