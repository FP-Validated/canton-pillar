-- ticket: P3.D20
-- owner: ledger-command
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS ledger_command_attempts (id text primary key, tenant_id text not null, operation_id text, request_id text, idempotency_key_hash text, submission_id text not null unique, command_id text not null, attempt integer not null, status text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS ledger_command_attempts_tenant_id_idx ON ledger_command_attempts(tenant_id);
CREATE INDEX IF NOT EXISTS ledger_command_attempts_operation_id_idx ON ledger_command_attempts(operation_id);
CREATE INDEX IF NOT EXISTS ledger_command_attempts_request_id_idx ON ledger_command_attempts(request_id);
CREATE INDEX IF NOT EXISTS ledger_command_attempts_idempotency_key_hash_idx ON ledger_command_attempts(idempotency_key_hash);
DROP TRIGGER IF EXISTS ledger_command_attempts_set_updated_at ON ledger_command_attempts;
CREATE TRIGGER ledger_command_attempts_set_updated_at BEFORE UPDATE ON ledger_command_attempts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.ledger_command_attempts') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ledger_command_attempts_tenant_id_idx') AS ok;
-- /verify
