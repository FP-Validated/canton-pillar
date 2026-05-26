create table if not exists usage_events (
  id text not null,
  tenant_id text not null,
  environment_id text not null,
  deployment_mode text not null,
  livemode boolean not null,
  meter text not null,
  quantity numeric(38, 18) not null check (quantity >= 0),
  unit text not null,
  source_service text not null,
  source_event_time timestamptz not null,
  request_id text,
  operation_id text,
  dedupe_key text not null,
  billable boolean not null default true,
  attributes jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  primary key (id, source_event_time)
) partition by range (source_event_time);

create table if not exists usage_events_2026_05 partition of usage_events
  for values from ('2026-05-01') to ('2026-06-01');

create index if not exists usage_events_2026_05_tenant_time_idx on usage_events_2026_05 (tenant_id, source_event_time);
create index if not exists usage_events_2026_05_tenant_meter_time_idx on usage_events_2026_05 (tenant_id, meter, source_event_time);
create unique index if not exists usage_events_2026_05_tenant_dedupe_idx on usage_events_2026_05 (tenant_id, dedupe_key);

-- verify: select 1 from pg_partitioned_table where partrelid = 'usage_events'::regclass;
