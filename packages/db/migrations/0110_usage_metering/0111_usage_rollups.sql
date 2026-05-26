create table if not exists usage_rollups (
  id text primary key,
  tenant_id text not null,
  environment_id text not null,
  livemode boolean not null,
  meter text not null,
  granularity text not null check (granularity in ('hour','day','month')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  quantity numeric(38, 18) not null default 0,
  event_count bigint not null default 0,
  source_checksum text not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, environment_id, meter, granularity, period_start, period_end)
);

create table if not exists usage_reconciliation_diffs (
  id text primary key,
  tenant_id text not null,
  environment_id text not null,
  meter text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  expected_quantity numeric(38,18) not null,
  actual_quantity numeric(38,18) not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

-- verify: select 1 from information_schema.tables where table_name='usage_rollups';
