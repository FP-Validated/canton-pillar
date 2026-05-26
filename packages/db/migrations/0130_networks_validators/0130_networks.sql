create schema if not exists network;

create table if not exists network.networks (
  id text primary key check (id ~ '^net_[a-z0-9][a-z0-9_-]*$'),
  slug text not null unique check (slug in ('dev','testnet','mainnet','custom')),
  display_name text not null,
  kind text not null check (kind in ('devnet','testnet','mainnet','custom')),
  livemode boolean not null,
  default_synchronizer_id text,
  status text not null default 'active' check (status in ('active','paused','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into network.networks (id, slug, display_name, kind, livemode, default_synchronizer_id, status)
values
  ('net_dev', 'dev', 'Canton Devnet', 'devnet', false, 'sync_dev', 'active'),
  ('net_testnet', 'testnet', 'Canton Testnet', 'testnet', false, 'sync_testnet', 'active'),
  ('net_mainnet', 'mainnet', 'Canton Mainnet', 'mainnet', true, 'sync_mainnet', 'active')
on conflict (id) do update set display_name = excluded.display_name, kind = excluded.kind, livemode = excluded.livemode, default_synchronizer_id = excluded.default_synchronizer_id, status = excluded.status;

create index if not exists networks_status_idx on network.networks (status);

drop trigger if exists networks_set_updated_at on network.networks;
create trigger networks_set_updated_at before update on network.networks for each row execute function set_updated_at();

-- verify:
select to_regclass('network.networks') is not null as ok;
select count(*) = 3 as ok from network.networks where slug in ('dev','testnet','mainnet');
-- /verify
