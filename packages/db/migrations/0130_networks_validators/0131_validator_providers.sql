create table if not exists network.validator_providers (
  id text primary key check (id ~ '^valp_[0-9A-HJKMNP-TV-Z]{26}$'),
  slug citext not null unique,
  display_name text not null,
  contact_email citext not null,
  website_url text,
  deployment_modes text[] not null default array['hosted']::text[],
  status text not null default 'pending_verification' check (status in ('pending_verification','verified','paused','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint validator_providers_deployment_modes_chk check (deployment_modes <@ array['hosted','customer-validator','self-hosted']::text[] and cardinality(deployment_modes) > 0)
);

create index if not exists validator_providers_status_idx on network.validator_providers (status);
create index if not exists validator_providers_deployment_modes_idx on network.validator_providers using gin (deployment_modes);

drop trigger if exists validator_providers_set_updated_at on network.validator_providers;
create trigger validator_providers_set_updated_at before update on network.validator_providers for each row execute function set_updated_at();

-- verify:
select to_regclass('network.validator_providers') is not null as ok;
select exists (select 1 from pg_indexes where schemaname='network' and indexname='validator_providers_status_idx') as ok;
-- /verify
