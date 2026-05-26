-- ticket: P3.D18
-- owner: ledger-command
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS operations (id text primary key, tenant_id text not null, operation_id text not null unique, request_id text, idempotency_key_hash text, command_id text not null unique, ledger_trace_id text, workflow_id text, ledger_offset text, status text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS operations_tenant_id_idx ON operations(tenant_id);
CREATE INDEX IF NOT EXISTS operations_operation_id_idx ON operations(operation_id);
CREATE INDEX IF NOT EXISTS operations_request_id_idx ON operations(request_id);
CREATE INDEX IF NOT EXISTS operations_idempotency_key_hash_idx ON operations(idempotency_key_hash);
DROP TRIGGER IF EXISTS operations_set_updated_at ON operations;
CREATE TRIGGER operations_set_updated_at BEFORE UPDATE ON operations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.operations') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='operations_tenant_id_idx') AS ok;
-- /verify
