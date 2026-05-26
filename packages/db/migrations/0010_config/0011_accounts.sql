-- ticket: P3.D10
-- owner: config
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS accounts (id text primary key, tenant_id text not null, livemode boolean not null default false, display_name text not null, status text not null default 'active', api_key_hash text, api_key_last4 text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS accounts_tenant_id_idx ON accounts(tenant_id);
DROP TRIGGER IF EXISTS accounts_set_updated_at ON accounts;
CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.accounts') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='accounts_tenant_id_idx') AS ok;
-- /verify
