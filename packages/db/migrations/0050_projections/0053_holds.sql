-- ticket: P3.D22
-- owner: projection-worker
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: yes

CREATE TABLE IF NOT EXISTS holds (id text primary key, tenant_id text not null, account_id text, asset_id text, amount numeric(38,18) not null, status text not null, as_of_ledger_offset text, as_of_ledger_time timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS holds_tenant_id_idx ON holds(tenant_id);
CREATE INDEX IF NOT EXISTS holds_ledger_offset_idx ON holds(as_of_ledger_offset);
DROP TRIGGER IF EXISTS holds_set_updated_at ON holds;
CREATE TRIGGER holds_set_updated_at BEFORE UPDATE ON holds FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.holds') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='holds_tenant_id_idx') AS ok;
-- /verify
