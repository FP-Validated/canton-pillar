create schema if not exists identity;
create table if not exists identity.sessions (
  id text primary key check (id ~ '^sess_[0-9A-HJKMNP-TV-Z]{26}$'),
  user_id text not null references identity.users(id) on delete cascade,
  session_hash text not null unique,
  csrf_token text not null,
  active_tenant_id text references identity.tenants(id),
  ip text,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists identity_sessions_user_idx on identity.sessions (user_id);
create index if not exists identity_sessions_expires_idx on identity.sessions (expires_at) where revoked_at is null;
-- verify: select 1 from information_schema.tables where table_schema = 'identity' and table_name = 'sessions';
