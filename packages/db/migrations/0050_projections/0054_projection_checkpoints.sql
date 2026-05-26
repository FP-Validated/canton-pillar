-- ticket: P3.D23
-- owner: projection-worker
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: yes

CREATE TABLE IF NOT EXISTS projection_checkpoints (id text primary key, tenant_id text not null, projection_name text not null, as_of_ledger_offset text, as_of_ledger_time timestamptz, lease_owner text, lease_fencing_token bigint not null default 0, lease_expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS projection_checkpoints_tenant_id_idx ON projection_checkpoints(tenant_id);
CREATE INDEX IF NOT EXISTS projection_checkpoints_ledger_offset_idx ON projection_checkpoints(as_of_ledger_offset);
DROP TRIGGER IF EXISTS projection_checkpoints_set_updated_at ON projection_checkpoints;
CREATE TRIGGER projection_checkpoints_set_updated_at BEFORE UPDATE ON projection_checkpoints FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.projection_checkpoints') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='projection_checkpoints_tenant_id_idx') AS ok;
-- /verify
