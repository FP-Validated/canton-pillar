-- ticket: P3.D19
-- owner: ledger-command
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS ledger_command_requests (id text primary key, tenant_id text not null, operation_id text, request_id text, idempotency_key_hash text, command_id text not null, payload jsonb not null, status text not null default 'queued', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS ledger_command_requests_tenant_id_idx ON ledger_command_requests(tenant_id);
CREATE INDEX IF NOT EXISTS ledger_command_requests_operation_id_idx ON ledger_command_requests(operation_id);
CREATE INDEX IF NOT EXISTS ledger_command_requests_request_id_idx ON ledger_command_requests(request_id);
CREATE INDEX IF NOT EXISTS ledger_command_requests_idempotency_key_hash_idx ON ledger_command_requests(idempotency_key_hash);
DROP TRIGGER IF EXISTS ledger_command_requests_set_updated_at ON ledger_command_requests;
CREATE TRIGGER ledger_command_requests_set_updated_at BEFORE UPDATE ON ledger_command_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.ledger_command_requests') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ledger_command_requests_tenant_id_idx') AS ok;
-- /verify
