create table if not exists network.validator_health_snapshots (
  validator_id text not null references network.validators(id),
  sampled_at timestamptz not null default now(),
  health_status text not null check (health_status in ('healthy','degraded','unhealthy','unknown')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_class text,
  sequencer_offset_lag_seconds integer check (sequencer_offset_lag_seconds is null or sequencer_offset_lag_seconds >= 0),
  package_visibility_status text not null default 'unknown' check (package_visibility_status in ('visible','missing','unknown')),
  created_at timestamptz not null default now(),
  primary key (validator_id, sampled_at)
);

create index if not exists validator_health_snapshots_validator_time_idx on network.validator_health_snapshots (validator_id, sampled_at desc);
create index if not exists validator_health_snapshots_status_time_idx on network.validator_health_snapshots (health_status, sampled_at desc);

-- verify:
select to_regclass('network.validator_health_snapshots') is not null as ok;
select exists (select 1 from pg_indexes where schemaname='network' and indexname='validator_health_snapshots_validator_time_idx') as ok;
-- /verify
