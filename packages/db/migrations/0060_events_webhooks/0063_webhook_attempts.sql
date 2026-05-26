-- ticket: P3.D25
-- owner: webhook-dispatcher
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS webhook_attempts (id text primary key, tenant_id text not null, operation_id text, request_id text, idempotency_key_hash text, delivery_id text not null, attempt integer not null, response_status integer, response_body_preview text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS webhook_attempts_tenant_id_idx ON webhook_attempts(tenant_id);
CREATE INDEX IF NOT EXISTS webhook_attempts_operation_id_idx ON webhook_attempts(operation_id);
CREATE INDEX IF NOT EXISTS webhook_attempts_request_id_idx ON webhook_attempts(request_id);
CREATE INDEX IF NOT EXISTS webhook_attempts_idempotency_key_hash_idx ON webhook_attempts(idempotency_key_hash);
DROP TRIGGER IF EXISTS webhook_attempts_set_updated_at ON webhook_attempts;
CREATE TRIGGER webhook_attempts_set_updated_at BEFORE UPDATE ON webhook_attempts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS webhook_attempts_immutable ON webhook_attempts;
CREATE TRIGGER webhook_attempts_immutable BEFORE UPDATE OR DELETE ON webhook_attempts FOR EACH ROW EXECUTE FUNCTION raise_immutable_table_violation();

-- verify:
SELECT to_regclass('public.webhook_attempts') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='webhook_attempts_tenant_id_idx') AS ok;
-- /verify
