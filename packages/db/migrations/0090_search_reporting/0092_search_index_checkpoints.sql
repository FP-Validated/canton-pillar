create table if not exists search_index_checkpoints (
  tenant_id text not null, livemode boolean not null, resource text not null, backend text not null,
  last_projection_watermark text not null, last_ledger_offset text, indexed_at timestamptz not null default now(),
  document_count bigint not null default 0, error_code text, error_message text,
  primary key (tenant_id, livemode, resource, backend)
);
create index if not exists search_index_checkpoints_indexed_idx on search_index_checkpoints(tenant_id, indexed_at desc);
-- verify: select 1 from information_schema.tables where table_name = 'search_index_checkpoints';
