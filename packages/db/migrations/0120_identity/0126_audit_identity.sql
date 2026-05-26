create schema if not exists identity;
create table if not exists identity.audit_identity (
  id bigserial primary key,
  event_type text not null check (event_type in ('sign_in','sign_out','role_change','invitation_created','invitation_accepted','invitation_revoked','session_revoked')),
  actor_user_id text references identity.users(id),
  tenant_id text references identity.tenants(id),
  target_user_id text references identity.users(id),
  session_id text,
  invitation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists identity_audit_identity_tenant_time_idx on identity.audit_identity (tenant_id, created_at desc);
create index if not exists identity_audit_identity_actor_time_idx on identity.audit_identity (actor_user_id, created_at desc);
-- verify: select 1 from information_schema.tables where table_schema = 'identity' and table_name = 'audit_identity';
