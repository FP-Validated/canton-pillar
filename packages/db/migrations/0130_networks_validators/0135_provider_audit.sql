create table if not exists network.provider_audit (
  id text primary key check (id ~ '^netaud_[0-9A-HJKMNP-TV-Z]{26}$'),
  actor_user_id text,
  tenant_id text references tenants(id),
  provider_id text references network.validator_providers(id),
  validator_id text references network.validators(id),
  binding_id text references network.tenant_network_bindings(id),
  action text not null check (action in ('provider_verified','provider_paused','provider_disabled','validator_activated','validator_degraded','validator_disabled','tenant_binding_created','tenant_binding_updated','tenant_binding_paused','tenant_binding_resumed','tenant_binding_disabled')),
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists provider_audit_provider_time_idx on network.provider_audit (provider_id, created_at desc);
create index if not exists provider_audit_validator_time_idx on network.provider_audit (validator_id, created_at desc);
create index if not exists provider_audit_tenant_time_idx on network.provider_audit (tenant_id, created_at desc);
create index if not exists provider_audit_binding_time_idx on network.provider_audit (binding_id, created_at desc);

-- verify:
select to_regclass('network.provider_audit') is not null as ok;
select exists (select 1 from pg_indexes where schemaname='network' and indexname='provider_audit_tenant_time_idx') as ok;
-- /verify
