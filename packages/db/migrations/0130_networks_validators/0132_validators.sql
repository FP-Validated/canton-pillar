create table if not exists network.validators (
  id text primary key check (id ~ '^val_[0-9A-HJKMNP-TV-Z]{26}$'),
  provider_id text not null references network.validator_providers(id),
  network_id text not null references network.networks(id),
  display_name text not null,
  participant_endpoint_ref text not null,
  jwt_issuer text,
  tls_profile text,
  capacity_tier text not null default 'standard',
  regions text[] not null default array[]::text[],
  status text not null default 'disabled' check (status in ('active','degraded','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, network_id, display_name)
);

create index if not exists validators_provider_idx on network.validators (provider_id);
create index if not exists validators_network_status_idx on network.validators (network_id, status);
create index if not exists validators_regions_idx on network.validators using gin (regions);

drop trigger if exists validators_set_updated_at on network.validators;
create trigger validators_set_updated_at before update on network.validators for each row execute function set_updated_at();

-- verify:
select to_regclass('network.validators') is not null as ok;
select exists (select 1 from pg_indexes where schemaname='network' and indexname='validators_network_status_idx') as ok;
-- /verify
