create schema if not exists identity;
create table if not exists identity.oauth_states (
  state_hash text primary key,
  code_verifier_hash text not null,
  nonce_hash text not null,
  return_to text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists identity_oauth_states_expires_idx on identity.oauth_states (expires_at);
-- verify: select 1 from information_schema.tables where table_schema = 'identity' and table_name = 'oauth_states';
