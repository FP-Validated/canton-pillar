-- ticket: P3.D25
-- owner: webhook-dispatcher
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS webhook_deliveries (id text primary key, tenant_id text not null, event_id text not null, endpoint_id text not null, status text not null, next_retry_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS webhook_deliveries_tenant_id_idx ON webhook_deliveries(tenant_id);
DROP TRIGGER IF EXISTS webhook_deliveries_set_updated_at ON webhook_deliveries;
CREATE TRIGGER webhook_deliveries_set_updated_at BEFORE UPDATE ON webhook_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.webhook_deliveries') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='webhook_deliveries_tenant_id_idx') AS ok;
-- /verify
