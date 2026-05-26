-- ticket: P8
-- owner: security-compliance
-- forward-only: yes
CREATE TABLE IF NOT EXISTS config.oidc_sessions (id text primary key, tenant_id text not null, account_id text not null, mode text not null check(mode in ('test','live')), issuer text not null, subject text not null, audience text not null, nonce_hash text not null, state_hash text not null, claims jsonb not null default '{}'::jsonb, scopes jsonb not null default '[]'::jsonb, status text not null check(status in ('pending','exchanged','expired','revoked')), expires_at timestamptz not null, created_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS oidc_sessions_expiry_idx ON config.oidc_sessions(expires_at,status);
-- verify:
SELECT to_regclass('config.oidc_sessions') IS NOT NULL AS ok;
-- /verify
