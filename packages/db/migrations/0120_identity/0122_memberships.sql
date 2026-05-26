create schema if not exists identity;
create table if not exists identity.memberships (
  id text primary key check (id ~ '^mem_[0-9A-HJKMNP-TV-Z]{26}$'),
  tenant_id text not null references identity.tenants(id) on delete cascade,
  user_id text not null references identity.users(id) on delete cascade,
  role text not null check (role in ('super_admin','tenant_owner','tenant_admin','tenant_developer','tenant_viewer')),
  status text not null default 'active' check (status in ('active','invited','disabled')),
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index if not exists identity_memberships_user_idx on identity.memberships (user_id);
create index if not exists identity_memberships_tenant_role_idx on identity.memberships (tenant_id, role);
-- verify: select 1 from information_schema.tables where table_schema = 'identity' and table_name = 'memberships';
