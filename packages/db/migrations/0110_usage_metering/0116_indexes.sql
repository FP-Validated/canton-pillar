create index if not exists usage_rollups_tenant_period_idx on usage_rollups (tenant_id, granularity, period_start desc);
create index if not exists usage_rollups_close_idx on usage_rollups (granularity, closed_at) where closed_at is null;
create index if not exists invoices_tenant_created_idx on invoices (tenant_id, created_at desc, id desc);
create index if not exists invoices_status_period_idx on invoices (status, period_start, period_end);
create index if not exists customer_billing_status_idx on customer_billing (status, livemode);
create index if not exists usage_reconciliation_diffs_open_idx on usage_reconciliation_diffs (tenant_id, status, created_at desc);

-- verify: select 1 from pg_indexes where indexname='usage_rollups_tenant_period_idx';
