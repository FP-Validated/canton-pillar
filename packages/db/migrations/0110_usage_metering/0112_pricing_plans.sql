create table if not exists pricing_plans (
  id text primary key check (id like 'plan_%'),
  tenant_id text,
  name text not null,
  status text not null check (status in ('draft','published','retired')),
  currency text not null,
  meter_config jsonb not null default '{}'::jsonb,
  provider_price_map jsonb not null default '{}'::jsonb,
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- verify: select 1 from information_schema.tables where table_name='pricing_plans';
