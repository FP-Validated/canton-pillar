create table if not exists invoices (
  id text primary key check (id like 'inv_%'),
  tenant_id text not null,
  customer_billing_id text references customer_billing(id),
  livemode boolean not null,
  status text not null check (status in ('draft','open','paid','void','uncollectible','disputed')),
  currency text not null,
  subtotal numeric(38, 18) not null default 0,
  total numeric(38, 18) not null default 0,
  period_start timestamptz not null,
  period_end timestamptz not null,
  hosted_invoice_url text,
  provider_invoice_ref text,
  lines jsonb not null default '[]'::jsonb,
  dispute jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- verify: select 1 from information_schema.tables where table_name='invoices';
