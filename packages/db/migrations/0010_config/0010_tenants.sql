-- ticket: P3.D09
-- owner: config
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS tenants (id text primary key, tenant_id text not null unique, name text not null, deployment_mode text not null check (deployment_mode in ('hosted','customer-validator','self-hosted')), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS tenants_tenant_id_idx ON tenants(tenant_id);
DROP TRIGGER IF EXISTS tenants_set_updated_at ON tenants;
CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.tenants') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='tenants_tenant_id_idx') AS ok;
-- /verify
