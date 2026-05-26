-- ticket: P3.D25
-- owner: webhook-dispatcher
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS event_log (id text primary key, tenant_id text not null, operation_id text, request_id text, idempotency_key_hash text, event_type text not null, payload jsonb not null, as_of_ledger_offset text, as_of_ledger_time timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS event_log_tenant_id_idx ON event_log(tenant_id);
CREATE INDEX IF NOT EXISTS event_log_operation_id_idx ON event_log(operation_id);
CREATE INDEX IF NOT EXISTS event_log_request_id_idx ON event_log(request_id);
CREATE INDEX IF NOT EXISTS event_log_idempotency_key_hash_idx ON event_log(idempotency_key_hash);
CREATE INDEX IF NOT EXISTS event_log_ledger_offset_idx ON event_log(as_of_ledger_offset);
DROP TRIGGER IF EXISTS event_log_set_updated_at ON event_log;
CREATE TRIGGER event_log_set_updated_at BEFORE UPDATE ON event_log FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS event_log_immutable ON event_log;
CREATE TRIGGER event_log_immutable BEFORE UPDATE OR DELETE ON event_log FOR EACH ROW EXECUTE FUNCTION raise_immutable_table_violation();

-- verify:
SELECT to_regclass('public.event_log') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='event_log_tenant_id_idx') AS ok;
-- /verify
