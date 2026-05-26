create extension if not exists citext;
create schema if not exists identity;
create table if not exists identity.invitations (
  id text primary key check (id ~ '^inv_[0-9A-HJKMNP-TV-Z]{26}$'),
  tenant_id text not null references identity.tenants(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('tenant_owner','tenant_admin','tenant_developer','tenant_viewer')),
  invited_by_user_id text references identity.users(id),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists identity_invitations_tenant_idx on identity.invitations (tenant_id, status);
create index if not exists identity_invitations_email_idx on identity.invitations (email);
-- verify: select 1 from information_schema.tables where table_schema = 'identity' and table_name = 'invitations';
