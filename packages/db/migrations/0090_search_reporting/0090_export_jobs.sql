create type export_job_status as enum ('queued','claimed','running','succeeded','failed','canceled');
create type export_format as enum ('csv','jsonl','parquet');
create table if not exists export_jobs (
  id text primary key check (id like 'exp_%'), tenant_id text not null, livemode boolean not null,
  created_by_api_key_id text not null, idempotency_key_hash text not null,
  status export_job_status not null default 'queued', resource text not null,
  query jsonb not null default '{}'::jsonb, query_hash text not null,
  format export_format not null, columns jsonb not null default '[]'::jsonb,
  consistency_mode text not null check (consistency_mode in ('eventual','ledger_snapshot')),
  target_ledger_offset text, destination_id text, object_storage_key text,
  result_row_count bigint, result_byte_count bigint, result_sha256 text, result_manifest jsonb,
  failure_code text, failure_message text, lease_owner text, lease_expires_at timestamptz, heartbeat_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), claimed_at timestamptz, completed_at timestamptz
);
create unique index if not exists export_jobs_idem_idx on export_jobs(tenant_id, livemode, idempotency_key_hash);
create index if not exists export_jobs_tenant_created_idx on export_jobs(tenant_id, created_at desc);
create index if not exists export_jobs_tenant_status_created_idx on export_jobs(tenant_id, status, created_at desc);
create table if not exists export_job_audit (id bigserial primary key, tenant_id text not null, export_job_id text not null references export_jobs(id), action text not null, actor_api_key_id text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
-- verify: select 1 from pg_type where typname in ('export_job_status','export_format');
-- verify: select 1 from information_schema.tables where table_name in ('export_jobs','export_job_audit');
