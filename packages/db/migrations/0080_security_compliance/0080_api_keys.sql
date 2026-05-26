-- ticket: P8
-- owner: security-compliance
-- forward-only: yes
CREATE SCHEMA IF NOT EXISTS config;
CREATE TABLE IF NOT EXISTS config.api_keys (id text primary key, tenant_id text not null, account_id text not null, mode text not null check (mode in ('test','live')), key_type text not null check (key_type in ('sk','rk','pk')), prefix text not null, last4 text not null, secret_hash text not null, hash_algorithm text not null default 'argon2id', hash_version integer not null default 1, pepper_id text not null, scopes jsonb not null default '[]'::jsonb, constraints jsonb not null default '{}'::jsonb, status text not null default 'active' check (status in ('active','expired','revoked')), expires_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(prefix));
CREATE INDEX IF NOT EXISTS api_keys_tenant_account_idx ON config.api_keys(tenant_id,account_id,mode,status);
CREATE INDEX IF NOT EXISTS api_keys_prefix_idx ON config.api_keys(prefix);
-- verify:
SELECT to_regclass('config.api_keys') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='config' AND table_name='api_keys' AND column_name='secret_hash') AS ok;
-- /verify
