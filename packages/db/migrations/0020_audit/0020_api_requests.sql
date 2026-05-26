-- ticket: P3.D13
-- owner: api
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS api_requests (id text primary key, tenant_id text not null, operation_id text, request_id text not null unique, idempotency_key_hash text, method text not null, path_template text not null, api_version text not null, response_status integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS api_requests_tenant_id_idx ON api_requests(tenant_id);
CREATE INDEX IF NOT EXISTS api_requests_operation_id_idx ON api_requests(operation_id);
CREATE INDEX IF NOT EXISTS api_requests_request_id_idx ON api_requests(request_id);
CREATE INDEX IF NOT EXISTS api_requests_idempotency_key_hash_idx ON api_requests(idempotency_key_hash);
DROP TRIGGER IF EXISTS api_requests_set_updated_at ON api_requests;
CREATE TRIGGER api_requests_set_updated_at BEFORE UPDATE ON api_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
GRANT SELECT, INSERT, UPDATE ON api_requests TO api;

-- verify:
SELECT to_regclass('public.api_requests') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='api_requests_tenant_id_idx') AS ok;
-- /verify
