-- ticket: P3.D25
-- owner: webhook-dispatcher
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS webhook_endpoints (id text primary key, tenant_id text not null, url text not null, secret_hash text not null, secret_last4 text not null, enabled boolean not null default true, api_version text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS webhook_endpoints_tenant_id_idx ON webhook_endpoints(tenant_id);
DROP TRIGGER IF EXISTS webhook_endpoints_set_updated_at ON webhook_endpoints;
CREATE TRIGGER webhook_endpoints_set_updated_at BEFORE UPDATE ON webhook_endpoints FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.webhook_endpoints') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='webhook_endpoints_tenant_id_idx') AS ok;
-- /verify
