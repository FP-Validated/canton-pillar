create or replace function create_usage_events_month_partition(month_start date)
returns void language plpgsql as $$
declare
  part_name text := 'usage_events_' || to_char(month_start, 'YYYY_MM');
  next_month date := (month_start + interval '1 month')::date;
begin
  execute format('create table if not exists %I partition of usage_events for values from (%L) to (%L)', part_name, month_start, next_month);
  execute format('create index if not exists %I on %I (tenant_id, source_event_time)', part_name || '_tenant_time_idx', part_name);
  execute format('create index if not exists %I on %I (tenant_id, meter, source_event_time)', part_name || '_tenant_meter_time_idx', part_name);
  execute format('create unique index if not exists %I on %I (tenant_id, dedupe_key)', part_name || '_tenant_dedupe_idx', part_name);
exception when others then
  raise warning 'usage partition create failed: %', sqlerrm;
  raise;
end;
$$;

create or replace function bootstrap_usage_events_partitions(months_ahead integer default 3)
returns void language plpgsql as $$
declare i integer;
begin
  for i in 0..months_ahead loop
    perform create_usage_events_month_partition((date_trunc('month', now())::date + (i || ' months')::interval)::date);
  end loop;
end;
$$;

select bootstrap_usage_events_partitions(3);

-- verify: select 1 from pg_proc where proname='create_usage_events_month_partition';
