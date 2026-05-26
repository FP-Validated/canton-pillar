create extension if not exists citext;
create schema if not exists identity;
create table if not exists identity.users (
  id text primary key check (id ~ '^usr_[0-9A-HJKMNP-TV-Z]{26}$'),
  google_sub text not null unique,
  email citext not null unique,
  display_name text,
  picture_url text,
  status text not null default 'active' check (status in ('active','disabled','deleted')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists identity_users_status_idx on identity.users (status);
create index if not exists identity_users_last_login_idx on identity.users (last_login_at desc);
-- verify: select 1 from information_schema.tables where table_schema = 'identity' and table_name = 'users';
