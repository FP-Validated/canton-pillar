-- ticket: P3.D12
-- owner: config
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS api_versions (id text primary key, tenant_id text not null, account_id text, api_version text not null, is_default boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS api_versions_tenant_id_idx ON api_versions(tenant_id);
DROP TRIGGER IF EXISTS api_versions_set_updated_at ON api_versions;
CREATE TRIGGER api_versions_set_updated_at BEFORE UPDATE ON api_versions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.api_versions') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='api_versions_tenant_id_idx') AS ok;
-- /verify
