-- ticket: P3.D14
-- owner: audit
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS audit_log (id text primary key, tenant_id text not null, operation_id text, request_id text, idempotency_key_hash text, action text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS audit_log_tenant_id_idx ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS audit_log_operation_id_idx ON audit_log(operation_id);
CREATE INDEX IF NOT EXISTS audit_log_request_id_idx ON audit_log(request_id);
CREATE INDEX IF NOT EXISTS audit_log_idempotency_key_hash_idx ON audit_log(idempotency_key_hash);
DROP TRIGGER IF EXISTS audit_log_set_updated_at ON audit_log;
CREATE TRIGGER audit_log_set_updated_at BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION raise_immutable_table_violation();

-- verify:
SELECT to_regclass('public.audit_log') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='audit_log_tenant_id_idx') AS ok;
-- /verify
