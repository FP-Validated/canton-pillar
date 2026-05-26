create table if not exists customer_billing (
  id text primary key check (id like 'cb_%'),
  tenant_id text not null unique,
  environment_id text not null,
  livemode boolean not null,
  plan_id text references pricing_plans(id),
  status text not null check (status in ('active','trialing','past_due','disabled','canceled')),
  provider_customer_ref text,
  billing_email_hash text,
  tax_region text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- verify: select 1 from information_schema.tables where table_name='customer_billing';
