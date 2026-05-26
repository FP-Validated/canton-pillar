-- ticket: P3.D11
-- owner: config
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS party_mappings (id text primary key, tenant_id text not null, account_id text not null, party_hash text not null, canton_party text, classification text not null default 'internal-only', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(tenant_id, account_id, party_hash));
CREATE INDEX IF NOT EXISTS party_mappings_tenant_id_idx ON party_mappings(tenant_id);
DROP TRIGGER IF EXISTS party_mappings_set_updated_at ON party_mappings;
CREATE TRIGGER party_mappings_set_updated_at BEFORE UPDATE ON party_mappings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.party_mappings') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='party_mappings_tenant_id_idx') AS ok;
-- /verify
