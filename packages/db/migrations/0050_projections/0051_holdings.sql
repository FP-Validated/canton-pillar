-- ticket: P3.D22
-- owner: projection-worker
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: yes

CREATE TABLE IF NOT EXISTS holdings (id text primary key, tenant_id text not null, account_id text not null, asset_id text not null, available numeric(38,18) not null default 0, reserved numeric(38,18) not null default 0, pending numeric(38,18) not null default 0, total numeric(38,18) not null default 0, as_of_ledger_offset text, as_of_ledger_time timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS holdings_tenant_id_idx ON holdings(tenant_id);
CREATE INDEX IF NOT EXISTS holdings_ledger_offset_idx ON holdings(as_of_ledger_offset);
DROP TRIGGER IF EXISTS holdings_set_updated_at ON holdings;
CREATE TRIGGER holdings_set_updated_at BEFORE UPDATE ON holdings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
GRANT SELECT ON holdings TO api;

-- verify:
SELECT to_regclass('public.holdings') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='holdings_tenant_id_idx') AS ok;
-- /verify
