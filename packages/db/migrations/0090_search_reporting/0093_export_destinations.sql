create table if not exists export_destinations (
  id text primary key check (id like 'expdest_%'), tenant_id text not null, livemode boolean not null,
  type text not null, name text not null, config jsonb not null default '{}'::jsonb, secret_ref text,
  disabled_at timestamptz, created_by_api_key_id text not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists export_destinations_tenant_created_idx on export_destinations(tenant_id, created_at desc);
create table if not exists export_destination_audit (id bigserial primary key, tenant_id text not null, export_destination_id text not null references export_destinations(id), action text not null, actor_api_key_id text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
-- verify: select 1 from information_schema.tables where table_name in ('export_destinations','export_destination_audit');
