create table if not exists template_registry.registry_audit (id bigserial primary key, actor_id text not null, action text not null, resource_type text not null, resource_id text not null, before_json jsonb, after_json jsonb, created_at timestamptz not null default now());
create index if not exists registry_audit_resource_idx on template_registry.registry_audit(resource_type,resource_id,created_at desc);
-- verify: select 1 from information_schema.tables where table_schema='template_registry' and table_name='registry_audit';
