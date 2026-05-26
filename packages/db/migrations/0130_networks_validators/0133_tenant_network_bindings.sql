create table if not exists network.tenant_network_bindings (
  id text primary key check (id ~ '^tnb_[0-9A-HJKMNP-TV-Z]{26}$'),
  tenant_id text not null references tenants(id),
  network_id text not null references network.networks(id),
  default_validator_id text not null references network.validators(id),
  fallback_validator_id text references network.validators(id),
  livemode boolean not null,
  status text not null default 'active' check (status in ('active','paused','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, network_id),
  constraint tenant_network_bindings_distinct_validators_chk check (fallback_validator_id is null or fallback_validator_id <> default_validator_id)
);

create index if not exists tenant_network_bindings_tenant_idx on network.tenant_network_bindings (tenant_id);
create index if not exists tenant_network_bindings_network_idx on network.tenant_network_bindings (network_id);
create index if not exists tenant_network_bindings_default_validator_idx on network.tenant_network_bindings (default_validator_id);
create index if not exists tenant_network_bindings_fallback_validator_idx on network.tenant_network_bindings (fallback_validator_id);

drop trigger if exists tenant_network_bindings_set_updated_at on network.tenant_network_bindings;
create trigger tenant_network_bindings_set_updated_at before update on network.tenant_network_bindings for each row execute function set_updated_at();

-- verify:
select to_regclass('network.tenant_network_bindings') is not null as ok;
select exists (select 1 from pg_indexes where schemaname='network' and indexname='tenant_network_bindings_tenant_idx') as ok;
-- /verify
