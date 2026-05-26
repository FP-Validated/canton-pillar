-- ticket: P3.D03
-- owner: api
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS idempotency_keys (tenant_id text not null, idempotency_key_hash text not null, request_hash text not null, method text not null, path_template text not null, api_version text not null, status text not null check (status in ('in_progress','completed')), response_status integer, response_body jsonb, operation_id text, request_id text, locked_until timestamptz, expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(tenant_id,idempotency_key_hash));
CREATE INDEX IF NOT EXISTS idempotency_keys_tenant_id_idx ON idempotency_keys(tenant_id);
DROP TRIGGER IF EXISTS idempotency_keys_set_updated_at ON idempotency_keys;
CREATE TRIGGER idempotency_keys_set_updated_at BEFORE UPDATE ON idempotency_keys FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.idempotency_keys') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idempotency_keys_tenant_id_idx') AS ok;
-- /verify
