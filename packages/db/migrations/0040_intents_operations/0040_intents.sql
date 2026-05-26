-- ticket: P3.D17
-- owner: ledger-command
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS intents (id text primary key, tenant_id text not null, operation_id text, request_id text, idempotency_key_hash text, intent_type text not null, status text not null, amount numeric(38,18), asset_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS intents_tenant_id_idx ON intents(tenant_id);
CREATE INDEX IF NOT EXISTS intents_operation_id_idx ON intents(operation_id);
CREATE INDEX IF NOT EXISTS intents_request_id_idx ON intents(request_id);
CREATE INDEX IF NOT EXISTS intents_idempotency_key_hash_idx ON intents(idempotency_key_hash);
DROP TRIGGER IF EXISTS intents_set_updated_at ON intents;
CREATE TRIGGER intents_set_updated_at BEFORE UPDATE ON intents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.intents') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='intents_tenant_id_idx') AS ok;
-- /verify
