create table if not exists report_templates (
  id text primary key check (id like 'rpt_%'), tenant_id text not null, livemode boolean not null,
  name text not null, resource text not null, query jsonb not null default '{}'::jsonb, columns jsonb not null default '[]'::jsonb,
  format export_format not null default 'csv', consistency_mode text not null default 'eventual' check (consistency_mode in ('eventual','ledger_snapshot')),
  schedule jsonb, archived_at timestamptz, created_by_api_key_id text not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists report_templates_tenant_created_idx on report_templates(tenant_id, created_at desc);
create table if not exists report_template_audit (id bigserial primary key, tenant_id text not null, report_template_id text not null references report_templates(id), action text not null, actor_api_key_id text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
-- verify: select 1 from information_schema.tables where table_name in ('report_templates','report_template_audit');
