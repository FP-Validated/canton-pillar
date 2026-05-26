create extension if not exists citext;
create schema if not exists identity;
create table if not exists identity.tenants (
  id text primary key check (id ~ '^ten_[0-9A-HJKMNP-TV-Z]{26}$'),
  config_tenant_id text references config.tenants(id),
  slug citext not null unique,
  display_name text not null,
  plan_id text,
  billing_status text not null default 'active' check (billing_status in ('active','past_due','paused','disabled')),
  default_environment text not null default 'dev' check (default_environment in ('dev','testnet','mainnet')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists identity_tenants_config_tenant_idx on identity.tenants (config_tenant_id);
create index if not exists identity_tenants_billing_status_idx on identity.tenants (billing_status);
-- verify: select 1 from information_schema.columns where table_schema = 'identity' and table_name = 'tenants' and column_name = 'config_tenant_id';
