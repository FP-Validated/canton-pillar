-- ticket: P3.D27
-- owner: reconciler
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS reconciliation_diffs (id text primary key, tenant_id text not null, run_id text not null, diff_type text not null, amount_delta numeric(38,18), details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS reconciliation_diffs_tenant_id_idx ON reconciliation_diffs(tenant_id);
DROP TRIGGER IF EXISTS reconciliation_diffs_set_updated_at ON reconciliation_diffs;
CREATE TRIGGER reconciliation_diffs_set_updated_at BEFORE UPDATE ON reconciliation_diffs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.reconciliation_diffs') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='reconciliation_diffs_tenant_id_idx') AS ok;
-- /verify
