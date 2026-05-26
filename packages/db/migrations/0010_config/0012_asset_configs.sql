-- ticket: P3.D10
-- owner: config
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS asset_configs (id text primary key, tenant_id text not null, asset_id text not null, symbol citext not null, scale integer not null, transferable boolean not null default true, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(tenant_id, asset_id));
CREATE INDEX IF NOT EXISTS asset_configs_tenant_id_idx ON asset_configs(tenant_id);
DROP TRIGGER IF EXISTS asset_configs_set_updated_at ON asset_configs;
CREATE TRIGGER asset_configs_set_updated_at BEFORE UPDATE ON asset_configs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.asset_configs') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='asset_configs_tenant_id_idx') AS ok;
-- /verify
