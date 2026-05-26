-- ticket: P3.D21
-- owner: projection-worker
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: yes

CREATE TABLE IF NOT EXISTS balances (id text primary key, tenant_id text not null, account_id text not null, asset_id text not null, available numeric(38,18) not null default 0, pending numeric(38,18) not null default 0, reserved numeric(38,18) not null default 0, as_of_ledger_offset text, as_of_ledger_time timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS balances_tenant_id_idx ON balances(tenant_id);
CREATE INDEX IF NOT EXISTS balances_ledger_offset_idx ON balances(as_of_ledger_offset);
DROP TRIGGER IF EXISTS balances_set_updated_at ON balances;
CREATE TRIGGER balances_set_updated_at BEFORE UPDATE ON balances FOR EACH ROW EXECUTE FUNCTION set_updated_at();
GRANT SELECT ON balances TO api;

-- verify:
SELECT to_regclass('public.balances') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='balances_tenant_id_idx') AS ok;
-- /verify
