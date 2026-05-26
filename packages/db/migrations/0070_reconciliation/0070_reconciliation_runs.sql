-- ticket: P3.D27
-- owner: reconciler
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS reconciliation_runs (id text primary key, tenant_id text not null, status text not null, started_at timestamptz not null default now(), completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS reconciliation_runs_tenant_id_idx ON reconciliation_runs(tenant_id);
DROP TRIGGER IF EXISTS reconciliation_runs_set_updated_at ON reconciliation_runs;
CREATE TRIGGER reconciliation_runs_set_updated_at BEFORE UPDATE ON reconciliation_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.reconciliation_runs') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='reconciliation_runs_tenant_id_idx') AS ok;
-- /verify
